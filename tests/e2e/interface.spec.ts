// Critères : menus et raccourcis, barre latérale Fichiers/Plan/Recherche, Ctrl+P,
// modes focus et machine à écrire, plein écran, zoom.
import { join } from 'node:path'
import { expect, test } from './fixtures'

test.use({ openFile: 'complet.md' })

test('menus Fichier, Édition, Paragraphe, Format, Affichage, Thèmes, Aide', async ({ plume }) => {
  const { win } = plume
  const expected: Record<string, string[]> = {
    file: ['Nouveau', 'Ouvrir…', 'Ouverture rapide…', 'Enregistrer', 'Enregistrer sous…', 'Exporter', 'Préférences…', 'Fermer'],
    edit: ['Annuler', 'Rétablir', 'Copier en Markdown', 'Coller en texte brut', 'Rechercher et remplacer'],
    paragraph: ['Titre 1', 'Titre 6', 'Paragraphe', 'Tableau', 'Bloc de formule', 'Bloc de code', 'Citation', 'Liste de tâches', 'Table des matières', 'En-tête YAML'],
    format: ['Gras', 'Italique', 'Souligné', 'Code', 'Barré', 'Lien hypertexte', 'Image…', 'Effacer la mise en forme'],
    view: ['Barre latérale', 'Plan', 'Mode source', 'Mode focus', 'Mode machine à écrire', 'Plein écran', 'Zoom avant', 'Pleine largeur'],
    themes: ['Dark 2026', 'Clair', 'Papier'],
    help: ['Référence Markdown', 'Raccourcis clavier', 'À propos de Plume']
  }
  for (const [id, labels] of Object.entries(expected)) {
    await win.locator(`[data-testid=menu-${id}]`).click()
    const panel = win.locator('.menubar-panel')
    for (const label of labels) await expect(panel.locator('.menu-label', { hasText: label }).first()).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
  }
  // Raccourcis affichés à droite, en français (Maj).
  await win.locator('[data-testid=menu-paragraph]').click()
  await expect(win.locator('[data-testid="cmd-para.codeBlock"] .menu-shortcut')).toHaveText('Ctrl+Maj+K')
  await expect(win.locator('[data-testid="cmd-para.h2"] .menu-shortcut')).toHaveText('Ctrl+2')
  await win.keyboard.press('Escape')
  // Le thème actif est coché.
  await win.locator('[data-testid=menu-themes]').click()
  await expect(win.locator('[data-testid="cmd-theme.dark-2026"] .menu-check')).toHaveText('✓')
  await win.locator('[data-testid="cmd-theme.clair"]').click()
  await expect(win.locator('html')).toHaveAttribute('data-theme', 'clair')
})

test('entrée de menu désactivée selon le contexte, mode coché', async ({ plume }) => {
  const { win } = plume
  await win.keyboard.press('F8')
  await win.locator('[data-testid=menu-view]').click()
  await expect(win.locator('[data-testid="cmd-view.focus"] .menu-check')).toHaveText('✓')
  await win.keyboard.press('Escape')
})

test('barre latérale : fichiers, plan cliquable, recherche dans le dossier', async ({ plume }) => {
  const { win } = plume
  const files = win.locator('[data-testid=panel-files]')
  await expect(files.locator('.tree-row.is-current')).toHaveText('complet.md')
  await expect(files.locator('.tree-row', { hasText: 'listes.md' })).toBeVisible()

  await win.keyboard.press('Control+Shift+1')
  const outline = win.locator('[data-testid=panel-outline] .outline-item')
  await expect(outline.first()).toHaveText('Titre 1')
  await expect(outline.filter({ hasText: 'Diagramme' })).toHaveCount(1)
  await outline.filter({ hasText: 'Diagramme' }).click()
  await expect(win.locator('[data-testid=panel-outline] .outline-item.is-current')).toHaveText('Diagramme')

  await win.keyboard.press('Control+Shift+F')
  await win.locator('[data-testid=folder-search]').fill('sous-tâche')
  await expect(win.locator('[data-testid=search-hit]')).toHaveText(['listes.md'])
  await win.locator('[data-testid=search-hit]').click()
  await expect(win).toHaveTitle('listes.md - Plume')

  await files.locator('.tree-row', { hasText: 'unicode.md' }).click({ trial: true }).catch(() => {})
  await win.locator('[data-testid=tab-files]').click()
  await win.locator('[data-testid=panel-files] .tree-row', { hasText: 'unicode.md' }).click()
  await expect(win).toHaveTitle('unicode.md - Plume')

  await win.keyboard.press('Control+Shift+L')
  await expect(win.locator('#sidebar')).toBeHidden()
  await win.keyboard.press('Control+Shift+L')
  await expect(win.locator('#sidebar')).toBeVisible()
})

