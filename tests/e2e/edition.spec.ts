// Critère : édition en direct (marqueurs au focus, blocs, tableaux, formules, Mermaid…).
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function freshLine(win: Page): Promise<void> {
  await win.locator('#editor .ProseMirror').click()
  await win.keyboard.press('Control+End')
}

test('titres : marqueur « ## » visible seulement au focus', async ({ plume }) => {
  const { win } = plume
  await freshLine(win)
  await win.keyboard.type('## Mon titre')
  const h2 = win.locator('#editor h2')
  await expect(h2).toContainText('Mon titre')
  await expect(h2.locator('.md-marker')).toHaveText('## ')
  await win.keyboard.press('Enter')
  await win.keyboard.type('Paragraphe suivant')
  await expect(h2.locator('.md-marker')).toHaveCount(0)
  expect(await plume.markdown()).toBe('## Mon titre\n\nParagraphe suivant\n')
})

test('gras, italique, barré, code : marqueurs en ligne au focus seulement', async ({ plume }) => {
  const { win } = plume
  await freshLine(win)
  await win.keyboard.type('Un **gras** puis *ital* puis ~~barre~~ et `code` fin')
  const p = win.locator('#editor p').first()
  await expect(p.locator('strong')).toHaveText('gras')
  await expect(p.locator('em')).toHaveText('ital')
  await expect(p.locator('del')).toHaveText('barre')
  await expect(p.locator('code')).toHaveText('code')
  // Curseur hors des marques : aucun marqueur.
  await expect(p.locator('.md-marker')).toHaveCount(0)
  // Curseur dans le gras : « ** » affichés autour.
  await p.locator('strong').click()
  await expect(p.locator('.md-marker')).toHaveText(['**', '**'])
  await p.locator('code').click()
  await expect(p.locator('.md-marker')).toHaveText(['`', '`'])
  expect(await plume.markdown()).toBe('Un **gras** puis *ital* puis ~~barre~~ et `code` fin\n')
})

test('raccourcis de mise en forme et de paragraphe', async ({ plume }) => {
  const { win } = plume
  await freshLine(win)
  await win.keyboard.type('Titre')
  await win.keyboard.press('Control+1')
  await expect(win.locator('#editor h1')).toHaveText(/Titre/)
  await win.keyboard.press('Control+0')
  await expect(win.locator('#editor h1')).toHaveCount(0)
  await win.keyboard.press('End')
  await win.keyboard.press('Enter')
  await win.keyboard.press('Control+B')
  await win.keyboard.type('fort')
  await win.keyboard.press('Control+B')
  await win.keyboard.type(' ')
  await win.keyboard.press('Control+I')
  await win.keyboard.type('penche')
  await expect(win.locator('#editor strong')).toHaveText('fort')
  await expect(win.locator('#editor em')).toHaveText('penche')
  await win.keyboard.press('Control+Shift+Q')
  await expect(win.locator('#editor blockquote')).toHaveCount(1)
  expect(await plume.markdown()).toBe('Titre\n\n> **fort** *penche*\n')
})

test('bloc de code : ```python + Entrée, langue et coloration', async ({ plume }) => {
  const { win } = plume
  await freshLine(win)
  await win.keyboard.type('```python')
  await win.keyboard.press('Enter')
  const block = win.locator('#editor .code-block-view')
  await expect(block).toHaveCount(1)
  await expect(block.locator('.code-lang')).toHaveValue('python')
  await win.keyboard.type('def f():')
  await win.keyboard.press('Enter')
  // Indentation automatique après « : ».
  await win.keyboard.type('return 42')
  await expect(block.locator('.tok-keyword').first()).toHaveText('def')
  expect(await plume.markdown()).toMatch(/^```python\ndef f\(\):\n {2,4}return 42\n```\n$/)
})

