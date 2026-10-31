// Export HTML (avec ou sans styles) et PDF, à partir du Markdown du document.
import { unified, type Plugin } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import { highlightCode } from '@lezer/highlight'
import type { ThemeId } from '@shared/prefs'
import { basename, dirname, slugify, type App } from '../app'
import { t } from '../i18n'
import { plumeHighlighter } from '../editor/highlight'
import { loadLanguage } from '../editor/languages'
import { mermaidToSvg } from '../editor/render/mermaid'
import { isAbsolutePath } from '../editor/doc-context'
import themesCss from '../styles/themes.css?inline'
import contentCss from '../styles/content.css?inline'

interface MdNode {
  type: string
  value?: string
  lang?: string | null
  url?: string
  depth?: number
  children?: MdNode[]
  data?: Record<string, unknown>
}

interface HNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HNode[]
}

function visit(node: MdNode | HNode, fn: (n: never, parent: never, index: number) => void, parent?: unknown, index = 0): void {
  fn(node as never, parent as never, index)
  const kids = (node as MdNode).children
  if (kids) for (let i = 0; i < kids.length; i++) visit(kids[i], fn, node, i)
}

const textOf = (n: MdNode | HNode): string => (n.value ?? '') + (n.children ?? []).map(textOf).join('')

/** [TOC] seul dans un paragraphe → liste de liens vers les titres. */
const remarkToc: Plugin = () => (tree) => {
  const root = tree as unknown as MdNode
  const headings: { depth: number; text: string }[] = []
  visit(root, (n: MdNode) => {
    if (n.type === 'heading') headings.push({ depth: n.depth ?? 1, text: textOf(n) })
  })
  const min = Math.min(6, ...headings.map((h) => h.depth))
  visit(root, (n: MdNode, parent: MdNode | undefined, index: number) => {
    if (!parent?.children || n.type !== 'paragraph' || n.children?.length !== 1) return
    const only = n.children[0]
    if (only.type !== 'text' || !/^\[toc\]$/i.test((only.value ?? '').trim())) return
    const items = headings
      .map((h) => `<li class="toc-level-${h.depth - min + 1}"><a href="#${slugify(h.text)}">${escapeHtml(h.text)}</a></li>`)
      .join('')
    parent.children[index] = { type: 'html', value: `<nav class="toc"><ul>${items}</ul></nav>` }
  })
}

/** Identifiants des titres (ancres de la table des matières). */
const rehypeHeadingIds: Plugin = () => (tree) => {
  const used = new Map<string, number>()
  visit(tree as unknown as HNode, (n: HNode) => {
    if (n.type !== 'element' || !/^h[1-6]$/.test(n.tagName ?? '')) return
    let id = slugify(textOf(n)) || 'titre'
    const k = used.get(id) ?? 0
    used.set(id, k + 1)
    if (k) id = `${id}-${k}`
    n.properties = { ...n.properties, id }
  })
}

