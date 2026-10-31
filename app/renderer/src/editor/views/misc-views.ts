// Vues des nœuds simples : formule en ligne, tâche cochable, image, table des matières.
import type { Node as PmNode } from '@milkdown/kit/prose/model'
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { renderMath } from '../render/math'
import { resolveAsset } from '../doc-context'
import { t } from '../../i18n'

export class MathInlineView implements NodeView {
  dom: HTMLElement
  private rendered: HTMLElement
  private input: HTMLInputElement | null = null

  constructor(
    private node: PmNode,
    private view: EditorView,
    private getPos: () => number | undefined
  ) {
    this.dom = document.createElement('span')
    this.dom.className = 'math-inline'
    this.rendered = document.createElement('span')
    this.rendered.className = 'math-inline-render'
    this.dom.append(this.rendered)
    this.render()
  }

  private render(): void {
    renderMath(this.rendered, this.node.attrs.value, false)
    if (!this.node.attrs.value) this.rendered.textContent = '$ $'
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    if (!this.input) this.render()
    return true
  }

  selectNode(): void {
    this.dom.classList.add('is-editing')
    if (this.input) return
    const input = document.createElement('input')
    input.className = 'math-inline-input'
    input.value = this.node.attrs.value
    input.size = Math.max(4, input.value.length + 1)
    input.addEventListener('input', () => {
      input.size = Math.max(4, input.value.length + 1)
      const pos = this.getPos()
      if (pos == null) return
      this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { value: input.value }))
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape' || (e.key === 'ArrowRight' && input.selectionStart === input.value.length)) {
        e.preventDefault()
        this.leave(1)
      } else if (e.key === 'ArrowLeft' && input.selectionStart === 0) {
        e.preventDefault()
        this.leave(-1)
      }
    })
    input.addEventListener('blur', () => this.deselectNode())
    this.input = input
    this.dom.prepend(input)
    requestAnimationFrame(() => input.focus())
  }

  private leave(dir: -1 | 1): void {
    const pos = this.getPos()
    if (pos == null) return
    const target = dir > 0 ? pos + this.node.nodeSize : pos
    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, target)))
    this.view.focus()
  }

  deselectNode(): void {
    this.dom.classList.remove('is-editing')
    if (!this.input) return
    this.input.remove()
    this.input = null
    this.render()
  }

  stopEvent(e: Event): boolean {
    return !!this.input && e.target === this.input
  }

  ignoreMutation(): boolean {
    return true
  }
}

export class TaskItemView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private box: HTMLInputElement | null = null

  constructor(
    private node: PmNode,
    private view: EditorView,
    private getPos: () => number | undefined
  ) {
    const li = document.createElement('li')
    li.dataset.listType = node.attrs.listType
    li.dataset.label = node.attrs.label
    li.dataset.spread = String(node.attrs.spread)
    this.contentDOM = document.createElement('div')
    this.contentDOM.className = 'li-content'
    if (node.attrs.checked != null) {
      li.className = 'task-item'
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.contentEditable = 'false'
      box.checked = !!node.attrs.checked
      box.addEventListener('mousedown', (e) => e.preventDefault())
      box.addEventListener('click', (e) => {
        e.preventDefault()
        const pos = this.getPos()
        if (pos == null) return
        this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, checked: !this.node.attrs.checked }))
      })
      this.box = box
      li.dataset.checked = String(!!node.attrs.checked)
      li.append(box)
    }
    li.append(this.contentDOM)
    this.dom = li
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type || (node.attrs.checked == null) !== (this.node.attrs.checked == null)) return false
    this.node = node
    this.dom.dataset.label = node.attrs.label
    if (this.box) {
      this.box.checked = !!node.attrs.checked
      this.dom.dataset.checked = String(!!node.attrs.checked)
    }
    return true
  }

  ignoreMutation(m: MutationRecord | { type: 'selection'; target: Node }): boolean {
    return m.type !== 'selection' && (m.target === this.box || m.target === this.dom)
  }
}

export class ImageView implements NodeView {
  dom: HTMLElement
  private img: HTMLImageElement

  constructor(private node: PmNode) {
    this.dom = document.createElement('span')
    this.dom.className = 'image-view'
    this.img = document.createElement('img')
    this.dom.append(this.img)
    this.apply()
  }

  private apply(): void {
    const { src, alt, title } = this.node.attrs
    this.img.src = resolveAsset(src)
    this.img.alt = alt ?? ''
    if (title) this.img.title = title
    else this.img.removeAttribute('title')
    this.dom.dataset.src = src
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.apply()
    return true
  }
}

/** Les vues TOC vivantes, rafraîchies quand le document change. */
export const tocViews = new Set<TocView>()

export interface HeadingInfo {
  level: number
  text: string
  pos: number
}

export function collectHeadings(doc: PmNode): HeadingInfo[] {
  const out: HeadingInfo[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') out.push({ level: node.attrs.level, text: node.textContent, pos })
    return !node.isTextblock
  })
  return out
}

export class TocView implements NodeView {
  dom: HTMLElement

  constructor(
    private view: EditorView,
    private getPos: () => number | undefined
  ) {
    this.dom = document.createElement('nav')
    this.dom.className = 'toc'
    this.dom.contentEditable = 'false'
    tocViews.add(this)
    this.refresh()
  }

  refresh(): void {
    const headings = collectHeadings(this.view.state.doc)
    this.dom.replaceChildren()
    if (!headings.length) {
      const empty = document.createElement('div')
      empty.className = 'toc-empty'
      empty.textContent = `[TOC] — ${t('sidebar.noHeadings')}`
      this.dom.append(empty)
      return
    }
    const min = Math.min(...headings.map((h) => h.level))
    for (const h of headings) {
      const a = document.createElement('a')
      a.className = `toc-item toc-level-${h.level - min + 1}`
      a.textContent = h.text || '…'
      a.href = '#'
      a.addEventListener('mousedown', (e) => {
        e.preventDefault()
        const { state } = this.view
        const pos = Math.min(h.pos + 1, state.doc.content.size)
        this.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView())
        this.view.focus()
      })
      this.dom.append(a)
    }
  }

  selectNode(): void {
    this.dom.classList.add('is-selected')
  }

  deselectNode(): void {
    this.dom.classList.remove('is-selected')
  }

  stopEvent(e: Event): boolean {
    if (e.type === 'mousedown' && (e.target as HTMLElement).classList.contains('toc-item')) return true
    if (e.type === 'mousedown') {
      const pos = this.getPos()
      if (pos != null) this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)))
      return true
    }
    return false
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy(): void {
    tocViews.delete(this)
  }
}
