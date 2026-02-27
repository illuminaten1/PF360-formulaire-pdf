// =============================================================================
// Script Adobe Acrobat Pro DC – Ajout automatique des champs
// Formulaire de Demande de Protection Fonctionnelle
//
// UTILISATION :
//   1. Ouvrir le PDF dans Acrobat Pro DC
//   2. Ouvrir la console JS : Outils > JavaScript > Console JS  (Ctrl+J)
//   3. Coller ce script et appuyer sur Ctrl+Entrée
//
// Noms des champs conformes au modèle Prisma "Demande"
// Positions calculées pour un export PDF A4 depuis navigateur Chromium
// Si les champs sont décalés, ajustez les constantes de positionnement en haut
// =============================================================================

// ── Dimensions page A4 en points (1mm = 2.835pt) ──────────────────────────────
var H = 842;   // Hauteur A4

// ── Colonnes X ────────────────────────────────────────────────────────────────
// x0/x1 tiennent compte du padding interne des form-card (4mm = 11pt de chaque côté)
// page margin 12mm (34pt) + card padding 4mm (11pt) = 45pt
var x0   = 45;   // Bord gauche des champs (dans les cards)
var xHl  = 293;  // Fin demi-colonne gauche (½)
var xHr  = 302;  // Début demi-colonne droite (½)
var xT1  = 208;  // Fin 1er tiers
var xT2  = 217;  // Début 2e tiers
var xT2e = 380;  // Fin 2e tiers
var xT3  = 388;  // Début 3e tiers
var x1   = 550;  // Bord droit des champs (dans les cards)

// ── Positions Y page 1 — calibrées sur mesures Acrobat ────────────────────────
// Format : { t: top depuis haut de page, b: bottom depuis haut de page }
// Correspondance Acrobat : y2 = H - t,  y1 = H - b
// Pour recalibrer un champ : t = H - y2_mesuré,  b = H - y1_mesuré
var Y1 = {
    type:    { t: 362, b: 380 },   // Type de demande
    row1:    { t: 460, b: 478 },   // Nom / Prénom           ← mesure confirmée
    row2:    { t: 499, b: 517 },   // Grade / NIGEND
    row3:    { t: 539, b: 557 },   // Statut / Branche
    row4:    { t: 578, b: 596 },   // Formation adm. / Département
    unite:   { t: 617, b: 635 },   // Unité
    email:   { t: 657, b: 675 },   // Courriel pro / perso
    tel:     { t: 714, b: 732 },   // TPH pro / perso        ← mesure confirmée
};

// ── Positions Y page 2 — calibrées sur mesures Acrobat ────────────────────────
var Y2 = {
    row1:    { t:  87, b: 105 },   // dateFaits / commune / codePostal  ← confirmé
    row2:    { t: 126, b: 143 },   // position / contexteMissionnel
    qualif:  { t: 165, b: 185 },   // qualificationInfraction
    resume:  { t: 204, b: 265 },   // résumé (very-tall ~61pt)
    bless:   { t: 284, b: 326 },   // blessures (tall ~42pt)
    pcCb:    { t: 393, b: 407 },   // checkbox partieCivile
    jud:     { t: 426, b: 445 },   // montantPartieCivile / dateAudience
    qualPen: { t: 465, b: 508 },   // qualificationsPenales (tall ~43pt)
    sout:    { t: 574, b: 588 },   // 3 checkboxes soutiens
    rgpd:    { t: 654, b: 668 },   // checkbox rgpdConsent
    engag:   { t: 734, b: 748 },   // checkbox engagementHonneur       ← confirmé
    sign:    { t: 766, b: 786 },   // signatureNom / signatureDate
};

// ── Convertit top/bottom (depuis le HAUT de la page) en rect Acrobat ─────────
// Acrobat : origine bas-gauche, y croît vers le haut
function r(xa, topFromPageTop, xb, botFromPageTop) {
    return [xa, H - botFromPageTop, xb, H - topFromPageTop];
}

// ── Style commun appliqué à tous les champs ───────────────────────────────────
function style(f, tooltip) {
    f.strokeColor  = color.black;
    f.fillColor    = color.white;
    f.textColor    = color.black;
    f.textFont     = font.Helv;
    f.textSize     = 9;
    f.borderStyle  = border.s;
    f.lineWidth    = 1;
    if (tooltip) f.userName = tooltip;
}

var f;

// =============================================================================
// PAGE 1  (index 0)
// =============================================================================

