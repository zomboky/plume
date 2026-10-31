// Dossier du document courant, pour résoudre les chemins d'images relatifs.
export const docContext: { dir: string | null } = { dir: null }

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Chemin absolu Windows ou POSIX. */
export function isAbsolutePath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\')
}

/** URL affichable pour une image : distante telle quelle, locale via plume-file://. */
export function resolveAsset(src: string): string {
  if (!src) return ''
  if (/^(https?|data|blob|plume-file):/i.test(src)) return src
  let path = src
  if (/^file:\/\//i.test(src)) path = decodeURIComponent(src.replace(/^file:\/\/\/?/i, ''))
  else {
    try {
      path = decodeURI(src)
    } catch {
      path = src
    }
    if (!isAbsolutePath(path)) {
      if (!docContext.dir) return src
      path = toPosix(docContext.dir).replace(/\/$/, '') + '/' + path.replace(/^\.\//, '')
    }
  }
  return 'plume-file://local/' + encodeURI(toPosix(path)).replace(/#/g, '%23').replace(/\?/g, '%3F')
}

/** Chemin relatif de `file` depuis le dossier du document (séparateurs `/`). */
export function relativeToDoc(file: string): string {
  const dir = docContext.dir
  const f = toPosix(file)
  if (!dir) return f
  const from = toPosix(dir).replace(/\/$/, '').split('/')
  const to = f.split('/')
  if (from[0].toLowerCase() !== to[0].toLowerCase()) return f
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i].toLowerCase() === to[i].toLowerCase()) i++
  const up = from.length - i
  return [...Array(up).fill('..'), ...to.slice(i)].join('/') || f
}
