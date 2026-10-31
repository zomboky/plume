// Contrat du pont IPC exposé par le preload sous `window.plume`.
import type { DeepPartial, Prefs } from './prefs'

export interface TreeEntry {
  name: string
  path: string
  dir: boolean
  children?: TreeEntry[]
}

export interface SearchHit {
  path: string
  name: string
  matches: { line: number; text: string }[]
}

export interface OpenedFile {
  path: string
  content: string
  /** Fin de ligne détectée à l'ouverture. */
  eol: 'lf' | 'crlf'
}

export interface Recent {
  files: string[]
  folders: string[]
}

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

export interface PlumeApi {
  platform: string
  /** Chemin disque d'un fichier glissé ou collé ('' si aucun). */
  pathForFile(file: File): string
  e2e: boolean
  // Fichiers
  openFileDialog(): Promise<OpenedFile | null>
  openFolderDialog(): Promise<string | null>
  readFile(path: string): Promise<OpenedFile>
  writeFile(path: string, content: string): Promise<void>
  saveAsDialog(defaultName: string): Promise<string | null>
  listTree(folder: string): Promise<TreeEntry[]>
  listMarkdownFiles(folder: string): Promise<string[]>
  searchFolder(folder: string, query: string): Promise<SearchHit[]>
  revealInExplorer(path: string): Promise<void>
  trashFile(path: string): Promise<boolean>
  statFile(path: string): Promise<{ size: number; mtime: number; created: number } | null>
  // Préférences et récents
  getPrefs(): Promise<Prefs>
  setPrefs(patch: DeepPartial<Prefs>): Promise<Prefs>
  getRecent(): Promise<Recent>
  addRecent(kind: 'file' | 'folder', path: string): Promise<Recent>
  clearRecent(): Promise<Recent>
  // Fenêtre
  setTitle(title: string): void
  setTitleBarColors(bg: string, fg: string): void
  newWindow(path?: string): void
  closeWindow(): void
  confirmClose(): void
  toggleFullscreen(): Promise<boolean>
  toggleAlwaysOnTop(): Promise<boolean>
  toggleDevTools(): void
  setZoom(factor: number): void
  askUnsaved(name: string): Promise<UnsavedChoice>
  message(text: string, detail?: string): Promise<void>
  openExternal(url: string): void
  print(html: string): void
  // Export
  exportDialog(defaultName: string, ext: 'html' | 'pdf'): Promise<string | null>
  exportPdf(html: string, target: string): Promise<void>
  // Événements du processus principal
  on(channel: 'request-close' | 'fullscreen' | 'prefs-changed', cb: (arg: unknown) => void): void
}

declare global {
  interface Window {
    plume: PlumeApi
  }
}
