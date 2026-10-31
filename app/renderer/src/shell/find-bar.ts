// Barre Rechercher / Remplacer (Ctrl+F, Ctrl+H) du mode visuel.
import type { App } from '../app'
import { t } from '../i18n'
import { clearFind, findStep, replaceAll, replaceCurrent, setFindQuery, type FindState } from '../editor/plugins/find'
import { icons } from './icons'

export class FindBar {
  private el = document.getElementById('find-bar')!
  private query = document.createElement('input')
  private replace = document.createElement('input')
  private count = document.createElement('span')
  private caseBox = document.createElement('input')
  private replaceRow = document.createElement('div')

  constructor(private app: App) {
    const row = document.createElement('div')
    row.className = 'find-row'
    this.query.className = 'find-input'
    this.query.placeholder = t('find.placeholder')
    this.query.dataset.testid = 'find-input'
    this.query.addEventListener('input', () => this.search())
    this.query.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.step(e.shiftKey ? -1 : 1)
      } else if (e.key === 'Escape') this.close()
    })
    const caseLabel = document.createElement('label')
    caseLabel.className = 'find-case'
    this.caseBox.type = 'checkbox'
    this.caseBox.addEventListener('change', () => this.search())
    caseLabel.append(this.caseBox, document.createTextNode('Aa'))
    caseLabel.title = t('find.caseSensitive')
    this.count.className = 'find-count'
    this.count.dataset.testid = 'find-count'
    row.append(
      this.query,
      caseLabel,
      this.count,
      this.iconButton(icons.up, t('edit.findPrev'), () => this.step(-1)),
      this.iconButton(icons.down, t('edit.findNext'), () => this.step(1)),
      this.iconButton(icons.close, t('find.close'), () => this.close())
    )
    this.replaceRow.className = 'find-row'
    this.replace.className = 'find-input'
    this.replace.placeholder = t('find.replacePlaceholder')
    this.replace.dataset.testid = 'replace-input'
    this.replace.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.replaceOne()
      } else if (e.key === 'Escape') this.close()
    })
    const one = this.textButton(t('find.replace'), () => this.replaceOne())
    const all = this.textButton(t('find.replaceAll'), () => {
      replaceAll(this.app.editor.view, this.replace.value)
      this.search()
    })
    all.dataset.testid = 'replace-all'
    this.replaceRow.append(this.replace, one, all)
    this.el.append(row, this.replaceRow)
  }

  private iconButton(icon: string, title: string, run: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'find-btn'
    b.innerHTML = icon
    b.title = title
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', run)
    return b
  }

  private textButton(label: string, run: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'find-text-btn'
    b.textContent = label
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', run)
    return b
  }

  open(withReplace: boolean, query?: string): void {
    this.el.hidden = false
    this.replaceRow.hidden = !withReplace
    const view = this.app.editor.view
    const sel = view.state.selection
    if (query !== undefined) this.query.value = query
    else if (!sel.empty) this.query.value = view.state.doc.textBetween(sel.from, sel.to).slice(0, 200)
    this.query.focus()
    this.query.select()
    this.search()
  }

  close(): void {
    if (this.el.hidden) return
    this.el.hidden = true
    if (this.app.editor.view) clearFind(this.app.editor.view)
    this.app.focusEditor()
  }

  step(dir: 1 | -1): void {
    if (this.el.hidden) {
      if (this.query.value) this.open(false, this.query.value)
      return
    }
    this.show(findStep(this.app.editor.view, dir))
  }

  private search(): void {
    this.show(setFindQuery(this.app.editor.view, this.query.value, this.caseBox.checked))
    this.query.focus()
  }

  private replaceOne(): void {
    this.show(replaceCurrent(this.app.editor.view, this.replace.value))
  }

  private show(fs: FindState): void {
    if (!fs.query) this.count.textContent = ''
    else if (!fs.matches.length) this.count.textContent = t('find.none')
    else this.count.textContent = t('find.count', { i: fs.index + 1, n: fs.matches.length })
  }
}
