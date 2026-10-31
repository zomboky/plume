// Registre unique des commandes : libellé, raccourci, action, état coché/actif.
// Alimente la barre de menus, le menu contextuel et les raccourcis clavier.
import type { Command as PmCommand } from '@milkdown/kit/prose/state'
import { TextSelection } from '@milkdown/kit/prose/state'
import { redo, undo } from '@milkdown/kit/prose/history'
import { DOMSerializer } from '@milkdown/kit/prose/model'
import { THEMES, type ThemeId } from '@shared/prefs'
import type { App } from './app'
import { t, type MessageKey } from './i18n'
import * as bc from './editor/block-commands'
import { prompt } from './shell/prompt'
import { exportDocument, documentHtml } from './export/export'
import { toggleLinkCommand, insertImageCommand } from '@milkdown/kit/preset/commonmark'
import { helpMarkdown } from './shell/help'

export interface Cmd {
  id: string
  label: MessageKey | (() => string)
  shortcut?: string
  /** Raccourci affiché mais laissé au comportement natif (copier, coller…). */
  nativeKey?: boolean
  /** Commande d'édition : ignorée quand le focus est dans un bloc de code. */
  editing?: boolean
  run: () => void | Promise<void>
  checked?: () => boolean
  enabled?: () => boolean
}

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift']

const CODE_KEYS: Record<string, string> = {
  Equal: '=',
  Minus: '-',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  NumpadAdd: '=',
  NumpadSubtract: '-',
  NumpadDivide: '/'
}

/** Noms de raccourci candidats pour un évènement clavier (disposition physique ou caractère). */
export function eventShortcuts(e: KeyboardEvent): string[] {
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  const keys = new Set<string>()
  const code = e.code
  if (/^Key[A-Z]$/.test(code)) keys.add(code.slice(3))
  else if (/^Digit\d$/.test(code)) keys.add(code.slice(5))
  else if (/^Numpad\d$/.test(code)) keys.add(code.slice(6))
  else if (CODE_KEYS[code]) keys.add(CODE_KEYS[code])
  const k = e.key
  if (/^F\d{1,2}$/.test(k) || ['Tab', 'Enter', 'Escape', 'Delete', 'Backspace'].includes(k)) keys.add(k)
  else if (k === 'ArrowUp') keys.add('Up')
  else if (k === 'ArrowDown') keys.add('Down')
  else if (k.length === 1) keys.add(k.toUpperCase())
  const out: string[] = []
  for (const key of keys) {
    out.push([...mods, key].join('+'))
    // Caractère obtenu avec Maj (ex. « / » sur AZERTY) : accepter aussi sans Maj.
    if (e.shiftKey && key === k && !/[A-Z0-9]/.test(key)) out.push([...mods.filter((m) => m !== 'Shift'), key].join('+'))
  }
  return out
}

function normalize(shortcut: string): string {
  const parts = shortcut.split('+')
  const key = parts.pop()!
  const mods = MOD_ORDER.filter((m) => parts.includes(m))
  return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+')
}

export class CommandRegistry {
  private map = new Map<string, Cmd>()
  private byKey = new Map<string, Cmd>()

  constructor(app: App) {
    for (const c of buildCommands(app)) this.map.set(c.id, c)
  }

  get(id: string): Cmd {
    const c = this.map.get(id)
    if (!c) throw new Error(`Commande inconnue : ${id}`)
    return c
  }

  label(id: string): string {
    const c = this.get(id)
    return typeof c.label === 'function' ? c.label() : t(c.label)
  }

  run(id: string): void {
    const c = this.get(id)
    if (c.enabled && !c.enabled()) return
    void c.run()
  }

  all(): Cmd[] {
    return [...this.map.values()]
  }

  bindKeyboard(): void {
    for (const c of this.map.values()) if (c.shortcut && !c.nativeKey) this.byKey.set(normalize(c.shortcut), c)
    window.addEventListener('keydown', (e) => this.onKey(e), true)
  }

  private onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.isComposing) return
    const target = e.target as HTMLElement | null
    const inCodeBlock = !!target?.closest('.code-block-view, .math-inline-input')
    const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !target.closest('.code-block-view')
    for (const name of eventShortcuts(e)) {
      const c = this.byKey.get(name)
      if (!c) continue
      if ((inCodeBlock || inField) && c.editing) return
      if (inField && !/^(Ctrl|F\d)/.test(name)) return
      e.preventDefault()
      e.stopPropagation()
      this.run(c.id)
      return
    }
  }
}

