// Langages des blocs de code, chargés à la demande depuis @codemirror/language-data.
import { LanguageDescription, type LanguageSupport } from '@codemirror/language'
import { languages } from '@codemirror/language-data'

export const LANGUAGE_NAMES: string[] = [...new Set(languages.flatMap((l) => [l.name.toLowerCase(), ...l.alias]))].sort()

const cache = new Map<string, Promise<LanguageSupport | null>>()

export function findLanguage(name: string | undefined | null): LanguageDescription | null {
  if (!name) return null
  return LanguageDescription.matchLanguageName(languages, name.trim(), true)
}

export function loadLanguage(name: string | undefined | null): Promise<LanguageSupport | null> {
  const desc = findLanguage(name)
  if (!desc) return Promise.resolve(null)
  let p = cache.get(desc.name)
  if (!p) {
    p = desc.load().catch(() => null)
    cache.set(desc.name, p)
  }
  return p
}
