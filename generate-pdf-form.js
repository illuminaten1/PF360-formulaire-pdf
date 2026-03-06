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

    const fPrenom = form.createTextField('prenom');
    fPrenom.addToPage(pageOf('prenom'), { ...at('prenom'), ...S });
    fPrenom.enableRequired();

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

    const fEmailPro = form.createTextField('emailProfessionnel');
    fEmailPro.addToPage(pageOf('emailProfessionnel'), { ...at('emailProfessionnel'), ...S });

    const fEmailPerso = form.createTextField('emailPersonnel');
    fEmailPerso.addToPage(pageOf('emailPersonnel'), { ...at('emailPersonnel'), ...S });

    const fTelPro = form.createTextField('telephoneProfessionnel');
    fTelPro.addToPage(pageOf('telephoneProfessionnel'), { ...at('telephoneProfessionnel'), ...S });

    const fTelPerso = form.createTextField('telephonePersonnel');
    fTelPerso.addToPage(pageOf('telephonePersonnel'), { ...at('telephonePersonnel'), ...S });

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 2
    // ════════════════════════════════════════════════════════════════════════

    const fDateFaits = form.createTextField('dateFaits');
    fDateFaits.addToPage(pageOf('dateFaits'), { ...at('dateFaits'), ...S });

    const fCommune = form.createTextField('commune');
    fCommune.addToPage(pageOf('commune'), { ...at('commune'), ...S });

    const fCP = form.createTextField('codePostal');
    fCP.addToPage(pageOf('codePostal'), { ...at('codePostal'), ...S });

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
    fResume.addToPage(pageOf('resume'), { ...at('resume'), ...S, fontSize: 5 });

    const fBless = form.createTextField('blessures');
    fBless.enableMultiline();
    fBless.addToPage(pageOf('blessures'), { ...at('blessures'), ...S, fontSize: 5 });

    const fPC = form.createCheckBox('partieCivile');
    fPC.addToPage(pageOf('partieCivile'), { ...at('partieCivile'), ...S });

    const fMontant = form.createTextField('montantPartieCivile');
    fMontant.addToPage(pageOf('montantPartieCivile'), { ...at('montantPartieCivile'), ...S });

    const fDateAudDate = form.createTextField('dateAudienceDate');
    fDateAudDate.addToPage(pageOf('dateAudienceDate'), { ...at('dateAudienceDate'), ...S });

    const fDateAudTime = form.createTextField('dateAudienceTime');
    fDateAudTime.addToPage(pageOf('dateAudienceTime'), { ...at('dateAudienceTime'), ...S });

    const fQualPen = form.createTextField('qualificationsPenales');
    fQualPen.enableMultiline();
    fQualPen.addToPage(pageOf('qualificationsPenales'), { ...at('qualificationsPenales'), ...S });

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

    const fSignDate = form.createTextField('signatureDate');
    fSignDate.addToPage(pageOf('signatureDate'), { ...at('signatureDate'), ...S });

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