function buildCommands(app: App): Cmd[] {
  const ed = app.editor
  const wysiwyg = () => app.mode === 'wysiwyg'
  const editable = () => app.mode === 'wysiwyg' && !app.readonly
  const pm = (cmd: PmCommand) => () => {
    if (app.mode === 'wysiwyg') ed.run(cmd)
  }
  const sourceOr = (cmd: PmCommand, sourceAction: () => void) => () => {
    if (app.mode === 'source') sourceAction()
    else ed.run(cmd)
  }
  const src = () => app.source!

  const heading = (level: number): Cmd => ({
    id: `para.h${level}`,
    label: `para.h${level}` as MessageKey,
    shortcut: `Ctrl+${level}`,
    editing: true,
    run: sourceOr(bc.setHeading(level), () => src().setLinePrefix('#'.repeat(level) + ' ', /^#{1,6}\s+/)),
    checked: () => wysiwyg() && bc.blockKind(ed.state) === `h${level}`
  })

  const mark = (id: string, label: MessageKey, shortcut: string, markName: string, md: [string, string]): Cmd => ({
    id,
    label,
    shortcut,
    editing: true,
    run: sourceOr(bc.toggleMarkByName(markName), () => src().wrapSelection(md[0], md[1])),
    checked: () => wysiwyg() && isMarkActive(app, markName)
  })

  const commands: Cmd[] = [
    // Fichier
    { id: 'file.new', label: 'file.new', shortcut: 'Ctrl+N', run: () => app.newDocument() },
    { id: 'file.newWindow', label: 'file.newWindow', shortcut: 'Ctrl+Shift+N', run: () => window.plume.newWindow() },
    { id: 'file.open', label: 'file.open', shortcut: 'Ctrl+O', run: () => app.openDialog() },
    { id: 'file.openFolder', label: 'file.openFolder', run: () => app.openFolderDialog() },
    { id: 'file.quickOpen', label: 'file.quickOpen', shortcut: 'Ctrl+P', run: () => app.quickOpen.open() },
    { id: 'file.reload', label: 'file.reload', run: () => app.reload(), enabled: () => !!app.path },
    { id: 'file.save', label: 'file.save', shortcut: 'Ctrl+S', run: () => void app.save() },
    { id: 'file.saveAs', label: 'file.saveAs', shortcut: 'Ctrl+Shift+S', run: () => void app.saveAs() },
    { id: 'file.properties', label: 'file.properties', run: () => app.showProperties(), enabled: () => !!app.path },
    { id: 'file.reveal', label: 'file.reveal', run: () => void window.plume.revealInExplorer(app.path!), enabled: () => !!app.path },
    { id: 'file.revealSidebar', label: 'file.revealSidebar', run: () => app.sidebar.revealCurrent(), enabled: () => !!app.path },
    { id: 'file.delete', label: 'file.delete', run: () => app.trashCurrent(), enabled: () => !!app.path },
    { id: 'file.exportHtml', label: 'file.exportHtml', run: () => exportDocument(app, 'html') },
    { id: 'file.exportHtmlPlain', label: 'file.exportHtmlPlain', run: () => exportDocument(app, 'html-plain') },
    { id: 'file.exportPdf', label: 'file.exportPdf', run: () => exportDocument(app, 'pdf') },
    { id: 'file.print', label: 'file.print', shortcut: 'Alt+Shift+P', run: async () => window.plume.print(await documentHtml(app, true)) },
    { id: 'file.prefs', label: 'file.prefs', shortcut: 'Ctrl+,', run: () => app.prefsPanel.open() },
    { id: 'file.close', label: 'file.close', shortcut: 'Ctrl+W', run: () => window.plume.closeWindow() },

    // Édition
    { id: 'edit.undo', label: 'edit.undo', shortcut: 'Ctrl+Z', nativeKey: true, run: sourceOr(undo, () => cmUndo(app)) },
    { id: 'edit.redo', label: 'edit.redo', shortcut: 'Ctrl+Y', nativeKey: true, run: sourceOr(redo, () => cmUndo(app, true)) },
    { id: 'edit.cut', label: 'edit.cut', shortcut: 'Ctrl+X', nativeKey: true, run: () => execNative('cut') },
    { id: 'edit.copy', label: 'edit.copy', shortcut: 'Ctrl+C', nativeKey: true, run: () => execNative('copy') },
    { id: 'edit.paste', label: 'edit.paste', shortcut: 'Ctrl+V', nativeKey: true, run: () => pasteFromClipboard(app, false) },
    { id: 'edit.copyPlain', label: 'edit.copyPlain', run: () => copyAs(app, 'plain') },
    { id: 'edit.copyMarkdown', label: 'edit.copyMarkdown', shortcut: 'Ctrl+Shift+C', run: () => copyAs(app, 'markdown') },
    { id: 'edit.copyHtml', label: 'edit.copyHtml', run: () => copyAs(app, 'html') },
    { id: 'edit.pastePlain', label: 'edit.pastePlain', shortcut: 'Ctrl+Shift+V', run: () => pasteFromClipboard(app, true) },
    { id: 'edit.selectAll', label: 'edit.selectAll', shortcut: 'Ctrl+A', nativeKey: true, run: () => selectAll(app) },
    { id: 'edit.selectWord', label: 'edit.selectWord', shortcut: 'Ctrl+D', editing: true, run: pm(bc.selectWord), enabled: wysiwyg },
    { id: 'edit.selectLine', label: 'edit.selectLine', shortcut: 'Ctrl+L', editing: true, run: pm(bc.selectLine), enabled: wysiwyg },
    { id: 'edit.selectScope', label: 'edit.selectScope', shortcut: 'Ctrl+E', editing: true, run: pm(bc.selectScope), enabled: wysiwyg },
    { id: 'edit.moveUp', label: 'edit.moveUp', shortcut: 'Alt+Up', editing: true, run: pm(bc.moveBlock(-1)), enabled: editable },
    { id: 'edit.moveDown', label: 'edit.moveDown', shortcut: 'Alt+Down', editing: true, run: pm(bc.moveBlock(1)), enabled: editable },
    { id: 'edit.delete', label: 'edit.delete', run: () => deleteSelection(app) },
    { id: 'edit.find', label: 'edit.find', shortcut: 'Ctrl+F', run: () => findOrSource(app, false) },
    { id: 'edit.replace', label: 'edit.replace', shortcut: 'Ctrl+H', run: () => findOrSource(app, true) },
    { id: 'edit.findNext', label: 'edit.findNext', shortcut: 'F3', run: () => app.findBar.step(1) },
    { id: 'edit.findPrev', label: 'edit.findPrev', shortcut: 'Shift+F3', run: () => app.findBar.step(-1) },

    // Paragraphe
    ...[1, 2, 3, 4, 5, 6].map(heading),
    {
      id: 'para.paragraph',
      label: 'para.paragraph',
      shortcut: 'Ctrl+0',
      editing: true,
      run: sourceOr(bc.setParagraph, () => src().setLinePrefix('', /^#{1,6}\s+/)),
      checked: () => wysiwyg() && bc.blockKind(ed.state) === 'paragraph'
    },
    { id: 'para.headingUp', label: 'para.headingUp', shortcut: 'Ctrl+=', editing: true, run: pm(bc.shiftHeading(1)), enabled: editable },
    { id: 'para.headingDown', label: 'para.headingDown', shortcut: 'Ctrl+-', editing: true, run: pm(bc.shiftHeading(-1)), enabled: editable },
    { id: 'para.table', label: 'para.table', shortcut: 'Ctrl+T', editing: true, run: pm(bc.insertTable()), enabled: editable },
    { id: 'para.mathBlock', label: 'para.mathBlock', shortcut: 'Ctrl+Shift+M', editing: true, run: pm(bc.insertMathBlock), enabled: editable },
    {
      id: 'para.codeBlock',
      label: 'para.codeBlock',
      shortcut: 'Ctrl+Shift+K',
      run: sourceOr(bc.insertCodeBlock(), () => src().wrapSelection('\n```\n', '\n```\n')),
      enabled: () => !app.readonly
    },
    {
      id: 'para.quote',
      label: 'para.quote',
      shortcut: 'Ctrl+Shift+Q',
      editing: true,
      run: sourceOr(bc.toggleBlockquote, () => src().setLinePrefix('> ', /^>\s?/)),
      checked: () => wysiwyg() && inNode(app, 'blockquote')
    },
    {
      id: 'para.orderedList',
      label: 'para.orderedList',
      shortcut: 'Ctrl+Shift+[',
      editing: true,
      run: sourceOr(bc.toggleList('ordered_list'), () => src().setLinePrefix('1. ', /^\d+\.\s/)),
      checked: () => wysiwyg() && inNode(app, 'ordered_list')
    },
    {
      id: 'para.bulletList',
      label: 'para.bulletList',
      shortcut: 'Ctrl+Shift+]',
      editing: true,
      run: sourceOr(bc.toggleList('bullet_list'), () => src().setLinePrefix('- ', /^[-*+]\s/)),
      checked: () => wysiwyg() && inNode(app, 'bullet_list')
    },
    {
      id: 'para.taskList',
      label: 'para.taskList',
      shortcut: 'Ctrl+Shift+X',
      editing: true,
      run: sourceOr(bc.toggleList('task'), () => src().setLinePrefix('- [ ] ', /^[-*+]\s\[[ xX]\]\s/)),
      checked: () => wysiwyg() && inTask(app)
    },
    { id: 'para.toggleTask', label: 'para.toggleTask', run: pm(bc.toggleTask), enabled: () => wysiwyg() && inTask(app) },
    { id: 'para.indent', label: 'para.indent', shortcut: 'Ctrl+]', editing: true, run: pm(bc.indentList), enabled: () => editable() && inNode(app, 'list_item') },
    { id: 'para.outdent', label: 'para.outdent', shortcut: 'Ctrl+[', editing: true, run: pm(bc.outdentList), enabled: () => editable() && inNode(app, 'list_item') },
    { id: 'para.insertBefore', label: 'para.insertBefore', run: pm(bc.insertParagraph('before')), enabled: editable },
    { id: 'para.insertAfter', label: 'para.insertAfter', run: pm(bc.insertParagraph('after')), enabled: editable },
    { id: 'para.footnote', label: 'para.footnote', run: pm(bc.insertFootnote), enabled: editable },
    { id: 'para.hr', label: 'para.hr', run: pm(bc.insertHr), enabled: editable },
    { id: 'para.toc', label: 'para.toc', run: pm(bc.insertToc), enabled: editable },
    {
      id: 'para.frontmatter',
      label: 'para.frontmatter',
      run: pm(bc.toggleFrontmatter),
      enabled: editable,
      checked: () => wysiwyg() && bc.hasFrontmatter(ed.state)
    },

    // Format
    mark('fmt.strong', 'fmt.strong', 'Ctrl+B', 'strong', ['**', '**']),
    mark('fmt.em', 'fmt.em', 'Ctrl+I', 'emphasis', ['*', '*']),
    mark('fmt.underline', 'fmt.underline', 'Ctrl+U', 'underline', ['<u>', '</u>']),
    mark('fmt.code', 'fmt.code', 'Ctrl+Shift+`', 'inlineCode', ['`', '`']),
    mark('fmt.strike', 'fmt.strike', 'Alt+Shift+5', 'strike_through', ['~~', '~~']),
    {
      id: 'fmt.link',
      label: 'fmt.link',
      shortcut: 'Ctrl+K',
      editing: true,
      run: () => insertLink(app),
      checked: () => wysiwyg() && isMarkActive(app, 'link')
    },
    { id: 'fmt.image', label: 'fmt.image', shortcut: 'Ctrl+Shift+I', editing: true, run: () => insertImage(app), enabled: () => !app.readonly },
    { id: 'fmt.clear', label: 'fmt.clear', shortcut: 'Ctrl+\\', editing: true, run: pm(bc.clearFormat), enabled: editable },

    // Affichage
    {
      id: 'view.sidebar',
      label: 'view.sidebar',
      shortcut: 'Ctrl+Shift+L',
      run: () => app.sidebar.toggle(),
      checked: () => app.sidebar.visible
    },
    { id: 'view.outline', label: 'view.outline', shortcut: 'Ctrl+Shift+1', run: () => app.sidebar.show('outline'), checked: () => app.sidebar.visible && app.sidebar.tab === 'outline' },
    { id: 'view.files', label: 'view.files', shortcut: 'Ctrl+Shift+3', run: () => app.sidebar.show('files'), checked: () => app.sidebar.visible && app.sidebar.tab === 'files' },
    { id: 'view.search', label: 'view.search', shortcut: 'Ctrl+Shift+F', run: () => app.sidebar.show('search'), checked: () => app.sidebar.visible && app.sidebar.tab === 'search' },
    { id: 'view.source', label: 'view.source', shortcut: 'Ctrl+/', run: () => app.toggleSource(), checked: () => app.mode === 'source' },
    { id: 'view.readonly', label: 'view.readonly', run: () => app.toggleReadonly(), checked: () => app.readonly },
    { id: 'view.focus', label: 'view.focus', shortcut: 'F8', run: () => app.setFocusMode(!app.prefs.view.focusMode), checked: () => app.prefs.view.focusMode },
    {
      id: 'view.typewriter',
      label: 'view.typewriter',
      shortcut: 'F9',
      run: () => app.setTypewriterMode(!app.prefs.view.typewriterMode),
      checked: () => app.prefs.view.typewriterMode
    },
    {
      id: 'view.statusBar',
      label: 'view.statusBar',
      run: () => void app.updatePrefs({ view: { statusBar: !app.prefs.view.statusBar } }),
      checked: () => app.prefs.view.statusBar
    },
    { id: 'view.fullscreen', label: 'view.fullscreen', shortcut: 'F11', run: () => app.toggleFullscreen(), checked: () => app.fullscreen },
    { id: 'view.alwaysOnTop', label: 'view.alwaysOnTop', run: () => app.toggleAlwaysOnTop(), checked: () => app.alwaysOnTop },
    { id: 'view.fullWidth', label: 'view.fullWidth', run: () => app.toggleFullWidth(), checked: () => app.prefs.editor.width === 'full' },
    { id: 'view.zoomReset', label: 'view.zoomReset', shortcut: 'Ctrl+Shift+0', run: () => app.zoom(null) },
    { id: 'view.zoomIn', label: 'view.zoomIn', shortcut: 'Ctrl+Shift+=', run: () => app.zoom(0.1) },
    { id: 'view.zoomOut', label: 'view.zoomOut', shortcut: 'Ctrl+Shift+-', run: () => app.zoom(-0.1) },
    { id: 'view.devtools', label: 'view.devtools', shortcut: 'Shift+F12', run: () => window.plume.toggleDevTools() },

    // Thèmes
    ...THEMES.map(
      (id: ThemeId): Cmd => ({
        id: `theme.${id}`,
        label: `theme.${id}` as MessageKey,
        run: () => app.setTheme(id),
        checked: () => app.prefs.theme === id
      })
    ),

    // Aide
    { id: 'help.markdown', label: 'help.markdown', run: () => openHelp(app, 'markdown') },
    { id: 'help.shortcuts', label: 'help.shortcuts', run: () => openHelp(app, 'shortcuts') },
    {
      id: 'help.about',
      label: 'help.about',
      run: () => void window.plume.message(t('help.about'), t('help.aboutDetail', { version: __APP_VERSION__ }))
    }
  ]
  return commands
}


function isMarkActive(app: App, name: string): boolean {
  const state = app.editor.state
  const type = state.schema.marks[name]
  if (!type) return false
  const { from, to, empty, $from } = state.selection
  if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks())
  return state.doc.rangeHasMark(from, to, type)
}

function inNode(app: App, name: string): boolean {
  const { $from } = app.editor.state.selection
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === name) return true
  return false
}

function inTask(app: App): boolean {
  const { $from } = app.editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (n.type.name === 'list_item') return n.attrs.checked != null
  }
  return false
}

function cmUndo(app: App, isRedo = false): void {
  // Le mode source a son propre historique CodeMirror.
  void import('@codemirror/commands').then(({ undo: u, redo: r }) => {
    const v = app.source?.view
    if (v) (isRedo ? r : u)(v)
  })
}

function execNative(cmd: 'cut' | 'copy'): void {
  document.execCommand(cmd)
}

async function pasteFromClipboard(app: App, plain: boolean): Promise<void> {
  const text = await navigator.clipboard.readText().catch(() => '')
  if (!text) return
  if (app.mode === 'source') {
    const v = app.source!.view
    v.dispatch(v.state.replaceSelection(text))
    return
  }
  const view = app.editor.view
  if (plain) {
    view.dispatch(view.state.tr.insertText(text).scrollIntoView())
  } else {
    // Collage Markdown : analysé puis inséré comme contenu riche.
    const doc = app.editor.parse(text)
    const { from, to } = view.state.selection
    const slice = doc.content.childCount === 1 && doc.firstChild!.type.name === 'paragraph' ? doc.firstChild!.content : doc.content
    view.dispatch(view.state.tr.replaceWith(from, to, slice).scrollIntoView())
  }
  view.focus()
}

function selectAll(app: App): void {
  if (app.mode === 'source') {
    const v = app.source!.view
    v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } })
  } else {
    const view = app.editor.view
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 0, view.state.doc.content.size)))
  }
}

