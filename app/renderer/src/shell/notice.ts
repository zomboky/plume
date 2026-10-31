// Bandeau de notification en haut de l'éditeur.
import { t } from '../i18n'

export class Notice {
  private el = document.getElementById('notice')!
  private timer = 0

  show(message: string, timeout = 4000): void {
    this.el.replaceChildren()
    const text = document.createElement('span')
    text.className = 'notice-text'
    text.textContent = message
    const close = document.createElement('button')
    close.className = 'notice-close'
    close.textContent = t('msg.dismiss')
    close.addEventListener('click', () => this.hide())
    this.el.append(text, close)
    this.el.hidden = false
    window.clearTimeout(this.timer)
    if (timeout) this.timer = window.setTimeout(() => this.hide(), timeout)
  }

  hide(): void {
    this.el.hidden = true
  }
}