test('formule $$ + Entrée rendue par KaTeX, Mermaid rendu en SVG', async ({ plume }) => {
  const { win } = plume
  await freshLine(win)
  await win.keyboard.type('$$')
  await win.keyboard.press('Enter')
  await win.keyboard.type('x^2 + y^2')
  await expect(win.locator('#editor .math-preview .katex')).toHaveCount(1)
  await win.keyboard.press('Control+Enter')
  await win.keyboard.type('```mermaid')
  await win.keyboard.press('Enter')
  await win.keyboard.type('graph LR\nA --> B')
  await expect(win.locator('#editor .mermaid-preview svg')).toHaveCount(1, { timeout: 15_000 })
  const md = await plume.markdown()
  expect(md).toContain('$$\nx^2 + y^2\n$$')
  expect(md).toContain('```mermaid\ngraph LR\nA --> B\n```')
})

test('tableau, TOC, YAML, règle, liste de tâches cliquable', async ({ plume }) => {
  const { win } = plume
  await freshLine(win)
  await win.keyboard.type('---')
  await win.keyboard.press('Enter')
  await win.keyboard.type('titre: essai')
  await expect(win.locator('#editor .kind-frontmatter')).toHaveCount(1)
  await win.keyboard.press('Control+Enter')
  await win.keyboard.type('[toc]')
  await win.keyboard.press('Enter')
  await expect(win.locator('#editor nav.toc')).toHaveCount(1)
  await win.keyboard.type('# Partie')
  await win.keyboard.press('Enter')
  await expect(win.locator('#editor nav.toc .toc-item')).toHaveText(['Partie'])
  await win.keyboard.type('|Nom|Valeur|')
  await win.keyboard.press('Enter')
  await expect(win.locator('#editor table th')).toHaveText(['Nom', 'Valeur'])
  await win.keyboard.type('a')
  await win.keyboard.press('Tab')
  await win.keyboard.type('1')
  await win.locator('#editor h1').click()
  await win.keyboard.press('End')
  await win.keyboard.press('Enter')
  await win.keyboard.type('- [ ] tache')
  const box = win.locator('#editor li.task-item input[type=checkbox]')
  await expect(box).toHaveCount(1)
  await box.click()
  await expect(win.locator('#editor li.task-item')).toHaveAttribute('data-checked', 'true')
  await win.keyboard.press('End')
  await win.keyboard.press('Enter')
  await win.keyboard.press('Enter')
  await win.keyboard.type('***')
  await win.keyboard.press('Enter')
  await expect(win.locator('#editor hr')).toHaveCount(1)
  const md = await plume.markdown()
  expect(md).toContain('---\ntitre: essai\n---')
  expect(md).toContain('[TOC]')
  expect(md).toContain('- [x] tache')
  expect(md).toMatch(/\| Nom +\| Valeur +\|/)
  expect(md).toContain('\n---\n')
})

test('lien, image, note de bas de page, citation et listes', async ({ plume }) => {
  const { win } = plume
  await plume.win.evaluate(() => {
    const app = (window as never as { plumeApp: { editor: { setMarkdown(m: string): void } } }).plumeApp
    app.editor.setMarkdown(
      'Voir [le site](https://example.com) et ![logo](logo.png) avec note[^1].\n\n> cite\n\n- a\n- b\n\n1. un\n2. deux\n\n[^1]: La note.\n'
    )
  })
  const p = win.locator('#editor p').first()
  await expect(p.locator('a')).toHaveAttribute('href', 'https://example.com')
  await expect(p.locator('img')).toHaveAttribute('src', /logo\.png$/)
  await expect(win.locator('#editor blockquote')).toHaveText('cite')
  await expect(win.locator('#editor ul li')).toHaveCount(2)
  await expect(win.locator('#editor ol li')).toHaveCount(2)
  await expect(win.locator('#editor [data-type=footnote_definition]')).toContainText('La note.')
  await p.locator('a').click()
  await expect(p.locator('.md-marker')).toHaveText(['[', '](https://example.com)'])
})

test.describe('fichier existant', () => {
  test.use({ openFile: 'complet.md' })

  test('diagramme Mermaid du fichier rendu (disposition dagre, sans elkjs)', async ({ plume }) => {
    const preview = plume.win.locator('#editor .mermaid-preview')
    await expect(preview.locator('svg')).toHaveCount(1, { timeout: 15_000 })
    await expect(preview).not.toHaveClass(/has-error/)
  })
})
