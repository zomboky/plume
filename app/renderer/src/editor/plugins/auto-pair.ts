// Fermeture automatique des crochets et guillemets (préférence « autoPair »).
import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'

export const autoPairOptions = { enabled: true }

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', '«': '»' }
const CLOSERS = new Set(Object.values(PAIRS))

export const autoPair = $prose(
  () =>
    new Plugin({
      key: new PluginKey('plume-auto-pair'),
      props: {
        handleTextInput(view, from, to, text) {
          if (!autoPairOptions.enabled || view.state.selection.$from.parent.type.spec.code) return false
          const { state } = view
          const next = state.doc.textBetween(to, Math.min(to + 1, state.doc.content.size), '', '')
          // Saisie d'un fermant déjà présent : on le saute.
          if (CLOSERS.has(text) && next === text && from === to) {
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to + 1)))
            return true
          }
          const close = PAIRS[text]
          if (!close) return false
          const prev = from > 0 ? state.doc.textBetween(from - 1, from, '', '') : ''
          // Guillemet droit après une lettre : fin de citation, pas de paire.
          if (text === '"' && /[\p{L}\p{N}]/u.test(prev)) return false
          if (next && /[\p{L}\p{N}]/u.test(next)) return false
          const selected = state.doc.textBetween(from, to, '', '')
          let tr = state.tr.insertText(text + selected + close, from, to)
          tr = tr.setSelection(TextSelection.create(tr.doc, from + 1, from + 1 + selected.length))
          view.dispatch(tr)
          return true
        },
        handleKeyDown(view, event) {
          if (!autoPairOptions.enabled || event.key !== 'Backspace') return false
          const { state } = view
          const { $from, empty } = state.selection
          if (!empty || $from.parent.type.spec.code) return false
          const pos = $from.pos
          const before = pos > $from.start() ? state.doc.textBetween(pos - 1, pos, '', '') : ''
          const after = pos < $from.end() ? state.doc.textBetween(pos, pos + 1, '', '') : ''
          if (before && PAIRS[before] === after) {
            view.dispatch(state.tr.delete(pos - 1, pos + 1))
            return true
          }
          return false
        }
      }
    })
)
