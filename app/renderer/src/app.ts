// État de la fenêtre et opérations sur le document (ouvrir, enregistrer, modes).
import type { OpenedFile, Recent } from '@shared/api'
import { DEFAULT_WIDTH, type ColumnWidth, type DeepPartial, type Prefs, type ThemeId } from '@shared/prefs'
import { WysiwygEditor } from './editor/editor'
import { docContext } from './editor/doc-context'
import { applyCodeOptions, refreshPreviews } from './editor/views/code-view'
import { autoPairOptions } from './editor/plugins/auto-pair'
import { setMermaidTheme } from './editor/render/mermaid'
import { SourceEditor } from './source/source-editor'
import { setLocale, t } from './i18n'
import { CommandRegistry } from './commands'
import { MenuBar } from './shell/menubar'
import { Sidebar } from './shell/sidebar'
import { StatusBar } from './shell/statusbar'
import { QuickOpen } from './shell/quick-open'
import { FindBar } from './shell/find-bar'
import { Notice } from './shell/notice'
import { Margins } from './margins/margins'
import { ContextMenu } from './context-menu/context-menu'
import { PrefsPanel } from './preferences/prefs-panel'
import { applyTheme } from './themes'

export type Mode = 'wysiwyg' | 'source'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i > 0 ? path.slice(0, i) : path
}

export class App {
  prefs!: Prefs
  recent: Recent = { files: [], folders: [] }
  path: string | null = null
  eol: 'lf' | 'crlf' = 'lf'
  savedMarkdown = ''
  folder: string | null = null
  mode: Mode = 'wysiwyg'
  readonly = false
  alwaysOnTop = false
  fullscreen = false
  /** Faux pendant l'initialisation : les rappels de l'éditeur sont ignorés. */
  private ready = false

  readonly editor = new WysiwygEditor()
  source: SourceEditor | null = null
  /** Texte placé dans le mode source à l'entrée, pour savoir s'il a été modifié. */
  private sourceSnapshot = ''
  private sidebarBeforeSource = true
  private autoSaveTimer = 0

  readonly commands = new CommandRegistry(this)
  menubar!: MenuBar
  sidebar!: Sidebar
  statusbar!: StatusBar
  quickOpen!: QuickOpen
  findBar!: FindBar
  notice!: Notice
  margins!: Margins
  contextMenu!: ContextMenu
  prefsPanel!: PrefsPanel

  readonly scroller = $('editor-scroll')
  readonly column = $('column')
  readonly workspace = $('workspace')

  async start(): Promise<void> {
    this.prefs = await window.plume.getPrefs()
    this.recent = await window.plume.getRecent()
    setLocale(this.prefs.locale)
    this.eol = this.prefs.editor.lineEnding

    const params = new URLSearchParams(location.search)
    let initial: OpenedFile | null = null
    let initialFolder: string | null = null
    const openArg = params.get('open')
    const target = openArg ?? (this.prefs.files.reopenLast && !window.plume.e2e ? this.recent.files[0] : undefined)
    if (target) {
      const stat = await window.plume.statFile(target)
      if (stat?.dir) initialFolder = target
      else if (stat) initial = await window.plume.readFile(target).catch(() => null)
    }
    if (initial) docContext.dir = dirname(initial.path)

    await this.editor.init($('editor'), initial?.content ?? '', {
      onDocChange: () => this.onDocChange(),
      onSelectionChange: () => this.onSelectionChange(),
      onOpenLink: (href) => this.openLink(href)
    }, { inlineMath: this.prefs.markdown.inlineMath })

    this.menubar = new MenuBar(this)
    this.sidebar = new Sidebar(this)
    this.statusbar = new StatusBar(this)
    this.quickOpen = new QuickOpen(this)
    this.findBar = new FindBar(this)
    this.notice = new Notice()
    this.margins = new Margins(this)
    this.contextMenu = new ContextMenu(this)
    this.prefsPanel = new PrefsPanel(this)

    if (initial) this.adoptFile(initial)
    else if (initialFolder) await this.setFolder(initialFolder)
    this.applyPrefs()
    this.commands.bindKeyboard()
    window.plume.on('request-close', () => void this.requestClose())
    window.plume.on('fullscreen', (on) => {
      this.fullscreen = !!on
      document.body.classList.toggle('is-fullscreen', this.fullscreen)
    })
    window.plume.on('prefs-changed', (p) => {
      this.prefs = p as Prefs
      this.applyPrefs()
    })
    this.ready = true
    this.updateTitle()
    this.statusbar.update()
    this.editor.focus()
    document.body.classList.add('is-ready')
  }

