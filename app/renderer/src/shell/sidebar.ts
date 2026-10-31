// Barre latérale : onglets Fichiers, Plan et Recherche.
import type { SearchHit, TreeEntry } from '@shared/api'
import type { SidebarTab } from '@shared/prefs'
import { basename, type App } from '../app'
import { t } from '../i18n'
import { icons } from './icons'

const MIN_W = 160
const MAX_W = 520

export class Sidebar {
  private el = document.getElementById('sidebar')!
  private resizer = document.getElementById('sidebar-resizer')!
  private tabsEl = document.createElement('div')
  private panels: Record<SidebarTab, HTMLElement> = {
    files: document.createElement('div'),
    outline: document.createElement('div'),
    search: document.createElement('div')
  }
  private tree: TreeEntry[] = []
  private collapsed = new Set<string>()
  private searchInput = document.createElement('input')
  private searchResults = document.createElement('div')
  private searchTimer = 0
  private outlineTimer = 0
  private searchOpened = false
  tab: SidebarTab
  visible = true

  constructor(private app: App) {
    this.tab = app.prefs.view.sidebarTab
    this.searchOpened = this.tab === 'search'
    this.tabsEl.className = 'sidebar-tabs'
    this.tabsEl.setAttribute('role', 'tablist')
    this.el.append(this.tabsEl)
    for (const [key, panel] of Object.entries(this.panels)) {
      panel.className = `sidebar-panel panel-${key}`
      panel.dataset.testid = `panel-${key}`
      this.el.append(panel)
    }
    this.buildSearch()
    this.renderTabs()
    this.renderFiles()
    this.renderOutline()
    this.initResize()
  }

  private renderTabs(): void {
    this.tabsEl.replaceChildren()
    const tabs: SidebarTab[] = this.searchOpened ? ['files', 'outline', 'search'] : ['files', 'outline']
    for (const tab of tabs) {
      const b = document.createElement('button')
      b.className = 'sidebar-tab' + (tab === this.tab ? ' is-active' : '')
      b.textContent = t(`sidebar.${tab}`)
      b.dataset.testid = `tab-${tab}`
      b.setAttribute('role', 'tab')
      b.addEventListener('click', () => this.show(tab))
      this.tabsEl.append(b)
    }
    for (const [key, panel] of Object.entries(this.panels)) panel.hidden = key !== this.tab
  }

  show(tab: SidebarTab): void {
    if (tab === 'search') this.searchOpened = true
    this.tab = tab
    if (!this.visible) this.setVisible(true)
    this.renderTabs()
    if (tab === 'outline') this.renderOutline()
    if (tab === 'search') requestAnimationFrame(() => this.searchInput.focus())
    void window.plume.setPrefs({ view: { sidebarTab: tab } })
  }

  toggle(): void {
    if (this.app.mode === 'source') return
    this.setVisible(!this.visible)
  }

  setVisible(on: boolean, persist = true): void {
    this.visible = on
    document.body.classList.toggle('no-sidebar', !on)
    if (persist) void this.app.updatePrefs({ view: { sidebar: on } })
    requestAnimationFrame(() => this.app.margins?.layout())
  }

  // ---------- Fichiers ----------

  async loadFolder(): Promise<void> {
    this.tree = this.app.folder ? await window.plume.listTree(this.app.folder) : []
    this.renderFiles()
  }

  onFileChange(): void {
    this.renderFiles()
    this.renderOutline()
  }

  revealCurrent(): void {
    const p = this.app.path
    if (!p) return
    // Déplie les dossiers parents du fichier courant.
    for (const dir of this.collapsed) if (p.toLowerCase().startsWith(dir.toLowerCase())) this.collapsed.delete(dir)
    this.show('files')
    this.renderFiles()
    this.panels.files.querySelector('.is-current')?.scrollIntoView({ block: 'center' })
  }

  private renderFiles(): void {
    const panel = this.panels.files
    panel.replaceChildren()
    if (!this.app.folder) {
      const empty = document.createElement('div')
      empty.className = 'sidebar-empty'
      empty.textContent = t('sidebar.noFolder')
      const btn = document.createElement('button')
      btn.className = 'link-button'
      btn.textContent = t('sidebar.openFolder')
      btn.addEventListener('click', () => void this.app.openFolderDialog())
      panel.append(empty, btn)
      return
    }
    const rootRow = this.row({ name: basename(this.app.folder), path: this.app.folder, dir: true }, 0, true)
    rootRow.classList.add('tree-root')
    panel.append(rootRow)
    const walk = (entries: TreeEntry[], depth: number) => {
      for (const e of entries) {
        panel.append(this.row(e, depth, !this.collapsed.has(e.path)))
        if (e.dir && !this.collapsed.has(e.path) && e.children) walk(e.children, depth + 1)
      }
    }
    walk(this.tree, 1)
  }

  private row(e: TreeEntry, depth: number, open: boolean): HTMLElement {
    const row = document.createElement('div')
    row.className = 'tree-row' + (e.dir ? ' is-dir' : '')
    row.style.paddingLeft = `${8 + depth * 14}px`
    row.title = e.path
    row.dataset.path = e.path
    if (!e.dir && this.app.path && e.path.toLowerCase() === this.app.path.toLowerCase()) row.classList.add('is-current')
    const icon = document.createElement('span')
    icon.className = 'tree-icon'
    icon.innerHTML = e.dir ? icons.folder : icons.file
    const name = document.createElement('span')
    name.className = 'tree-name'
    name.textContent = e.name
    row.append(icon, name)
    if (e.dir) row.classList.toggle('is-open', open)
    row.addEventListener('click', () => {
      if (e.dir) {
        if (depth === 0) return
        if (this.collapsed.has(e.path)) this.collapsed.delete(e.path)
        else this.collapsed.add(e.path)
        this.renderFiles()
      } else void this.app.openPath(e.path)
    })
    return row
  }

