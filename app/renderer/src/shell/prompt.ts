// Petite boîte de saisie modale (adresse de lien, chemin d'image).
import { t } from '../i18n'

export function prompt(label: string, initial = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'prompt-overlay'
    const box = document.createElement('form')
    box.className = 'prompt-box'
    box.dataset.testid = 'prompt'
    const title = document.createElement('label')
    title.className = 'prompt-label'
    title.textContent = label
    const input = document.createElement('input')
    input.className = 'prompt-input'
    input.value = initial
    input.spellcheck = false
    const buttons = document.createElement('div')
    buttons.className = 'prompt-buttons'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = t('prompt.cancel')
    const ok = document.createElement('button')
    ok.type = 'submit'
    ok.className = 'is-primary'
    ok.textContent = t('prompt.ok')
    buttons.append(cancel, ok)
    title.append(input)
    box.append(title, buttons)
    overlay.append(box)
    document.body.append(overlay)
    const done = (value: string | null) => {
      overlay.remove()
      resolve(value)
    }
    box.addEventListener('submit', (e) => {
      e.preventDefault()
      done(input.value)
    })
    cancel.addEventListener('click', () => done(null))
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) done(null)
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        done(null)
      }
    })
    input.focus()
    input.select()
  })
}
