// Documents d'aide générés : référence Markdown et liste des raccourcis.
import type { CommandRegistry } from '../commands'
import { formatShortcut, getLocale } from '../i18n'

const REFERENCE_FR = `# Référence Markdown

Plume affiche le Markdown pendant la frappe. Les marqueurs (\`##\`, \`**\`…) apparaissent
quand le curseur est dans l'élément.

## Blocs

| Saisie | Résultat |
| --- | --- |
| \`# \` à \`###### \` | titres 1 à 6 |
| \`> \` | citation |
| \`- \`, \`* \`, \`1. \` | listes |
| \`- [ ] \` | liste de tâches |
| \`\\\`\\\`\\\`langue\` puis Entrée | bloc de code |
| \`$$\` puis Entrée | bloc de formule |
| \`\\|a\\|b\\|\` puis Entrée | tableau |
| \`[toc]\` puis Entrée | table des matières |
| \`---\` puis Entrée en début de document | en-tête YAML |
| \`---\` ou \`***\` puis Entrée | règle horizontale |

## En ligne

- \`**gras**\`, \`*italique*\`, \`~~barré~~\`, \`\\\`code\\\`\`, \`<u>souligné</u>\`
- \`[texte](https://exemple.fr)\` : Ctrl+clic pour ouvrir le lien
- \`![texte](image.png)\` : chemin relatif au document, ou glisser-déposer
- \`[^1]\` et \`[^1]: texte\` : note de bas de page

## Diagrammes

\`\`\`mermaid
graph LR
  Idée --> Brouillon --> Texte
\`\`\`

## Formule

$$
e^{i\\pi} + 1 = 0
$$
`

const REFERENCE_EN = `# Markdown Reference

Plume renders Markdown as you type. Markers (\`##\`, \`**\`…) show when the caret is inside the element.

| Input | Result |
| --- | --- |
| \`# \` to \`###### \` | headings 1 to 6 |
| \`> \` | quote |
| \`- \`, \`* \`, \`1. \` | lists |
| \`- [ ] \` | task list |
| \`\\\`\\\`\\\`lang\` then Enter | code block |
| \`$$\` then Enter | math block |
| \`\\|a\\|b\\|\` then Enter | table |
| \`[toc]\` then Enter | table of contents |
| \`---\` then Enter at the top | YAML front matter |
`

export function helpMarkdown(registry: CommandRegistry, which: 'markdown' | 'shortcuts'): string {
  const fr = getLocale() === 'fr'
  if (which === 'markdown') return fr ? REFERENCE_FR : REFERENCE_EN
  const rows = registry
    .all()
    .filter((c) => c.shortcut)
    .map((c) => `| ${registry.label(c.id)} | \`${formatShortcut(c.shortcut!)}\` |`)
  const head = fr ? '# Raccourcis clavier\n\n| Commande | Raccourci |\n| --- | --- |' : '# Keyboard Shortcuts\n\n| Command | Shortcut |\n| --- | --- |'
  return `${head}\n${rows.join('\n')}\n`
}