  // ---------- Plan ----------

  onDocChange(): void {
    window.clearTimeout(this.outlineTimer)
    this.outlineTimer = window.setTimeout(() => this.renderOutline(), 150)
  }

  onSelectionChange(): void {
    if (this.tab === 'outline' && this.visible) this.markCurrentHeading()
  }

  private renderOutline(): void {
    if (this.tab !== 'outline' || !this.app.editor.view) return
    const panel = this.panels.outline
    panel.replaceChildren()
    const headings = this.app.editor.headings()
    if (!headings.length) {
      const empty = document.createElement('div')
      empty.className = 'sidebar-empty'
      empty.textContent = t('sidebar.noHeadings')
      panel.append(empty)
      return
    }
    const min = Math.min(...headings.map((h) => h.level))
    for (const h of headings) {
      const item = document.createElement('div')
      item.className = 'outline-item'
      item.dataset.pos = String(h.pos)
      item.style.paddingLeft = `${10 + (h.level - min) * 12}px`
      item.textContent = h.text || '…'
      item.title = h.text
      item.addEventListener('click', () => this.app.editor.scrollToPos(h.pos))
      panel.append(item)
    }
    this.markCurrentHeading()
  }

  private markCurrentHeading(): void {
    const head = this.app.editor.state.selection.head
    const items = [...this.panels.outline.querySelectorAll<HTMLElement>('.outline-item')]
    let current: HTMLElement | null = null
    for (const it of items) if (Number(it.dataset.pos) <= head) current = it
    for (const it of items) it.classList.toggle('is-current', it === current)
  }

  // ---------- Recherche ----------

  private buildSearch(): void {
    const panel = this.panels.search
    this.searchInput.type = 'search'
    this.searchInput.className = 'sidebar-search-input'
    this.searchInput.placeholder = t('sidebar.searchPlaceholder')
    this.searchInput.dataset.testid = 'folder-search'
    this.searchInput.addEventListener('input', () => {
      window.clearTimeout(this.searchTimer)
      this.searchTimer = window.setTimeout(() => void this.runSearch(), 250)
    })
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.runSearch()
    })
    this.searchResults.className = 'search-results'
    panel.append(this.searchInput, this.searchResults)
  }

  private async runSearch(): Promise<void> {
    const q = this.searchInput.value
    this.searchResults.replaceChildren()
    if (!q.trim()) return
    if (!this.app.folder) {
      this.searchResults.textContent = t('sidebar.noFolder')
      return
    }
    const hits = await window.plume.searchFolder(this.app.folder, q)
    if (q !== this.searchInput.value) return
    this.renderHits(hits, q)
  }

  private renderHits(hits: SearchHit[], q: string): void {
    const box = this.searchResults
    box.replaceChildren()
    const summary = document.createElement('div')
    summary.className = 'search-summary'
    summary.textContent = hits.length ? t('sidebar.results', { n: hits.length }) : t('sidebar.noResults')
    box.append(summary)
    for (const hit of hits) {
      const file = document.createElement('div')
      file.className = 'search-file'
      file.textContent = hit.name
      file.title = hit.path
      file.dataset.testid = 'search-hit'
      file.addEventListener('click', () => void this.openHit(hit.path, q))
      box.append(file)
      for (const m of hit.matches.slice(0, 5)) {
        const line = document.createElement('div')
        line.className = 'search-line'
        line.textContent = m.text
        line.addEventListener('click', () => void this.openHit(hit.path, q))
        box.append(line)
      }
    }
  }

  private async openHit(path: string, q: string): Promise<void> {
    await this.app.openPath(path)
    if (this.app.path?.toLowerCase() === path.toLowerCase() && this.app.mode === 'wysiwyg') this.app.findBar.open(false, q)
  }

  // ---------- Largeur ----------

  private initResize(): void {
    let saved = 0
    try {
      saved = Number(localStorage.getItem('plume.sidebarWidth')) || 0
    } catch {
      saved = 0
    }
    if (saved) document.documentElement.style.setProperty('--sidebar-width', `${saved}px`)
    this.resizer.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.resizer.setPointerCapture(e.pointerId)
      const move = (ev: PointerEvent) => {
        const w = Math.min(MAX_W, Math.max(MIN_W, ev.clientX))
        document.documentElement.style.setProperty('--sidebar-width', `${w}px`)
        this.app.margins.layout()
      }
      const up = (ev: PointerEvent) => {
        this.resizer.removeEventListener('pointermove', move)
        this.resizer.removeEventListener('pointerup', up)
        try {
          localStorage.setItem('plume.sidebarWidth', String(Math.min(MAX_W, Math.max(MIN_W, ev.clientX))))
        } catch {
          // Stockage indisponible : largeur non mémorisée.
        }
      }
      this.resizer.addEventListener('pointermove', move)
      this.resizer.addEventListener('pointerup', up)
    })
  }
}
