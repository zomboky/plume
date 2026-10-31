// Pont minimal et typé entre l'interface et le processus principal.
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { PlumeApi } from '@shared/api'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)
const send = ipcRenderer.send.bind(ipcRenderer)

const api: PlumeApi = {
  platform: process.platform,
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  e2e: process.env.PLUME_E2E === '1',
  openFileDialog: () => invoke('file:open-dialog'),
  openFolderDialog: () => invoke('file:open-folder-dialog'),
  readFile: (path) => invoke('file:read', path),
  writeFile: (path, content) => invoke('file:write', path, content),
  saveAsDialog: (name) => invoke('file:save-as-dialog', name),
  listTree: (folder) => invoke('file:tree', folder),
  listMarkdownFiles: (folder) => invoke('file:list-md', folder),
  searchFolder: (folder, query) => invoke('file:search', folder, query),
  revealInExplorer: (path) => invoke('file:reveal', path),
  trashFile: (path) => invoke('file:trash', path),
  statFile: (path) => invoke('file:stat', path),
  getPrefs: () => invoke('prefs:get'),
  setPrefs: (patch) => invoke('prefs:set', patch),
  getRecent: () => invoke('recent:get'),
  addRecent: (kind, path) => invoke('recent:add', kind, path),
  clearRecent: () => invoke('recent:clear'),
  setTitle: (title) => send('win:title', title),
  setTitleBarColors: (bg, fg) => send('win:titlebar-colors', bg, fg),
  newWindow: (path) => send('win:new', path),
  closeWindow: () => send('win:close'),
  confirmClose: () => send('win:confirm-close'),
  toggleFullscreen: () => invoke('win:fullscreen'),
  toggleAlwaysOnTop: () => invoke('win:always-on-top'),
  toggleDevTools: () => send('win:devtools'),
  setZoom: (factor) => send('win:zoom', factor),
  askUnsaved: (name) => invoke('dialog:unsaved', name),
  message: (text, detail) => invoke('dialog:message', text, detail),
  openExternal: (url) => send('shell:open-external', url),
  print: (html) => send('print', html),
  exportDialog: (name, ext) => invoke('export:dialog', name, ext),
  exportPdf: (html, target) => invoke('export:pdf', html, target),
  on: (channel, cb) => {
    ipcRenderer.on(channel, (_e, arg) => cb(arg))
  }
}

contextBridge.exposeInMainWorld('plume', api)
