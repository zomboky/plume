// Lance Plume via Playwright et capture la fenêtre (outil de développement).
import { _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const [file = 'tests/corpus/complet.md', out = 'shot.png', script = ''] = process.argv.slice(2)
const app = await electron.launch({
  args: ['.', resolve(file)],
  env: { ...process.env, PLUME_E2E: '1', PLUME_USER_DATA: mkdtempSync(join(tmpdir(), 'plume-shot-')) }
})
const win = await app.firstWindow()
win.on('console', (m) => console.log('[console]', m.type(), m.text()))
win.on('pageerror', (e) => console.log('[pageerror]', e.message))
win.on('requestfailed', (r) => console.log('[requestfailed]', r.url()))
await win.setViewportSize({ width: 1280, height: 860 }).catch(() => {})
await win.waitForSelector('body.is-ready', { timeout: 20000 })
await win.waitForTimeout(1500)
if (script) {
  const fn = new Function('win', `return (async () => { ${script} })()`)
  const r = await fn(win)
  if (r !== undefined) console.log('[result]', JSON.stringify(r))
}
await win.screenshot({ path: out })
await app.close()
