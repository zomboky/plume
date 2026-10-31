// Les trois modifications demandées (cahier des charges §11).
import { expect, test } from './fixtures'

test.use({ openFile: 'complet.md' })

test('§11.1 « Bloc de code » au premier niveau du menu contextuel', async ({ plume }) => {
  const { win } = plume
  const para = win.locator('#editor p', { hasText: 'Paragraphe avec' })
  await para.click({ button: 'right' })
  const menu = win.locator('[data-testid=context-menu]')
  await expect(menu).toBeVisible()
  // Entrée directe (pas dans un sous-menu), avec son raccourci.
  const entry = menu.locator('[data-testid=ctx-code-block]')
  await expect(entry.locator('.menu-label')).toHaveText('Bloc de code')
  await expect(entry.locator('.menu-shortcut')).toHaveText('Ctrl+Maj+K')
  // Le sous-menu « Insérer » existe toujours, et le type de bloc courant est affiché.
  await expect(menu.locator('[data-testid=ctx-insert]')).toHaveText(/Insérer/)
  await expect(menu.locator('[data-testid=ctx-block-type] .menu-label')).toHaveText('Paragraphe')
  await entry.click()
  // Paragraphe non vide : bloc inséré après, curseur dedans.
  await expect(win.locator('#editor .code-block-view .cm-editor.cm-focused')).toHaveCount(1)
  await win.keyboard.type('print("ok")')
  expect(await plume.markdown()).toContain('et une note[^1].\n\n```\nprint("ok")\n```\n')

  // Paragraphe vide : transformé en bloc de code.
  await win.keyboard.press('Control+Enter')
  await win.locator('#editor p:empty, #editor p:has(br:only-child)').last().click({ button: 'right' })
  await win.locator('[data-testid=ctx-code-block]').click()
  await win.keyboard.type('vide')
  expect(await plume.markdown()).toContain('```\nprint("ok")\n```\n\n```\nvide\n```')
})

test('§11.2 apparence par défaut : aperçu Markdown VS Code « Dark 2026 »', async ({ plume }) => {
  const { win } = plume
  await expect(win.locator('html')).toHaveAttribute('data-theme', 'dark-2026')
  const style = (sel: string, props: string[]) =>
    win.locator(sel).first().evaluate((el, ps) => {
      const cs = getComputedStyle(el)
      return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]))
    }, props)

  const body = await style('#editor', ['font-family', 'font-size', 'line-height', 'color'])
  expect(body['font-family']).toContain('Segoe WPC')
  expect(body['font-size']).toBe('14px')
  expect(parseFloat(body['line-height'])).toBeCloseTo(22.4, 1)
  expect(body.color).toBe('rgb(187, 190, 191)')
  expect((await style('#workspace', ['background-color']))['background-color']).toBe('rgb(18, 19, 20)')

  const h1 = await style('#editor h1', ['font-size', 'font-weight', 'border-bottom-color', 'margin-top', 'margin-bottom'])
  expect(h1['font-size']).toBe('28px')
  expect(h1['font-weight']).toBe('600')
  expect(h1['border-bottom-color']).toBe('rgba(255, 255, 255, 0.18)')
  expect(h1['margin-bottom']).toBe('16px')
  expect((await style('#editor h2', ['font-size']))['font-size']).toBe('21px')

  const link = await style('#editor a', ['color'])
  expect(link.color).toBe('rgb(72, 160, 199)')
  const code = await style('#editor p code', ['color', 'background-color', 'border-radius', 'font-family'])
  expect(code.color).toBe('rgb(140, 140, 140)')
  expect(code['background-color']).toBe('rgb(38, 38, 38)')
  expect(code['border-radius']).toBe('4px')
  expect(code['font-family']).toContain('Consolas')
  const pre = await style('#editor .code-block-view.kind-code', ['background-color', 'border-top-color', 'border-radius'])
  expect(pre['background-color']).toBe('rgb(36, 37, 38)')
  expect(pre['border-top-color']).toBe('rgb(42, 43, 44)')
  expect(pre['border-radius']).toBe('3px')
  const quote = await style('#editor blockquote', ['border-left-width', 'border-left-color', 'background-color'])
  expect(quote['border-left-width']).toBe('5px')
  expect(quote['border-left-color']).toBe('rgb(42, 43, 44)')
  expect(quote['background-color']).toBe('rgb(36, 37, 38)')
  const th = await style('#editor th', ['border-bottom-color'])
  expect(th['border-bottom-color']).toBe('rgba(255, 255, 255, 0.69)')
  // Coloration : mot-clé du bloc JavaScript.
  await expect(win.locator('#editor .code-block-view .tok-keyword').first()).toHaveCSS('color', 'rgb(86, 156, 214)')
  // Interface.
  expect((await style('#sidebar', ['background-color']))['background-color']).toBe('rgb(25, 26, 27)')
  await win.locator('[data-testid=menu-file]').click()
  expect((await style('.menubar-panel', ['background-color']))['background-color']).toBe('rgb(32, 33, 34)')
  await win.keyboard.press('Escape')
  // Mode source : titres en #79c0ff gras.
  await win.keyboard.press('Control+/')
  await expect(win.locator('[data-testid=source] .tok-heading').first()).toHaveCSS('color', 'rgb(121, 192, 255)')
})

