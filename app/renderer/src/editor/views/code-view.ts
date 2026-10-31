// Vue CodeMirror 6 pour les blocs de code, de formule et l'en-tête YAML.
// Les blocs de formule et les diagrammes Mermaid affichent un aperçu rendu ;
// leur source n'est visible que lorsque le curseur est dans le bloc.
import { Compartment, EditorState as CMState } from '@codemirror/state'
import {
  EditorView as CMView,
  drawSelection,
  highlightActiveLine,
  keymap as cmKeymap,
  lineNumbers,
  type ViewUpdate
} from '@codemirror/view'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { classHighlighter } from '@lezer/highlight'
import type { Node as PmNode } from '@milkdown/kit/prose/model'
import { Selection, TextSelection, type Command } from '@milkdown/kit/prose/state'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { redo, undo } from '@milkdown/kit/prose/history'
import { exitCode } from '@milkdown/kit/prose/commands'
import { loadLanguage, LANGUAGE_NAMES } from '../languages'
import { renderMath } from '../render/math'
import { renderMermaid } from '../render/mermaid'
import { t } from '../../i18n'

export const codeOptions = { lineNumbers: false, wrap: true }
const liveViews = new Set<CodeView>()

export function applyCodeOptions(opts: Partial<typeof codeOptions>): void {
  Object.assign(codeOptions, opts)
  for (const v of liveViews) v.reconfigureOptions()
}

/** Re-rend les aperçus Mermaid (changement de thème). */
export function refreshPreviews(): void {
  for (const v of liveViews) v.renderPreview(true)
}

type Kind = 'code' | 'math' | 'frontmatter'

let datalistReady = false
function ensureDatalist(): void {
  if (datalistReady) return
  datalistReady = true
  const list = document.createElement('datalist')
  list.id = 'plume-languages'
  for (const name of LANGUAGE_NAMES) {
    const opt = document.createElement('option')
    opt.value = name
    list.append(opt)
  }
  document.body.append(list)
}

export class CodeView implements NodeView {
  dom: HTMLElement
  cm: CMView
  private updating = false
  private lang = new Compartment()
  private opts = new Compartment()
  private preview: HTMLElement | null = null
  private langInput: HTMLInputElement | null = null
  private previewTimer = 0
  private lastPreview = ''

