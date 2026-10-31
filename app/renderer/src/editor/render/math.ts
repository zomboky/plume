// Rendu KaTeX (sans réseau).
import katex from 'katex'

export function renderMath(target: HTMLElement, src: string, display: boolean): void {
  const tex = src.trim()
  if (!tex) {
    target.innerHTML = ''
    target.classList.add('is-empty')
    return
  }
  target.classList.remove('is-empty')
  target.innerHTML = mathToHtml(tex, display)
}

export function mathToHtml(src: string, display: boolean): string {
  return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' })
}
