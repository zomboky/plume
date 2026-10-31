// Génère resources/icon.png (fenêtre) et build/icon.ico (installateur) à partir
// de app/renderer/src/assets/plume.svg. Lancer avec : pnpm icon (exécuté par Electron).
import { app, BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'app/renderer/src/assets/plume.svg'), 'utf8')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

// Dessine le SVG dans un canvas de la page et renvoie le PNG.
async function render(win, size) {
  const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = ${size}
      const g = c.getContext('2d')
      g.imageSmoothingQuality = 'high'
      g.drawImage(img, 0, 0, ${size}, ${size})
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = ${JSON.stringify(src)}
  })`)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

// Fichier ICO contenant des images PNG (format accepté depuis Windows Vista).
function ico(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('data:text/html,<html><body></body></html>')
  const pngs = []
  for (const size of SIZES) pngs.push({ size, data: await render(win, size) })
  const big = await render(win, 512)
  mkdirSync(join(root, 'resources'), { recursive: true })
  mkdirSync(join(root, 'build'), { recursive: true })
  writeFileSync(join(root, 'resources/icon.png'), big)
  writeFileSync(join(root, 'build/icon.png'), big)
  writeFileSync(join(root, 'build/icon.ico'), ico(pngs))
  console.log('icônes écrites : resources/icon.png, build/icon.png, build/icon.ico')
  app.quit()
})
