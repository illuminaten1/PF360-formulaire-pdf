# PF360 — Générateur de formulaire PDF interactif

Génère un PDF interactif (AcroForm) à partir du formulaire HTML de demande de protection fonctionnelle.

## Fonctionnement

1. Puppeteer ouvre `formulaire-pdf-print.html` en mode impression à la largeur A4 exacte
2. `getBoundingClientRect()` mesure chaque champ `[data-field]` dans le DOM
3. Les positions en pixels sont converties en points PDF (×0.75, 96 → 72 DPI)
4. pdf-lib place les champs AcroForm aux coordonnées exactes mesurées

Aucune coordonnée hardcodée — alignement pixel-perfect garanti.

## Installation

```bash
npm install
```

## Utilisation

```bash
node generate-pdf-form.js [chemin/sortie.pdf]
```

Ou via npm :

```bash
npm run generate
```

Le PDF généré est prêt à être ouvert dans Acrobat pour y appliquer les scripts de champs (`acrobat-add-fields.js` / `acrobat-delete-fields.js`).

## Fichiers

| Fichier | Rôle |
|---------|------|
| `generate-pdf-form.js` | Script principal de génération du PDF |
| `formulaire-pdf-print.html` | Gabarit HTML du formulaire (version impression) |
| `acrobat-add-fields.js` | Script Acrobat pour ajouter les champs interactifs |
| `acrobat-delete-fields.js` | Script Acrobat pour supprimer les champs |
| `code-qr.png` | QR code intégré dans le PDF |

## Dépendances

- [Puppeteer](https://pptr.dev/) — rendu HTML headless
- [pdf-lib](https://pdf-lib.js.org/) — manipulation du PDF et création des champs AcroForm
