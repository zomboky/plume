// Mode source : le document en Markdown brut dans CodeMirror 6.
import { EditorSelection, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { bracketMatching, syntaxHighlighting } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { search, searchKeymap } from '@codemirror/search'
import { plumeHighlighter } from '@/editor/highlight'

export class SourceEditor {
  readonly view: EditorView
  private readonly extensions: Extension[]

  constructor(parent: HTMLElement, onChange: () => void) {
    const extensions: Extension[] = (this.extensions = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      history(),
      bracketMatching(),
      closeBrackets(),
      search({ top: true }),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(plumeHighlighter),
      keymap.of([...closeBracketsKeymap, ...historyKeymap, ...searchKeymap, indentWithTab, ...defaultKeymap]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange()
      }),
      EditorView.contentAttributes.of({ spellcheck: 'false', 'aria-label': 'Markdown' })
    ])
    this.view = new EditorView({ state: EditorState.create({ doc: '', extensions }), parent })
    this.view.dom.classList.add('source-editor')
  }

  getText(): string {
    return this.view.state.doc.toString()
  }

  /** Remplace le texte sans garder d'historique d'annulation. */
  setText(text: string): void {
    this.view.setState(EditorState.create({ doc: text, extensions: this.extensions }))
  }

  focus(): void {
    this.view.focus()
  }

  get scroller(): HTMLElement {
    return this.view.scrollDOM
  }

  /** Entoure la sélection de `before`/`after` (gras, italique… en mode source). */
  wrapSelection(before: string, after = before): void {
    const { state } = this.view
    const changes = state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to)
      const wrapped = text.startsWith(before) && text.endsWith(after) && text.length >= before.length + after.length
      if (wrapped) {
        const inner = text.slice(before.length, text.length - after.length)
        return { changes: { from: range.from, to: range.to, insert: inner }, range: rangeOf(range.from, range.from + inner.length) }
      }
      return {
        changes: [
          { from: range.from, insert: before },
          { from: range.to, insert: after }
        ],
        range: rangeOf(range.from + before.length, range.to + before.length)
      }
    })
    this.view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }))
    this.view.focus()
  }

  /** Préfixe les lignes sélectionnées (titres, citations, listes). */
  setLinePrefix(prefix: string, pattern: RegExp): void {
    const { state } = this.view
    const range = state.selection.main
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    const changes = []
    for (let n = first; n <= last; n++) {
      const line = state.doc.line(n)
      const m = pattern.exec(line.text)
      const existing = m ? m[0].length : 0
      changes.push({ from: line.from, to: line.from + existing, insert: m && m[0] === prefix ? '' : prefix })
    }
    this.view.dispatch({ changes, userEvent: 'input' })
    this.view.focus()
  }
}

function rangeOf(from: number, to: number) {
  return EditorSelection.range(from, to)
}
