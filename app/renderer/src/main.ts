// Point d'entrée de l'interface.
import 'katex/dist/katex.min.css'
import './styles/themes.css'
import './styles/content.css'
import './styles/app.css'
import './styles/editor.css'
import { App } from './app'

document.getElementById('editor')!.classList.add('markdown-body')

const app = new App()
// Accès pour le débogage et les tests de bout en bout.
;(window as unknown as { plumeApp: App }).plumeApp = app
app.start().catch((err) => {
  console.error(err)
  document.body.classList.add('is-ready')
  document.body.textContent = `Plume : ${String(err?.stack ?? err)}`
})
