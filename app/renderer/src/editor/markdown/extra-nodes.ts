// Nœuds Markdown absents des presets commonmark/gfm de Milkdown :
// en-tête YAML, formules (bloc et en ligne), table des matières [TOC].
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core'
import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx'
import { $markSchema, $nodeSchema, $remark } from '@milkdown/kit/utils'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMath from 'remark-math'

type MdNode = { type: string; value?: string; children?: MdNode[] }

export const remarkFrontmatterPlugin = $remark('plumeFrontmatter', () => remarkFrontmatter as never, ['yaml'] as never)

// Les maths en ligne `$…$` sont optionnelles (préférence `inlineMath`), `$$…$$` toujours actif.
export const remarkMathPlugin = $remark('plumeMath', () => remarkMath as never, { singleDollarTextMath: false } as never)

// Un paragraphe réduit à « [TOC] » devient un nœud `toc`.
export const remarkTocPlugin = $remark('plumeToc', () => () => (tree: MdNode) => {
  const walk = (node: MdNode) => {
    if (!node.children) return
    node.children = node.children.map((child) => {
      const only = child.type === 'paragraph' && child.children?.length === 1 ? child.children[0] : null
      if (only && only.type === 'text' && /^\[toc\]$/i.test((only.value ?? '').trim())) return { type: 'toc' }
      walk(child)
      return child
    })
  }
  walk(tree)
})

// `<u>…</u>` (HTML en ligne) devient un nœud mdast `underline`, rendu comme une marque.
export const remarkUnderlinePlugin = $remark('plumeUnderline', () => () => (tree: MdNode) => {
  const walk = (node: MdNode) => {
    if (!node.children) return
    const out: MdNode[] = []
    const kids = node.children
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i]
      if (child.type === 'html' && /^<u>$/i.test(child.value ?? '')) {
        const end = kids.findIndex((k, j) => j > i && k.type === 'html' && /^<\/u>$/i.test(k.value ?? ''))
        if (end > i) {
          const inner = { type: 'underline', children: kids.slice(i + 1, end) }
          walk(inner)
          out.push(inner)
          i = end
          continue
        }
      }
      walk(child)
      out.push(child)
    }
    node.children = out
  }
  walk(tree)
})

export const underlineSchema = $markSchema('underline', () => ({
  parseDOM: [{ tag: 'u' }],
  toDOM: () => ['u', 0],
  parseMarkdown: {
    match: (node) => node.type === 'underline',
    runner: (state, node, markType) => {
      state.openMark(markType)
      state.next(node.children)
      state.closeMark(markType)
    }
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'underline',
    runner: (state, mark) => {
      state.withMark(mark, 'underline')
    }
  }
}))

export const frontmatterSchema = $nodeSchema('frontmatter', () => ({
  content: 'text*',
  group: 'block',
  marks: '',
  code: true,
  defining: true,
  isolating: true,
  parseDOM: [{ tag: 'pre[data-frontmatter]', preserveWhitespace: 'full' }],
  toDOM: () => ['pre', { 'data-frontmatter': '', class: 'frontmatter' }, ['code', 0]],
  parseMarkdown: {
    match: ({ type }) => type === 'yaml',
    runner: (state, node, type) => {
      state.openNode(type)
      if (node.value) state.addText(node.value as string)
      state.closeNode()
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'frontmatter',
    runner: (state, node) => {
      state.addNode('yaml', undefined, node.textContent)
    }
  }
}))

export const mathBlockSchema = $nodeSchema('math_block', () => ({
  content: 'text*',
  group: 'block',
  marks: '',
  code: true,
  defining: true,
  isolating: true,
  parseDOM: [{ tag: 'div[data-math-block]', preserveWhitespace: 'full' }],
  toDOM: () => ['div', { 'data-math-block': '', class: 'math-block' }, ['code', 0]],
  parseMarkdown: {
    match: ({ type }) => type === 'math',
    runner: (state, node, type) => {
      state.openNode(type)
      if (node.value) state.addText(node.value as string)
      state.closeNode()
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => {
      state.addNode('math', undefined, node.textContent)
    }
  }
}))

export const mathInlineSchema = $nodeSchema('math_inline', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { value: { default: '' } },
  parseDOM: [
    {
      tag: 'span[data-math-inline]',
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' })
    }
  ],
  toDOM: (node) => ['span', { 'data-math-inline': '', 'data-value': node.attrs.value, class: 'math-inline' }, node.attrs.value],
  parseMarkdown: {
    match: ({ type }) => type === 'inlineMath',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string })
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_inline',
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, node.attrs.value)
    }
  }
}))

export const tocSchema = $nodeSchema('toc', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  parseDOM: [{ tag: 'div[data-toc]' }],
  toDOM: () => ['div', { 'data-toc': '', class: 'toc' }],
  parseMarkdown: {
    match: ({ type }) => type === 'toc',
    runner: (state, _node, type) => {
      state.addNode(type)
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'toc',
    runner: (state) => {
      state.addNode('toc')
    }
  }
}))

// Réglages de sérialisation : sortie stable et proche de l'usage courant.
export function stringifyConfig(ctx: Ctx): void {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    bullet: '-' as const,
    emphasis: '*' as const,
    strong: '*' as const,
    fence: '`' as const,
    fences: true,
    rule: '-' as const,
    listItemIndent: 'one' as const,
    handlers: {
      ...options.handlers,
      toc: () => '[TOC]',
      underline: (node: never, _parent: never, st: { containerPhrasing: (n: never, i: never) => string }, info: never) =>
        '<u>' + st.containerPhrasing(node, info) + '</u>'
    }
  }))
}

export const extraNodes: MilkdownPlugin[] = [
  remarkFrontmatterPlugin,
  remarkMathPlugin,
  remarkTocPlugin,
  remarkUnderlinePlugin,
  underlineSchema,
  frontmatterSchema,
  mathBlockSchema,
  mathInlineSchema,
  tocSchema
].flat()
