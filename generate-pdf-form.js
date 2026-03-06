'use strict';
// =============================================================================
// Générateur PDF interactif — Formulaire de Protection Fonctionnelle
//
// Utilisation :
//   cd formulaire-appli-pf
//   npm install
//   node generate-pdf-form.js [chemin/sortie.pdf]
//
// Fonctionnement :
//   1. Puppeteer ouvre le HTML en mode print à la largeur A4 exacte
//   2. getBoundingClientRect() mesure chaque [data-field] dans le DOM
//   3. Les positions px sont converties en points PDF (×0.75, 96→72 DPI)
//   4. pdf-lib place les champs AcroForm aux coordonnées exactes mesurées
//   → Aucune coordonnée hardcodée, alignement pixel-perfect garanti
// =============================================================================

const puppeteer = require('puppeteer');
const { PDFDocument, PDFName, PDFString, PDFArray, rgb } = require('pdf-lib');
const fs   = require('fs');
const path = require('path');

const OUTPUT = process.argv[2] || path.join(__dirname, 'formulaire-pf-interactif.pdf');

// Dimensions PDF A4 (points, 72 DPI)
const PDF_W = 595.28;
const PDF_H = 841.89;

// ── Aide bas-niveau : ajout d'actions JavaScript ──────────────────────────────

function addAction(pdfDoc, rawDict, eventKey, jsCode) {
    const action = pdfDoc.context.obj({
        S:  PDFName.of('JavaScript'),
        JS: PDFString.of(jsCode),
    });
    const existing = rawDict.get(PDFName.of('AA'));
    let aaDict;
    if (existing) {
        aaDict = pdfDoc.context.lookup(existing);
    } else {
        aaDict = pdfDoc.context.obj({});
        rawDict.set(PDFName.of('AA'), pdfDoc.context.register(aaDict));
    }
    aaDict.set(PDFName.of(eventKey), pdfDoc.context.register(action));
}

// Action sur le dict du champ  (Validate='V', Keystroke='K', Format='F')
const onField  = (doc, f, k, js) => addAction(doc, f.acroField.dict, k, js);

// Action sur le dict du widget  (MouseUp='U') — checkboxes
const onWidget = (doc, f, k, js) => {
    const widgets = f.acroField.getWidgets();
    const dict = widgets.length > 0 ? widgets[0].dict : f.acroField.dict;
    addAction(doc, dict, k, js);
};

// ── Options combobox avec label ≠ valeur d'export ────────────────────────────
function setItems(pdfDoc, dropdown, items) {
    const arr = PDFArray.withContext(pdfDoc.context);
    for (const [label, value] of items) {
        if (!value || label === value) {
            arr.push(PDFString.of(label));
        } else {
            const pair = PDFArray.withContext(pdfDoc.context);
            pair.push(PDFString.of(value)); // valeur d'export en premier (spec PDF)
            pair.push(PDFString.of(label)); // texte affiché
            arr.push(pair);
        }
    }
    dropdown.acroField.dict.set(PDFName.of('Opt'), arr);
}

