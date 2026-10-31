// Lancement de Plume pour les tests de bout en bout : dossier de données et
// dossier de documents temporaires, dialogues natifs remplacés par des chemins fixés.
import { _electron as electron, test as base, type ElectronApplication, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export interface Plume {
  app: ElectronApplication
  win: Page
  docs: string
  data: string
  exportDir: string
  /** Relance l'application avec le même dossier de données. */
  relaunch(file?: string): Promise<void>
  markdown(): Promise<string>
  readPrefs(): Record<string, unknown>
}

const ROOT = resolve(__dirname, '..', '..')

async function launch(data: string, docs: string, exportDir: string, file?: string) {
  const app = await electron.launch({
    args: [ROOT, ...(file ? [file] : [])],
    cwd: ROOT,
    env: {
      ...process.env,
      PLUME_E2E: '1',
      PLUME_USER_DATA: data,
      PLUME_E2E_EXPORT_DIR: exportDir,
      PLUME_E2E_SAVE_PATH: join(docs, 'nouveau.md')
    }
  })
  const win = await app.firstWindow()
  await win.waitForSelector('body.is-ready', { timeout: 30_000 })
  return { app, win }
}

export const test = base.extend<{ plume: Plume; openFile: string | undefined }>({
  openFile: [undefined, { option: true }],
  plume: async ({ openFile }, use) => {
    const tmp = mkdtempSync(join(tmpdir(), 'plume-e2e-'))
    const data = join(tmp, 'data')
    const docs = join(tmp, 'docs')
    const exportDir = join(tmp, 'export')
    mkdirSync(exportDir, { recursive: true })
    cpSync(join(ROOT, 'tests', 'corpus'), docs, { recursive: true })
    const file = openFile ? join(docs, openFile) : undefined
    let { app, win } = await launch(data, docs, exportDir, file)
    const plume: Plume = {
      app,
      win,
      docs,
      data,
      exportDir,
      async relaunch(next?: string) {
        await plume.app.close()
        ;({ app, win } = await launch(data, docs, exportDir, next))
        plume.app = app
        plume.win = win
      },
      markdown: () => plume.win.evaluate(() => (window as never as { plumeApp: { currentMarkdown(): string } }).plumeApp.currentMarkdown()),
      readPrefs: () => JSON.parse(readFileSync(join(data, 'preferences.json'), 'utf8'))
    }
    await use(plume)
    await plume.app.close().catch(() => {})
  }
})

export { expect } from '@playwright/test'

/** Place le curseur à la fin du texte d'un élément de l'éditeur. */
export async function caretAtEnd(win: Page, selector: string): Promise<void> {
  const el = win.locator(selector).first()
  await el.click()
  await win.keyboard.press('End')
}

export function readText(path: string): string {
  return readFileSync(path, 'utf8')
}
