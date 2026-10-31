# Plume

Éditeur Markdown WYSIWYG pour Windows. Le texte est rendu pendant la frappe. Les marqueurs
Markdown (`**`, `#`, `[…](…)`…) n'apparaissent que lorsque le curseur est dans l'élément.
Le fichier enregistré reste du Markdown standard, sans perte lors d'un passage par le mode
source.

## Installation

Dans `dist/` après la compilation (voir plus bas) :

- `Plume-Setup-<version>.exe` : installateur (choix du dossier, raccourcis Bureau et menu
  Démarrer, association des fichiers `.md`).
- `Plume-<version>-portable.exe` : version portable, sans installation. Ses réglages vont dans
  un dossier `data\` placé à côté de l'exécutable.

La version installée range ses réglages et la liste des fichiers récents dans
`%APPDATA%\Plume`.

## Développement

Prérequis : Node.js 24 et pnpm 11.

```bash
pnpm install
```

Au premier lancement, si Electron ne démarre pas, télécharger son binaire :

```bash
node node_modules/electron/install.js
```

| Commande | Rôle |
| --- | --- |
| `pnpm dev` | lance l'application avec rechargement à chaud |
| `pnpm test` | tests unitaires (aller-retour Markdown sur le corpus `tests/corpus`, logique de l'éditeur) |
| `pnpm test:e2e` | compile puis lance les tests de bout en bout Playwright (`tests/e2e`) |
| `pnpm typecheck` | vérification TypeScript |
| `pnpm build:win` | installateur NSIS et exécutable portable dans `dist/` |
| `pnpm icon` | régénère les icônes à partir de `app/renderer/src/assets/plume.svg` |
| `pnpm licenses:file` | régénère `THIRD_PARTY_LICENSES` |

Structure : `app/main` (processus principal Electron), `app/preload` (pont sécurisé),
`app/renderer` (interface ; éditeur Milkdown/ProseMirror, CodeMirror 6 pour le code et le mode
source), `app/shared` (types et préférences communs).

## Fonctions

**Fichiers.** Nouveau, ouvrir, ouvrir un dossier, enregistrer (Ctrl+S), enregistrer sous,
fichiers récents, ouverture rapide floue (Ctrl+P), enregistrement automatique en option,
conservation des fins de ligne (LF/CRLF) et suppression du BOM. Un point `•` dans le titre
signale les modifications non enregistrées.

**Édition en direct.**
- Titres, gras, italique, souligné, barré, code en ligne, liens, images, notes de bas de page,
  citations, listes à puces, numérotées et de tâches (cases cliquables), règles horizontales.
- Tableaux GFM : `|a|b|` puis Entrée, ou Ctrl+T.
- Blocs de code coloré : ```` ```lang ```` puis Entrée, avec un champ de langue.
- Formules KaTeX : `$$` puis Entrée ; formules en ligne `$…$` en option.
- Diagrammes Mermaid.
- Table des matières `[TOC]` et en-tête YAML (`---` en début de document).
- Paires automatiques de `( [ { " *` et de la ponctuation, en option.

**Mode source** (Ctrl+/). Markdown brut coloré. Le texte d'origine est conservé tel quel tant
qu'il n'est pas modifié.

**Interface.**
- Menus Fichier, Édition, Paragraphe, Format, Affichage, Thèmes et Aide, avec leurs raccourcis.
- Menu contextuel.
- Barre latérale (Ctrl+Maj+L) avec trois onglets : Fichiers, Plan (Ctrl+Maj+1) et Recherche
  dans le dossier (Ctrl+Maj+F).
- Rechercher et remplacer (Ctrl+F, Ctrl+H).
- Mode focus (F8), mode machine à écrire (F9), plein écran (F11), zoom (Ctrl+Maj+= / - / 0).
- Barre d'état avec le nombre de mots.
- Préférences (Ctrl+,).

**Export.** HTML avec ou sans styles, PDF et impression. Les formules et les diagrammes sont
rendus dans le fichier exporté.

**Thèmes.** Dark 2026 (par défaut), Clair, Papier.

### Personnalisations

1. **Bloc de code en un clic** : l'entrée « Bloc de code » (Ctrl+Maj+K) est au premier niveau
   du menu contextuel.
   - Sur un paragraphe vide, elle le transforme en bloc de code.
   - Sinon, elle insère un bloc de code juste après et place le curseur dedans.
2. **Apparence par défaut** : thème « Dark 2026 ». Il reprend les valeurs de l'aperçu Markdown
   de VS Code :
   - fond `#121314`, texte `#BBBEBF`, liens `#48A0C7` ;
   - police Segoe WPC 14 px, interligne 1,6 ;
   - mode source coloré (titres `#79C0FF`).
3. **Marges réglables** : deux poignées de part et d'autre de la colonne de texte.
   - Glisser une poignée élargit ou rétrécit la colonne symétriquement.
   - Amenée au bord, la colonne passe en pleine largeur.
   - Un double-clic bascule entre pleine largeur et largeur précédente.
   - La largeur est mémorisée. Elle se règle aussi dans Préférences ▸ Apparence (px, % ou
     pleine largeur).

## Limites connues

- Non implémentés :
  - complétion des émojis `:nom:` ;
  - surlignage `==…==`, indices et exposants ;
  - encadrés d'alerte GitHub ;
  - collage d'une image depuis le presse-papiers (le glisser-déposer de fichiers image
    fonctionne) ;
  - export via Pandoc (Word, etc.).
- L'option « formules en ligne » s'applique au prochain document ouvert.
- La disposition `elk` des diagrammes Mermaid est désactivée : la bibliothèque elkjs est sous
  licence EPL-2.0, non permissive.

## Licences

Code de Plume : MIT. Les bibliothèques tierces embarquées et leurs licences (MIT, ISC, BSD,
Apache-2.0) sont listées dans `THIRD_PARTY_LICENSES`.
