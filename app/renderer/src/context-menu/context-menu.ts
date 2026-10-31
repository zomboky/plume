// Menu clic droit de l'éditeur. « Bloc de code » est au premier niveau (un clic).
import type { App } from '../app'
import { t, type MessageKey } from '../i18n'
import { blockKind } from '../editor/block-commands'
import { icons } from '../shell/icons'
import { openMenu, separator, type MenuItem } from '../shell/menu'
import { cmd } from '../shell/menus'
import { TextSelection } from '@milkdown/kit/prose/state'

const BLOCK_LABELS: Record<string, MessageKey> = {
  h1: 'para.h1',
  h2: 'para.h2',
  h3: 'para.h3',
  h4: 'para.h4',
  h5: 'para.h5',
  h6: 'para.h6',
  paragraph: 'para.paragraph',
  code_block: 'para.code_block',
  math_block: 'para.math_block',
  frontmatter: 'para.frontmatterBlock',
  blockquote: 'para.blockquote'
}

export class ContextMenu {
  constructor(private app: App) {
    app.workspace.addEventListener('contextmenu', (e) => this.onContextMenu(e))
  }

  private onContextMenu(e: MouseEvent): void {
    const target = e.target as HTMLElement
    if (target.closest('.find-bar, input, textarea') && !target.closest('.code-block-view')) return
    e.preventDefault()
    if (this.app.mode === 'wysiwyg') this.placeCaret(e)
    openMenu(this.items(), e.clientX, e.clientY, { className: 'context-menu' }).dataset.testid = 'context-menu'
  }

  /** Clic droit hors de la sélection : déplace le curseur au point cliqué. */
  private placeCaret(e: MouseEvent): void {
    const view = this.app.editor.view
    if (!view.dom.contains(e.target as Node)) return
    const hit = view.posAtCoords({ left: e.clientX, top: e.clientY })
    if (!hit) return
    const { from, to } = view.state.selection
    if (hit.pos >= from && hit.pos <= to && from !== to) return
    if ((e.target as HTMLElement).closest('.code-block-view')) return
    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(hit.pos))))
    } catch {
      // Position non textuelle : on garde la sélection.
    }
  }

  private items(): MenuItem[] {
    const app = this.app
    const run = (id: string) => () => app.commands.run(id)
    const btn = (id: string, icon: string) => {
      const c = app.commands.get(id)
      return {
        icon,
        title: app.commands.label(id),
        active: c.checked?.() ?? false,
        disabled: c.enabled ? !c.enabled() : false,
        testId: `ctx-${id}`,
        run: run(id)
      }
    }
    const source = app.mode === 'source'
    const kind = source ? 'paragraph' : blockKind(app.editor.state)
    const items: MenuItem[] = [
      {
        kind: 'icons',
        buttons: [btn('edit.cut', icons.cut), btn('edit.copy', icons.copy), btn('edit.paste', icons.paste), btn('edit.delete', icons.trash)]
      },
      {
        kind: 'submenu',
        label: t('edit.copyPasteAs'),
        items: () => [cmd(app, 'edit.copyPlain'), cmd(app, 'edit.copyMarkdown'), cmd(app, 'edit.copyHtml'), separator(), cmd(app, 'edit.pastePlain')]
      },
      separator(),
      { kind: 'icons', buttons: [btn('fmt.strong', icons.bold), btn('fmt.em', icons.italic), btn('fmt.code', icons.code), btn('fmt.link', icons.link)] },
      {
        kind: 'icons',
        buttons: [btn('para.quote', icons.quote), btn('para.orderedList', icons.ol), btn('para.bulletList', icons.ul), btn('para.taskList', icons.task)]
      },
      separator(),
      // Demande spécifique : le bloc de code accessible en un seul clic.
      { ...cmd(app, 'para.codeBlock', { testId: 'ctx-code-block' }), checked: false },
      {
        kind: 'submenu',
        label: t(BLOCK_LABELS[kind] ?? 'ctx.blockType'),
        testId: 'ctx-block-type',
        disabled: source,
        items: () => ['para.h1', 'para.h2', 'para.h3', 'para.h4', 'para.h5', 'para.h6', null, 'para.paragraph'].map((id) => (id ? cmd(app, id) : separator()))
      },
      {
        kind: 'submenu',
        label: t('ctx.insert'),
        testId: 'ctx-insert',
        disabled: source,
        items: () => [
          { ...cmd(app, 'fmt.image'), label: t('ctx.image') },
          cmd(app, 'para.footnote'),
          cmd(app, 'para.hr'),
          separator(),
          cmd(app, 'para.table'),
          cmd(app, 'para.codeBlock'),
          cmd(app, 'para.mathBlock'),
          separator(),
          cmd(app, 'para.toc'),
          cmd(app, 'para.frontmatter'),
          separator(),
          { ...cmd(app, 'para.insertBefore'), label: t('ctx.paragraphBefore') },
          { ...cmd(app, 'para.insertAfter'), label: t('ctx.paragraphAfter') }
        ]
      }
    ]
    const link = !source ? this.linkAtCaret() : null
    if (link) items.push(separator(), { label: t('ctx.openLink'), run: () => app.openLink(link) })
    return items
  }

  private linkAtCaret(): string | null {
    const { $from } = this.app.editor.state.selection
    const m = [...$from.marks(), ...($from.nodeAfter?.marks ?? [])].find((x) => x.type.name === 'link')
    return m ? (m.attrs.href as string) : null
  }
}
