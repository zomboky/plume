// Tests de la logique sans interface : préférences, raccourcis, chemins, règles de saisie.
import { describe, expect, it } from 'vitest'
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import { DEFAULT_PREFS, mergePrefs, normalizePrefs } from '@shared/prefs'
import { eventShortcuts } from '@/commands'
import { docContext, relativeToDoc, resolveAsset } from '@/editor/doc-context'
import { createHeadlessEditor, serialize } from '@/editor/markdown/core'
import { enterRule } from '@/editor/plugins/enter-rules'
import { insertCodeBlock, moveBlock, setHeading, shiftHeading } from '@/editor/block-commands'
import { countWords } from '@/shell/statusbar'

describe('préférences', () => {
  it('valeurs par défaut : thème Dark 2026 et français', () => {
    const p = normalizePrefs(undefined)
    expect(p.theme).toBe('dark-2026')
    expect(p.locale).toBe('fr')
    expect(p.editor.width).toEqual({ value: 860, unit: 'px' })
  })
  it('rejette les valeurs invalides champ par champ', () => {
    const p = normalizePrefs({ theme: 'inconnu', editor: { width: { value: 5, unit: 'px' }, fontSize: 'x' }, view: { zoom: 2 } })
    expect(p.theme).toBe(DEFAULT_PREFS.theme)
    expect(p.editor.width).toEqual(DEFAULT_PREFS.editor.width)
    expect(p.editor.fontSize).toBe(14)
    expect(p.view.zoom).toBe(2)
  })
  it('largeur : px, % ou pleine largeur', () => {
    expect(normalizePrefs({ editor: { width: 'full' } }).editor.width).toBe('full')
    expect(normalizePrefs({ editor: { width: { value: 75, unit: '%' } } }).editor.width).toEqual({ value: 75, unit: '%' })
    expect(normalizePrefs({ editor: { width: { value: 150, unit: '%' } } }).editor.width).toEqual(DEFAULT_PREFS.editor.width)
  })
  it('fusion partielle', () => {
    const p = mergePrefs(DEFAULT_PREFS, { view: { focusMode: true }, editor: { width: 'full' } })
    expect(p.view.focusMode).toBe(true)
    expect(p.view.sidebar).toBe(true)
    expect(p.editor.width).toBe('full')
    expect(mergePrefs(p, { editor: { width: { value: 600, unit: 'px' } } }).editor.width).toEqual({ value: 600, unit: 'px' })
  })
  it('position de la colonne : centrée par défaut, à gauche possible', () => {
    expect(normalizePrefs(undefined).editor.columnAlign).toBe('center')
    expect(normalizePrefs({ editor: { columnAlign: 'left' } }).editor.columnAlign).toBe('left')
    expect(normalizePrefs({ editor: { columnAlign: 'right' } }).editor.columnAlign).toBe('center')
    const p = mergePrefs(DEFAULT_PREFS, { editor: { columnAlign: 'left' } })
    expect(p.editor.columnAlign).toBe('left')
    expect(p.editor.width).toEqual(DEFAULT_PREFS.editor.width)
  })
  it('mises à jour : vérification au démarrage activée par défaut', () => {
    expect(normalizePrefs(undefined).updates.checkOnStartup).toBe(true)
    expect(normalizePrefs({ updates: { checkOnStartup: false } }).updates.checkOnStartup).toBe(false)
    expect(normalizePrefs({ updates: { checkOnStartup: 'non' } }).updates.checkOnStartup).toBe(true)
    expect(mergePrefs(DEFAULT_PREFS, { updates: { checkOnStartup: false } }).updates.checkOnStartup).toBe(false)
  })
})

describe('raccourcis clavier', () => {
  const ev = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)
  it('lettre avec Ctrl', () => {
    expect(eventShortcuts(ev({ key: 'b', code: 'KeyB', ctrlKey: true }))).toContain('Ctrl+B')
  })
  it('chiffre sur clavier AZERTY (touche physique)', () => {
    expect(eventShortcuts(ev({ key: '&', code: 'Digit1', ctrlKey: true }))).toContain('Ctrl+1')
  })
  it('Ctrl+Maj+K', () => {
    expect(eventShortcuts(ev({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true }))).toContain('Ctrl+Shift+K')
  })
  it('touches de fonction', () => {
    expect(eventShortcuts(ev({ key: 'F8', code: 'F8' }))).toContain('F8')
    expect(eventShortcuts(ev({ key: 'ArrowUp', code: 'ArrowUp', altKey: true }))).toContain('Alt+Up')
  })
})