// ── Section : Informations générales ─────────────────────────────────────────
f = this.addField("type", "combobox", 0, r(x0, Y1.type.t, x1, Y1.type.b));
f.setItems([
    ["", ""],
    ["Victime", "VICTIME"],
    ["Mis en cause", "MIS_EN_CAUSE"]
]);
style(f, "Type de demande");
f.required = true;

// ── Section : Informations sur le demandeur ───────────────────────────────────
f = this.addField("nom", "text", 0, r(x0, Y1.row1.t, xHl, Y1.row1.b));
style(f, "Nom"); f.required = true;
f.setAction("Keystroke", "event.change = event.change.toUpperCase();");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.toUpperCase().replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) {",
    "        app.alert(\"Le nom est obligatoire.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    var reps = [",
    "        [/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],",
    "        [/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],",
    "        [/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]",
    "    ];",
    "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
    "    if (value.length > 100) {",
    "        app.alert(\"Le nom ne peut pas dépasser 100 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (!/^[a-zA-Z\u00C0-\u024F\\s'\\-]+$/.test(value)) {",
    "        app.alert(\"Le nom contient des caractères non autorisés.\\nCaractères autorisés : lettres, espaces, apostrophes, tirets.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (/(.)\\1{3,}/.test(value)) {",
    "        app.alert(\"Le nom ne peut pas contenir 4 caractères identiques consécutifs.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("prenom", "text", 0, r(xHr, Y1.row1.t, x1, Y1.row1.b));
style(f, "Prénom"); f.required = true;
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) {",
    "        app.alert(\"Le prénom est obligatoire.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    var reps = [",
    "        [/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],",
    "        [/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],",
    "        [/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]",
    "    ];",
    "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
    "    if (value.length > 100) {",
    "        app.alert(\"Le prénom ne peut pas dépasser 100 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (!/^[a-zA-Z\u00C0-\u024F\\s'\\-]+$/.test(value)) {",
    "        app.alert(\"Le prénom contient des caractères non autorisés.\\nCaractères autorisés : lettres, espaces, apostrophes, tirets.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (/(.)\\1{3,}/.test(value)) {",
    "        app.alert(\"Le prénom ne peut pas contenir 4 caractères identiques consécutifs.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

// "grade" = relation Grade dans Prisma (gradeId en BDD)
f = this.addField("grade", "combobox", 0, r(x0, Y1.row2.t, xHl, Y1.row2.b));
f.setItems([
    ["", ""],
    ["Général (GEN)",                          "GEN"],
    ["Colonel (COL)",                          "COL"],
    ["Lieutenant-colonel (LCL)",               "LCL"],
    ["Chef d'escadron (CEN)",                  "CEN"],
    ["Commandant (CDT)",                       "CDT"],
    ["Capitaine (CNE)",                        "CNE"],
    ["Lieutenant (LTN)",                       "LTN"],
    ["Sous-lieutenant (SLT)",                  "SLT"],
    ["Aspirant (ASP)",                         "ASP"],
    ["Major (MAJ)",                            "MAJ"],
    ["Adjudant-chef (ADC)",                    "ADC"],
    ["Adjudant (ADJ)",                         "ADJ"],
    ["Maréchal des logis-chef (MDC)",          "MDC"],
    ["Gendarme (GND)",                         "GND"],
    ["Élève gendarme (ELG)",                   "ELG"],
    ["Maréchal des logis (MDL)",               "MDL"],
    ["Brigadier-chef (BRC)",                   "BRC"],
    ["Brigadier (BRI)",                        "BRI"],
    ["Gendarme adjoint volontaire (GAV)",      "GAV"],
    ["Gendarme adjoint de 2ème classe (GA2)",  "GA2"],
    ["Madame (Mme)",                           "Mme"],
    ["Monsieur (M)",                           "M"]
]);
style(f, "Grade ou civilité"); f.required = true;

f = this.addField("nigend", "text", 0, r(xHr, Y1.row2.t, x1, Y1.row2.b));
style(f, "NIGEND");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    if (!/^[0-9]+$/.test(value)) {",
    "        app.alert(\"Le NIGEND ne doit contenir que des chiffres.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (value.length < 5 || value.length > 6) {",
    "        app.alert(\"Le NIGEND doit contenir entre 5 et 6 chiffres.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("statutDemandeur", "combobox", 0, r(x0, Y1.row3.t, xHl, Y1.row3.b));
f.setItems([
    ["", ""],
    ["OG",          "OG"],
    ["OCTA",        "OCTA"],
    ["SOG",         "SOG"],
    ["CSTAGN",      "CSTAGN"],
    ["GAV",         "GAV"],
    ["Civil",       "Civil"],
    ["Réserviste",  "Reserviste"],
    ["Retraité",    "Retraite"],
    ["Ayant-droit", "Ayant_droit"]
]);
style(f, "Statut du demandeur"); f.required = true;

f = this.addField("branche", "combobox", 0, r(xHr, Y1.row3.t, x1, Y1.row3.b));
f.setItems([
    ["", ""],
    ["GD",                    "GD"],
    ["GM",                    "GM"],
    ["GR",                    "GR"],
    ["État-Major",            "Etat_Major"],
    ["GIE SPÉ",               "GIE_SPE"],
    ["DG et ORG. CENTRAUX",   "DG_et_ORG_CENTRAUX"],
    ["GIGN",                  "GIGN"]
]);
style(f, "Branche");

f = this.addField("formationAdministrative", "combobox", 0, r(x0, Y1.row4.t, xHl, Y1.row4.b));
f.setItems([
    ["", ""],
    ["Auvergne-Rhône-Alpes",              "Auvergne-Rhône-Alpes"],
    ["Bourgogne-Franche-Comté",           "Bourgogne-Franche-Comté"],
    ["Bretagne",                          "Bretagne"],
    ["Centre-Val-de-Loire",               "Centre-Val-de-Loire"],
    ["Corse",                             "Corse"],
    ["Grand Est",                         "Grand Est"],
    ["Hauts-de-France",                   "Hauts-de-France"],
    ["Île-de-France",                     "Île-de-France"],
    ["Nouvelle-Aquitaine",                "Nouvelle-Aquitaine"],
    ["Normandie",                         "Normandie"],
    ["Occitanie",                         "Occitanie"],
    ["Pays-de-la-Loire",                  "Pays-de-la-Loire"],
    ["Provence-Alpes-Côte-d'Azur",        "Provence-Alpes-Côte-d'Azur"],
    ["Guadeloupe",                        "Guadeloupe"],
    ["Guyane",                            "Guyane"],
    ["Martinique",                        "Martinique"],
    ["Mayotte",                           "Mayotte"],
    ["Nouvelle-Calédonie",                "Nouvelle-Calédonie"],
    ["Wallis-et-Futuna",                  "Wallis-et-Futuna"],
    ["Polynésie française",               "Polynésie française"],
    ["La Réunion",                        "La Réunion"],
    ["Saint Barthélémy / Saint-Martin",   "Saint Barthélémy / Saint-Martin"],
    ["Saint-Pierre-et-Miquelon",          "Saint-Pierre-et-Miquelon"],
    ["Garde républicaine",                "Garde républicaine"],
    ["IGAG",                              "IGAG"],
    ["IGGN",                              "IGGN"],
    ["DGGN",                              "DGGN"],
    ["GIGN",                              "GIGN"],
    ["COMSOPGN",                          "COMSOPGN"],
    ["PJGN",                              "PJGN"],
    ["CEGN",                              "CEGN"],
    ["CGOM",                              "CGOM"],
    ["CRJ",                               "CRJ"],
    ["ANFSI",                             "ANFSI"],
    ["COSSEN",                            "COSSEN"],
    ["COMCYBER-MI",                       "COMCYBER-MI"],
    ["CESAN",                             "CESAN"],
    ["SAILMI",                            "SAILMI"],
    ["GSAN",                              "GSAN"],
    ["GTA",                               "GTA"],
    ["GARM",                              "GARM"],
    ["CFAGN",                             "CFAGN"],
    ["GMAR",                              "GMAR"],
    ["GAIR",                              "GAIR"],
    ["AUTRE",                             "AUTRE"]
]);
style(f, "Formation administrative");

f = this.addField("departement", "combobox", 0, r(xHr, Y1.row4.t, x1, Y1.row4.b));
f.setItems([
    ["", ""],
    ["01","01"],["02","02"],["03","03"],["04","04"],["05","05"],
    ["06","06"],["07","07"],["08","08"],["09","09"],["10","10"],
    ["11","11"],["12","12"],["13","13"],["14","14"],["15","15"],
    ["16","16"],["17","17"],["18","18"],["19","19"],["2A","2A"],
    ["2B","2B"],["21","21"],["22","22"],["23","23"],["24","24"],
    ["25","25"],["26","26"],["27","27"],["28","28"],["29","29"],
    ["30","30"],["31","31"],["32","32"],["33","33"],["34","34"],
    ["35","35"],["36","36"],["37","37"],["38","38"],["39","39"],
    ["40","40"],["41","41"],["42","42"],["43","43"],["44","44"],
    ["45","45"],["46","46"],["47","47"],["48","48"],["49","49"],
    ["50","50"],["51","51"],["52","52"],["53","53"],["54","54"],
    ["55","55"],["56","56"],["57","57"],["58","58"],["59","59"],
    ["60","60"],["61","61"],["62","62"],["63","63"],["64","64"],
    ["65","65"],["66","66"],["67","67"],["68","68"],["69","69"],
    ["70","70"],["71","71"],["72","72"],["73","73"],["74","74"],
    ["75","75"],["76","76"],["77","77"],["78","78"],["79","79"],
    ["80","80"],["81","81"],["82","82"],["83","83"],["84","84"],
    ["85","85"],["86","86"],["87","87"],["88","88"],["89","89"],
    ["90","90"],["91","91"],["92","92"],["93","93"],["94","94"],
    ["95","95"],
    ["971","971"],["972","972"],["973","973"],["974","974"],
    ["975","975"],["976","976"],["977","977"],["978","978"],
    ["986","986"],["987","987"],["988","988"]
]);
style(f, "Département d'affectation");

f = this.addField("unite", "text", 0, r(x0, Y1.unite.t, x1, Y1.unite.b));
style(f, "Unité");
f.setAction("Keystroke", "event.change = event.change.toUpperCase();");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.toUpperCase().replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    var reps = [",
    "        [/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],",
    "        [/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],",
    "        [/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]",
    "    ];",
    "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
    "    if (value.length < 2) {",
    "        app.alert(\"L'unité doit contenir au moins 2 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (value.length > 255) {",
    "        app.alert(\"L'unité ne peut pas dépasser 255 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (!/^[a-zA-Z\u00C0-\u024F0-9\\s'\\-\\/().]+$/.test(value)) {",
    "        app.alert(\"L'unité contient des caractères non autorisés.\\nCaractères autorisés : lettres, chiffres, espaces, apostrophes, tirets, slashs, parenthèses, points.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (/(.)\\1{3,}/.test(value)) {",
    "        app.alert(\"L'unité ne peut pas contenir 4 caractères identiques consécutifs.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("emailProfessionnel", "text", 0, r(x0, Y1.email.t, xHl, Y1.email.b));
style(f, "Courriel professionnel");
f.setAction("Keystroke", "event.change = event.change.toLowerCase();");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.toLowerCase().replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    var emailPerso = this.getField(\"emailPersonnel\").value.toLowerCase().replace(/^\\s+|\\s+$/g, \"\");",
    "    if (value.length === 0 && emailPerso.length === 0) {",
    "        app.alert(\"Au moins une adresse courriel (professionnelle ou personnelle) est requise.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    if (value.length > 254) {",
    "        app.alert(\"L'adresse courriel ne peut pas dépasser 254 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    var emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._+\\-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9.\\-]*[a-zA-Z0-9])?\\.[a-zA-Z]{2,}$/;",
    "    if (!emailRegex.test(value)) {",
    "        app.alert(\"Le courriel professionnel n'est pas valide.\\nExemple attendu : prenom.nom@gendarmerie.interieur.gouv.fr\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("emailPersonnel", "text", 0, r(xHr, Y1.email.t, x1, Y1.email.b));
style(f, "Courriel personnel");
f.setAction("Keystroke", "event.change = event.change.toLowerCase();");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.toLowerCase().replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    if (value.length > 254) {",
    "        app.alert(\"L'adresse courriel ne peut pas dépasser 254 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    var emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._+\\-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9.\\-]*[a-zA-Z0-9])?\\.[a-zA-Z]{2,}$/;",
    "    if (!emailRegex.test(value)) {",
    "        app.alert(\"Le courriel personnel n'est pas valide.\\nExemple attendu : prenom.nom@exemple.fr\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    var emailPro = this.getField(\"emailProfessionnel\").value.toLowerCase().replace(/^\\s+|\\s+$/g, \"\");",
    "    if (emailPro.length > 0 && emailPro === value) {",
    "        app.alert(\"Les adresses courriel professionnelle et personnelle doivent être différentes.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("telephoneProfessionnel", "text", 0, r(x0, Y1.tel.t, xHl, Y1.tel.b));
style(f, "TPH professionnel");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    var telPerso = this.getField(\"telephonePersonnel\").value.replace(/^\\s+|\\s+$/g, \"\");",
    "    if (value.length === 0 && telPerso.length === 0) {",
    "        app.alert(\"Au moins un numéro de téléphone (professionnel ou personnel) est requis.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    var clean = value.replace(/[\\s.\\-()]/g, \"\");",
    "    if (clean.charAt(0) === \"+\") clean = clean.substring(1);",
    "    if (!/^\\d+$/.test(clean)) {",
    "        app.alert(\"Le numéro de téléphone professionnel contient des caractères non autorisés.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (clean.length === 13 && clean.substring(0,4) === \"0033\") { clean = \"0\" + clean.substring(4); }",
    "    else if (clean.substring(0,2) === \"33\" && clean.length === 11) { clean = \"0\" + clean.substring(2); }",
    "    var valid = false;",
    "    if (clean.charAt(0) === \"0\") { valid = clean.length === 10; }",
    "    else if (clean.substring(0,2) === \"33\") { valid = clean.length === 11; }",
    "    else if (clean.substring(0,3) === \"687\" || clean.substring(0,3) === \"689\" ||",
    "             clean.substring(0,3) === \"681\" || clean.substring(0,3) === \"508\") {",
    "        valid = clean.length === 6 || clean.length === 9;",
    "    } else { valid = clean.length >= 7 && clean.length <= 15; }",
    "    if (!valid) {",
    "        app.alert(\"Le numéro de téléphone professionnel est invalide.\\nExemple attendu : 0612345678 ou +33612345678\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("telephonePersonnel", "text", 0, r(xHr, Y1.tel.t, x1, Y1.tel.b));
style(f, "TPH personnel");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    var clean = value.replace(/[\\s.\\-()]/g, \"\");",
    "    if (clean.charAt(0) === \"+\") clean = clean.substring(1);",
    "    if (!/^\\d+$/.test(clean)) {",
    "        app.alert(\"Le numéro de téléphone personnel contient des caractères non autorisés.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (clean.length === 13 && clean.substring(0,4) === \"0033\") { clean = \"0\" + clean.substring(4); }",
    "    else if (clean.substring(0,2) === \"33\" && clean.length === 11) { clean = \"0\" + clean.substring(2); }",
    "    var valid = false;",
    "    if (clean.charAt(0) === \"0\") { valid = clean.length === 10; }",
    "    else if (clean.substring(0,2) === \"33\") { valid = clean.length === 11; }",
    "    else if (clean.substring(0,3) === \"687\" || clean.substring(0,3) === \"689\" ||",
    "             clean.substring(0,3) === \"681\" || clean.substring(0,3) === \"508\") {",
    "        valid = clean.length === 6 || clean.length === 9;",
    "    } else { valid = clean.length >= 7 && clean.length <= 15; }",
    "    if (!valid) {",
    "        app.alert(\"Le numéro de téléphone personnel est invalide.\\nExemple attendu : 0612345678 ou +33612345678\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    var cleanPro = this.getField(\"telephoneProfessionnel\").value.replace(/[\\s.\\-()]/g, \"\");",
    "    if (cleanPro.charAt(0) === \"+\") cleanPro = cleanPro.substring(1);",
    "    if (cleanPro.length > 0 && cleanPro === clean) {",
    "        app.alert(\"Les numéros de téléphone professionnel et personnel doivent être différents.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));


// =============================================================================
// PAGE 2  (index 1)
// =============================================================================

// ── Section : Informations sur les faits ──────────────────────────────────────
f = this.addField("dateFaits", "text", 1, r(x0, Y2.row1.t, xT1, Y2.row1.b));
style(f, "Date des faits");
f.setAction("Format",    'AFDate_FormatEx("dd/mm/yyyy");');
f.setAction("Keystroke", 'AFDate_KeystrokeEx("dd/mm/yyyy");');
f.setAction("Validate", [
    "(function () {",
    "    var value = event.value;",
    "    if (!value || value.length === 0) { event.rc = true; return; }",
    "    var parts = value.split(\"/\");",
    "    if (parts.length !== 3) { event.rc = true; return; }",
    "    var day   = parseInt(parts[0], 10);",
    "    var month = parseInt(parts[1], 10);",
    "    var year  = parseInt(parts[2], 10);",
    "    var d = new Date(year, month - 1, day);",
    "    var today = new Date(); today.setHours(0, 0, 0, 0);",
    "    if (d > today) {",
    "        app.alert(\"La date des faits ne peut pas être dans le futur.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("commune", "text", 1, r(xT2, Y2.row1.t, xT2e, Y2.row1.b));
style(f, "Commune des faits");
f.setAction("Keystroke", "event.change = event.change.toUpperCase();");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.toUpperCase().replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    var reps = [",
    "        [/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],",
    "        [/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],",
    "        [/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]",
    "    ];",
    "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
    "    if (value.length < 2) {",
    "        app.alert(\"La commune doit contenir au moins 2 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (value.length > 100) {",
    "        app.alert(\"La commune ne peut pas dépasser 100 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (!/^[a-zA-Z\u00C0-\u024F\\s'\\-]+$/.test(value)) {",
    "        app.alert(\"La commune contient des caractères non autorisés.\\nCaractères autorisés : lettres, espaces, apostrophes, tirets.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (/(.)\\1{3,}/.test(value)) {",
    "        app.alert(\"La commune ne peut pas contenir 4 caractères identiques consécutifs.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("codePostal", "text", 1, r(xT3, Y2.row1.t, x1, Y2.row1.b));
style(f, "Code postal des faits");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    var cpRegex = /^((0[1-9]|[1-8][0-9]|9[0-5])[0-9]{3}|97[1-8][0-9]{2}|98[6-8][0-9]{2})$/;",
    "    if (!cpRegex.test(value)) {",
    "        app.alert(\"Code postal invalide (métropole ou DOM-TOM uniquement).\\nExemples : 75001, 97100, 98600\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("position", "combobox", 1, r(x0, Y2.row2.t, xHl, Y2.row2.b));
f.setItems([
    ["", ""],
    ["Non précisé",   "NON_PRECISE"],
    ["En service",    "EN_SERVICE"],
    ["Hors service",  "HORS_SERVICE"]
]);
style(f, "Position administrative");

f = this.addField("contexteMissionnel", "combobox", 1, r(xHr, Y2.row2.t, x1, Y2.row2.b));
f.setItems([
    ["", ""],
    ["Prévention de proximité",        "Prévention de proximité"],
    ["Police route",                   "Police route"],
    ["MO/RO",                          "MO/RO"],
    ["Police judiciaire",              "Police judiciaire"],
    ["Chargé d'accueil",               "Chargé d'accueil"],
    ["Sécurisation d'événement",       "Sécurisation d'événement"],
    ["Intervention spécialisée",       "Intervention spécialisée"],
    ["Surveillance particulière",      "Surveillance particulière"],
    ["Escorte/Transfèrement",          "Escorte/Transfèrement"],
    ["International",                  "International"],
    ["Relations interpersonnelles",    "Relations interpersonnelles"],
    ["Hors service",                   "Hors service"],
    ["Autre",                          "Autre"]
]);
style(f, "Contexte missionnel");

f = this.addField("qualificationInfraction", "combobox", 1, r(x0, Y2.qualif.t, x1, Y2.qualif.b));
f.setItems([
    ["", ""],
    ["OUTRAGE / MENACES",                                             "OUTRAGE / MENACES"],
    ["RÉBELLION avec ou sans outrage",                                "RÉBELLION avec ou sans outrage"],
    ["VIOLENCES hors rébellion",                                      "VIOLENCES hors rébellion"],
    ["REFUS D'OBTEMPÉRER / Mise en danger de la vie d'autrui",        "REFUS D'OBTEMPÉRER / Mise en danger de la vie d'autrui"],
    ["HARCÈLEMENT MORAL AU TRAVAIL / DISCRIMINATION",                 "HARCÈLEMENT MORAL AU TRAVAIL / DISCRIMINATION"],
    ["VIOLENCES SEXUELLES ET SEXISTES",                               "VIOLENCES SEXUELLES ET SEXISTES"],
    ["DÉFENSEUR DES DROITS",                                          "DÉFENSEUR DES DROITS"],
    ["ACCIDENT DE LA CIRC. ROUTIÈRE",                                 "ACCIDENT DE LA CIRC. ROUTIÈRE"],
    ["DIFFAMATION / INJURES",                                         "DIFFAMATION / INJURES"],
    ["TENTATIVE D'HOMICIDE",                                          "TENTATIVE D'HOMICIDE"],
    ["INFRACTION INVOLONTAIRE HORS ACCIDENT CIRC. ROUTIÈRE",          "INFRACTION INVOLONTAIRE HORS ACCIDENT CIRC. ROUTIÈRE"],
    ["AUTRE",                                                         "AUTRE"]
]);
style(f, "Qualification de l'infraction");

f = this.addField("resume", "text", 1, r(x0, Y2.resume.t, x1, Y2.resume.b));
f.multiline = true;
style(f, "Résumé de la situation");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    var reps = [",
    "        [/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],",
    "        [/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],",
    "        [/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]",
    "    ];",
    "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
    "    if (value.length > 5000) {",
    "        app.alert(\"Le résumé de la situation ne peut pas dépasser 5000 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("blessures", "text", 1, r(x0, Y2.bless.t, x1, Y2.bless.b));
f.multiline = true;
style(f, "Blessures (ITT et détail)");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    var reps = [",
    "        [/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],",
    "        [/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],",
    "        [/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]",
    "    ];",
    "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
    "    if (value.length > 2000) {",
    "        app.alert(\"Les blessures ne peuvent pas dépasser 2000 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

// ── Section : Informations judiciaires ───────────────────────────────────────
f = this.addField("partieCivile", "checkbox", 1, r(x0, Y2.pcCb.t, x0 + 13, Y2.pcCb.b));
style(f, "Constitution de partie civile");
f.setAction("MouseUp", [
    "(function () {",
    "    var montant = this.getField(\"montantPartieCivile\");",
    "    if (this.getField(\"partieCivile\").value === \"Off\") {",
    "        montant.value = \"\";",
    "        montant.readonly = true;",
    "    } else {",
    "        montant.readonly = false;",
    "    }",
    "})();"
].join("\n"));

f = this.addField("montantPartieCivile", "text", 1, r(x0, Y2.jud.t, xHl, Y2.jud.b));
style(f, "Montant dommages et intérêts demandés (€)");
f.readonly = true;   // désactivé tant que partieCivile n'est pas cochée
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    var isChecked = (this.getField(\"partieCivile\").value !== \"Off\");",
    "    if (!isChecked) {",
    "        if (value.length > 0) {",
    "            app.alert(\"Le montant ne peut être renseigné que si la constitution de partie civile est cochée.\", 1);",
    "            event.rc = false; return;",
    "        }",
    "        event.rc = true; return;",
    "    }",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    if (!/^\\d+$/.test(value)) {",
    "        app.alert(\"Le montant doit être un nombre entier positif (sans décimales).\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    var montant = parseInt(value, 10);",
    "    if (isNaN(montant) || montant < 0) {",
    "        app.alert(\"Le montant doit être un nombre entier positif.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (montant > 999999999) {",
    "        app.alert(\"Le montant est trop élevé (maximum : 999 999 999).\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("dateAudience", "text", 1, r(xHr, Y2.jud.t, x1, Y2.jud.b));
style(f, "Date d'audience (JJ/MM/AAAA HH:MM)");
f.setAction("Format",    'AFDate_FormatEx("dd/mm/yyyy HH:MM");');
f.setAction("Keystroke", 'AFDate_KeystrokeEx("dd/mm/yyyy HH:MM");');
f.setAction("Validate", [
    "(function () {",
    "    var value = event.value;",
    "    if (!value || value.length === 0) { event.rc = true; return; }",
    "    if (!/^\\d{2}\\/\\d{2}\\/\\d{4} \\d{2}:\\d{2}$/.test(value)) {",
    "        app.alert(\"Format invalide.\\nFormat attendu : JJ/MM/AAAA HH:MM (ex. : 25/01/2024 14:30)\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    var datePart = value.substring(0, 10);",
    "    var timePart = value.substring(11);",
    "    var dp = datePart.split(\"/\");",
    "    var day = parseInt(dp[0], 10), month = parseInt(dp[1], 10), year = parseInt(dp[2], 10);",
    "    var tp = timePart.split(\":\");",
    "    var hours = parseInt(tp[0], 10), mins = parseInt(tp[1], 10);",
    "    if (hours > 23 || mins > 59) {",
    "        app.alert(\"L'heure est invalide (heures : 00-23, minutes : 00-59).\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    var d = new Date(year, month - 1, day);",
    "    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {",
    "        app.alert(\"La date est invalide.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("qualificationsPenales", "text", 1, r(x0, Y2.qualPen.t, x1, Y2.qualPen.b));
f.multiline = true;
style(f, "Qualification pénale susceptible d'être retenue");
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) { event.rc = true; return; }",
    "    var reps = [",
    "        [/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],",
    "        [/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],",
    "        [/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]",
    "    ];",
    "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
    "    if (value.length > 2000) {",
    "        app.alert(\"Les qualifications pénales ne peuvent pas dépasser 2000 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

// ── Section : Soutiens demandés ───────────────────────────────────────────────
f = this.addField("soutienMedical", "checkbox", 1, r(x0, Y2.sout.t, x0 + 13, Y2.sout.b));
style(f, "Soutien médical");

f = this.addField("soutienPsychologique", "checkbox", 1, r(xT2, Y2.sout.t, xT2 + 13, Y2.sout.b));
style(f, "Soutien psychologique");

f = this.addField("soutienSocial", "checkbox", 1, r(xT3, Y2.sout.t, xT3 + 13, Y2.sout.b));
style(f, "Soutien social");

// ── Section : Protection des données ─────────────────────────────────────────
f = this.addField("rgpdConsent", "checkbox", 1, r(x0, Y2.rgpd.t, x0 + 13, Y2.rgpd.b));
style(f, "Consentement RGPD");
f.required = true;

// ── Section : Engagement de responsabilité ────────────────────────────────────
f = this.addField("engagementHonneur", "checkbox", 1, r(x0, Y2.engag.t, x0 + 13, Y2.engag.b));
style(f, "Certification sur l'honneur");
f.required = true;

f = this.addField("signatureNom", "text", 1, r(x0, Y2.sign.t, xHl, Y2.sign.b));
style(f, "Prénom et nom (signature)"); f.required = true;
f.setAction("Validate", [
    "(function () {",
    "    event.value = event.value.replace(/^\\s+|\\s+$/g, \"\");",
    "    var value = event.value;",
    "    if (value.length === 0) {",
    "        app.alert(\"Le prénom et nom sont obligatoires.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    var reps = [",
    "        [/\u2018/g,\"'\"],[/\u2019/g,\"'\"],[/\u201B/g,\"'\"],[/\u201A/g,\"'\"],[/\u2032/g,\"'\"],",
    "        [/\u2013/g,\"-\"],[/\u2014/g,\"-\"],[/\u2011/g,\"-\"],[/\u2212/g,\"-\"],",
    "        [/\u00A0/g,\" \"],[/\u2009/g,\" \"],[/\u202F/g,\" \"]",
    "    ];",
    "    for (var i = 0; i < reps.length; i++) value = value.replace(reps[i][0], reps[i][1]);",
    "    if (value.length < 2) {",
    "        app.alert(\"Le prénom et nom doivent contenir au moins 2 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (value.length > 100) {",
    "        app.alert(\"Le prénom et nom ne peuvent pas dépasser 100 caractères.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (!/^[a-zA-Z\u00C0-\u024F\\s'\\-]+$/.test(value)) {",
    "        app.alert(\"Le prénom et nom contiennent des caractères non autorisés.\\nCaractères autorisés : lettres, espaces, apostrophes, tirets.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    if (/(.)\\1{3,}/.test(value)) {",
    "        app.alert(\"Le prénom et nom ne peuvent pas contenir 4 caractères identiques consécutifs.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));

f = this.addField("signatureDate", "text", 1, r(xHr, Y2.sign.t, x1, Y2.sign.b));
style(f, "Date (signature)");
f.setAction("Format",    'AFDate_FormatEx("dd/mm/yyyy");');
f.setAction("Keystroke", 'AFDate_KeystrokeEx("dd/mm/yyyy");');
f.setAction("Validate", [
    "(function () {",
    "    var value = event.value;",
    "    if (!value || value.length === 0) { event.rc = true; return; }",
    "    var parts = value.split(\"/\");",
    "    if (parts.length !== 3) { event.rc = true; return; }",
    "    var day   = parseInt(parts[0], 10);",
    "    var month = parseInt(parts[1], 10);",
    "    var year  = parseInt(parts[2], 10);",
    "    var d = new Date(year, month - 1, day);",
    "    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {",
    "        app.alert(\"La date de signature est invalide.\", 1);",
    "        event.rc = false; return;",
    "    }",
    "    event.rc = true;",
    "})();"
].join("\n"));


// Pré-remplir la date de signature avec la date du jour
this.getField("signatureDate").value = util.printd("dd/mm/yyyy", new Date());


// =============================================================================
// Fin – résumé
// =============================================================================
app.alert(
    this.numFields + " champs ajoutés !\n\n" +
    "Si des champs sont décalés par rapport aux zones du formulaire,\n" +
    "ajustez les valeurs Y dans le script.\n\n" +
    "Pensez à enregistrer le fichier (Ctrl+S) après vérification.",
    3
);