  // ---------- Document ----------

  get displayName(): string {
    return this.path ? basename(this.path) : t('app.untitled')
  }

  currentMarkdown(): string {
    return this.mode === 'source' && this.source ? this.source.getText() : this.editor.getMarkdown()
  }

  isDirty(): boolean {
    if (this.mode === 'source' && this.source) return this.source.getText() !== this.savedMarkdown
    if (this.editor.isAtBase()) return this.editor.getMarkdown() !== this.savedMarkdown
    return true
  }

  private onDocChange(): void {
    if (!this.ready) return
    this.updateTitle()
    this.statusbar.update()
    this.sidebar.onDocChange()
    this.scheduleAutoSave()
  }

  private onSelectionChange(): void {
    if (!this.ready) return
    this.statusbar.updateSelection()
    this.sidebar?.onSelectionChange()
    if (this.prefs?.view.typewriterMode) this.centerCaret()
  }

  onSourceChange(): void {
    this.updateTitle()
    this.statusbar.update()
    this.scheduleAutoSave()
  }

  private scheduleAutoSave(): void {
    if (!this.prefs?.files.autoSave || !this.path) return
    window.clearTimeout(this.autoSaveTimer)
    this.autoSaveTimer = window.setTimeout(() => {
      if (this.isDirty()) void this.save()
    }, 1500)
  }

  updateTitle(): void {
    const dirty = this.isDirty()
    const title = `${this.displayName}${dirty ? ' •' : ''} - Plume`
    document.title = title
    $('title').textContent = title
    document.body.classList.toggle('is-dirty', dirty)
    window.plume.setTitle(title)
  }

  /** Charge un fichier lu sur disque dans la fenêtre. */
  private adoptFile(file: OpenedFile): void {
    this.path = file.path
    this.eol = file.eol
    this.savedMarkdown = file.content
    docContext.dir = dirname(file.path)
    if (this.mode === 'source' && this.source) {
      this.source.setText(file.content)
      this.sourceSnapshot = file.content
      this.editor.setMarkdown(file.content)
    } else if (this.editor.getMarkdown() !== file.content || !this.editor.isAtBase()) {
      this.editor.setMarkdown(file.content)
    } else {
      this.editor.markBase(file.content)
    }
    this.scroller.scrollTop = 0
    if (!this.folder || !file.path.toLowerCase().startsWith(this.folder.toLowerCase())) void this.setFolder(dirname(file.path), false)
    void window.plume.addRecent('file', file.path).then((r) => (this.recent = r))
    this.sidebar.onFileChange()
    this.updateTitle()
    this.statusbar.update()
  }

  /** Demande quoi faire des modifications non enregistrées ; false = annuler. */
  async confirmDiscard(): Promise<boolean> {
    if (!this.isDirty()) return true
    const choice = await window.plume.askUnsaved(this.displayName)
    if (choice === 'cancel') return false
    if (choice === 'save') return this.save()
    return true
  }

  async openPath(path: string): Promise<void> {
    if (this.path && path.toLowerCase() === this.path.toLowerCase()) return
    if (!(await this.confirmDiscard())) return
    try {
      this.adoptFile(await window.plume.readFile(path))
    } catch (err) {
      void window.plume.message(t('msg.openFailed'), `${path}\n${(err as Error).message}`)
    }
  }

  async openDialog(): Promise<void> {
    if (!(await this.confirmDiscard())) return
    const file = await window.plume.openFileDialog()
    if (file) this.adoptFile(file)
  }

  async openFolderDialog(): Promise<void> {
    const folder = await window.plume.openFolderDialog()
    if (folder) await this.setFolder(folder)
  }

  async setFolder(folder: string, remember = true): Promise<void> {
    this.folder = folder
    if (remember) void window.plume.addRecent('folder', folder).then((r) => (this.recent = r))
    await this.sidebar.loadFolder()
    if (remember) this.sidebar.show('files')
  }

  async newDocument(): Promise<void> {
    if (!(await this.confirmDiscard())) return
    this.path = null
    this.eol = this.prefs.editor.lineEnding
    this.savedMarkdown = ''
    docContext.dir = this.folder
    if (this.mode === 'source' && this.source) {
      this.source.setText('')
      this.sourceSnapshot = ''
    }
    this.editor.setMarkdown('')
    this.sidebar.onFileChange()
    this.updateTitle()
    this.statusbar.update()
    this.focusEditor()
  }

