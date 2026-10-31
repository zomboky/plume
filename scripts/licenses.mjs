// Écrit THIRD_PARTY_LICENSES : licences des bibliothèques embarquées dans l'application
// (dépendances d'exécution et leurs dépendances transitives). Lancer : pnpm licenses:file
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Bibliothèques importées par le code de l'application (les outils de build sont exclus).
const RUNTIME = [
  '@codemirror/autocomplete', '@codemirror/commands', '@codemirror/lang-markdown', '@codemirror/language',
  '@codemirror/language-data', '@codemirror/search', '@codemirror/state', '@codemirror/view',
  '@lezer/highlight', '@milkdown/kit', 'electron', 'fuse.js', 'katex', 'mermaid', 'rehype-katex',
  'rehype-raw', 'rehype-stringify', 'remark-frontmatter', 'remark-gfm', 'remark-math', 'remark-parse',
  'remark-rehype', 'unified'
]
// Non embarqués : remplacés par un module vide au build (voir electron.vite.config.ts).
const EXCLUDED = new Set(['elkjs'])
const PERMISSIVE = /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|0BSD|BlueOak-1\.0\.0|CC0-1\.0|Unlicense|Python-2\.0|W3C|Zlib)$/

function pkgDir(name, fromDir) {
  const req = createRequire(join(fromDir, 'noop.js'))
  let dir
  try {
    dir = dirname(req.resolve(`${name}/package.json`))
  } catch {
    // Paquet sans « exports » pour package.json : remonter depuis le point d'entrée.
    try {
      dir = dirname(req.resolve(name))
    } catch {
      return undefined
    }
    while (!existsSync(join(dir, 'package.json')) || JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name !== name) {
      const up = dirname(dir)
      if (up === dir) return undefined
      dir = up
    }
  }
  return realpathSync(dir)
}

const seen = new Map()
function visit(name, fromDir) {
  if (EXCLUDED.has(name)) return
  const dir = pkgDir(name, fromDir)
  if (!dir || seen.has(dir)) return
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  seen.set(dir, pkg)
  if (pkg.name === 'electron') return
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) visit(dep, dir)
}
for (const name of RUNTIME) visit(name, root)

const licenseOf = (pkg) =>
  typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? (pkg.licenses ?? []).map((l) => l.type).join(' OR ')

const entries = [...seen].map(([dir, pkg]) => {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f))
  const text = file ? readFileSync(join(dir, file), 'utf8').trim() : ''
  // Licence absente de package.json : la déduire du fichier de licence.
  const license = licenseOf(pkg) || (/^\s*(The )?MIT License/i.test(text) ? 'MIT' : '')
  return { name: pkg.name, version: pkg.version, license, text }
})
const unique = [...new Map(entries.map((e) => [`${e.name}@${e.version}`, e])).values()].sort((a, b) => a.name.localeCompare(b.name))

const flagged = unique.filter((e) => !e.license.split(/\s+OR\s+|[()]/).some((l) => PERMISSIVE.test(l.trim())))
let out = 'Plume — licences des composants tiers\n'
out += `Composants embarqués : ${unique.length}\n\n`
for (const e of unique) {
  out += `${'='.repeat(78)}\n${e.name} ${e.version} — ${e.license}\n${'='.repeat(78)}\n`
  out += (e.text || `(Texte de licence non fourni par le paquet ; licence déclarée : ${e.license})`) + '\n\n'
}
writeFileSync(join(root, 'THIRD_PARTY_LICENSES'), out)
console.log(`${unique.length} paquets écrits dans THIRD_PARTY_LICENSES`)
const counts = {}
for (const e of unique) counts[e.license] = (counts[e.license] ?? 0) + 1
console.log(counts)
if (flagged.length) console.log('À vérifier :', flagged.map((e) => `${e.name}@${e.version} (${e.license})`).join(', '))
