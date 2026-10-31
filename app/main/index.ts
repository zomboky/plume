// Processus principal : fenêtres, IPC, dialogues natifs, export PDF.
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell, type IpcMainInvokeEvent } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { UnsavedChoice } from '@shared/api'
import { listMarkdownFiles, listTree, readMarkdown, searchFolder, writeMarkdown } from './files'
import { configureDataDir } from './paths'
import { addRecent, clearRecent, getPrefs, getRecent, setPrefs } from './store'

const E2E = process.env.PLUME_E2E === '1'
const TITLEBAR_HEIGHT = 30

configureDataDir()

protocol.registerSchemesAsPrivileged([
  { scheme: 'plume-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

/** Fenêtres qui ont confirmé leur fermeture (document enregistré ou abandonné). */
const closing = new WeakSet<BrowserWindow>()

function fileArg(argv: string[]): string | undefined {
  // Dernier argument qui désigne un fichier ou dossier existant.
  for (const arg of argv.slice(1).reverse()) {
    if (arg.startsWith('-') || arg === '.' || arg.endsWith('.js') || arg.endsWith('.exe')) continue
    const p = resolve(arg)
    if (existsSync(p)) return p
  }
  return undefined
}

function createWindow(openPath?: string): BrowserWindow {
  const prefs = getPrefs()
  const dark = prefs.theme === 'dark-2026'
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 560,
    minHeight: 360,
    show: false,
    title: 'Plume',
    backgroundColor: dark ? '#121314' : '#ffffff',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: dark ? '#191A1B' : '#f3f3f3', symbolColor: dark ? '#BBBEBF' : '#333333', height: TITLEBAR_HEIGHT },
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: prefs.editor.spellcheck
    }
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.setZoomFactor(prefs.view.zoom)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url)
    }
  })
  win.on('close', (e) => {
    if (closing.has(win) || E2E) return
    e.preventDefault()
    win.webContents.send('request-close')
  })
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true))
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false))

  const query = openPath ? { open: openPath } : undefined
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    if (openPath) url.searchParams.set('open', openPath)
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
  return win
}

const fromEvent = (e: IpcMainInvokeEvent | Electron.IpcMainEvent) => BrowserWindow.fromWebContents(e.sender)!