  constructor(
    private node: PmNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private kind: Kind
  ) {
    this.dom = document.createElement('div')
    this.dom.className = `code-block-view kind-${kind}`
    this.cm = new CMView({
      state: CMState.create({
        doc: node.textContent,
        extensions: [
          cmKeymap.of([...this.escapeKeymap(), ...closeBracketsKeymap, indentWithTab, ...defaultKeymap]),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          syntaxHighlighting(classHighlighter),
          this.lang.of([]),
          this.opts.of(this.optionExtensions()),
          CMView.updateListener.of((u) => this.forwardUpdate(u)),
          CMView.domEventHandlers({
            focus: () => this.setEditing(true),
            blur: () => this.setEditing(false)
          })
        ]
      })
    })
    this.cm.dom.classList.add('code-editor')

    if (kind === 'code') {
      ensureDatalist()
      const input = document.createElement('input')
      input.className = 'code-lang'
      input.placeholder = t('code.languagePlaceholder')
      input.setAttribute('list', 'plume-languages')
      input.spellcheck = false
      input.value = node.attrs.language ?? ''
      input.addEventListener('input', () => this.setLanguageAttr(input.value.trim()))
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          this.cm.focus()
        }
      })
      this.langInput = input
    }

    this.dom.append(this.cm.dom)
    if (this.langInput) this.dom.append(this.langInput)
    if (kind === 'frontmatter') void this.configureLanguage('yaml')
    else if (kind === 'math') void this.configureLanguage('latex')
    else void this.configureLanguage(node.attrs.language)
    this.syncPreview()
    liveViews.add(this)
  }

  private optionExtensions() {
    const ext = []
    if (codeOptions.lineNumbers && this.kind === 'code') ext.push(lineNumbers())
    if (codeOptions.wrap) ext.push(CMView.lineWrapping)
    ext.push(highlightActiveLine())
    return ext
  }

  reconfigureOptions(): void {
    this.cm.dispatch({ effects: this.opts.reconfigure(this.optionExtensions()) })
  }

  private async configureLanguage(name: string): Promise<void> {
    const support = await loadLanguage(name)
    this.cm.dispatch({ effects: this.lang.reconfigure(support ?? []) })
  }

  private setLanguageAttr(language: string): void {
    const pos = this.getPos()
    if (pos == null) return
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, language }))
  }

  private get isPreviewed(): boolean {
    if (this.kind === 'math') return true
    return this.kind === 'code' && /^mermaid$/i.test(this.node.attrs.language ?? '')
  }

  /** Crée/retire le panneau d'aperçu selon le type et la langue. */
  private syncPreview(): void {
    if (this.isPreviewed && !this.preview) {
      this.preview = document.createElement('div')
      this.preview.className = this.kind === 'math' ? 'math-preview' : 'mermaid-preview'
      this.preview.setAttribute('contenteditable', 'false')
      this.preview.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.focusEnd()
      })
      this.dom.append(this.preview)
      this.dom.classList.add('has-preview')
    } else if (!this.isPreviewed && this.preview) {
      this.preview.remove()
      this.preview = null
      this.dom.classList.remove('has-preview')
    }
    this.renderPreview()
  }

  renderPreview(force = false): void {
    if (!this.preview) return
    const src = this.cm.state.doc.toString()
    if (!force && src === this.lastPreview) return
    this.lastPreview = src
    window.clearTimeout(this.previewTimer)
    const target = this.preview
    if (this.kind === 'math') {
      renderMath(target, src, true)
      return
    }
    this.previewTimer = window.setTimeout(() => void renderMermaid(target, src), force ? 0 : 250)
  }

  private focusEnd(): void {
    const pos = this.getPos()
    if (pos == null) return
    const end = pos + 1 + this.node.content.size
    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, end)))
    this.view.focus()
    this.setSelection(this.node.content.size, this.node.content.size)
  }

  private setEditing(on: boolean): void {
    this.dom.classList.toggle('is-editing', on)
  }

  private forwardUpdate(update: ViewUpdate): void {
    if (this.updating || !this.cm.hasFocus) return
    const pos = this.getPos()
    if (pos == null) return
    let offset = pos + 1
    const { main } = update.state.selection
    const selFrom = offset + main.from
    const selTo = offset + main.to
    const pmSel = this.view.state.selection
    if (update.docChanged || pmSel.from !== selFrom || pmSel.to !== selTo) {
      const tr = this.view.state.tr
      update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
        if (text.length) tr.replaceWith(offset + fromA, offset + toA, this.view.state.schema.text(text.toString()))
        else tr.delete(offset + fromA, offset + toA)
        offset += toB - fromB - (toA - fromA)
      })
      tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo))
      this.view.dispatch(tr)
    }
  }

  setSelection(anchor: number, head: number): void {
    this.cm.focus()
    this.updating = true
    this.cm.dispatch({ selection: { anchor, head } })
    this.updating = false
  }

  private escapeKeymap() {
    const view = this.view
    const pm = (cmd: Command) => () => cmd(view.state, view.dispatch, view)
    return [
      { key: 'ArrowUp', run: () => this.maybeEscape('line', -1) },
      { key: 'ArrowLeft', run: () => this.maybeEscape('char', -1) },
      { key: 'ArrowDown', run: () => this.maybeEscape('line', 1) },
      { key: 'ArrowRight', run: () => this.maybeEscape('char', 1) },
      {
        key: 'Ctrl-Enter',
        run: () => {
          if (!exitCode(view.state, view.dispatch)) return false
          view.focus()
          return true
        }
      },
      { key: 'Mod-z', run: pm(undo) },
      { key: 'Shift-Mod-z', run: pm(redo) },
      { key: 'Mod-y', run: pm(redo) },
      {
        key: 'Backspace',
        run: () => {
          // Bloc vide + Retour arrière : redevient un paragraphe.
          if (this.cm.state.doc.length > 0) return false
          const pos = this.getPos()
          if (pos == null) return false
          const { paragraph } = view.state.schema.nodes
          const tr = view.state.tr.replaceWith(pos, pos + this.node.nodeSize, paragraph.create())
          tr.setSelection(TextSelection.create(tr.doc, pos + 1))
          view.dispatch(tr)
          view.focus()
          return true
        }
      }
    ]
  }

  private maybeEscape(unit: 'line' | 'char', dir: -1 | 1): boolean {
    const { state } = this.cm
    const main = state.selection.main
    if (!main.empty) return false
    const range = unit === 'line' ? state.doc.lineAt(main.head) : main
    if (dir < 0 ? range.from > 0 : range.to < state.doc.length) return false
    const pos = this.getPos()
    if (pos == null) return false
    const targetPos = pos + (dir < 0 ? 0 : this.node.nodeSize)
    const selection = Selection.near(this.view.state.doc.resolve(targetPos), dir)
    const tr = this.view.state.tr.setSelection(selection).scrollIntoView()
    this.view.dispatch(tr)
    this.view.focus()
    return true
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false
    const prevLang = this.node.attrs.language
    this.node = node
    if (this.kind === 'code' && prevLang !== node.attrs.language) {
      if (this.langInput && document.activeElement !== this.langInput) this.langInput.value = node.attrs.language ?? ''
      void this.configureLanguage(node.attrs.language)
      this.syncPreview()
    }
    if (this.updating) return true
    const newText = node.textContent
    const curText = this.cm.state.doc.toString()
    if (newText !== curText) {
      let start = 0
      let curEnd = curText.length
      let newEnd = newText.length
      while (start < curEnd && curText.charCodeAt(start) === newText.charCodeAt(start)) ++start
      while (curEnd > start && newEnd > start && curText.charCodeAt(curEnd - 1) === newText.charCodeAt(newEnd - 1)) {
        curEnd--
        newEnd--
      }
      this.updating = true
      this.cm.dispatch({ changes: { from: start, to: curEnd, insert: newText.slice(start, newEnd) } })
      this.updating = false
    }
    this.renderPreview()
    return true
  }

  selectNode(): void {
    this.cm.focus()
  }

  stopEvent(e: Event): boolean {
    // Laisse passer le clic droit pour le menu contextuel de l'application.
    return e.type !== 'contextmenu'
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy(): void {
    window.clearTimeout(this.previewTimer)
    liveViews.delete(this)
    this.cm.destroy()
  }
}

/** Flèches depuis un paragraphe voisin : entrer dans le bloc de code. */
export function arrowIntoCode(dir: 'left' | 'right' | 'up' | 'down'): Command {
  return (state, dispatch, view) => {
    if (!state.selection.empty || !view?.endOfTextblock(dir)) return false
    const side = dir === 'left' || dir === 'up' ? -1 : 1
    const $head = state.selection.$head
    const next = Selection.near(state.doc.resolve(side > 0 ? $head.after() : $head.before()), side)
    if (next.$head && next.$head.parent.type.spec.code) {
      dispatch?.(state.tr.setSelection(next))
      return true
    }
    return false
  }
}
