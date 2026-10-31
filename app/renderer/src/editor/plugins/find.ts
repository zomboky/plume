// Rechercher / remplacer dans le document visuel (surlignage par décorations).
import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'

export interface FindState {
  query: string
  caseSensitive: boolean
  matches: { from: number; to: number }[]
  index: number
}

export const findKey = new PluginKey<FindState>('plume-find')

function computeMatches(state: EditorState, query: string, caseSensitive: boolean): FindState['matches'] {
  if (!query) return []
  const needle = caseSensitive ? query : query.toLowerCase()
  const out: FindState['matches'] = []
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const map: number[] = []
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) map.push(pos + 1 + offset + i)
        text += child.text
      } else {
        map.push(-1)
        text += '\u0000'
      }
    })
    const hay = caseSensitive ? text : text.toLowerCase()
    let i = hay.indexOf(needle)
    while (i >= 0) {
      const from = map[i]
      const to = map[i + needle.length - 1]
      if (from >= 0 && to >= 0) out.push({ from, to: to + 1 })
      i = hay.indexOf(needle, i + needle.length)
    }
    return false
  })
  return out
}

const empty: FindState = { query: '', caseSensitive: false, matches: [], index: -1 }

export const findPlugin = $prose(
  () =>
    new Plugin<FindState>({
      key: findKey,
      state: {
        init: () => empty,
        apply(tr, value, _old, state) {
          const meta = tr.getMeta(findKey) as Partial<FindState> | undefined
          if (meta) {
            const query = meta.query ?? value.query
            const caseSensitive = meta.caseSensitive ?? value.caseSensitive
            const matches = computeMatches(state, query, caseSensitive)
            let index = meta.index ?? value.index
            if (meta.query !== undefined || meta.caseSensitive !== undefined) {
              const head = state.selection.from
              index = matches.findIndex((m) => m.from >= head)
              if (index < 0) index = matches.length ? 0 : -1
            }
            return { query, caseSensitive, matches, index: Math.min(index, matches.length - 1) }
          }
          if (tr.docChanged && value.query) {
            const matches = computeMatches(state, value.query, value.caseSensitive)
            return { ...value, matches, index: Math.min(value.index, matches.length - 1) }
          }
          return value
        }
      },
      props: {
        decorations(state) {
          const fs = findKey.getState(state)
          if (!fs || !fs.matches.length) return DecorationSet.empty
          return DecorationSet.create(
            state.doc,
            fs.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === fs.index ? 'find-match find-current' : 'find-match' }))
          )
        }
      }
    })
)

function select(view: EditorView, tr: Transaction, m: { from: number; to: number } | undefined): void {
  if (m) tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView()
  view.dispatch(tr)
}

export function setFindQuery(view: EditorView, query: string, caseSensitive: boolean): FindState {
  view.dispatch(view.state.tr.setMeta(findKey, { query, caseSensitive }))
  const fs = findKey.getState(view.state)!
  if (fs.index >= 0) {
    const m = fs.matches[fs.index]
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, m.from, m.to)).scrollIntoView())
  }
  return fs
}

export function findStep(view: EditorView, dir: 1 | -1): FindState {
  const fs = findKey.getState(view.state)!
  if (!fs.matches.length) return fs
  const index = (fs.index + dir + fs.matches.length) % fs.matches.length
  select(view, view.state.tr.setMeta(findKey, { index }), fs.matches[index])
  return findKey.getState(view.state)!
}

export function replaceCurrent(view: EditorView, replacement: string): FindState {
  const fs = findKey.getState(view.state)!
  const m = fs.matches[fs.index]
  if (!m) return fs
  view.dispatch(view.state.tr.insertText(replacement, m.from, m.to))
  const after = findKey.getState(view.state)!
  const next = after.matches.findIndex((x) => x.from >= m.from + replacement.length)
  const index = next >= 0 ? next : after.matches.length ? 0 : -1
  select(view, view.state.tr.setMeta(findKey, { index }), after.matches[index])
  return findKey.getState(view.state)!
}

export function replaceAll(view: EditorView, replacement: string): number {
  const fs = findKey.getState(view.state)!
  if (!fs.matches.length) return 0
  const tr = view.state.tr
  for (const m of [...fs.matches].reverse()) tr.insertText(replacement, m.from, m.to)
  view.dispatch(tr)
  return fs.matches.length
}

export function clearFind(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(findKey, { query: '' }))
}
