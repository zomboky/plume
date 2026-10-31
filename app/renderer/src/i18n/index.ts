// Traduction des libellés. Le français sert de référence et de repli.
import type { Locale } from '@shared/prefs'
import { en } from './en'
import { fr, type MessageKey } from './fr'

const dictionaries: Record<Locale, Partial<Record<MessageKey, string>>> = { fr, en }
let current: Locale = 'fr'

export function setLocale(locale: Locale): void {
  current = locale
  document.documentElement.lang = locale
}

export function getLocale(): Locale {
  return current
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s: string = dictionaries[current][key] ?? fr[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** Affichage d'un raccourci selon la langue (Maj au lieu de Shift en français). */
export function formatShortcut(shortcut: string): string {
  if (current !== 'fr') return shortcut
  return shortcut.replace(/\bShift\b/g, 'Maj').replace(/\bUp\b/, 'Haut').replace(/\bDown\b/, 'Bas')
}

export type { MessageKey }
