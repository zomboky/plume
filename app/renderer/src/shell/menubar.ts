// Barre de menus dans la bande de titre sombre (Fichier, Édition, …).
// Alt seul ou Alt+lettre ouvre les menus au clavier.
import type { App } from '../app'
import { t } from '../i18n'
import { closeMenus, isMenuOpen, openMenu, setMenuNavigator } from './menu'
import { topMenus, type TopMenu } from './menus'

export class MenuBar {
  private el = document.getElementById('menubar')!
  private menus: TopMenu[]
  private buttons: HTMLButtonElement[] = []
  private openIndex = -1
  private altArmed = false

  constructor(app: App) {
    this.menus = topMenus(app)
    this.render()
    window.addEventListener('keydown', (e) => this.onKeyDown(e), true)
    window.addEventListener('keyup', (e) => this.onKeyUp(e), true)
  }

  private render(): void {
    this.el.replaceChildren()
    this.buttons = this.menus.map((m, i) => {
      const b = document.createElement('button')
      b.className = 'menubar-item'
      b.textContent = t(m.label)
      b.dataset.testid = `menu-${m.id}`
      b.setAttribute('role', 'menuitem')
      b.addEventListener('mousedown', (e) => {
        e.preventDefault()
        if (this.openIndex === i) closeMenus()
        else this.open(i)
      })
      b.addEventListener('mouseenter', () => {
        if (this.openIndex >= 0 && this.openIndex !== i) this.open(i)
      })
      this.el.append(b)
      return b
    })
  }

  open(index: number, focusFirst = false): void {
    const n = this.menus.length
    index = ((index % n) + n) % n
    const btn = this.buttons[index]
    const rect = btn.getBoundingClientRect()
    this.openIndex = index
    this.buttons.forEach((b, i) => b.classList.toggle('is-open', i === index))
    openMenu(this.menus[index].items(), rect.left, rect.bottom, {
      focusFirst,
      className: 'menubar-panel',
      onClose: () => {
        if (this.openIndex === index) {
          this.openIndex = -1
          btn.classList.remove('is-open')
          setMenuNavigator(null)
        }
      }
    })
    setMenuNavigator((dir) => this.open(this.openIndex + dir, true))
  }

  /** Les états cochés sont recalculés à chaque ouverture ; rien à faire ici hormis la langue. */
  refresh(): void {
    this.buttons.forEach((b, i) => (b.textContent = t(this.menus[i].label)))
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Alt') {
      this.altArmed = !e.ctrlKey && !e.shiftKey
      return
    }
    this.altArmed = false
    if (e.altKey && !e.ctrlKey && !e.shiftKey && /^Key[A-Z]$/.test(e.code)) {
      const letter = e.code.slice(3).toLowerCase()
      const index = this.menus.findIndex((m) => t(m.label).toLowerCase().startsWith(letter))
      if (index >= 0) {
        e.preventDefault()
        e.stopPropagation()
        this.open(index, true)
      }
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Alt' && this.altArmed) {
      e.preventDefault()
      this.altArmed = false
      if (isMenuOpen()) closeMenus()
      else this.open(0, true)
    }
  }
}
