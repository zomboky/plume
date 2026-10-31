// Préférences : panneau plein écran, catégories à gauche, recherche de réglage.
import { DEFAULT_WIDTH, MIN_COLUMN_PX, THEMES, type ColumnWidth, type DeepPartial, type Prefs } from '@shared/prefs'
import type { App } from '../app'
import { t, type MessageKey } from '../i18n'

type Category = 'general' | 'files' | 'editor' | 'markdown' | 'appearance'

interface Setting {
  cat: Category
  label: MessageKey
  hint?: MessageKey
  render: (prefs: Prefs) => HTMLElement
}

export class PrefsPanel {
  private el: HTMLElement | null = null
  private cat: Category = 'general'
  private filter = ''

  constructor(private app: App) {}

  get isOpen(): boolean {
    return !!this.el
  }

  open(): void {
    if (this.el) return
    const el = document.createElement('div')
    el.className = 'prefs'
    el.dataset.testid = 'prefs'
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        this.close()
      }
    })
    document.body.append(el)
    this.el = el
    this.render()
    el.querySelector<HTMLInputElement>('.prefs-search')?.focus()
  }

  close(): void {
    this.el?.remove()
    this.el = null
    this.app.focusEditor()
  }

  private async set(patch: DeepPartial<Prefs>): Promise<void> {
    await this.app.updatePrefs(patch)
  }

  private settings(): Setting[] {
    const checkbox = (get: (p: Prefs) => boolean, patch: (v: boolean) => DeepPartial<Prefs>, testId: string) => (p: Prefs) => {
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = get(p)
      input.dataset.testid = testId
      input.addEventListener('change', () => void this.set(patch(input.checked)))
      return input
    }
    const select = <V extends string>(value: V, options: [V, string][], onChange: (v: V) => void, testId: string) => {
      const s = document.createElement('select')
      s.dataset.testid = testId
      for (const [v, label] of options) {
        const o = document.createElement('option')
        o.value = v
        o.textContent = label
        o.selected = v === value
        s.append(o)
      }
      s.addEventListener('change', () => onChange(s.value as V))
      return s
    }
    return [
      {
        cat: 'general',
        label: 'prefs.locale',
        hint: 'prefs.localeHint',
        render: (p) =>
          select(p.locale, [['fr', 'Français'], ['en', 'English']], (v) => void this.set({ locale: v }).then(() => location.reload()), 'pref-locale')
      },
      {
        cat: 'general',
        label: 'prefs.checkUpdates',
        hint: 'prefs.checkUpdatesHint',
        render: checkbox((p) => p.updates.checkOnStartup, (v) => ({ updates: { checkOnStartup: v } }), 'pref-check-updates')
      },
      {
        cat: 'files',
        label: 'prefs.autoSave',
        render: checkbox((p) => p.files.autoSave, (v) => ({ files: { autoSave: v } }), 'pref-autosave')
      },
      {
        cat: 'files',
        label: 'prefs.reopenLast',
        render: checkbox((p) => p.files.reopenLast, (v) => ({ files: { reopenLast: v } }), 'pref-reopen')
      },
      {
        cat: 'files',
        label: 'prefs.onlyMarkdown',
        render: checkbox((p) => p.files.onlyMarkdown, (v) => ({ files: { onlyMarkdown: v } }), 'pref-only-md')
      },
      {
        cat: 'files',
        label: 'prefs.showHidden',
        render: checkbox((p) => p.files.showHidden, (v) => ({ files: { showHidden: v } }), 'pref-hidden')
      },
      {
        cat: 'files',
        label: 'prefs.recentClear',
        render: () => {
          const b = document.createElement('button')
          b.textContent = t('file.recentClear')
          b.addEventListener('click', () => void window.plume.clearRecent().then((r) => (this.app.recent = r)))
          return b
        }
      },
      {
        cat: 'editor',
        label: 'prefs.autoPair',
        render: checkbox((p) => p.editor.autoPair, (v) => ({ editor: { autoPair: v } }), 'pref-autopair')
      },
      {
        cat: 'editor',
        label: 'prefs.spellcheck',
        render: checkbox((p) => p.editor.spellcheck, (v) => ({ editor: { spellcheck: v } }), 'pref-spellcheck')
      },
      {
        cat: 'editor',
        label: 'prefs.lineEnding',
        render: (p) =>
          select(p.editor.lineEnding, [['lf', 'LF (\\n)'], ['crlf', 'CRLF (\\r\\n)']], (v) => void this.set({ editor: { lineEnding: v } }), 'pref-eol')
      },
      {
        cat: 'markdown',
        label: 'prefs.inlineMath',
        hint: 'prefs.localeHint',
        render: checkbox((p) => p.markdown.inlineMath, (v) => ({ markdown: { inlineMath: v } }), 'pref-inline-math')
      },
      {
        cat: 'markdown',
        label: 'prefs.codeLineNumbers',
        render: checkbox((p) => p.markdown.codeLineNumbers, (v) => ({ markdown: { codeLineNumbers: v } }), 'pref-code-lines')
      },
      {
        cat: 'markdown',
        label: 'prefs.codeWrap',
        render: checkbox((p) => p.markdown.codeWrap, (v) => ({ markdown: { codeWrap: v } }), 'pref-code-wrap')
      },
      {
        cat: 'appearance',
        label: 'prefs.theme',
        render: (p) =>
          select(
            p.theme,
            THEMES.map((id) => [id, t(`theme.${id}` as MessageKey)]),
            (v) => void this.set({ theme: v }),
            'pref-theme'
          )
      },
      {
        cat: 'appearance',
        label: 'prefs.fontSize',
        render: (p) => {
          const input = document.createElement('input')
          input.type = 'number'
          input.min = '10'
          input.max = '32'
          input.value = String(p.editor.fontSize)
          input.dataset.testid = 'pref-font-size'
          input.addEventListener('change', () => {
            const v = Number(input.value)
            if (v >= 8 && v <= 40) void this.set({ editor: { fontSize: v } })
          })
          return input
        }
      },
      { cat: 'appearance', label: 'prefs.width', hint: 'prefs.widthHint', render: (p) => this.widthControl(p.editor.width) },
      {
        cat: 'appearance',
        label: 'prefs.columnAlign',
        hint: 'prefs.columnAlignHint',
        render: (p) =>
          select(
            p.editor.columnAlign,
            [['center', t('prefs.columnAlignCenter')], ['left', t('prefs.columnAlignLeft')]],
            (v) => void this.set({ editor: { columnAlign: v } }),
            'pref-column-align'
          )
      },
      {
        cat: 'appearance',
        label: 'prefs.statusBar',
        render: checkbox((p) => p.view.statusBar, (v) => ({ view: { statusBar: v } }), 'pref-statusbar')
      },
      {
        cat: 'appearance',
        label: 'prefs.zoom',
        render: (p) =>
          select(
            String(p.view.zoom),
            ['0.8', '0.9', '1', '1.1', '1.25', '1.5', '1.75', '2'].map((z) => [z, `${Math.round(Number(z) * 100)} %`] as [string, string]),
            (v) => void this.set({ view: { zoom: Number(v) } }),
            'pref-zoom'
          )
      }
    ]
  }

  /** Largeur max de la colonne : valeur + unité (px, %) ou pleine largeur. */
  private widthControl(width: ColumnWidth): HTMLElement {
    const box = document.createElement('div')
    box.className = 'prefs-width'
    const full = document.createElement('input')
    full.type = 'checkbox'
    full.checked = width === 'full'
    full.dataset.testid = 'pref-width-full'
    const fullLabel = document.createElement('label')
    fullLabel.append(full, document.createTextNode(t('prefs.widthFull')))
    const value = document.createElement('input')
    value.type = 'number'
    value.dataset.testid = 'pref-width-value'
    const unit = document.createElement('select')
    unit.dataset.testid = 'pref-width-unit'
    for (const u of ['px', '%']) {
      const o = document.createElement('option')
      o.value = u
      o.textContent = u
      unit.append(o)
    }
    const base = width === 'full' ? (this.app.margins.lastWidth ?? DEFAULT_WIDTH) : width
    const lastWidth = base === 'full' ? DEFAULT_WIDTH : base
    value.value = String(lastWidth.value)
    unit.value = lastWidth.unit
    const sync = () => {
      value.disabled = full.checked
      unit.disabled = full.checked
    }
    const apply = () => {
      sync()
      if (full.checked) {
        this.app.setWidth('full')
        return
      }
      const u = unit.value as 'px' | '%'
      let v = Number(value.value)
      if (u === 'px') v = Math.max(MIN_COLUMN_PX, Math.min(10000, v || DEFAULT_WIDTH.value))
      else v = Math.max(20, Math.min(100, v || 80))
      value.value = String(v)
      this.app.setWidth({ value: v, unit: u })
    }
    sync()
    full.addEventListener('change', apply)
    value.addEventListener('change', apply)
    unit.addEventListener('change', () => {
      value.value = unit.value === '%' ? '80' : String(DEFAULT_WIDTH.value)
      apply()
    })
    box.append(value, unit, fullLabel)
    return box
  }

  private render(): void {
    const el = this.el!
    el.replaceChildren()
    const prefs = this.app.prefs
    const side = document.createElement('div')
    side.className = 'prefs-side'
    const search = document.createElement('input')
    search.className = 'prefs-search'
    search.type = 'search'
    search.placeholder = t('prefs.search')
    search.value = this.filter
    search.addEventListener('input', () => {
      this.filter = search.value
      this.renderBody(body, prefs)
    })
    side.append(search)
    const cats: Category[] = ['general', 'files', 'editor', 'markdown', 'appearance']
    for (const c of cats) {
      const b = document.createElement('button')
      b.className = 'prefs-cat' + (c === this.cat && !this.filter ? ' is-active' : '')
      b.textContent = t(`prefs.cat.${c}` as MessageKey)
      b.dataset.testid = `prefs-cat-${c}`
      b.addEventListener('click', () => {
        this.cat = c
        this.filter = ''
        this.render()
      })
      side.append(b)
    }
    const main = document.createElement('div')
    main.className = 'prefs-main'
    const header = document.createElement('div')
    header.className = 'prefs-header'
    const title = document.createElement('h1')
    title.textContent = t('prefs.title')
    const close = document.createElement('button')
    close.className = 'prefs-close'
    close.textContent = t('prefs.close')
    close.dataset.testid = 'prefs-close'
    close.addEventListener('click', () => this.close())
    header.append(title, close)
    const body = document.createElement('div')
    body.className = 'prefs-body'
    const foot = document.createElement('p')
    foot.className = 'prefs-foot'
    foot.textContent = t('prefs.dataDir')
    main.append(header, body, foot)
    el.append(side, main)
    this.renderBody(body, prefs)
  }

  private renderBody(body: HTMLElement, prefs: Prefs): void {
    body.replaceChildren()
    const q = this.filter.trim().toLowerCase()
    const list = this.settings().filter((s) => (q ? t(s.label).toLowerCase().includes(q) : s.cat === this.cat))
    for (const s of list) {
      const row = document.createElement('div')
      row.className = 'prefs-row'
      const label = document.createElement('div')
      label.className = 'prefs-label'
      label.textContent = t(s.label)
      if (s.hint) {
        const hint = document.createElement('div')
        hint.className = 'prefs-hint'
        hint.textContent = t(s.hint)
        label.append(hint)
      }
      const control = document.createElement('div')
      control.className = 'prefs-control'
      control.append(s.render(prefs))
      row.append(label, control)
      body.append(row)
    }
  }
}
