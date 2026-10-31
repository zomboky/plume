// Mises à jour par les versions GitHub (electron-updater) : vérification au démarrage,
// téléchargement en arrière-plan, installation au redémarrage demandé par l'utilisateur.
// La version portable ne peut pas se mettre à jour : elle compare seulement les numéros de version.
import { app, BrowserWindow, net } from 'electron'
import type { UpdateStatus } from '@shared/api'
import { getPrefs } from './store'

const E2E = process.env.PLUME_E2E === '1'
const PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR
const LATEST_RELEASE_API = 'https://api.github.com/repos/zomboky/plume/releases/latest'

type Updater = (typeof import('electron-updater'))['autoUpdater']

let updater: Updater | null = null
/** Version téléchargée et prête à installer. */
let readyVersion: string | null = null
/** Redémarrage demandé : installer quand toutes les fenêtres sont fermées. */
let installRequested = false

/** Compare deux numéros x.y.z (suffixes de préversion ignorés). */
export function isNewer(candidate: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/, '').split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0)
  const [a, b] = [parts(candidate), parts(current)]
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

function broadcast(status: UpdateStatus): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update-status', status)
}

function getUpdater(): Updater {
  if (updater) return updater
  // require (et non import()) : le module CommonJS expose autoUpdater par un accesseur.
  const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  autoUpdater.on('update-downloaded', (info) => {
    readyVersion = info.version
    broadcast({ kind: 'ready', version: info.version })
  })
  // Erreurs consignées seulement : la vérification automatique reste silencieuse.
  autoUpdater.on('error', (err) => console.error('[mise à jour]', err?.message ?? err))
  updater = autoUpdater
  return autoUpdater
}

/** Vérification automatique au démarrage, si elle a un sens et n'est pas désactivée. */
export function checkOnStartup(): void {
  if (!app.isPackaged || E2E || PORTABLE || !getPrefs().updates.checkOnStartup) return
  setTimeout(() => {
    Promise.resolve()
      .then(() => getUpdater().checkForUpdates())
      .catch((err: Error) => console.error('[mise à jour]', err.message))
  }, 3000)
}

/** Vérification demandée depuis le menu Aide. */
export async function checkNow(): Promise<UpdateStatus> {
  const current = app.getVersion()
  if (readyVersion) return { kind: 'ready', version: readyVersion }
  if (!app.isPackaged || E2E) return { kind: 'dev' }
  try {
    if (PORTABLE) {
      const res = await net.fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const tag = String(((await res.json()) as { tag_name?: string }).tag_name ?? '')
      return isNewer(tag, current) ? { kind: 'portable', version: tag.replace(/^v/, '') } : { kind: 'portable' }
    }
    const result = await getUpdater().checkForUpdates()
    const version = result?.updateInfo.version
    if (!version || !isNewer(version, current)) return { kind: 'none', version: current }
    return readyVersion ? { kind: 'ready', version: readyVersion } : { kind: 'downloading', version }
  } catch (err) {
    console.error('[mise à jour]', (err as Error).message)
    return { kind: 'error', error: (err as Error).message }
  }
}

/** Nouvelle fenêtre : lui signaler une mise à jour déjà prête. */
export function notifyWindow(win: BrowserWindow): void {
  if (readyVersion) win.webContents.send('update-status', { kind: 'ready', version: readyVersion } satisfies UpdateStatus)
}

/** Demande la fermeture de chaque fenêtre (enregistrement proposé), puis installe. */
export function requestInstall(): void {
  if (!readyVersion || !updater) return
  installRequested = true
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('request-close')
}

/** Appelé quand la dernière fenêtre est fermée : true si l'installation prend la main. */
export function installIfRequested(): boolean {
  if (!installRequested || !updater) return false
  updater.quitAndInstall(true, true)
  return true
}
