// Accès au système de fichiers : lecture/écriture, arborescence, recherche dans un dossier.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { OpenedFile, SearchHit, TreeEntry } from '@shared/api'

export const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt'])
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg'])
const MAX_FILES = 5000
const MAX_DEPTH = 8

export async function readMarkdown(path: string): Promise<OpenedFile> {
  let content = await readFile(path, 'utf8')
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
  const eol = content.includes('\r\n') ? 'crlf' : 'lf'
  return { path, content: content.replace(/\r\n/g, '\n'), eol }
}

export async function writeMarkdown(path: string, content: string): Promise<void> {
  await writeFile(path, content, 'utf8')
}

interface TreeOptions {
  showHidden: boolean
  onlyMarkdown: boolean
}

export async function listTree(folder: string, opts: TreeOptions, depth = 0): Promise<TreeEntry[]> {
  if (depth > MAX_DEPTH) return []
  let entries
  try {
    entries = await readdir(folder, { withFileTypes: true })
  } catch {
    return []
  }
  const dirs: TreeEntry[] = []
  const files: TreeEntry[] = []
  for (const e of entries) {
    if (!opts.showHidden && e.name.startsWith('.')) continue
    const path = join(folder, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      dirs.push({ name: e.name, path, dir: true, children: await listTree(path, opts, depth + 1) })
    } else if (!opts.onlyMarkdown || MARKDOWN_EXT.has(extname(e.name).toLowerCase())) {
      files.push({ name: e.name, path, dir: false })
    }
  }
  const byName = (a: TreeEntry, b: TreeEntry) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  return [...dirs.sort(byName), ...files.sort(byName)]
}

export async function listMarkdownFiles(folder: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const path = join(dir, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(path, depth + 1)
      } else if (MARKDOWN_EXT.has(extname(e.name).toLowerCase())) {
        out.push(path)
        if (out.length >= MAX_FILES) return
      }
    }
  }
  await walk(folder, 0)
  return out
}

export async function searchFolder(folder: string, query: string): Promise<SearchHit[]> {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const hits: SearchHit[] = []
  for (const path of await listMarkdownFiles(folder)) {
    let text: string
    try {
      const info = await stat(path)
      if (info.size > 5_000_000) continue
      text = await readFile(path, 'utf8')
    } catch {
      continue
    }
    const matches: SearchHit['matches'] = []
    const name = basename(path)
    text.split(/\r?\n/).forEach((line, i) => {
      if (matches.length < 20 && line.toLowerCase().includes(needle)) matches.push({ line: i + 1, text: line.trim().slice(0, 200) })
    })
    if (matches.length || name.toLowerCase().includes(needle)) hits.push({ path, name, matches })
    if (hits.length >= 200) break
  }
  return hits
}
