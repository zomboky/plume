// Classes CSS de coloration syntaxique, partagées par les blocs de code,
// le mode source et l'export. Les couleurs sont définies par chaque thème.
import { tagHighlighter, tags as t } from '@lezer/highlight'

export const plumeHighlighter = tagHighlighter([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.self, t.null], class: 'tok-keyword' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], class: 'tok-type' },
  { tag: [t.number, t.bool, t.atom, t.unit], class: 'tok-number' },
  { tag: [t.string, t.special(t.string), t.regexp, t.character, t.docString], class: 'tok-string' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 'tok-comment' },
  { tag: [t.propertyName, t.attributeName], class: 'tok-property' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], class: 'tok-function' },
  { tag: [t.variableName, t.labelName], class: 'tok-variable' },
  { tag: [t.tagName, t.angleBracket], class: 'tok-tag' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], class: 'tok-punctuation' },
  { tag: t.heading, class: 'tok-heading' },
  { tag: t.quote, class: 'tok-quote' },
  { tag: t.list, class: 'tok-list' },
  { tag: [t.link, t.url], class: 'tok-link' },
  { tag: t.emphasis, class: 'tok-emphasis' },
  { tag: t.strong, class: 'tok-strong' },
  { tag: t.strikethrough, class: 'tok-strike' },
  { tag: t.monospace, class: 'tok-monospace' },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta, t.documentMeta], class: 'tok-meta' },
  { tag: t.invalid, class: 'tok-invalid' }
])
