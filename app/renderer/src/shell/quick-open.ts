// Ouverture rapide (Ctrl+P) : palette flottante, recherche floue par nom de fichier.
import Fuse from 'fuse.js'
import { basename, dirname, type App } from '../app'
import { t } from '../i18n'

interface Entry {
  path: string
  name: string
  recent: boolean
}

export class QuickOpen {
  private el: HTMLElement
  private input: HTMLInputElement
  private list: HTMLElement
  private entries: Entry[] = []
  private shown: Entry[] = []
  private active = 0

  constructor(private app: App) {
    this.el = document.createElement('div')
    this.el.className = 'quick-open'
    this.el.hidden = true
    this.el.dataset.testid = 'quick-open'
    this.input = document.createElement('input')
    this.input.className = 'quick-input'
    this.input.placeholder = t('quick.placeholder')
    this.input.spellcheck = false
    this.list = document.createElement('div')
    this.list.className = 'quick-list'
    this.el.append(this.input, this.list)
    document.body.append(this.el)
    this.input.addEventListener('input', () => this.filter())
    this.input.addEventListener('keydown', (e) => this.onKey(e))
    this.input.addEventListener('blur', () => setTimeout(() => this.close(), 120))
  }

  async open(): Promise<void> {
    this.app.recent = await window.plume.getRecent()
    const recent = this.app.recent.files.map((p) => ({ path: p, name: basename(p), recent: true }))
    const inFolder = this.app.folder ? await window.plume.listMarkdownFiles(this.app.folder) : []
    const seen = new Set(recent.map((r) => r.path.toLowerCase()))
    this.entries = [...recent, ...inFolder.filter((p) => !seen.has(p.toLowerCase())).map((p) => ({ path: p, name: basename(p), recent: false }))]
    this.el.hidden = false
    this.input.value = ''
    this.filter()
    this.input.focus()
  }

  close(): void {
    if (this.el.hidden) return
    this.el.hidden = true
    this.app.focusEditor()
  }

  private filter(): void {
    const q = this.input.value.trim()
    if (!q) this.shown = this.entries.slice(0, 50)
    else {
      const fuse = new Fuse(this.entries, { keys: [{ name: 'name', weight: 3 }, 'path'], threshold: 0.4, ignoreLocation: true })
      this.shown = fuse.search(q, { limit: 50 }).map((r) => r.item)
    }
    this.active = 0
    this.render(!q)
  }

  private render(grouped: boolean): void {
    this.list.replaceChildren()
    if (!this.shown.length) {
      const empty = document.createElement('div')
      empty.className = 'quick-empty'
      empty.textContent = t('quick.none')
      this.list.append(empty)
      return
    }
    let lastGroup: boolean | null = null
    this.shown.forEach((entry, i) => {
      if (grouped && entry.recent !== lastGroup) {
        lastGroup = entry.recent
        const h = document.createElement('div')
        h.className = 'quick-group'
        h.textContent = entry.recent ? t('quick.recent') : t('quick.folder')
        this.list.append(h)
      }
      const row = document.createElement('div')
      row.className = 'quick-item' + (i === this.active ? ' is-active' : '')
      row.dataset.testid = 'quick-item'
      const name = document.createElement('div')
      name.className = 'quick-name'
      name.textContent = entry.name
      const path = document.createElement('div')
      path.className = 'quick-path'
      path.textContent = dirname(entry.path)
      row.append(name, path)
      row.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.choose(entry)
      })
      this.list.append(row)
    })
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      this.close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!this.shown.length) return
      this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + this.shown.length) % this.shown.length
      this.list.querySelectorAll('.quick-item').forEach((el, i) => el.classList.toggle('is-active', i === this.active))
      this.list.querySelector('.quick-item.is-active')?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const entry = this.shown[this.active]
      if (entry) this.choose(entry)
    }
  }

  private choose(entry: Entry): void {
    this.el.hidden = true
    void this.app.openPath(entry.path)
  }
}
