// Assemblage du schéma Markdown : commonmark + GFM + nœuds Plume.
// Partagé par l'éditeur visuel et par les tests d'aller-retour.
import { defaultValueCtx, Editor, editorViewCtx, parserCtx, rootCtx, serializerCtx } from '@milkdown/kit/core'
import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx'
import { commonmark, insertHrInputRule, createCodeBlockInputRule } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { extraNodes, stringifyConfig } from './extra-nodes'

// `---` et ```` ``` ```` sont gérés à l'appui sur Entrée (en-tête YAML, langue du bloc).
const excluded = new Set<MilkdownPlugin>([insertHrInputRule, createCodeBlockInputRule].flat() as MilkdownPlugin[])

export const markdownPlugins: MilkdownPlugin[] = [
  ...commonmark.filter((p) => !excluded.has(p)),
  ...gfm,
  ...extraNodes,
  history
].flat()

export function configureMarkdown(ctx: Ctx, markdown: string): void {
  ctx.set(defaultValueCtx, markdown)
  stringifyConfig(ctx)
}

/** Sérialise le document courant de l'éditeur en Markdown. */
export function serialize(ctx: Ctx): string {
  const view = ctx.get(editorViewCtx)
  return ctx.get(serializerCtx)(view.state.doc)
}

export function parse(ctx: Ctx, markdown: string) {
  return ctx.get(parserCtx)(markdown)
}

/** Éditeur sans vues personnalisées, pour les tests et l'export. */
export async function createHeadlessEditor(markdown: string, root?: HTMLElement): Promise<Editor> {
  const editor = Editor.make().config((ctx) => {
    configureMarkdown(ctx, markdown)
    if (root) ctx.set(rootCtx, root)
  })
  for (const plugin of markdownPlugins) editor.use(plugin)
  await editor.create()
  return editor
}