test('§11.3 marges réglables : glisser, double-clic, mémorisation', async ({ plume }) => {
  const { win } = plume
  const column = win.locator('#column')
  const handle = win.locator('[data-testid=margin-right]')
  const left = win.locator('[data-testid=margin-left]')
  const box = async () => (await column.boundingBox())!
  const before = await box()
  expect(before.width).toBeLessThanOrEqual(860)

  // Glisser la poignée droite vers la droite : la colonne s'élargit des deux côtés.
  const h = (await handle.boundingBox())!
  await win.mouse.move(h.x + h.width / 2, h.y + 200)
  await win.mouse.down()
  await win.mouse.move(h.x + h.width / 2 + 60, h.y + 200, { steps: 5 })
  await win.mouse.up()
  const wider = await box()
  expect(wider.width).toBeGreaterThan(before.width + 100)
  const ws = (await win.locator('#editor-scroll').boundingBox())!
  const centerBefore = before.x + before.width / 2
  expect(Math.abs(wider.x + wider.width / 2 - centerBefore)).toBeLessThan(3)
  await expect.poll(() => (plume.readPrefs().editor as { width: unknown }).width).toMatchObject({ unit: 'px' })

  // Glisser la poignée gauche jusqu'au bord : pleine largeur.
  const l = (await left.boundingBox())!
  await win.mouse.move(l.x + 4, l.y + 200)
  await win.mouse.down()
  await win.mouse.move(ws.x + 2, l.y + 200, { steps: 8 })
  await win.mouse.up()
  await expect(win.locator('body')).toHaveClass(/is-full-width/)
  await expect.poll(() => (plume.readPrefs().editor as { width: unknown }).width).toBe('full')

  // Double-clic : retour à la largeur précédente, puis de nouveau pleine largeur.
  await win.locator('[data-testid=margin-right]').dblclick()
  await expect(win.locator('body')).not.toHaveClass(/is-full-width/)
  await win.locator('[data-testid=margin-right]').dblclick()
  await expect(win.locator('body')).toHaveClass(/is-full-width/)

  // Mémorisé au redémarrage.
  await plume.relaunch()
  await expect(plume.win.locator('body')).toHaveClass(/is-full-width/)
  const full = (await plume.win.locator('#column').boundingBox())!
  const area = (await plume.win.locator('#editor-scroll').boundingBox())!
  expect(full.width).toBeGreaterThan(area.width - 30)

  // Réglable aussi dans les préférences (px, %, pleine largeur).
  await plume.win.keyboard.press('Control+,')
  await plume.win.locator('[data-testid=prefs-cat-appearance]').click()
  await plume.win.locator('[data-testid=pref-width-full]').uncheck()
  await plume.win.locator('[data-testid=pref-width-unit]').selectOption('%')
  await plume.win.locator('[data-testid=pref-width-value]').fill('50')
  await plume.win.locator('[data-testid=pref-width-value]').press('Enter')
  await expect.poll(() => (plume.readPrefs().editor as { width: unknown }).width).toEqual({ value: 50, unit: '%' })
})