function registerIpc(): void {
  const handle = ipcMain.handle.bind(ipcMain)

  handle('file:open-dialog', async (e) => {
    const res = await dialog.showOpenDialog(fromEvent(e), {
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
        { name: '*', extensions: ['*'] }
      ]
    })
    return res.canceled || !res.filePaths[0] ? null : readMarkdown(res.filePaths[0])
  })
  handle('file:open-folder-dialog', async (e) => {
    const res = await dialog.showOpenDialog(fromEvent(e), { properties: ['openDirectory'] })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  handle('file:read', (_e, path: string) => readMarkdown(path))
  handle('file:write', (_e, path: string, content: string) => writeMarkdown(path, content))
  handle('file:save-as-dialog', async (e, defaultName: string) => {
    if (E2E && process.env.PLUME_E2E_SAVE_PATH) return process.env.PLUME_E2E_SAVE_PATH
    const res = await dialog.showSaveDialog(fromEvent(e), {
      defaultPath: defaultName,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
    })
    return res.canceled ? null : (res.filePath ?? null)
  })
  handle('file:tree', (_e, folder: string) => {
    const { showHidden, onlyMarkdown } = getPrefs().files
    return listTree(folder, { showHidden, onlyMarkdown })
  })
  handle('file:list-md', (_e, folder: string) => listMarkdownFiles(folder))
  handle('file:search', (_e, folder: string, query: string) => searchFolder(folder, query))
  handle('file:reveal', (_e, path: string) => shell.showItemInFolder(path))
  handle('file:trash', async (_e, path: string) => {
    try {
      await shell.trashItem(path)
      return true
    } catch {
      return false
    }
  })
  handle('file:stat', async (_e, path: string) => {
    try {
      const s = await stat(path)
      return { size: s.size, mtime: s.mtimeMs, created: s.birthtimeMs, dir: s.isDirectory() }
    } catch {
      return null
    }
  })

  handle('prefs:get', () => getPrefs())
  handle('prefs:set', (_e, patch) => {
    const next = setPrefs(patch)
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('prefs-changed', next)
    return next
  })
  handle('recent:get', () => getRecent())
  handle('recent:add', (_e, kind: 'file' | 'folder', path: string) => addRecent(kind, path))
  handle('recent:clear', () => clearRecent())

  ipcMain.on('win:title', (e, title: string) => fromEvent(e).setTitle(title))
  ipcMain.on('win:titlebar-colors', (e, bg: string, fg: string) => {
    try {
      fromEvent(e).setTitleBarOverlay({ color: bg, symbolColor: fg, height: TITLEBAR_HEIGHT })
    } catch {
      // Indisponible hors Windows/Linux.
    }
  })
  ipcMain.on('win:new', (_e, path?: string) => createWindow(path))
  ipcMain.on('win:close', (e) => fromEvent(e).close())
  ipcMain.on('win:confirm-close', (e) => {
    const win = fromEvent(e)
    closing.add(win)
    win.close()
  })
  ipcMain.on('win:devtools', (e) => fromEvent(e).webContents.toggleDevTools())
  ipcMain.on('win:zoom', (e, factor: number) => fromEvent(e).webContents.setZoomFactor(factor))
  ipcMain.on('shell:open-external', (_e, url: string) => {
    if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url)
  })
  handle('win:fullscreen', (e) => {
    const win = fromEvent(e)
    win.setFullScreen(!win.isFullScreen())
    return !win.isFullScreen()
  })
  handle('win:always-on-top', (e) => {
    const win = fromEvent(e)
    win.setAlwaysOnTop(!win.isAlwaysOnTop())
    return win.isAlwaysOnTop()
  })
  handle('dialog:unsaved', async (e, name: string): Promise<UnsavedChoice> => {
    if (E2E) return 'discard'
    const fr = getPrefs().locale === 'fr'
    const res = await dialog.showMessageBox(fromEvent(e), {
      type: 'warning',
      buttons: fr ? ['Enregistrer', 'Ne pas enregistrer', 'Annuler'] : ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: fr ? `Enregistrer les modifications de « ${name} » ?` : `Save changes to "${name}"?`,
      detail: fr ? 'Les modifications seront perdues sinon.' : 'Your changes will be lost otherwise.'
    })
    return (['save', 'discard', 'cancel'] as const)[res.response]
  })
  handle('dialog:message', async (e, message: string, detail?: string) => {
    if (E2E) return
    await dialog.showMessageBox(fromEvent(e), { type: 'info', message, detail })
  })

  handle('export:dialog', async (e, defaultName: string, ext: 'html' | 'pdf') => {
    if (E2E && process.env.PLUME_E2E_EXPORT_DIR) return join(process.env.PLUME_E2E_EXPORT_DIR, `${defaultName}.${ext}`)
    const res = await dialog.showSaveDialog(fromEvent(e), {
      defaultPath: `${defaultName}.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    })
    return res.canceled ? null : (res.filePath ?? null)
  })
  handle('export:pdf', async (_e, html: string, target: string) => {
    await withHtmlWindow(html, async (w) => {
      const pdf = await w.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 } })
      await writeFile(target, pdf)
    })
  })
  ipcMain.on('print', (_e, html: string) => {
    void withHtmlWindow(html, (w) => new Promise<void>((done) => w.webContents.print({ printBackground: true }, () => done())))
  })
}

/** Charge du HTML autonome dans une fenêtre cachée, le temps d'une opération. */
async function withHtmlWindow(html: string, fn: (w: BrowserWindow) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'plume-'))
  const file = join(dir, 'export.html')
  await writeFile(file, html, 'utf8')
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await w.loadFile(file)
    await fn(w)
  } finally {
    w.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}

function serveLocalFiles(): void {
  // plume-file://local/C:/dossier/image.png -> fichier local (images relatives au document).
  protocol.handle('plume-file', (req) => {
    const url = new URL(req.url)
    let path = decodeURIComponent(url.pathname)
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1)
    try {
      if (!statSync(path).isFile()) return new Response('Not found', { status: 404 })
    } catch {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(path).toString())
  })
}

const gotLock = E2E || app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const path = fileArg(argv)
    const win = BrowserWindow.getAllWindows()[0]
    if (path || !win) createWindow(path)
    else {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    serveLocalFiles()
    registerIpc()
    let initial = fileArg(process.argv)
    if (initial && statSync(initial).isFile() && !/\.(md|markdown|mdown|mkd|txt)$/i.test(extname(initial))) initial = undefined
    createWindow(initial)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

