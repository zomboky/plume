// Raccourcis de saisie validés par Entrée, comme dans un éditeur Markdown :
// ```lang, $$, [toc], |a|b|, --- (en-tête YAML en début de document ou règle), ***.
import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@milkdown/kit/prose/state'
import type { Node as PmNode } from '@milkdown/kit/prose/model'
import { createTable } from '../block-commands'

function replaceParagraph(state: EditorState, node: PmNode, cursorInside: boolean): Transaction {
  const { $from } = state.selection
  const start = $from.before()
  const end = $from.after()
  let tr = state.tr.replaceWith(start, end, node)
  if (cursorInside) {
    tr = tr.setSelection(TextSelection.create(tr.doc, start + 1))
  } else {
    const after = start + node.nodeSize
    const next = tr.doc.nodeAt(after)
    if (!next || !next.isTextblock) tr = tr.insert(after, state.schema.nodes.paragraph.create())
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)))
  }
  return tr.scrollIntoView()
}

export function enterRule(state: EditorState): Transaction | null {
  const { selection, schema } = state
  const { $from, empty } = selection
  if (!empty || $from.parent.type !== schema.nodes.paragraph) return null
  if ($from.parentOffset !== $from.parent.content.size) return null
  const text = $from.parent.textContent
  const topLevel = $from.depth === 1

  let m = /^```([\w+#.-]*)\s*$/.exec(text)
  if (m) return replaceParagraph(state, schema.nodes.code_block.create({ language: m[1] }), true)
  if (/^\$\$\s*$/.test(text)) return replaceParagraph(state, schema.nodes.math_block.create(), true)
  if (/^\[toc\]$/i.test(text.trim()) && topLevel) return replaceParagraph(state, schema.nodes.toc.create(), false)
  if (text === '---' && topLevel && $from.index(0) === 0 && !state.doc.firstChild?.type.name.startsWith('front')) {
    return replaceParagraph(state, schema.nodes.frontmatter.create(), true)
  }
  if (/^(---|\*\*\*|___)$/.test(text)) return replaceParagraph(state, schema.nodes.hr.create(), false)
  m = /^\|(.+)\|\s*$/.exec(text)
  if (m && topLevel) {
    const cells = m[1].split('|').map((c) => c.trim())
    const table = createTable(schema, cells, 1)
    const start = $from.before()
    let tr = state.tr.replaceWith(start, $from.after(), table)
    // Curseur dans la première cellule de la ligne de données.
    const headerSize = table.firstChild!.nodeSize
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(start + 1 + headerSize + 1)))
    return tr.scrollIntoView()
  }
  return null
}

export const enterRules = $prose(
  () =>
    new Plugin({
      key: new PluginKey('plume-enter-rules'),
      props: {
        handleKeyDown(view, event) {
          if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false
          const tr = enterRule(view.state)
          if (!tr) return false
          view.dispatch(tr)
          return true
        }
      }
    })
)
