// Menus déroulants : barre de menus et menu contextuel partagent ce rendu.
// Navigation clavier (flèches, Entrée, Échap), sous-menus au survol.
import { formatShortcut } from '../i18n'

export interface MenuAction {
  kind?: 'action'
  label: string
  shortcut?: string
  checked?: boolean
  disabled?: boolean
  testId?: string
  run: () => void
}

export interface MenuSubmenu {
  kind: 'submenu'
  label: string
  disabled?: boolean
  testId?: string
  items: () => MenuItem[]
}

export interface MenuSeparator {
  kind: 'separator'
}

export interface MenuIconRow {
  kind: 'icons'
  buttons: { icon: string; title: string; disabled?: boolean; active?: boolean; testId?: string; run: () => void }[]
}

export type MenuItem = MenuAction | MenuSubmenu | MenuSeparator | MenuIconRow

const SEP: MenuSeparator = { kind: 'separator' }
export const separator = (): MenuSeparator => SEP

interface OpenMenu {
  el: HTMLElement
  child: OpenMenu | null
  parent: OpenMenu | null
  items: MenuItem[]
  rows: HTMLElement[]
  active: number
}

let root: OpenMenu | null = null
let onCloseCb: (() => void) | null = null

export function isMenuOpen(): boolean {
  return root !== null
}

export function closeMenus(): void {
  if (!root) return
  let m: OpenMenu | null = root
  while (m) {
    m.el.remove()
    m = m.child
  }
  root = null
  document.removeEventListener('mousedown', onOutside, true)
  document.removeEventListener('keydown', onKey, true)
  window.removeEventListener('blur', closeMenus)
  const cb = onCloseCb
  onCloseCb = null
  cb?.()
}

function onOutside(e: MouseEvent): void {
  let m = root
  while (m) {
    if (m.el.contains(e.target as Node)) return
    m = m.child
  }
  closeMenus()
}

function deepest(): OpenMenu | null {
  let m = root
  while (m?.child) m = m.child
  return m
}

function onKey(e: KeyboardEvent): void {
  const m = deepest()
  if (!m) return
  const stop = () => {
    e.preventDefault()
    e.stopPropagation()
  }
  if (e.key === 'Escape') {
    stop()
    if (m.parent) closeChild(m.parent)
    else closeMenus()
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    stop()
    move(m, e.key === 'ArrowDown' ? 1 : -1)
  } else if (e.key === 'ArrowRight') {
    const item = m.items[m.active]
    if (item?.kind === 'submenu') {
      stop()
      openChild(m, m.active, true)
    } else if (!m.parent) {
      stop()
      menuNavigate?.(1)
    }
  } else if (e.key === 'ArrowLeft') {
    stop()
    if (m.parent) closeChild(m.parent)
    else menuNavigate?.(-1)
  } else if (e.key === 'Enter' || e.key === ' ') {
    stop()
    activate(m, m.active, true)
  } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
    // Saut à l'entrée commençant par la lettre tapée.
    const letter = e.key.toLowerCase()
    const start = m.active + 1
    for (let k = 0; k < m.items.length; k++) {
      const i = (start + k) % m.items.length
      const it = m.items[i]
      if ((it.kind === undefined || it.kind === 'action' || it.kind === 'submenu') && it.label.toLowerCase().startsWith(letter)) {
        stop()
        highlight(m, i)
        return
      }
    }
  }
}

/** Rappel de la barre de menus pour passer au menu voisin (flèches gauche/droite). */
let menuNavigate: ((dir: 1 | -1) => void) | null = null
export function setMenuNavigator(fn: ((dir: 1 | -1) => void) | null): void {
  menuNavigate = fn
}

function selectable(item: MenuItem | undefined): boolean {
  return !!item && (item.kind === undefined || item.kind === 'action' || item.kind === 'submenu') && !item.disabled
}

function move(m: OpenMenu, dir: 1 | -1): void {
  const n = m.items.length
  for (let k = 1; k <= n; k++) {
    const i = (((m.active < 0 ? (dir > 0 ? -1 : 0) : m.active) + dir * k) % n + n) % n
    if (selectable(m.items[i])) {
      highlight(m, i)
      return
    }
  }
}

function highlight(m: OpenMenu, index: number): void {
  m.rows.forEach((r, i) => r.classList.toggle('is-active', i === index))
  m.active = index
  m.rows[index]?.scrollIntoView({ block: 'nearest' })
}

