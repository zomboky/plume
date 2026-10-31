// Poignées de largeur de la colonne d'écriture.
// Colonne centrée : glisser élargit ou rétrécit la colonne symétriquement.
// Colonne à gauche : seule la poignée droite règle la largeur.
// Atteindre le bord = pleine largeur. Double-clic : bascule pleine largeur / largeur précédente. Réglage mémorisé.
import { DEFAULT_WIDTH, MIN_COLUMN_PX, type ColumnWidth } from '@shared/prefs'
import type { App } from '../app'
import { t } from '../i18n'

/** Distance au bord (px) en dessous de laquelle on passe en pleine largeur. */
const SNAP_PX = 24
/** Marge intérieure de la colonne en pleine largeur (voir CSS). */
const FULL_PADDING = 24

export class Margins {
  private handles = [...document.querySelectorAll<HTMLElement>('.margin-handle')]
  /** Dernière largeur non pleine, pour le double-clic. */
  lastWidth: ColumnWidth | null = null

  constructor(private app: App) {
    const w = app.prefs.editor.width
    this.lastWidth = w === 'full' ? DEFAULT_WIDTH : w
    for (const h of this.handles) {
      h.title = t('prefs.widthHint')
      h.addEventListener('pointerdown', (e) => this.startDrag(e, h))
      h.addEventListener('dblclick', (e) => {
        e.preventDefault()
        this.toggle()
      })
    }
    new ResizeObserver(() => this.layout()).observe(app.workspace)
    app.scroller.addEventListener('scroll', () => this.layout(), { passive: true })
  }

  toggle(): void {
    const w = this.app.prefs.editor.width
    if (w !== 'full') this.lastWidth = w
    this.app.setWidth(w === 'full' ? (this.lastWidth ?? DEFAULT_WIDTH) : 'full')
  }

  /** Place les poignées sur les bords de la colonne. */
  layout(): void {
    const ws = this.app.workspace.getBoundingClientRect()
    const col = this.app.column.getBoundingClientRect()
    const full = this.app.prefs?.editor.width === 'full'
    const left = full ? FULL_PADDING / 2 : col.left - ws.left
    const right = full ? ws.width - FULL_PADDING / 2 : col.right - ws.left
    const [l, r] = this.handles
    l.style.left = `${Math.round(left) - 4}px`
    r.style.left = `${Math.round(right) - 4}px`
  }

  private startDrag(e: PointerEvent, handle: HTMLElement): void {
    if (e.button !== 0) return
    e.preventDefault()
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('is-resizing-column')
    const ws = this.app.workspace.getBoundingClientRect()
    // Largeur utile : la zone de défilement moins sa barre de défilement.
    const usable = this.app.scroller.clientWidth
    const center = ws.left + usable / 2
    const alignLeft = this.app.prefs.editor.columnAlign === 'left'
    let width: ColumnWidth = this.app.prefs.editor.width
    const move = (ev: PointerEvent) => {
      // À gauche, la colonne part du bord gauche de la zone ; centrée, elle s'étend des deux côtés.
      const px = Math.round(alignLeft ? ev.clientX - ws.left : Math.abs(ev.clientX - center) * 2)
      if (px >= usable - SNAP_PX * (alignLeft ? 1 : 2)) width = 'full'
      else width = { value: Math.max(MIN_COLUMN_PX, px), unit: 'px' }
      this.app.setWidth(width, false)
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      document.body.classList.remove('is-resizing-column')
      if (width !== 'full') this.lastWidth = width
      this.app.setWidth(width, true)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }
}