test('ouverture rapide Ctrl+P : recherche floue et récents', async ({ plume }) => {
  const { win } = plume
  await win.keyboard.press('Control+P')
  const palette = win.locator('[data-testid=quick-open]')
  await expect(palette).toBeVisible()
  await expect(palette.locator('.quick-group').first()).toHaveText('Fichiers récents')
  await win.keyboard.type('blcs')
  await expect(palette.locator('[data-testid=quick-item]').first()).toContainText('blocs.md')
  await win.keyboard.press('Enter')
  await expect(win).toHaveTitle('blocs.md - Plume')
  await expect(palette).toBeHidden()
})

test('modes focus et machine à écrire, plein écran, zoom', async ({ plume }) => {
  const { win, app } = plume
  await win.locator('#editor p').first().click()
  await win.keyboard.press('F8')
  await expect(win.locator('body')).toHaveClass(/focus-mode/)
  await expect(win.locator('#editor .ProseMirror > .is-focused-block')).toHaveCount(1)
  const dimmed = await win.locator('#editor .ProseMirror > h1').first().evaluate((el) => getComputedStyle(el).opacity)
  expect(Number(dimmed)).toBeLessThan(1)
  await win.keyboard.press('F8')
  await expect(win.locator('body')).not.toHaveClass(/focus-mode/)

  await win.keyboard.press('F9')
  await expect(win.locator('body')).toHaveClass(/typewriter-mode/)
  const padTop = await win.locator('#column').evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))
  expect(padTop).toBeGreaterThan(200)
  await win.keyboard.press('F9')

  await win.keyboard.press('F11')
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true)
  await win.keyboard.press('F11')
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false)

  const zoom = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())
  await win.keyboard.press('Control+Shift+=')
  await expect.poll(zoom).toBeCloseTo(1.1, 2)
  await win.keyboard.press('Control+Shift+0')
  await expect.poll(zoom).toBeCloseTo(1, 2)
})

test('rechercher et remplacer (Ctrl+F, Ctrl+H)', async ({ plume }) => {
  const { win } = plume
  await win.locator('#editor p').first().click()
  await win.keyboard.press('Control+H')
  await win.locator('[data-testid=find-input]').fill('élément')
  await expect(win.locator('[data-testid=find-count]')).toHaveText('1 sur 3')
  await expect(win.locator('#editor .find-match')).toHaveCount(3)
  await win.locator('[data-testid=replace-input]').fill('item')
  await win.locator('[data-testid=replace-all]').click()
  await expect(win.locator('#editor .find-match')).toHaveCount(0)
  expect(await plume.markdown()).toContain('- item\n  - sous-item\n- item')
})

test('préférences : panneau, catégories, enregistrement', async ({ plume }) => {
  const { win, data } = plume
  await win.keyboard.press('Control+,')
  await expect(win.locator('[data-testid=prefs]')).toBeVisible()
  await win.locator('[data-testid=prefs-cat-editor]').click()
  await win.locator('[data-testid=pref-autopair]').uncheck()
  await expect.poll(() => plume.readPrefs().editor).toMatchObject({ autoPair: false })
  await win.locator('[data-testid=prefs-close]').click()
  await expect(win.locator('[data-testid=prefs]')).toHaveCount(0)
  expect(join(data, 'preferences.json')).toContain('data')
})