function closeChild(m: OpenMenu): void {
  let c = m.child
  while (c) {
    c.el.remove()
    c = c.child
  }
  m.child = null
}

function activate(m: OpenMenu, index: number, viaKeyboard: boolean): void {
  const item = m.items[index]
  if (!item || !selectable(item)) return
  if (item.kind === 'submenu') {
    openChild(m, index, viaKeyboard)
    return
  }
  if (item.kind === undefined || item.kind === 'action') {
    closeMenus()
    item.run()
  }
}

function openChild(m: OpenMenu, index: number, focusFirst: boolean): void {
  const item = m.items[index]
  if (item?.kind !== 'submenu') return
  closeChild(m)
  const row = m.rows[index]
  const rect = row.getBoundingClientRect()
  const child = build(item.items(), m)
  m.child = child
  place(child.el, rect.right - 2, rect.top - 5, rect.left + 2)
  if (focusFirst) move(child, 1)
}

function build(items: MenuItem[], parent: OpenMenu | null): OpenMenu {
  const el = document.createElement('div')
  el.className = 'menu-panel'
  el.setAttribute('role', 'menu')
  const m: OpenMenu = { el, child: null, parent, items, rows: [], active: -1 }
  items.forEach((item, index) => {
    let row: HTMLElement
    if (item.kind === 'separator') {
      row = document.createElement('div')
      row.className = 'menu-separator'
    } else if (item.kind === 'icons') {
      row = document.createElement('div')
      row.className = 'menu-icons'
      for (const b of item.buttons) {
        const btn = document.createElement('button')
        btn.className = 'menu-icon-btn' + (b.active ? ' is-on' : '')
        btn.innerHTML = b.icon
        btn.title = b.title
        btn.setAttribute('aria-label', b.title)
        btn.disabled = !!b.disabled
        if (b.testId) btn.dataset.testid = b.testId
        btn.addEventListener('mousedown', (e) => e.preventDefault())
        btn.addEventListener('click', () => {
          closeMenus()
          b.run()
        })
        row.append(btn)
      }
    } else {
      row = document.createElement('div')
      row.className = 'menu-item'
      row.setAttribute('role', 'menuitem')
      if (item.disabled) row.classList.add('is-disabled')
      if (item.testId) row.dataset.testid = item.testId
      const check = document.createElement('span')
      check.className = 'menu-check'
      if ((item.kind === undefined || item.kind === 'action') && item.checked) check.textContent = '✓'
      const label = document.createElement('span')
      label.className = 'menu-label'
      label.textContent = item.label
      const extra = document.createElement('span')
      extra.className = 'menu-shortcut'
      if (item.kind === 'submenu') extra.textContent = '›'
      else if (item.shortcut) extra.textContent = formatShortcut(item.shortcut)
      row.append(check, label, extra)
      row.addEventListener('mouseenter', () => {
        if (!selectable(item)) return
        highlight(m, index)
        if (item.kind === 'submenu') openChild(m, index, false)
        else closeChild(m)
      })
      row.addEventListener('mousedown', (e) => e.preventDefault())
      row.addEventListener('click', () => activate(m, index, false))
    }
    m.rows.push(row)
    el.append(row)
  })
  document.body.append(el)
  return m
}

/** Positionne un panneau en restant dans la fenêtre (`altX` : bord opposé si débordement). */
function place(el: HTMLElement, x: number, y: number, altX?: number): void {
  el.style.left = '0px'
  el.style.top = '0px'
  const w = el.offsetWidth
  const h = el.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = x
  if (left + w > vw - 4) left = altX !== undefined ? Math.max(4, altX - w) : Math.max(4, vw - w - 4)
  let top = y
  if (top + h > vh - 4) top = Math.max(4, vh - h - 4)
  el.style.left = `${left}px`
  el.style.top = `${top}px`
}

export function openMenu(items: MenuItem[], x: number, y: number, opts: { onClose?: () => void; className?: string; focusFirst?: boolean } = {}): HTMLElement {
  closeMenus()
  root = build(items, null)
  if (opts.className) root.el.classList.add(opts.className)
  place(root.el, x, y)
  onCloseCb = opts.onClose ?? null
  document.addEventListener('mousedown', onOutside, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('blur', closeMenus)
  if (opts.focusFirst) move(root, 1)
  return root.el
}
