// Application du thème : attribut sur <html> et couleurs de la barre de titre native.
import type { ThemeId } from '@shared/prefs'

const TITLEBAR: Record<ThemeId, [string, string]> = {
  'dark-2026': ['#191A1B', '#BBBEBF'],
  clair: ['#f3f3f3', '#333333'],
  papier: ['#ece6d9', '#4a4237']
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme === 'dark-2026' ? 'dark' : 'light'
  const [bg, fg] = TITLEBAR[theme]
  window.plume.setTitleBarColors(bg, fg)
}