function deleteSelection(app: App): void {
  if (app.mode === 'source') {
    const v = app.source!.view
    v.dispatch(v.state.replaceSelection(''))
    return
  }
  const view = app.editor.view
  view.dispatch(view.state.tr.deleteSelection().scrollIntoView())
  view.focus()
}

/** Copier la sélection en texte brut, Markdown ou HTML. */
export async function copyAs(app: App, kind: 'plain' | 'markdown' | 'html'): Promise<void> {
  if (app.mode === 'source') {
    const v = app.source!.view
    const sel = v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to)
    await navigator.clipboard.writeText(sel)
    return
  }
  const { state } = app.editor
  const sel = state.selection
  if (sel.empty) return
  const slice = sel.content()
  if (kind === 'plain') {
    await navigator.clipboard.writeText(state.doc.textBetween(sel.from, sel.to, '\n\n', ' '))
    return
  }
  // Document temporaire contenant la sélection, pour la sérialiser.
  let doc
  try {
    doc = state.schema.topNodeType.createAndFill(null, slice.content) ?? state.schema.topNodeType.create(null, state.schema.nodes.paragraph.create(null, slice.content))
  } catch {
    doc = state.schema.topNodeType.create(null, state.schema.nodes.paragraph.create(null, slice.content))
  }
  if (kind === 'markdown') {
    await navigator.clipboard.writeText(app.editor.serializeDoc(doc).replace(/\n$/, ''))
    return
  }
  const div = document.createElement('div')
  div.append(DOMSerializer.fromSchema(state.schema).serializeFragment(doc.content))
  await navigator.clipboard.writeText(div.innerHTML)
}

