// Stockage JSON des préférences et des fichiers récents dans le dossier de données.
import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Recent } from '@shared/api'
import { mergePrefs, normalizePrefs, type DeepPartial, type Prefs } from '@shared/prefs'

const MAX_RECENT = 15

function file(name: string): string {
  return join(app.getPath('userData'), name)
}

function readJson(name: string): unknown {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8'))
  } catch {
    return undefined
  }
}

function writeJson(name: string, value: unknown): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  const target = file(name)
  // Écriture atomique : un fichier temporaire puis renommage.
  writeFileSync(target + '.tmp', JSON.stringify(value, null, 2), 'utf8')
  renameSync(target + '.tmp', target)
}

let prefs: Prefs | null = null

export function getPrefs(): Prefs {
  if (!prefs) prefs = normalizePrefs(readJson('preferences.json'))
  return prefs
}

export function setPrefs(patch: DeepPartial<Prefs>): Prefs {
  prefs = mergePrefs(getPrefs(), patch)
  writeJson('preferences.json', prefs)
  return prefs
}

export function getRecent(): Recent {
  const raw = readJson('recent.json') as Partial<Recent> | undefined
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return { files: list(raw?.files), folders: list(raw?.folders) }
}

export function addRecent(kind: 'file' | 'folder', path: string): Recent {
  const recent = getRecent()
  const key = kind === 'file' ? 'files' : 'folders'
  recent[key] = [path, ...recent[key].filter((p) => p.toLowerCase() !== path.toLowerCase())].slice(0, MAX_RECENT)
  writeJson('recent.json', recent)
  return recent
}

export function clearRecent(): Recent {
  const empty = { files: [], folders: [] }
  writeJson('recent.json', empty)
  return empty
}
