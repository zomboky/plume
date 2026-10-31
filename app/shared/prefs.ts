// Schéma des préférences, valeurs par défaut et validation.
// Utilisé par le processus principal (stockage) et l'interface (édition).

export type ThemeId = 'dark-2026' | 'clair' | 'papier'
export type Locale = 'fr' | 'en'
export type ColumnWidth = { value: number; unit: 'px' | '%' } | 'full'
export type SidebarTab = 'files' | 'outline' | 'search'

export interface Prefs {
  locale: Locale
  theme: ThemeId
  editor: {
    width: ColumnWidth
    fontSize: number
    autoPair: boolean
    lineEnding: 'lf' | 'crlf'
    spellcheck: boolean
  }
  markdown: {
    inlineMath: boolean
    codeLineNumbers: boolean
    codeWrap: boolean
  }
  files: {
    autoSave: boolean
    reopenLast: boolean
    showHidden: boolean
    onlyMarkdown: boolean
  }
  view: {
    sidebar: boolean
    sidebarTab: SidebarTab
    statusBar: boolean
    zoom: number
    focusMode: boolean
    typewriterMode: boolean
  }
}

export const DEFAULT_WIDTH: ColumnWidth = { value: 860, unit: 'px' }

export const DEFAULT_PREFS: Prefs = {
  locale: 'fr',
  theme: 'dark-2026',
  editor: { width: DEFAULT_WIDTH, fontSize: 14, autoPair: true, lineEnding: 'lf', spellcheck: false },
  markdown: { inlineMath: false, codeLineNumbers: false, codeWrap: true },
  files: { autoSave: false, reopenLast: true, showHidden: false, onlyMarkdown: true },
  view: { sidebar: true, sidebarTab: 'files', statusBar: true, zoom: 1, focusMode: false, typewriterMode: false }
}

export const THEMES: ThemeId[] = ['dark-2026', 'clair', 'papier']
export const MIN_COLUMN_PX = 320

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function pick<T>(value: unknown, fallback: T, ok: (v: unknown) => boolean): T {
  return ok(value) ? (value as T) : fallback
}

const bool = (v: unknown) => typeof v === 'boolean'
const num = (min: number, max: number) => (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const oneOf = (...values: unknown[]) => (v: unknown) => values.includes(v)

export function validWidth(v: unknown): v is ColumnWidth {
  if (v === 'full') return true
  if (!isObj(v)) return false
  if (v.unit === 'px') return num(MIN_COLUMN_PX, 10000)(v.value)
  if (v.unit === '%') return num(20, 100)(v.value)
  return false
}

/** Fusionne une valeur inconnue (fichier JSON) avec les défauts, champ par champ. */
export function normalizePrefs(raw: unknown): Prefs {
  const r = isObj(raw) ? raw : {}
  const d = DEFAULT_PREFS
  const ed = isObj(r.editor) ? r.editor : {}
  const md = isObj(r.markdown) ? r.markdown : {}
  const fi = isObj(r.files) ? r.files : {}
  const vw = isObj(r.view) ? r.view : {}
  return {
    locale: pick(r.locale, d.locale, oneOf('fr', 'en')),
    theme: pick(r.theme, d.theme, oneOf(...THEMES)),
    editor: {
      width: pick(ed.width, d.editor.width, validWidth),
      fontSize: pick(ed.fontSize, d.editor.fontSize, num(8, 40)),
      autoPair: pick(ed.autoPair, d.editor.autoPair, bool),
      lineEnding: pick(ed.lineEnding, d.editor.lineEnding, oneOf('lf', 'crlf')),
      spellcheck: pick(ed.spellcheck, d.editor.spellcheck, bool)
    },
    markdown: {
      inlineMath: pick(md.inlineMath, d.markdown.inlineMath, bool),
      codeLineNumbers: pick(md.codeLineNumbers, d.markdown.codeLineNumbers, bool),
      codeWrap: pick(md.codeWrap, d.markdown.codeWrap, bool)
    },
    files: {
      autoSave: pick(fi.autoSave, d.files.autoSave, bool),
      reopenLast: pick(fi.reopenLast, d.files.reopenLast, bool),
      showHidden: pick(fi.showHidden, d.files.showHidden, bool),
      onlyMarkdown: pick(fi.onlyMarkdown, d.files.onlyMarkdown, bool)
    },
    view: {
      sidebar: pick(vw.sidebar, d.view.sidebar, bool),
      sidebarTab: pick(vw.sidebarTab, d.view.sidebarTab, oneOf('files', 'outline', 'search')),
      statusBar: pick(vw.statusBar, d.view.statusBar, bool),
      zoom: pick(vw.zoom, d.view.zoom, num(0.5, 3)),
      focusMode: pick(vw.focusMode, d.view.focusMode, bool),
      typewriterMode: pick(vw.typewriterMode, d.view.typewriterMode, bool)
    }
  }
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> | T[K] : T[K] }

export function mergePrefs(base: Prefs, patch: DeepPartial<Prefs>): Prefs {
  const out: Record<string, unknown> = structuredClone(base) as never
  for (const [key, value] of Object.entries(patch)) {
    const cur = out[key]
    out[key] = isObj(cur) && isObj(value) && key !== 'width' ? { ...cur, ...value } : value
  }
  return normalizePrefs(out)
}