/** Coloration des blocs de code avec les mêmes classes que l'éditeur. */
function rehypeHighlight(parsers: Map<string, { parse: (s: string) => never }>): Plugin {
  return () => (tree) => {
    visit(tree as unknown as HNode, (n: HNode) => {
      if (n.type !== 'element' || n.tagName !== 'code') return
      const cls = ([] as string[]).concat((n.properties?.className as string[]) ?? [])
      const lang = cls.find((c) => c.startsWith('language-'))?.slice(9)
      const parser = lang ? parsers.get(lang.toLowerCase()) : undefined
      if (!parser) return
      const code = textOf(n)
      const out: HNode[] = []
      highlightCode(
        code,
        parser.parse(code),
        plumeHighlighter,
        (text, classes) => out.push(classes ? { type: 'element', tagName: 'span', properties: { className: classes.split(' ') }, children: [{ type: 'text', value: text }] } : { type: 'text', value: text }),
        () => out.push({ type: 'text', value: '\n' })
      )
      n.children = out
    })
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function fileUrl(path: string): string {
  return 'file:///' + encodeURI(path.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')
}

export interface HtmlOptions {
  styled: boolean
  theme: ThemeId
  /** Dossier de destination : les images relatives restent relatives s'il s'agit du dossier du document. */
  targetDir: string | null
  title: string
}

export async function markdownToHtml(markdown: string, docDir: string | null, opts: HtmlOptions): Promise<string> {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter, ['yaml']).use(remarkToc)
  const mdast = (await processor.run(processor.parse(markdown))) as unknown as MdNode

  // Diagrammes Mermaid rendus en SVG, langages de code chargés à l'avance.
  const parsers = new Map<string, { parse: (s: string) => never }>()
  const jobs: Promise<void>[] = []
  visit(mdast, (n: MdNode, parent: MdNode | undefined, index: number) => {
    if (n.type === 'yaml' && parent?.children) parent.children[index] = { type: 'html', value: '' }
    if (n.type === 'image' && n.url && docDir && !/^[a-z][a-z0-9+.-]*:/i.test(n.url)) {
      const abs = isAbsolutePath(n.url) ? n.url : `${docDir}\\${decodeURI(n.url).replace(/\//g, '\\')}`
      const sameDir = opts.targetDir && opts.targetDir.toLowerCase() === docDir.toLowerCase()
      if (!sameDir || isAbsolutePath(n.url)) n.url = fileUrl(abs)
    }
    if (n.type !== 'code' || !n.lang) return
    const lang = n.lang.toLowerCase()
    if (lang === 'mermaid' && parent?.children) {
      const target = parent.children
      jobs.push(
        mermaidToSvg(n.value ?? '')
          .then((svg) => {
            target[index] = { type: 'html', value: `<div class="mermaid-diagram">${svg}</div>` }
          })
          .catch(() => undefined)
      )
    } else if (!parsers.has(lang)) {
      jobs.push(
        loadLanguage(lang).then((support) => {
          if (support) parsers.set(lang, support.language.parser as never)
        })
      )
    }
  })
  await Promise.all(jobs)

  const hast = await unified()
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeKatex, { output: 'mathml', throwOnError: false } as never)
    .use(rehypeHeadingIds)
    .use(rehypeHighlight(parsers))
    .run(mdast as never)
  const body = unified().use(rehypeStringify).stringify(hast as never)

  const style = opts.styled ? `<style>\n${themesCss}\n${contentCss}\n${EXPORT_CSS}</style>` : ''
  const htmlAttrs = opts.styled ? ` data-theme="${opts.theme}"` : ''
  return `<!doctype html>
<html lang="fr"${htmlAttrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Plume">
<title>${escapeHtml(opts.title)}</title>
${style}
</head>
<body>
<article class="markdown-body">
${body}
</article>
</body>
</html>
`
}

const EXPORT_CSS = `
html { background: var(--bg); color-scheme: light dark; }
body { margin: 0; background: var(--bg); }
.markdown-body { max-width: 860px; margin: 0 auto; padding: 32px 26px 64px; }
.toc ul { list-style: none; padding-left: 0; }
.toc .toc-level-2 { padding-left: 1.2em; } .toc .toc-level-3 { padding-left: 2.4em; }
.toc .toc-level-4 { padding-left: 3.6em; } .toc .toc-level-5, .toc .toc-level-6 { padding-left: 4.8em; }
.mermaid-diagram { text-align: center; }
@media print { .markdown-body { max-width: none; padding: 0; } pre, table, img, .mermaid-diagram { break-inside: avoid; } }
`

/** HTML autonome du document courant (impression, PDF : thème clair). */
export async function documentHtml(app: App, forPrint = false): Promise<string> {
  const docDir = app.path ? dirname(app.path) : app.folder
  return markdownToHtml(app.currentMarkdown(), docDir, {
    styled: true,
    theme: forPrint ? 'clair' : app.prefs.theme,
    targetDir: null,
    title: app.displayName
  })
}

export async function exportDocument(app: App, kind: 'html' | 'html-plain' | 'pdf'): Promise<void> {
  const name = app.path ? basename(app.path).replace(/\.[^.]+$/, '') : t('app.untitled')
  const ext = kind === 'pdf' ? 'pdf' : 'html'
  const target = await window.plume.exportDialog(name, ext)
  if (!target) return
  const docDir = app.path ? dirname(app.path) : app.folder
  const html = await markdownToHtml(app.currentMarkdown(), docDir, {
    styled: kind !== 'html-plain',
    theme: kind === 'pdf' ? 'clair' : app.prefs.theme,
    targetDir: kind === 'pdf' ? null : dirname(target),
    title: app.displayName
  })
  if (kind === 'pdf') await window.plume.exportPdf(html, target)
  else await window.plume.writeFile(target, html)
  app.notice.show(t('msg.exported', { path: target }))
}
