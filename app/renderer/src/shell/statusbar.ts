// Barre d'état : nouveau fichier, barre latérale, mode source, nombre de mots.
import type { App } from '../app'
import { t } from '../i18n'
import { icons } from './icons'

const WORDS_PER_MINUTE = 230

export function countWords(text: string): number {
  // Mots latins et chiffres ; chaque idéogramme CJK compte pour un mot.
  const latin = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu)?.filter((w) => !/\p{Script=Han}/u.test(w)).length ?? 0
  const cjk = text.match(/\p{Script=Han}/gu)?.length ?? 0
  return latin + cjk
}

export class StatusBar {
  private el = document.getElementById('statusbar')!
  private words = document.createElement('div')
  private sourceBtn = document.createElement('button')
  private timer = 0

  constructor(private app: App) {
    const left = document.createElement('div')
    left.className = 'status-left'
    const newBtn = this.button(icons.plus, t('status.newFile'), () => app.commands.run('file.new'), 'status-new')
    const sideBtn = this.button(icons.chevronLeft, t('status.toggleSidebar'), () => app.commands.run('view.sidebar'), 'status-sidebar')
    sideBtn.classList.add('status-sidebar')
    this.sourceBtn = this.button(icons.code, t('status.source'), () => app.commands.run('view.source'), 'status-source')
    left.append(newBtn, sideBtn, this.sourceBtn)
    this.words.className = 'status-words'
    this.words.dataset.testid = 'word-count'
    this.el.append(left, this.words)
  }

  private button(icon: string, title: string, run: () => void, testId: string): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'status-btn'
    b.innerHTML = icon
    b.title = title
    b.setAttribute('aria-label', title)
    b.dataset.testid = testId
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', run)
    return b
  }

  update(): void {
    window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.render(), 80)
  }

  updateSelection(): void {
    this.update()
  }

  private render(): void {
    const app = this.app
    const source = app.mode === 'source'
    this.sourceBtn.title = source ? t('status.exitSource') : t('status.source')
    this.sourceBtn.classList.toggle('is-on', source)
    const text = source ? (app.source?.getText() ?? '') : app.editor.state.doc.textBetween(0, app.editor.state.doc.content.size, '\n', ' ')
    const total = countWords(text)
    let label = t(total === 1 ? 'status.word' : 'status.words', { n: total })
    if (!source) {
      const sel = app.editor.state.selection
      if (!sel.empty) {
        const n = countWords(app.editor.state.doc.textBetween(sel.from, sel.to, '\n', ' '))
        label = t('status.selection', { n, total })
      }
    }
    this.words.textContent = label
    const lines = text.split('\n').length
    this.words.title = t('status.detail', {
      words: total,
      chars: text.replace(/\s/g, '').length,
      lines,
      minutes: Math.max(1, Math.round(total / WORDS_PER_MINUTE))
    })
  }
}
