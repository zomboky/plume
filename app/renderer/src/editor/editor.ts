// Éditeur visuel : Milkdown + vues et plugins Plume.
import { Editor, editorViewCtx, parserCtx, rootCtx, serializerCtx } from '@milkdown/kit/core'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { cursor } from '@milkdown/kit/plugin/cursor'
import { $prose, callCommand } from '@milkdown/kit/utils'
import type { CmdKey } from '@milkdown/kit/core'
import type { Node as PmNode } from '@milkdown/kit/prose/model'
import { keymap } from '@milkdown/kit/prose/keymap'
import { Plugin, PluginKey, TextSelection, type Command, type EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { configureMarkdown, markdownPlugins } from './markdown/core'
import { remarkMathPlugin } from './markdown/extra-nodes'
import { liveMarkers } from './plugins/live-markers'
import { enterRules } from './plugins/enter-rules'
import { autoPair } from './plugins/auto-pair'
import { findPlugin } from './plugins/find'
import { arrowIntoCode, CodeView } from './views/code-view'
import { collectHeadings, ImageView, MathInlineView, TaskItemView, TocView, tocViews, type HeadingInfo } from './views/misc-views'
import { relativeToDoc } from './doc-context'

export interface EditorHooks {
  onDocChange(): void
  onSelectionChange(): void
  onOpenLink(href: string): void
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

function viewsPlugin(hooks: EditorHooks) {
  return $prose(
    () =>
      new Plugin({
        key: new PluginKey('plume-views'),
        props: {
          nodeViews: {
            code_block: (node, view, getPos) => new CodeView(node, view, getPos, 'code'),
            math_block: (node, view, getPos) => new CodeView(node, view, getPos, 'math'),
            frontmatter: (node, view, getPos) => new CodeView(node, view, getPos, 'frontmatter'),
            math_inline: (node, view, getPos) => new MathInlineView(node, view, getPos),
            list_item: (node, view, getPos) => new TaskItemView(node, view, getPos),
            image: (node) => new ImageView(node),
            toc: (_node, view, getPos) => new TocView(view, getPos)
          },
          handleClick(view, pos, event) {
            if (!(event.ctrlKey || event.metaKey)) return false
            const $pos = view.state.doc.resolve(pos)
            const link = [...$pos.marks(), ...(view.state.doc.nodeAt(pos)?.marks ?? [])].find((m) => m.type.name === 'link')
            if (!link) return false
            hooks.onOpenLink(link.attrs.href)
            return true
          },
          handleDOMEvents: {
            drop(view, event) {
              const files = [...(event.dataTransfer?.files ?? [])].filter((f) => IMAGE_EXT.test(f.name))
              if (!files.length) return false
              event.preventDefault()
              const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.to
              insertImages(view, files, at)
              return true
            }
          },
          handlePaste(view, event) {
            const files = [...(event.clipboardData?.files ?? [])].filter((f) => IMAGE_EXT.test(f.name))
            if (!files.length || !files.every((f) => window.plume.pathForFile(f))) return false
            insertImages(view, files, view.state.selection.to)
            return true
          }
        },
        view: () => ({
          update(view, prev) {
            if (view.state.doc !== prev.doc) {
              for (const toc of tocViews) toc.refresh()
              hooks.onDocChange()
            }
            if (view.state.doc !== prev.doc || !view.state.selection.eq(prev.selection)) hooks.onSelectionChange()
          }
        })
      })
  )
}

function insertImages(view: EditorView, files: File[], at: number): void {
  const { image } = view.state.schema.nodes
  let tr = view.state.tr
  let pos = at
  for (const f of files) {
    const path = window.plume.pathForFile(f)
    if (!path) continue
    const node = image.create({ src: relativeToDoc(path), alt: f.name.replace(/\.[^.]+$/, '') })
    tr = tr.insert(pos, node)
    pos += node.nodeSize
  }
  view.dispatch(tr.scrollIntoView())
}

const arrows = $prose(() =>
  keymap({
    ArrowLeft: arrowIntoCode('left'),
    ArrowRight: arrowIntoCode('right'),
    ArrowUp: arrowIntoCode('up'),
    ArrowDown: arrowIntoCode('down')
  })
)

export class WysiwygEditor {
  private editor!: Editor
  view!: EditorView
  /** Markdown d'origine et document correspondant : rendu tel quel tant que rien n'a changé. */
  private base: { md: string; doc: PmNode } = { md: '', doc: null as never }

  async init(root: HTMLElement, markdown: string, hooks: EditorHooks, options = { inlineMath: false }): Promise<void> {
    const editor = Editor.make().config((ctx) => {
      configureMarkdown(ctx, markdown)
      ctx.set(rootCtx, root)
      ctx.set(remarkMathPlugin.options.key, { singleDollarTextMath: options.inlineMath } as never)
    })
    for (const p of [enterRules, autoPair, arrows, liveMarkers, findPlugin, viewsPlugin(hooks)].flat()) editor.use(p)
    for (const p of markdownPlugins) editor.use(p)
    editor.use(clipboard).use(cursor)
    await editor.create()
    this.editor = editor
    this.view = editor.ctx.get(editorViewCtx)
    this.base = { md: markdown, doc: this.view.state.doc }
  }

  get state(): EditorState {
    return this.view.state
  }

  serializeDoc(doc: PmNode): string {
    return this.editor.ctx.get(serializerCtx)(doc)
  }

  parse(markdown: string): PmNode {
    return this.editor.ctx.get(parserCtx)(markdown)
  }

  /** Markdown du document ; le texte d'origine est conservé s'il n'a pas été modifié. */
  getMarkdown(): string {
    const doc = this.view.state.doc
    if (doc.eq(this.base.doc)) return this.base.md
    return this.serializeDoc(doc)
  }

  /** Remplace tout le contenu. `addToHistory` : annulable (retour du mode source). */
  setMarkdown(markdown: string, addToHistory = false): void {
    const doc = this.parse(markdown)
    const { state } = this.view
    let tr = state.tr.replaceWith(0, state.doc.content.size, doc.content)
    if (!addToHistory) tr = tr.setMeta('addToHistory', false)
    tr = tr.setSelection(TextSelection.atStart(tr.doc))
    this.view.dispatch(tr)
    this.base = { md: markdown, doc: this.view.state.doc }
  }

  /** Mémorise le texte enregistré comme nouvelle référence. */
  markBase(markdown: string): void {
    this.base = { md: markdown, doc: this.view.state.doc }
  }

  isAtBase(): boolean {
    return this.view.state.doc.eq(this.base.doc)
  }

  run(cmd: Command): boolean {
    const ok = cmd(this.view.state, this.view.dispatch, this.view)
    this.view.focus()
    return ok
  }

  /** Exécute une commande Milkdown ($command). */
  call<T>(cmd: { key: CmdKey<T> }, payload?: T): boolean {
    const ok = this.editor.action(callCommand(cmd.key, payload))
    this.view.focus()
    return ok
  }

  headings(): HeadingInfo[] {
    return collectHeadings(this.view.state.doc)
  }

  scrollToPos(pos: number): void {
    const { state } = this.view
    const p = Math.min(pos + 1, state.doc.content.size)
    this.view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(p))))
    const dom = this.view.nodeDOM(pos) as HTMLElement | null
    dom?.scrollIntoView?.({ block: 'start', behavior: 'auto' })
    this.view.focus()
  }

  focus(): void {
    this.view.focus()
  }

  setEditable(editable: boolean): void {
    this.view.setProps({ editable: () => editable })
  }

  destroy(): void {
    void this.editor.destroy()
  }
}
