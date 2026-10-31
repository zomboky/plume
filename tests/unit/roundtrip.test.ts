// Aller-retour Markdown → document → Markdown sur le corpus d'exemples.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { Editor } from '@milkdown/kit/core'
import { createHeadlessEditor, parse, serialize } from '@/editor/markdown/core'

const corpusDir = join(__dirname, '..', 'corpus')
const corpus = readdirSync(corpusDir).filter((f) => f.endsWith('.md'))
const read = (f: string) => readFileSync(join(corpusDir, f), 'utf8').replace(/\r\n/g, '\n')

const editors: Editor[] = []
async function roundTrip(md: string): Promise<{ out: string; editor: Editor }> {
  const editor = await createHeadlessEditor(md)
  editors.push(editor)
  return { out: editor.action(serialize), editor }
}

afterAll(async () => {
  for (const e of editors) await e.destroy().catch(() => {})
})

describe('corpus : sortie identique à l’entrée', () => {
  it('contient des fichiers', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(5)
  })
  for (const file of corpus) {
    it(file, async () => {
      const md = read(file)
      const { out } = await roundTrip(md)
      expect(out).toBe(md)
    })
  }
})

describe('corpus : document stable après re-analyse', () => {
  for (const file of corpus) {
    it(file, async () => {
      const md = read(file)
      const { out, editor } = await roundTrip(md)
      const first = editor.action((ctx) => parse(ctx, md))
      const second = editor.action((ctx) => parse(ctx, out))
      expect(second.eq(first)).toBe(true)
    })
  }
})

describe('syntaxes non normalisées : contenu conservé et sortie idempotente', () => {
  const cases: Record<string, string> = {
    'puces étoile': '* a\n* b\n',
    'puces plus': '+ a\n+ b\n',
    'gras souligné': '__gras__ et _italique_\n',
    'règle étoiles': 'avant\n\n***\n\naprès\n',
    'titre setext': 'Titre\n=====\n\nTexte\n',
    'clôture tilde': '~~~js\nlet a = 1\n~~~\n',
    'tableau compact': '|a|b|\n|-|-|\n|1|2|\n',
    'toc minuscule': '[toc]\n\n# Titre\n',
    'liste lâche': '- a\n\n- b\n'
  }
  for (const [name, md] of Object.entries(cases)) {
    it(name, async () => {
      const { out, editor } = await roundTrip(md)
      const again = await roundTrip(out)
      expect(again.out).toBe(out)
      const a = editor.action((ctx) => parse(ctx, md))
      const b = editor.action((ctx) => parse(ctx, out))
      expect(b.eq(a)).toBe(true)
    })
  }
})

describe('nœuds Plume', () => {
  const types = async (md: string) => {
    const { editor } = await roundTrip(md)
    const doc = editor.action((ctx) => parse(ctx, md))
    const names: string[] = []
    doc.descendants((n) => {
      names.push(n.type.name)
      for (const m of n.marks) names.push(`mark:${m.type.name}`)
    })
    return names
  }

  it('en-tête YAML', async () => {
    expect(await types('---\na: 1\n---\n\nTexte\n')).toContain('frontmatter')
  })
  it('table des matières', async () => {
    expect(await types('[TOC]\n\n# A\n')).toContain('toc')
  })
  it('bloc de formule', async () => {
    expect(await types('$$\nx^2\n$$\n')).toContain('math_block')
  })
  it('formule en ligne $$…$$', async () => {
    expect(await types('Texte $$x$$ fin\n')).toContain('math_inline')
  })
  it('souligné comme marque', async () => {
    expect(await types('a <u>b</u> c\n')).toContain('mark:underline')
  })
  it('tâche cochée', async () => {
    const { editor } = await roundTrip('- [x] fait\n')
    const doc = editor.action((ctx) => parse(ctx, '- [x] fait\n'))
    let checked: unknown = null
    doc.descendants((n) => {
      if (n.type.name === 'list_item') checked = n.attrs.checked
    })
    expect(checked).toBe(true)
  })
  it('le texte « $ » isolé reste du texte par défaut', async () => {
    const { out } = await roundTrip('Prix : 5 $ et 10 $.\n')
    expect(out).toBe('Prix : 5 $ et 10 $.\n')
  })
})