  async reload(): Promise<void> {
    if (!this.path) return
    if (this.isDirty() && !confirm(t('msg.reloadConfirm'))) return
    const file = await window.plume.readFile(this.path)
    this.savedMarkdown = ''
    this.adoptFile(file)
  }

  async save(): Promise<boolean> {
    if (!this.path) return this.saveAs()
    return this.writeTo(this.path)
  }

  async saveAs(): Promise<boolean> {
    const suggested = this.path ?? `${this.firstHeading() || t('app.untitled')}.md`
    const target = await window.plume.saveAsDialog(suggested)
    if (!target) return false
    const ok = await this.writeTo(target)
    if (ok) {
      this.path = target
      docContext.dir = dirname(target)
      void window.plume.addRecent('file', target).then((r) => (this.recent = r))
      if (!this.folder) void this.setFolder(dirname(target), false)
      else void this.sidebar.loadFolder()
      this.sidebar.onFileChange()
      this.updateTitle()
    }
    return ok
  }

  private async writeTo(path: string): Promise<boolean> {
    const md = this.currentMarkdown()
    const out = this.eol === 'crlf' ? md.replace(/\r?\n/g, '\r\n') : md
    try {
      await window.plume.writeFile(path, out)
    } catch (err) {
      void window.plume.message(t('msg.saveFailed'), (err as Error).message)
      return false
    }
    this.savedMarkdown = md
    if (this.mode === 'wysiwyg') this.editor.markBase(md)
    this.updateTitle()
    return true
  }