function findOrSource(app: App, replace: boolean): void {
  if (app.mode === 'source') {
    void import('@codemirror/search').then(({ openSearchPanel }) => openSearchPanel(app.source!.view))
    return
  }
  app.findBar.open(replace)
}

async function insertLink(app: App): Promise<void> {
  if (app.mode === 'source') {
    const url = await prompt(t('prompt.linkUrl'), 'https://')
    if (url !== null) app.source!.wrapSelection('[', `](${url})`)
    return
  }
  const ed = app.editor
  if (isMarkActive(app, 'link')) {
    ed.run(bc.toggleMarkByName('link'))
    return
  }
  const { empty } = ed.state.selection
  const url = await prompt(t('prompt.linkUrl'), 'https://')
  if (url === null || !url.trim()) {
    ed.focus()
    return
  }
  if (empty) {
    // Sans sélection : le texte du lien est l'adresse elle-même.
    const view = ed.view
    const { from } = view.state.selection
    const linkMark = view.state.schema.marks.link.create({ href: url.trim() })
    view.dispatch(view.state.tr.insert(from, view.state.schema.text(url.trim(), [linkMark])))
    view.focus()
    return
  }
  ed.call(toggleLinkCommand, { href: url.trim() })
}

async function insertImage(app: App): Promise<void> {
  const src = await prompt(t('prompt.imageUrl'), '')
  if (src === null || !src.trim()) return
  if (app.mode === 'source') {
    app.source!.wrapSelection('![', `](${src.trim()})`)
    return
  }
  const sel = app.editor.state.selection
  const alt = sel.empty ? '' : app.editor.state.doc.textBetween(sel.from, sel.to)
  app.editor.call(insertImageCommand, { src: src.trim(), alt })
}

async function openHelp(app: App, which: 'markdown' | 'shortcuts'): Promise<void> {
  if (!(await app.confirmDiscard())) return
  const md = helpMarkdown(app.commands, which)
  await app.newDocument()
  app.editor.setMarkdown(md)
  app.savedMarkdown = md
  app.updateTitle()
}