// ── Scripts de validation (verbatim depuis acrobat-add-fields.js) ─────────────
const V = {
    ksUpper: "event.change = event.change.toUpperCase();",
    ksLower: "event.change = event.change.toLowerCase();",
    fmtDate:     'AFDate_FormatEx("dd/mm/yyyy");',
    ksDate:      'AFDate_KeystrokeEx("dd/mm/yyyy");',
    fmtDateTime: 'AFDate_FormatEx("dd/mm/yyyy HH:MM");',
    ksDateTime:  'AFDate_KeystrokeEx("dd/mm/yyyy HH:MM");',

    nom: [
        "(function () {",
        "    event.value = event.value.toUpperCase().replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { app.alert(\"Le nom est obligatoire.\", 1); event.rc = false; return; }",
        "    var reps = [[/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],[/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],[/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]];",
        "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
        "    if (value.length > 100) { app.alert(\"Le nom ne peut pas d\u00e9passer 100 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    if (!/^[a-zA-Z\u00C0-\u024F\\s'\\-]+$/.test(value)) { app.alert(\"Le nom contient des caract\u00e8res non autoris\u00e9s.\\nCaract\u00e8res autoris\u00e9s : lettres, espaces, apostrophes, tirets.\", 1); event.rc = false; return; }",
        "    if (/(.)\\1{3,}/.test(value)) { app.alert(\"Le nom ne peut pas contenir 4 caract\u00e8res identiques cons\u00e9cutifs.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    prenom: [
        "(function () {",
        "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { app.alert(\"Le pr\u00e9nom est obligatoire.\", 1); event.rc = false; return; }",
        "    var reps = [[/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],[/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],[/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]];",
        "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
        "    if (value.length > 100) { app.alert(\"Le pr\u00e9nom ne peut pas d\u00e9passer 100 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    if (!/^[a-zA-Z\u00C0-\u024F\\s'\\-]+$/.test(value)) { app.alert(\"Le pr\u00e9nom contient des caract\u00e8res non autoris\u00e9s.\\nCaract\u00e8res autoris\u00e9s : lettres, espaces, apostrophes, tirets.\", 1); event.rc = false; return; }",
        "    if (/(.)\\1{3,}/.test(value)) { app.alert(\"Le pr\u00e9nom ne peut pas contenir 4 caract\u00e8res identiques cons\u00e9cutifs.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    nigend: [
        "(function () {",
        "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    if (!/^[0-9]+$/.test(value)) { app.alert(\"Le NIGEND ne doit contenir que des chiffres.\", 1); event.rc = false; return; }",
        "    if (value.length < 5 || value.length > 6) { app.alert(\"Le NIGEND doit contenir entre 5 et 6 chiffres.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    unite: [
        "(function () {",
        "    event.value = event.value.toUpperCase().replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    var reps = [[/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],[/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],[/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]];",
        "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
        "    if (value.length < 2) { app.alert(\"L'unit\u00e9 doit contenir au moins 2 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    if (value.length > 255) { app.alert(\"L'unit\u00e9 ne peut pas d\u00e9passer 255 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    if (!/^[a-zA-Z\u00C0-\u024F0-9\\s'\\-\\/().]+$/.test(value)) { app.alert(\"L'unit\u00e9 contient des caract\u00e8res non autoris\u00e9s.\\nCaract\u00e8res autoris\u00e9s : lettres, chiffres, espaces, apostrophes, tirets, slashs, parenth\u00e8ses, points.\", 1); event.rc = false; return; }",
        "    if (/(.)\\1{3,}/.test(value)) { app.alert(\"L'unit\u00e9 ne peut pas contenir 4 caract\u00e8res identiques cons\u00e9cutifs.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    emailPro: [
        "(function () {",
        "    event.value = event.value.toLowerCase().replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    var emailPerso = this.getField(\"emailPersonnel\").value.toLowerCase().replace(/^\\s+|\\s+$/g, \"\");",
        "    if (value.length === 0 && emailPerso.length === 0) { app.alert(\"Au moins une adresse courriel (professionnelle ou personnelle) est requise.\", 1); event.rc = false; return; }",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    if (value.length > 254) { app.alert(\"L'adresse courriel ne peut pas d\u00e9passer 254 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    var emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._+\\-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9.\\-]*[a-zA-Z0-9])?\\.[a-zA-Z]{2,}$/;",
        "    if (!emailRegex.test(value)) { app.alert(\"Le courriel professionnel n'est pas valide.\\nExemple attendu : prenom.nom@gendarmerie.interieur.gouv.fr\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    emailPerso: [
        "(function () {",
        "    event.value = event.value.toLowerCase().replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    if (value.length > 254) { app.alert(\"L'adresse courriel ne peut pas d\u00e9passer 254 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    var emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._+\\-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9.\\-]*[a-zA-Z0-9])?\\.[a-zA-Z]{2,}$/;",
        "    if (!emailRegex.test(value)) { app.alert(\"Le courriel personnel n'est pas valide.\\nExemple attendu : prenom.nom@exemple.fr\", 1); event.rc = false; return; }",
        "    var emailPro = this.getField(\"emailProfessionnel\").value.toLowerCase().replace(/^\\s+|\\s+$/g, \"\");",
        "    if (emailPro.length > 0 && emailPro === value) { app.alert(\"Les adresses courriel professionnelle et personnelle doivent \u00eatre diff\u00e9rentes.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    telPro: [
        "(function () {",
        "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    var telPerso = this.getField(\"telephonePersonnel\").value.replace(/^\\s+|\\s+$/g, \"\");",
        "    if (value.length === 0 && telPerso.length === 0) { app.alert(\"Au moins un num\u00e9ro de t\u00e9l\u00e9phone (professionnel ou personnel) est requis.\", 1); event.rc = false; return; }",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    var clean = value.replace(/[\\s.\\-()]/g, \"\");",
        "    if (clean.charAt(0) === \"+\") clean = clean.substring(1);",
        "    if (!/^\\d+$/.test(clean)) { app.alert(\"Le num\u00e9ro de t\u00e9l\u00e9phone professionnel contient des caract\u00e8res non autoris\u00e9s.\", 1); event.rc = false; return; }",
        "    if (clean.length === 13 && clean.substring(0,4) === \"0033\") { clean = \"0\" + clean.substring(4); }",
        "    else if (clean.substring(0,2) === \"33\" && clean.length === 11) { clean = \"0\" + clean.substring(2); }",
        "    var valid = false;",
        "    if (clean.charAt(0) === \"0\") { valid = clean.length === 10; }",
        "    else if (clean.substring(0,2) === \"33\") { valid = clean.length === 11; }",
        "    else if (clean.substring(0,3) === \"687\" || clean.substring(0,3) === \"689\" || clean.substring(0,3) === \"681\" || clean.substring(0,3) === \"508\") { valid = clean.length === 6 || clean.length === 9; }",
        "    else { valid = clean.length >= 7 && clean.length <= 15; }",
        "    if (!valid) { app.alert(\"Le num\u00e9ro de t\u00e9l\u00e9phone professionnel est invalide.\\nExemple attendu : 0612345678 ou +33612345678\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    telPerso: [
        "(function () {",
        "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    var clean = value.replace(/[\\s.\\-()]/g, \"\");",
        "    if (clean.charAt(0) === \"+\") clean = clean.substring(1);",
        "    if (!/^\\d+$/.test(clean)) { app.alert(\"Le num\u00e9ro de t\u00e9l\u00e9phone personnel contient des caract\u00e8res non autoris\u00e9s.\", 1); event.rc = false; return; }",
        "    if (clean.length === 13 && clean.substring(0,4) === \"0033\") { clean = \"0\" + clean.substring(4); }",
        "    else if (clean.substring(0,2) === \"33\" && clean.length === 11) { clean = \"0\" + clean.substring(2); }",
        "    var valid = false;",
        "    if (clean.charAt(0) === \"0\") { valid = clean.length === 10; }",
        "    else if (clean.substring(0,2) === \"33\") { valid = clean.length === 11; }",
        "    else if (clean.substring(0,3) === \"687\" || clean.substring(0,3) === \"689\" || clean.substring(0,3) === \"681\" || clean.substring(0,3) === \"508\") { valid = clean.length === 6 || clean.length === 9; }",
        "    else { valid = clean.length >= 7 && clean.length <= 15; }",
        "    if (!valid) { app.alert(\"Le num\u00e9ro de t\u00e9l\u00e9phone personnel est invalide.\\nExemple attendu : 0612345678 ou +33612345678\", 1); event.rc = false; return; }",
        "    var cleanPro = this.getField(\"telephoneProfessionnel\").value.replace(/[\\s.\\-()]/g, \"\");",
        "    if (cleanPro.charAt(0) === \"+\") cleanPro = cleanPro.substring(1);",
        "    if (cleanPro.length > 0 && cleanPro === clean) { app.alert(\"Les num\u00e9ros de t\u00e9l\u00e9phone professionnel et personnel doivent \u00eatre diff\u00e9rents.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    dateFaits: [
        "(function () {",
        "    var value = event.value;",
        "    if (!value || value.length === 0) { event.rc = true; return; }",
        "    var parts = value.split(\"/\");",
        "    if (parts.length !== 3) { event.rc = true; return; }",
        "    var d = new Date(parseInt(parts[2],10), parseInt(parts[1],10)-1, parseInt(parts[0],10));",
        "    var today = new Date(); today.setHours(0,0,0,0);",
        "    if (d > today) { app.alert(\"La date des faits ne peut pas \u00eatre dans le futur.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    commune: [
        "(function () {",
        "    event.value = event.value.toUpperCase().replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    var reps = [[/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],[/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],[/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]];",
        "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
        "    if (value.length < 2) { app.alert(\"La commune doit contenir au moins 2 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    if (value.length > 100) { app.alert(\"La commune ne peut pas d\u00e9passer 100 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    if (!/^[a-zA-Z\u00C0-\u024F\\s'\\-]+$/.test(value)) { app.alert(\"La commune contient des caract\u00e8res non autoris\u00e9s.\\nCaract\u00e8res autoris\u00e9s : lettres, espaces, apostrophes, tirets.\", 1); event.rc = false; return; }",
        "    if (/(.)\\1{3,}/.test(value)) { app.alert(\"La commune ne peut pas contenir 4 caract\u00e8res identiques cons\u00e9cutifs.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    codePostal: [
        "(function () {",
        "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    if (!/^((0[1-9]|[1-8][0-9]|9[0-5])[0-9]{3}|97[1-8][0-9]{2}|98[6-8][0-9]{2})$/.test(value)) { app.alert(\"Code postal invalide (m\u00e9tropole ou DOM-TOM uniquement).\\nExemples : 75001, 97100, 98600\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    resume: [
        "(function () {",
        "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    var reps = [[/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],[/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],[/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]];",
        "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
        "    if (value.length > 5000) { app.alert(\"Le r\u00e9sum\u00e9 de la situation ne peut pas d\u00e9passer 5000 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    blessures: [
        "(function () {",
        "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    var reps = [[/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],[/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],[/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]];",
        "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
        "    if (value.length > 2000) { app.alert(\"Les blessures ne peuvent pas d\u00e9passer 2000 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    partieCivileMouseUp: [
        "(function () {",
        "    var montant = this.getField(\"montantPartieCivile\");",
        "    if (this.getField(\"partieCivile\").value === \"Off\") {",
        "        montant.value = \"\"; montant.readonly = true;",
        "    } else { montant.readonly = false; }",
        "})();"
    ].join("\n"),

    montantPartieCivile: [
        "(function () {",
        "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    var isChecked = (this.getField(\"partieCivile\").value !== \"Off\");",
        "    if (!isChecked) { if (value.length > 0) { app.alert(\"Le montant ne peut \u00eatre renseign\u00e9 que si la constitution de partie civile est coch\u00e9e.\", 1); event.rc = false; return; } event.rc = true; return; }",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    if (!/^\\d+$/.test(value)) { app.alert(\"Le montant doit \u00eatre un nombre entier positif (sans d\u00e9cimales).\", 1); event.rc = false; return; }",
        "    var montant = parseInt(value, 10);",
        "    if (isNaN(montant) || montant < 0) { app.alert(\"Le montant doit \u00eatre un nombre entier positif.\", 1); event.rc = false; return; }",
        "    if (montant > 999999999) { app.alert(\"Le montant est trop \u00e9lev\u00e9 (maximum : 999\u202f999\u202f999).\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    dateAudienceDate: [
        "(function () {",
        "    var value = event.value;",
        "    if (!value || value.length === 0) { event.rc = true; return; }",
        "    var parts = value.split(\"/\");",
        "    if (parts.length !== 3) { event.rc = true; return; }",
        "    var d = new Date(parseInt(parts[2],10), parseInt(parts[1],10)-1, parseInt(parts[0],10));",
        "    if (d.getFullYear() !== parseInt(parts[2],10) || d.getMonth() !== parseInt(parts[1],10)-1 || d.getDate() !== parseInt(parts[0],10)) { app.alert(\"La date d'audience est invalide.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    timeHHMM: [
        "(function () {",
        "    var value = event.value;",
        "    if (!value || value.length === 0) { event.rc = true; return; }",
        "    if (!/^\\d{2}:\\d{2}$/.test(value)) { app.alert(\"Format invalide.\\nFormat attendu : HH:MM (ex. : 14:30)\", 1); event.rc = false; return; }",
        "    var parts = value.split(\":\");",
        "    var hours = parseInt(parts[0],10), mins = parseInt(parts[1],10);",
        "    if (hours > 23 || mins > 59) { app.alert(\"L'heure est invalide (heures : 00-23, minutes : 00-59).\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    qualPenales: [
        "(function () {",
        "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { event.rc = true; return; }",
        "    var reps = [[/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],[/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],[/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]];",
        "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
        "    if (value.length > 2000) { app.alert(\"Les qualifications p\u00e9nales ne peuvent pas d\u00e9passer 2000 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    signatureNom: [
        "(function () {",
        "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
        "    var value = event.value;",
        "    if (value.length === 0) { app.alert(\"Le pr\u00e9nom et nom sont obligatoires.\", 1); event.rc = false; return; }",
        "    var reps = [[/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],[/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],[/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]];",
        "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
        "    if (value.length < 2) { app.alert(\"Le pr\u00e9nom et nom doivent contenir au moins 2 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    if (value.length > 100) { app.alert(\"Le pr\u00e9nom et nom ne peuvent pas d\u00e9passer 100 caract\u00e8res.\", 1); event.rc = false; return; }",
        "    if (!/^[a-zA-Z\u00C0-\u024F\\s'\\-]+$/.test(value)) { app.alert(\"Le pr\u00e9nom et nom contiennent des caract\u00e8res non autoris\u00e9s.\\nCaract\u00e8res autoris\u00e9s : lettres, espaces, apostrophes, tirets.\", 1); event.rc = false; return; }",
        "    if (/(.)\\1{3,}/.test(value)) { app.alert(\"Le pr\u00e9nom et nom ne peuvent pas contenir 4 caract\u00e8res identiques cons\u00e9cutifs.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),

    signatureDate: [
        "(function () {",
        "    var value = event.value;",
        "    if (!value || value.length === 0) { event.rc = true; return; }",
        "    var parts = value.split(\"/\");",
        "    if (parts.length !== 3) { event.rc = true; return; }",
        "    var d = new Date(parseInt(parts[2],10), parseInt(parts[1],10)-1, parseInt(parts[0],10));",
        "    if (d.getFullYear() !== parseInt(parts[2],10) || d.getMonth() !== parseInt(parts[1],10)-1 || d.getDate() !== parseInt(parts[0],10)) { app.alert(\"La date de signature est invalide.\", 1); event.rc = false; return; }",
        "    event.rc = true;",
        "})();"
    ].join("\n"),
};

// =============================================================================
// GÉNÉRATION
// =============================================================================
async function main() {
    const htmlPath = path.resolve(__dirname, 'formulaire-pdf-print.html');

    // ── Étape 1 : ouverture du HTML avec Puppeteer ────────────────────────────
    console.log('Ouverture du HTML...');
    const browser = await puppeteer.launch({ headless: true });
    const pg = await browser.newPage();

    // Viewport à la largeur exacte d'une page A4 à 96 DPI : 210mm × (96/25.4) ≈ 794 px
    // Cela garantit que le layout en print correspond exactement au PDF généré
    await pg.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await pg.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });

    // Mode print pour que la mesure DOM soit cohérente avec le rendu PDF
    await pg.emulateMediaType('print');
    // Délai court pour stabiliser le rendu des polices après changement de media
    await new Promise(r => setTimeout(r, 300));

    // ── Étape 2 : mesure des positions exactes depuis le DOM ──────────────────
    console.log('Mesure des positions DOM...');
    const raw = await pg.evaluate(() => {
        const result = {};
        const pageEls = Array.from(document.querySelectorAll('.page'));

        pageEls.forEach((pageEl, pageIdx) => {
            const pageRect = pageEl.getBoundingClientRect();

            pageEl.querySelectorAll('[data-field]').forEach(el => {
                const r = el.getBoundingClientRect();
                result[el.dataset.field] = {
                    pageIndex:  pageIdx,
                    // Coordonnées en px relatives au coin haut-gauche de la page
                    left:       r.left   - pageRect.left,
                    top:        r.top    - pageRect.top,
                    width:      r.width,
                    height:     r.height,
                    // Largeur de la page en px (sert à calculer le facteur d'échelle)
                    pageWidth:  pageRect.width,
                };
            });
        });

        return result;
    });

    // Conversion px → points PDF
    // Facteur d'échelle calculé depuis la largeur réelle de la page mesurée
    // (équivalent à ×0.75 soit 96→72 DPI, mais calibré sur le rendu réel)
    const pos = {};
    for (const [name, m] of Object.entries(raw)) {
        const scale = PDF_W / m.pageWidth;          // ex. 595.28 / 793.7 ≈ 0.75
        const x      = m.left   * scale;
        const width  = m.width  * scale;
        const height = m.height * scale;
        const y      = PDF_H - (m.top + m.height) * scale; // origine bas-gauche pdf-lib
        pos[name] = { page: m.pageIndex, x, y, width, height };
    }

    // Affichage pour débogage (retirer si besoin)
    console.log('  Positions mesurées (pt) :');
    for (const [n, p] of Object.entries(pos))
        console.log(`    ${n.padEnd(28)} page=${p.page}  x=${p.x.toFixed(1)}  y=${p.y.toFixed(1)}  w=${p.width.toFixed(1)}  h=${p.height.toFixed(1)}`);

    // ── Étape 3 : rendu HTML → PDF brut ──────────────────────────────────────
    console.log('\nRendu HTML → PDF...');
    const flatBytes = await pg.pdf({
        format:          'A4',
        printBackground: true,
        margin:          { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await browser.close();

    // ── Étape 4 : superposition AcroForm via pdf-lib ──────────────────────────
    console.log('Ajout des champs interactifs...');
    const pdfDoc = await PDFDocument.load(flatBytes);
    const pages  = pdfDoc.getPages();
    const form   = pdfDoc.getForm();

    // NeedAppearances → Adobe Reader régénère les apparences à l'ouverture
    form.acroForm.dict.set(PDFName.of('NeedAppearances'), pdfDoc.context.obj(true));

    // Raccourci pour placer un champ sur la bonne page aux coordonnées mesurées
    const pg1 = pages[0];
    const pg2 = pages[1];
    const pageOf = name => pages[pos[name].page];
    const at     = name => {
        const p = pos[name];
        return { x: p.x, y: p.y, width: p.width, height: p.height };
    };

    // Style commun
    const S = {
        borderColor:     rgb(0, 0, 0),
        backgroundColor: rgb(1, 1, 1),
        textColor:       rgb(0, 0, 0),
        fontSize:        9,
        borderWidth:     1,
    };

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 1
    // ════════════════════════════════════════════════════════════════════════

    const fType = form.createDropdown('type');
    fType.addToPage(pageOf('type'), { ...at('type'), ...S });
    setItems(pdfDoc, fType, [
        ['', ''], ['Victime', 'VICTIME'], ['Mis en cause', 'MIS_EN_CAUSE'],
    ]);
    fType.enableRequired();

    const fNom = form.createTextField('nom');
    fNom.addToPage(pageOf('nom'), { ...at('nom'), ...S });
    fNom.enableRequired();
    onField(pdfDoc, fNom, 'K', V.ksUpper);
    onField(pdfDoc, fNom, 'V', V.nom);

    const fPrenom = form.createTextField('prenom');
    fPrenom.addToPage(pageOf('prenom'), { ...at('prenom'), ...S });
    fPrenom.enableRequired();
    onField(pdfDoc, fPrenom, 'V', V.prenom);

    const fGrade = form.createDropdown('grade');
    fGrade.addToPage(pageOf('grade'), { ...at('grade'), ...S });
    setItems(pdfDoc, fGrade, [
        ['', ''],
        ['G\u00e9n\u00e9ral (GEN)', 'GEN'], ['Colonel (COL)', 'COL'],
        ['Lieutenant-colonel (LCL)', 'LCL'], ["Chef d'escadron (CEN)", 'CEN'],
        ['Commandant (CDT)', 'CDT'], ['Capitaine (CNE)', 'CNE'],
        ['Lieutenant (LTN)', 'LTN'], ['Sous-lieutenant (SLT)', 'SLT'],
        ['Aspirant (ASP)', 'ASP'], ['Major (MAJ)', 'MAJ'],
        ['Adjudant-chef (ADC)', 'ADC'], ['Adjudant (ADJ)', 'ADJ'],
        ['Mar\u00e9chal des logis-chef (MDC)', 'MDC'], ['Gendarme (GND)', 'GND'],
        ['\u00c9l\u00e8ve gendarme (ELG)', 'ELG'], ['Mar\u00e9chal des logis (MDL)', 'MDL'],
        ['Brigadier-chef (BRC)', 'BRC'], ['Brigadier (BRI)', 'BRI'],
        ['Gendarme adjoint volontaire (GAV)', 'GAV'],
        ['Gendarme adjoint de 2\u00e8me classe (GA2)', 'GA2'],
        ['Madame (Mme)', 'Mme'], ['Monsieur (M)', 'M'],
    ]);
    fGrade.enableRequired();

    const fNigend = form.createTextField('nigend');
    fNigend.addToPage(pageOf('nigend'), { ...at('nigend'), ...S });
    onField(pdfDoc, fNigend, 'V', V.nigend);

    const fStatut = form.createDropdown('statutDemandeur');
    fStatut.addToPage(pageOf('statutDemandeur'), { ...at('statutDemandeur'), ...S });
    setItems(pdfDoc, fStatut, [
        ['', ''], ['OG', 'OG'], ['OCTA', 'OCTA'], ['SOG', 'SOG'], ['CSTAGN', 'CSTAGN'],
        ['GAV', 'GAV'], ['Civil', 'Civil'], ['R\u00e9serviste', 'Reserviste'],
        ['Retrait\u00e9', 'Retraite'], ['Ayant-droit', 'Ayant_droit'],
    ]);
    fStatut.enableRequired();

    const fBranche = form.createDropdown('branche');
    fBranche.addToPage(pageOf('branche'), { ...at('branche'), ...S });
    setItems(pdfDoc, fBranche, [
        ['', ''], ['GD', 'GD'], ['GM', 'GM'], ['GR', 'GR'],
        ['\u00c9tat-Major', 'Etat_Major'], ['GIE SP\u00c9', 'GIE_SPE'],
        ['DG et ORG. CENTRAUX', 'DG_et_ORG_CENTRAUX'], ['GIGN', 'GIGN'],
    ]);

    const fFormation = form.createDropdown('formationAdministrative');
    fFormation.addToPage(pageOf('formationAdministrative'), { ...at('formationAdministrative'), ...S });
    setItems(pdfDoc, fFormation, [
        ['', ''],
        ['Auvergne-Rh\u00f4ne-Alpes', 'Auvergne-Rh\u00f4ne-Alpes'],
        ['Bourgogne-Franche-Comt\u00e9', 'Bourgogne-Franche-Comt\u00e9'],
        ['Bretagne', 'Bretagne'], ['Centre-Val-de-Loire', 'Centre-Val-de-Loire'],
        ['Corse', 'Corse'], ['Grand Est', 'Grand Est'], ['Hauts-de-France', 'Hauts-de-France'],
        ['\u00cele-de-France', '\u00cele-de-France'], ['Nouvelle-Aquitaine', 'Nouvelle-Aquitaine'],
        ['Normandie', 'Normandie'], ['Occitanie', 'Occitanie'],
        ['Pays-de-la-Loire', 'Pays-de-la-Loire'],
        ["Provence-Alpes-C\u00f4te-d'Azur", "Provence-Alpes-C\u00f4te-d'Azur"],
        ['Guadeloupe', 'Guadeloupe'], ['Guyane', 'Guyane'], ['Martinique', 'Martinique'],
        ['Mayotte', 'Mayotte'], ['Nouvelle-Cal\u00e9donie', 'Nouvelle-Cal\u00e9donie'],
        ['Wallis-et-Futuna', 'Wallis-et-Futuna'],
        ['Polyn\u00e9sie fran\u00e7aise', 'Polyn\u00e9sie fran\u00e7aise'],
        ['La R\u00e9union', 'La R\u00e9union'],
        ['Saint Barth\u00e9l\u00e9my / Saint-Martin', 'Saint Barth\u00e9l\u00e9my / Saint-Martin'],
        ['Saint-Pierre-et-Miquelon', 'Saint-Pierre-et-Miquelon'],
        ['Garde r\u00e9publicaine', 'Garde r\u00e9publicaine'],
        ['IGAG','IGAG'],['IGGN','IGGN'],['DGGN','DGGN'],['GIGN','GIGN'],
        ['COMSOPGN','COMSOPGN'],['PJGN','PJGN'],['CEGN','CEGN'],['CGOM','CGOM'],
        ['CRJ','CRJ'],['ANFSI','ANFSI'],['COSSEN','COSSEN'],['COMCYBER-MI','COMCYBER-MI'],
        ['CESAN','CESAN'],['SAILMI','SAILMI'],['GSAN','GSAN'],['GTA','GTA'],
        ['GARM','GARM'],['CFAGN','CFAGN'],['GMAR','GMAR'],['GAIR','GAIR'],['AUTRE','AUTRE'],
    ]);

    const fDept = form.createDropdown('departement');
    fDept.addToPage(pageOf('departement'), { ...at('departement'), ...S });
    const depts = [['', '']];
    for (let i = 1; i <= 9;  i++) depts.push([`0${i}`, `0${i}`]);
    for (let i = 10; i <= 19; i++) depts.push([`${i}`, `${i}`]);
    depts.push(['2A', '2A'], ['2B', '2B']);
    for (let i = 21; i <= 95; i++) depts.push([`${i}`, `${i}`]);
    for (const d of ['971','972','973','974','975','976','977','978','986','987','988'])
        depts.push([d, d]);
    setItems(pdfDoc, fDept, depts);

    const fUnite = form.createTextField('unite');
    fUnite.addToPage(pageOf('unite'), { ...at('unite'), ...S });
    onField(pdfDoc, fUnite, 'K', V.ksUpper);
    onField(pdfDoc, fUnite, 'V', V.unite);

    const fEmailPro = form.createTextField('emailProfessionnel');
    fEmailPro.addToPage(pageOf('emailProfessionnel'), { ...at('emailProfessionnel'), ...S });
    onField(pdfDoc, fEmailPro, 'K', V.ksLower);
    onField(pdfDoc, fEmailPro, 'V', V.emailPro);

    const fEmailPerso = form.createTextField('emailPersonnel');
    fEmailPerso.addToPage(pageOf('emailPersonnel'), { ...at('emailPersonnel'), ...S });
    onField(pdfDoc, fEmailPerso, 'K', V.ksLower);
    onField(pdfDoc, fEmailPerso, 'V', V.emailPerso);

    const fTelPro = form.createTextField('telephoneProfessionnel');
    fTelPro.addToPage(pageOf('telephoneProfessionnel'), { ...at('telephoneProfessionnel'), ...S });
    onField(pdfDoc, fTelPro, 'V', V.telPro);

    const fTelPerso = form.createTextField('telephonePersonnel');
    fTelPerso.addToPage(pageOf('telephonePersonnel'), { ...at('telephonePersonnel'), ...S });
    onField(pdfDoc, fTelPerso, 'V', V.telPerso);

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 2
    // ════════════════════════════════════════════════════════════════════════

    const fDateFaits = form.createTextField('dateFaits');
    fDateFaits.addToPage(pageOf('dateFaits'), { ...at('dateFaits'), ...S });
    onField(pdfDoc, fDateFaits, 'F', V.fmtDate);
    onField(pdfDoc, fDateFaits, 'K', V.ksDate);
    onField(pdfDoc, fDateFaits, 'V', V.dateFaits);

    const fCommune = form.createTextField('commune');
    fCommune.addToPage(pageOf('commune'), { ...at('commune'), ...S });
    onField(pdfDoc, fCommune, 'K', V.ksUpper);
    onField(pdfDoc, fCommune, 'V', V.commune);

    const fCP = form.createTextField('codePostal');
    fCP.addToPage(pageOf('codePostal'), { ...at('codePostal'), ...S });
    onField(pdfDoc, fCP, 'V', V.codePostal);

    const fPosition = form.createDropdown('position');
    fPosition.addToPage(pageOf('position'), { ...at('position'), ...S });
    setItems(pdfDoc, fPosition, [
        ['', ''], ['Non pr\u00e9cis\u00e9', 'NON_PRECISE'],
        ['En service', 'EN_SERVICE'], ['Hors service', 'HORS_SERVICE'],
    ]);

    const fContexte = form.createDropdown('contexteMissionnel');
    fContexte.addToPage(pageOf('contexteMissionnel'), { ...at('contexteMissionnel'), ...S });
    setItems(pdfDoc, fContexte, [
        ['', ''],
        ['Pr\u00e9vention de proximit\u00e9', 'Pr\u00e9vention de proximit\u00e9'],
        ['Police route', 'Police route'], ['MO/RO', 'MO/RO'],
        ['Police judiciaire', 'Police judiciaire'],
        ["Charg\u00e9 d'accueil", "Charg\u00e9 d'accueil"],
        ["S\u00e9curisation d'\u00e9v\u00e9nement", "S\u00e9curisation d'\u00e9v\u00e9nement"],
        ['Intervention sp\u00e9cialis\u00e9e', 'Intervention sp\u00e9cialis\u00e9e'],
        ['Surveillance particuli\u00e8re', 'Surveillance particuli\u00e8re'],
        ['Escorte/Transf\u00e8rement', 'Escorte/Transf\u00e8rement'],
        ['International', 'International'],
        ['Relations interpersonnelles', 'Relations interpersonnelles'],
        ['Hors service', 'Hors service'], ['Autre', 'Autre'],
    ]);

    const fQualif = form.createDropdown('qualificationInfraction');
    fQualif.addToPage(pageOf('qualificationInfraction'), { ...at('qualificationInfraction'), ...S });
    setItems(pdfDoc, fQualif, [
        ['', ''],
        ['OUTRAGE / MENACES', 'OUTRAGE / MENACES'],
        ['R\u00c9BELLION avec ou sans outrage', 'R\u00c9BELLION avec ou sans outrage'],
        ['VIOLENCES hors r\u00e9bellion', 'VIOLENCES hors r\u00e9bellion'],
        ["REFUS D'OBT\u00c9MP\u00c9RER / Mise en danger de la vie d'autrui", "REFUS D'OBT\u00c9MP\u00c9RER / Mise en danger de la vie d'autrui"],
        ['HARC\u00c8LEMENT MORAL AU TRAVAIL / DISCRIMINATION', 'HARC\u00c8LEMENT MORAL AU TRAVAIL / DISCRIMINATION'],
        ['VIOLENCES SEXUELLES ET SEXISTES', 'VIOLENCES SEXUELLES ET SEXISTES'],
        ['D\u00c9FENSEUR DES DROITS', 'D\u00c9FENSEUR DES DROITS'],
        ['ACCIDENT DE LA CIRC. ROUTI\u00c8RE', 'ACCIDENT DE LA CIRC. ROUTI\u00c8RE'],
        ['DIFFAMATION / INJURES', 'DIFFAMATION / INJURES'],
        ["TENTATIVE D'HOMICIDE", "TENTATIVE D'HOMICIDE"],
        ['INFRACTION INVOLONTAIRE HORS ACCIDENT CIRC. ROUTI\u00c8RE', 'INFRACTION INVOLONTAIRE HORS ACCIDENT CIRC. ROUTI\u00c8RE'],
        ['AUTRE', 'AUTRE'],
    ]);

    const fResume = form.createTextField('resume');
    fResume.enableMultiline();
    fResume.addToPage(pageOf('resume'), { ...at('resume'), ...S });
    onField(pdfDoc, fResume, 'V', V.resume);

    const fBless = form.createTextField('blessures');
    fBless.enableMultiline();
    fBless.addToPage(pageOf('blessures'), { ...at('blessures'), ...S });
    onField(pdfDoc, fBless, 'V', V.blessures);

    const fPC = form.createCheckBox('partieCivile');
    fPC.addToPage(pageOf('partieCivile'), { ...at('partieCivile'), ...S });
    onWidget(pdfDoc, fPC, 'U', V.partieCivileMouseUp);

    const fMontant = form.createTextField('montantPartieCivile');
    fMontant.addToPage(pageOf('montantPartieCivile'), { ...at('montantPartieCivile'), ...S });
    fMontant.enableReadOnly();
    onField(pdfDoc, fMontant, 'V', V.montantPartieCivile);

    const fDateAudDate = form.createTextField('dateAudienceDate');
    fDateAudDate.addToPage(pageOf('dateAudienceDate'), { ...at('dateAudienceDate'), ...S });
    onField(pdfDoc, fDateAudDate, 'F', V.fmtDate);
    onField(pdfDoc, fDateAudDate, 'K', V.ksDate);
    onField(pdfDoc, fDateAudDate, 'V', V.dateAudienceDate);

    const fDateAudTime = form.createTextField('dateAudienceTime');
    fDateAudTime.addToPage(pageOf('dateAudienceTime'), { ...at('dateAudienceTime'), ...S });
    onField(pdfDoc, fDateAudTime, 'V', V.timeHHMM);

    const fQualPen = form.createTextField('qualificationsPenales');
    fQualPen.enableMultiline();
    fQualPen.addToPage(pageOf('qualificationsPenales'), { ...at('qualificationsPenales'), ...S });
    onField(pdfDoc, fQualPen, 'V', V.qualPenales);

    const fSoutMed = form.createCheckBox('soutienMedical');
    fSoutMed.addToPage(pageOf('soutienMedical'), { ...at('soutienMedical'), ...S });

    const fSoutPsy = form.createCheckBox('soutienPsychologique');
    fSoutPsy.addToPage(pageOf('soutienPsychologique'), { ...at('soutienPsychologique'), ...S });

    const fSoutSoc = form.createCheckBox('soutienSocial');
    fSoutSoc.addToPage(pageOf('soutienSocial'), { ...at('soutienSocial'), ...S });

    const fRgpd = form.createCheckBox('rgpdConsent');
    fRgpd.addToPage(pageOf('rgpdConsent'), { ...at('rgpdConsent'), ...S });
    fRgpd.enableRequired();

    const fEngag = form.createCheckBox('engagementHonneur');
    fEngag.addToPage(pageOf('engagementHonneur'), { ...at('engagementHonneur'), ...S });
    fEngag.enableRequired();

    const fSignNom = form.createTextField('signatureNom');
    fSignNom.addToPage(pageOf('signatureNom'), { ...at('signatureNom'), ...S });
    fSignNom.enableRequired();
    onField(pdfDoc, fSignNom, 'V', V.signatureNom);

    const fSignDate = form.createTextField('signatureDate');
    fSignDate.addToPage(pageOf('signatureDate'), { ...at('signatureDate'), ...S });
    onField(pdfDoc, fSignDate, 'F', V.fmtDate);
    onField(pdfDoc, fSignDate, 'K', V.ksDate);
    onField(pdfDoc, fSignDate, 'V', V.signatureDate);

    // Pré-remplissage de la date du jour
    const now = new Date();
    fSignDate.setText(
        `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`
    );

    // ── Étape 5 : sauvegarde ──────────────────────────────────────────────────
    const outputBytes = await pdfDoc.save();
    fs.writeFileSync(OUTPUT, outputBytes);

    console.log(`\nPDF interactif généré : ${OUTPUT}`);
    console.log(`${form.getFields().length} champs — positions mesurées depuis le DOM.`);
}

main().catch(err => {
    console.error('\nErreur :', err.message);
    process.exit(1);
});
