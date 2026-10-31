// Critère : export HTML et PDF.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'

test.use({ openFile: 'complet.md' })

async function exportVia(win: import('@playwright/test').Page, testId: string): Promise<void> {
  await win.locator('[data-testid=menu-file]').click()
  await win.locator('[data-testid=menu-export]').hover()
  await win.locator(`[data-testid="${testId}"]`).click()
}

test('export HTML avec styles, TOC, formule, diagramme et coloration', async ({ plume }) => {
  const { win, exportDir } = plume
  await exportVia(win, 'cmd-file.exportHtml')
  const file = join(exportDir, 'complet.html')
  await expect.poll(() => existsSync(file), { timeout: 20_000 }).toBe(true)
  const html = readFileSync(file, 'utf8')
  expect(html).toContain('<html lang="fr" data-theme="dark-2026">')
  expect(html).toContain('--bg: #121314')
  expect(html).toMatch(/<h1 id="titre-1">Titre 1<\/h1>/)
  expect(html).toContain('<nav class="toc">')
  expect(html).toContain('<math')
  expect(html).toContain('<svg')
  expect(html).toContain('class="tok-keyword"')
  expect(html).toContain('<table>')
  expect(html).not.toContain('title: Exemple complet')
  await expect(win.locator('#notice')).toContainText('Export terminé')
})

test('export HTML sans styles', async ({ plume }) => {
  const { win, exportDir } = plume
  await exportVia(win, 'cmd-file.exportHtmlPlain')
  const file = join(exportDir, 'complet.html')
  await expect.poll(() => existsSync(file), { timeout: 20_000 }).toBe(true)
  const html = readFileSync(file, 'utf8')
  expect(html).not.toContain('--bg:')
  expect(html).not.toContain('.markdown-body {')
  expect(html).toContain('<h2 id="citations">Citations</h2>')
})

test('export PDF', async ({ plume }) => {
  const { win, exportDir } = plume
  await exportVia(win, 'cmd-file.exportPdf')
  const file = join(exportDir, 'complet.pdf')
  await expect.poll(() => existsSync(file), { timeout: 30_000 }).toBe(true)
  await expect.poll(() => readFileSync(file).length, { timeout: 30_000 }).toBeGreaterThan(5000)
  expect(readFileSync(file).subarray(0, 5).toString()).toBe('%PDF-')
})