describe('chemins d’images', () => {
  it('relatif au document', () => {
    docContext.dir = 'C:\\docs\\notes'
    expect(resolveAsset('img/a b.png')).toBe('plume-file://local/C:/docs/notes/img/a%20b.png')
    expect(resolveAsset('https://x.org/a.png')).toBe('https://x.org/a.png')
    expect(resolveAsset('D:\\photos\\x.jpg')).toBe('plume-file://local/D:/photos/x.jpg')
  })
  it('chemin relatif pour un fichier déposé', () => {
    docContext.dir = 'C:\\docs\\notes'
    expect(relativeToDoc('C:\\docs\\notes\\img\\a.png')).toBe('img/a.png')
    expect(relativeToDoc('C:\\docs\\autre\\b.png')).toBe('../autre/b.png')
    expect(relativeToDoc('D:\\x.png')).toBe('D:/x.png')
  })
})

describe('compte de mots', () => {
  it('mots français et ponctuation', () => {
    expect(countWords("L'été, c'est « très » bien !")).toBe(4)
    expect(countWords('')).toBe(0)
  })
})

async function withDoc(md: string) {
  const editor = await createHeadlessEditor(md, document.createElement('div'))
  const view = editor.ctx.get(editorViewCtx)
  const md2 = () => editor.action(serialize)
  return { editor, view, md: md2 }
}

/** Place le curseur à la fin du n-ième bloc de texte. */
function caretAtEndOf(view: ReturnType<typeof Object>, index: number) {
  const v = view as import('@milkdown/kit/prose/view').EditorView
  let count = -1
  let target = 0
  v.state.doc.descendants((n, pos) => {
    if (n.isTextblock) {
      count++
      if (count === index) target = pos + 1 + n.content.size
    }
    return true
  })
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, target)))
}

describe('règles validées par Entrée', () => {
  /** Document dont le premier paragraphe contient `text` (saisi, pas analysé). */
  const run = async (text: string, prefix = '') => {
    const { view, md: out, editor } = await withDoc(prefix + 'x\n')
    const index = prefix ? 1 : 0
    caretAtEndOf(view, index)
    const { $from } = view.state.selection
    view.dispatch(view.state.tr.insertText(text, $from.start(), $from.end()))
    const tr = enterRule(view.state)
    if (tr) view.dispatch(tr)
    const result = { applied: !!tr, md: out(), selectionParent: view.state.selection.$from.parent.type.name }
    await editor.destroy()
    return result
  }

  it('```python crée un bloc de code avec la langue', async () => {
    const r = await run('```python')
    expect(r.applied).toBe(true)
    expect(r.selectionParent).toBe('code_block')
    expect(r.md).toBe('```python\n```\n')
  })
  it('$$ crée un bloc de formule', async () => {
    expect((await run('$$')).selectionParent).toBe('math_block')
  })
  it('[toc] crée une table des matières', async () => {
    const r = await run('[toc]')
    expect(r.md.startsWith('[TOC]')).toBe(true)
  })
  it('|a|b| crée un tableau', async () => {
    const r = await run('|a|b|')
    expect(r.md).toContain('| a | b |')
  })
  it('--- en tête crée l’en-tête YAML, ailleurs une règle', async () => {
    expect((await run('---')).selectionParent).toBe('frontmatter')
    const r = await run('---', 'texte\n\n')
    expect(r.applied).toBe(true)
    expect(r.md).toContain('texte\n\n---\n')
  })
  it('texte ordinaire : pas de transformation', async () => {
    expect((await run('bonjour')).applied).toBe(false)
  })
})

describe('commandes de blocs', () => {
  it('Bloc de code : remplace un paragraphe vide', async () => {
    const { view, md, editor } = await withDoc('Avant\n\n<br />\n\nAprès\n')
    caretAtEndOf(view, 1)
    insertCodeBlock()(view.state, view.dispatch)
    expect(view.state.selection.$from.parent.type.name).toBe('code_block')
    expect(md()).toBe('Avant\n\n```\n```\n\nAprès\n')
    await editor.destroy()
  })
  it('Bloc de code : inséré après un paragraphe non vide, curseur dedans', async () => {
    const { view, md, editor } = await withDoc('Texte\n')
    caretAtEndOf(view, 0)
    insertCodeBlock()(view.state, view.dispatch)
    expect(view.state.selection.$from.parent.type.name).toBe('code_block')
    expect(md()).toBe('Texte\n\n```\n```\n')
    await editor.destroy()
  })
  it('titres : Ctrl+2 puis augmenter / diminuer', async () => {
    const { view, md, editor } = await withDoc('Titre\n')
    caretAtEndOf(view, 0)
    setHeading(2)(view.state, view.dispatch)
    expect(md()).toBe('## Titre\n')
    shiftHeading(1)(view.state, view.dispatch)
    expect(md()).toBe('# Titre\n')
    shiftHeading(-1)(view.state, view.dispatch)
    expect(md()).toBe('## Titre\n')
    await editor.destroy()
  })
  it('déplacer un bloc vers le bas', async () => {
    const { view, md, editor } = await withDoc('A\n\nB\n')
    caretAtEndOf(view, 0)
    moveBlock(1)(view.state, view.dispatch)
    expect(md()).toBe('B\n\nA\n')
    await editor.destroy()
  })
})
