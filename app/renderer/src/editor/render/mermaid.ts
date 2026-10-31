// Rendu Mermaid, chargé seulement au premier diagramme.
type MermaidApi = typeof import('mermaid').default

let api: Promise<MermaidApi> | null = null
let counter = 0
let currentTheme = 'dark'

export function setMermaidTheme(dark: boolean): void {
  currentTheme = dark ? 'dark' : 'default'
  if (api) void api.then((m) => m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: currentTheme as never }))
}

function load(): Promise<MermaidApi> {
  if (!api) {
    api = import('mermaid').then((mod) => {
      mod.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: currentTheme as never })
      return mod.default
    })
  }
  return api
}

export async function mermaidToSvg(src: string): Promise<string> {
  const mermaid = await load()
  const { svg } = await mermaid.render(`plume-mermaid-${++counter}`, src)
  return svg
}

export async function renderMermaid(target: HTMLElement, src: string): Promise<void> {
  if (!src.trim()) {
    target.innerHTML = ''
    return
  }
  try {
    target.innerHTML = await mermaidToSvg(src)
    target.classList.remove('has-error')
  } catch (err) {
    target.classList.add('has-error')
    target.textContent = String((err as Error)?.message ?? err).split('\n')[0]
  }
}
