// Critères : ouvrir, éditer, enregistrer un .md ; indicateur de modification ;
// mode source avec aller-retour sans perte ; données dans le dossier de l'application.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, readText, test } from './fixtures'

test.describe('fichier ouvert au lancement', () => {
  test.use({ openFile: 'complet.md' })

  test('titre, modification, enregistrement', async ({ plume }) => {
    const { win, docs } = plume
    await expect(win).toHaveTitle('complet.md - Plume')
    await expect(win.locator('#editor h1').first()).toHaveText('Titre 1')

    // Saisie à la fin du premier paragraphe.
    const para = win.locator('#editor p', { hasText: 'Paragraphe avec' })
    await para.click()
    await win.keyboard.press('End')
    await win.keyboard.type(' Ajout.')
    await expect(win).toHaveTitle('complet.md • - Plume')
    await expect(win.locator('#title')).toHaveText('complet.md • - Plume')

    await win.keyboard.press('Control+S')
    await expect(win).toHaveTitle('complet.md - Plume')
    const saved = readText(join(docs, 'complet.md'))
    expect(saved).toContain('et une note[^1]. Ajout.')
    // Le reste du fichier est inchangé.
    const original = readText(join(__dirname, '..', 'corpus', 'complet.md'))
    expect(saved.replace(' Ajout.', '')).toBe(original)
  })

  test('mode source : aller-retour sans perte (Ctrl+/)', async ({ plume }) => {
    const { win, docs } = plume
    const original = readText(join(docs, 'complet.md'))
    await win.keyboard.press('Control+/')
    await expect(win.locator('body')).toHaveClass(/is-source/)
    await expect(win.locator('[data-testid=source] .cm-content')).toContainText('# Titre 1')
    // Barre latérale fermée en mode source, bouton « quitter » dans la barre d'état.
    await expect(win.locator('#sidebar')).toBeHidden()
    await expect(win.locator('[data-testid=status-source]')).toHaveAttribute('title', 'Quitter le mode source')
    expect(await plume.markdown()).toBe(original)

    await win.keyboard.press('Control+/')
    await expect(win.locator('body')).not.toHaveClass(/is-source/)
    expect(await plume.markdown()).toBe(original)
    await expect(win).toHaveTitle('complet.md - Plume')

    // Une modification faite dans le mode source est reprise par l'éditeur visuel.
    await win.keyboard.press('Control+/')
    await win.locator('[data-testid=source] .cm-content').click()
    await win.keyboard.press('Control+End')
    await win.keyboard.type('\n## Ajout source\n')
    await win.keyboard.press('Control+/')
    await expect(win.locator('#editor h2', { hasText: 'Ajout source' })).toBeVisible()
    await expect(win).toHaveTitle('complet.md • - Plume')
    expect(await plume.markdown()).toBe(original + '\n## Ajout source\n')
  })

  test('tous les fichiers du corpus : bascule source sans perte', async ({ plume }) => {
    const { win, docs } = plume
    for (const name of ['blocs.md', 'en-ligne.md', 'listes.md', 'unicode.md', 'html.md']) {
      await win.evaluate((p) => (window as never as { plumeApp: { openPath(p: string): Promise<void> } }).plumeApp.openPath(p), join(docs, name))
      await expect(win).toHaveTitle(`${name} - Plume`)
      const original = readText(join(docs, name)).replace(/\r\n/g, '\n')
      await win.keyboard.press('Control+/')
      await win.keyboard.press('Control+/')
      expect(await plume.markdown(), name).toBe(original)
    }
  })
})

test('nouveau document, enregistrer sous, récents et dossier de données', async ({ plume }) => {
  const { win, docs, data } = plume
  await expect(win).toHaveTitle('Sans titre - Plume')
  await win.locator('#editor .ProseMirror').click()
  await win.keyboard.type('# Bonjour')
  await win.keyboard.press('Enter')
  await win.keyboard.type('Premier texte.')
  await expect(win).toHaveTitle('Sans titre • - Plume')
  await win.keyboard.press('Control+S')
  await expect(win).toHaveTitle('nouveau.md - Plume')
  expect(readFileSync(join(docs, 'nouveau.md'), 'utf8')).toBe('# Bonjour\n\nPremier texte.\n')

  // Réglages et récents dans le dossier de données de Plume (pas ailleurs).
  await win.keyboard.press('F8')
  await expect.poll(() => existsSync(join(data, 'preferences.json'))).toBe(true)
  const recent = JSON.parse(readFileSync(join(data, 'recent.json'), 'utf8'))
  expect(recent.files[0]).toBe(join(docs, 'nouveau.md'))
})