test('colonne à gauche : poignée droite seule, mémorisation', async ({ plume }) => {
  const { win } = plume
  // Réglage dans les préférences (Apparence).
  await win.keyboard.press('Control+,')
  await win.locator('[data-testid=prefs-cat-appearance]').click()
  await win.locator('[data-testid=pref-column-align]').selectOption('left')
  await expect.poll(() => (plume.readPrefs().editor as { columnAlign: unknown }).columnAlign).toBe('left')
  await win.locator('[data-testid=prefs-close]').click()

  const column = win.locator('#column')
  const area = (await win.locator('#editor-scroll').boundingBox())!
  const before = (await column.boundingBox())!
  expect(Math.abs(before.x - area.x)).toBeLessThan(2)
  expect(before.width).toBeLessThanOrEqual(860)
  await expect(win.locator('body')).toHaveClass(/column-left/)
  await expect(win.locator('[data-testid=margin-left]')).toBeHidden()

  // Glisser la poignée droite : seul le bord droit bouge.
  const h = (await win.locator('[data-testid=margin-right]').boundingBox())!
  await win.mouse.move(h.x + h.width / 2, h.y + 200)
  await win.mouse.down()
  await win.mouse.move(h.x + h.width / 2 - 200, h.y + 200, { steps: 5 })
  await win.mouse.up()
  const narrower = (await column.boundingBox())!
  expect(Math.abs(narrower.x - area.x)).toBeLessThan(2)
  expect(Math.abs(narrower.width - (before.width - 200))).toBeLessThan(6)
  await expect.poll(() => (plume.readPrefs().editor as { width: { value: number } }).width.value).toBeCloseTo(narrower.width, -1)

  // Jusqu'au bord droit : pleine largeur ; double-clic : retour.
  const h2 = (await win.locator('[data-testid=margin-right]').boundingBox())!
  await win.mouse.move(h2.x + h2.width / 2, h2.y + 200)
  await win.mouse.down()
  await win.mouse.move(area.x + area.width - 4, h2.y + 200, { steps: 8 })
  await win.mouse.up()
  await expect(win.locator('body')).toHaveClass(/is-full-width/)
  await win.locator('[data-testid=margin-right]').dblclick()
  await expect(win.locator('body')).not.toHaveClass(/is-full-width/)

  // Menu Affichage : entrée cochée.
  await win.locator('[data-testid=menu-view]').click()
  await expect(win.locator('[data-testid="cmd-view.columnLeft"] .menu-check')).toHaveText('✓')
  await win.keyboard.press('Escape')

  // Mémorisé au redémarrage.
  await plume.relaunch()
  await expect(plume.win.locator('body')).toHaveClass(/column-left/)
  const after = (await plume.win.locator('#column').boundingBox())!
  const area2 = (await plume.win.locator('#editor-scroll').boundingBox())!
  expect(Math.abs(after.x - area2.x)).toBeLessThan(2)
  expect(Math.abs(after.width - narrower.width)).toBeLessThan(2)

  // Retour au centre par le menu.
  await plume.win.locator('[data-testid=menu-view]').click()
  await plume.win.locator('[data-testid="cmd-view.columnLeft"]').click()
  await expect(plume.win.locator('body')).not.toHaveClass(/column-left/)
  await expect.poll(() => (plume.readPrefs().editor as { columnAlign: unknown }).columnAlign).toBe('center')
})