  private firstHeading(): string {
    return (this.editor.headings()[0]?.text ?? '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60)
  }

  async requestClose(): Promise<void> {
    if (await this.confirmDiscard()) window.plume.confirmClose()
  }

  async trashCurrent(): Promise<void> {
    if (!this.path) return
    if (!confirm(t('msg.trashConfirm', { name: this.displayName }))) return
    if (await window.plume.trashFile(this.path)) {
      this.savedMarkdown = ''
      this.path = null
      await this.newDocument()
      await this.sidebar.loadFolder()
      this.notice.show(t('msg.deleted'))
    }
  }

  async showProperties(): Promise<void> {
    if (!this.path) return
    const s = await window.plume.statFile(this.path)
    if (!s) return
    await window.plume.message(
      t('msg.properties', { name: this.displayName, path: this.path, size: s.size, mtime: new Date(s.mtime).toLocaleString() })
    )
  }

  openLink(href: string): void {
    if (href.startsWith('#')) {
      const slug = decodeURIComponent(href.slice(1)).toLowerCase()
      const h = this.editor.headings().find((x) => slugify(x.text) === slug || x.text.toLowerCase() === slug)
      if (h) this.editor.scrollToPos(h.pos)
      return
    }
    if (/^(https?:|mailto:)/i.test(href)) {
      window.plume.openExternal(href)
      return
    }
    // Lien relatif vers un autre document Markdown.
    if (/\.(md|markdown|txt)(#.*)?$/i.test(href) && docContext.dir) {
      const file = href.replace(/#.*$/, '')
      const abs = /^[A-Za-z]:[\\/]/.test(file) ? file : `${docContext.dir}\\${file.replace(/\//g, '\\')}`
      void this.openPath(decodeURI(abs))
    }
  }

  // ---------- Modes ----------

  focusEditor(): void {
    if (this.mode === 'source') this.source?.focus()
    else this.editor.focus()
  }

  toggleSource(): void {
    if (this.mode === 'wysiwyg') this.enterSource()
    else this.exitSource()
    this.menubar.refresh()
  }

  private enterSource(): void {
    const ratio = scrollRatio(this.scroller)
    const md = this.editor.getMarkdown()
    if (!this.source) this.source = new SourceEditor($('source-host'), () => this.onSourceChange())
    this.source.setText(md)
    this.sourceSnapshot = md
    this.mode = 'source'
    this.findBar.close()
    document.body.classList.add('is-source')
    $('source-host').hidden = false
    this.sidebarBeforeSource = this.prefs.view.sidebar
    this.sidebar.setVisible(false, false)
    requestAnimationFrame(() => {
      setScrollRatio(this.source!.scroller, ratio)
      this.source!.focus()
    })
    this.statusbar.update()
  }

  private exitSource(): void {
    if (!this.source) return
    const ratio = scrollRatio(this.source.scroller)
    const text = this.source.getText()
    if (text !== this.sourceSnapshot) this.editor.setMarkdown(text, true)
    this.mode = 'wysiwyg'
    document.body.classList.remove('is-source')
    $('source-host').hidden = true
    this.sidebar.setVisible(this.sidebarBeforeSource, false)
    this.sidebar.onDocChange()
    requestAnimationFrame(() => {
      setScrollRatio(this.scroller, ratio)
      this.editor.focus()
      this.margins.layout()
    })
    this.updateTitle()
    this.statusbar.update()
  }

  toggleReadonly(): void {
    this.readonly = !this.readonly
    this.editor.setEditable(!this.readonly)
    document.body.classList.toggle('is-readonly', this.readonly)
    this.menubar.refresh()
  }

  setFocusMode(on: boolean): void {
    void this.updatePrefs({ view: { focusMode: on } })
  }

  setTypewriterMode(on: boolean): void {
    void this.updatePrefs({ view: { typewriterMode: on } })
  }

  centerCaret(): void {
    if (this.mode !== 'wysiwyg') return
    const view = this.editor.view
    let coords
    try {
      coords = view.coordsAtPos(view.state.selection.head)
    } catch {
      return
    }
    const box = this.scroller.getBoundingClientRect()
    const target = box.top + box.height / 2
    this.scroller.scrollTop += coords.top - target
  }

  async toggleFullscreen(): Promise<void> {
    this.fullscreen = await window.plume.toggleFullscreen()
    document.body.classList.toggle('is-fullscreen', this.fullscreen)
  }

  async toggleAlwaysOnTop(): Promise<void> {
    this.alwaysOnTop = await window.plume.toggleAlwaysOnTop()
  }

  zoom(delta: number | null): void {
    const z = delta === null ? 1 : Math.round(Math.min(3, Math.max(0.5, this.prefs.view.zoom + delta)) * 10) / 10
    void this.updatePrefs({ view: { zoom: z } })
  }

  // ---------- Préférences ----------

  async updatePrefs(patch: DeepPartial<Prefs>): Promise<void> {
    this.prefs = await window.plume.setPrefs(patch)
    this.applyPrefs()
  }

  setTheme(theme: ThemeId): void {
    void this.updatePrefs({ theme })
  }

  setWidth(width: ColumnWidth, persist = true): void {
    this.prefs = { ...this.prefs, editor: { ...this.prefs.editor, width } }
    this.applyWidth()
    if (persist) void window.plume.setPrefs({ editor: { width } })
  }

  toggleFullWidth(): void {
    this.setWidth(this.prefs.editor.width === 'full' ? (this.margins.lastWidth ?? DEFAULT_WIDTH) : 'full')
  }

  applyWidth(): void {
    const w = this.prefs.editor.width
    this.column.style.maxWidth = w === 'full' ? 'none' : `${w.value}${w.unit}`
    document.body.classList.toggle('is-full-width', w === 'full')
    this.margins?.layout()
  }

  applyPrefs(): void {
    const p = this.prefs
    applyTheme(p.theme)
    setMermaidTheme(p.theme === 'dark-2026')
    refreshPreviews()
    document.documentElement.style.setProperty('--editor-font-size', `${p.editor.fontSize}px`)
    document.body.classList.toggle('focus-mode', p.view.focusMode)
    document.body.classList.toggle('typewriter-mode', p.view.typewriterMode)
    document.body.classList.toggle('no-statusbar', !p.view.statusBar)
    autoPairOptions.enabled = p.editor.autoPair
    applyCodeOptions({ lineNumbers: p.markdown.codeLineNumbers, wrap: p.markdown.codeWrap })
    this.editor.view.dom.spellcheck = p.editor.spellcheck
    window.plume.setZoom(p.view.zoom)
    if (this.mode === 'wysiwyg') this.sidebar.setVisible(p.view.sidebar, false)
    this.applyWidth()
    this.menubar.refresh()
    this.statusbar.update()
    if (p.view.typewriterMode) this.centerCaret()
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

function scrollRatio(el: HTMLElement): number {
  const max = el.scrollHeight - el.clientHeight
  return max > 0 ? el.scrollTop / max : 0
}

function setScrollRatio(el: HTMLElement, ratio: number): void {
  el.scrollTop = ratio * (el.scrollHeight - el.clientHeight)
}
