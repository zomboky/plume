// Bandeau de notification en haut de l'éditeur.
import { t } from '../i18n'

export class Notice {
  private el = document.getElementById('notice')!
  private timer = 0

  /** `action` : bouton supplémentaire (ex. redémarrer pour mettre à jour). `timeout` 0 = reste affiché. */
  show(message: string, timeout = 4000, action?: { label: string; run: () => void }): void {
    this.el.replaceChildren()
    const text = document.createElement('span')
    text.className = 'notice-text'
    text.textContent = message
    this.el.append(text)
    if (action) {
      const button = document.createElement('button')
      button.className = 'notice-action'
      button.dataset.testid = 'notice-action'
      button.textContent = action.label
      button.addEventListener('click', () => {
        this.hide()
        action.run()
      })
      this.el.append(button)
    }
    const close = document.createElement('button')
    close.className = 'notice-close'
    close.textContent = t('msg.dismiss')
    close.addEventListener('click', () => this.hide())
    this.el.append(close)
    this.el.hidden = false
    window.clearTimeout(this.timer)
    if (timeout) this.timer = window.setTimeout(() => this.hide(), timeout)
  }

  hide(): void {
    this.el.hidden = true
  }
}
