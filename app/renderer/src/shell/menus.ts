// Définition des menus de l'application à partir du registre de commandes.
import type { App } from '../app'
import { t, type MessageKey } from '../i18n'
import { separator, type MenuAction, type MenuItem } from './menu'

export function cmd(app: App, id: string, extra: { testId?: string } = {}): MenuAction {
  const c = app.commands.get(id)
  return {
    label: app.commands.label(id),
    shortcut: c.shortcut,
    checked: c.checked?.() ?? false,
    disabled: c.enabled ? !c.enabled() : false,
    testId: extra.testId ?? `cmd-${id}`,
    run: () => app.commands.run(id)
  }
}

function sub(app: App, label: MessageKey, ids: (string | null)[], testId?: string): MenuItem {
  return {
    kind: 'submenu',
    label: t(label),
    testId,
    items: () => ids.map((id) => (id === null ? separator() : cmd(app, id)))
  }
}

function recentMenu(app: App): MenuItem {
  return {
    kind: 'submenu',
    label: t('file.recent'),
    testId: 'menu-recent',
    items: () => {
      const files = app.recent.files
      const items: MenuItem[] = files.length
        ? files.map((p) => ({ label: p, run: () => void app.openPath(p) }))
        : [{ label: t('file.recentEmpty'), disabled: true, run: () => {} }]
      items.push(separator(), {
        label: t('file.recentClear'),
        disabled: !files.length,
        run: () => void window.plume.clearRecent().then((r) => (app.recent = r))
      })
      return items
    }
  }
}

export interface TopMenu {
  id: string
  label: MessageKey
  items: () => MenuItem[]
}

export function topMenus(app: App): TopMenu[] {
  const c = (id: string) => cmd(app, id)
  return [
    {
      id: 'file',
      label: 'menu.file',
      items: () => [
        c('file.new'),
        c('file.newWindow'),
        separator(),
        c('file.open'),
        c('file.openFolder'),
        separator(),
        c('file.quickOpen'),
        recentMenu(app),
        c('file.reload'),
        separator(),
        c('file.save'),
        c('file.saveAs'),
        separator(),
        c('file.properties'),
        c('file.reveal'),
        c('file.revealSidebar'),
        c('file.delete'),
        separator(),
        sub(app, 'file.export', ['file.exportHtml', 'file.exportHtmlPlain', 'file.exportPdf'], 'menu-export'),
        c('file.print'),
        separator(),
        c('file.prefs'),
        separator(),
        c('file.close')
      ]
    },
    {
      id: 'edit',
      label: 'menu.edit',
      items: () => [
        c('edit.undo'),
        c('edit.redo'),
        separator(),
        c('edit.cut'),
        c('edit.copy'),
        c('edit.paste'),
        separator(),
        c('edit.copyPlain'),
        c('edit.copyMarkdown'),
        c('edit.copyHtml'),
        c('edit.pastePlain'),
        separator(),
        c('edit.selectAll'),
        sub(app, 'edit.selection', ['edit.selectWord', 'edit.selectLine', 'edit.selectScope']),
        c('edit.moveUp'),
        c('edit.moveDown'),
        c('edit.delete'),
        separator(),
        sub(app, 'edit.findMenu', ['edit.find', 'edit.replace', null, 'edit.findNext', 'edit.findPrev'])
      ]
    },
    {
      id: 'paragraph',
      label: 'menu.paragraph',
      items: () => [
        c('para.h1'),
        c('para.h2'),
        c('para.h3'),
        c('para.h4'),
        c('para.h5'),
        c('para.h6'),
        separator(),
        c('para.paragraph'),
        separator(),
        c('para.headingUp'),
        c('para.headingDown'),
        separator(),
        c('para.table'),
        c('para.mathBlock'),
        c('para.codeBlock'),
        separator(),
        c('para.quote'),
        separator(),
        c('para.orderedList'),
        c('para.bulletList'),
        c('para.taskList'),
        c('para.toggleTask'),
        sub(app, 'para.listIndent', ['para.indent', 'para.outdent']),
        separator(),
        c('para.insertBefore'),
        c('para.insertAfter'),
        separator(),
        c('para.footnote'),
        separator(),
        c('para.hr'),
        c('para.toc'),
        c('para.frontmatter')
      ]
    },
    {
      id: 'format',
      label: 'menu.format',
      items: () => [
        c('fmt.strong'),
        c('fmt.em'),
        c('fmt.underline'),
        c('fmt.code'),
        separator(),
        c('fmt.strike'),
        separator(),
        c('fmt.link'),
        c('fmt.image'),
        separator(),
        c('fmt.clear')
      ]
    },
    {
      id: 'view',
      label: 'menu.view',
      items: () => [
        c('view.sidebar'),
        c('view.outline'),
        c('view.files'),
        c('view.search'),
        separator(),
        c('view.source'),
        c('view.readonly'),
        separator(),
        c('view.focus'),
        c('view.typewriter'),
        separator(),
        c('view.statusBar'),
        c('view.fullWidth'),
        separator(),
        c('view.fullscreen'),
        c('view.alwaysOnTop'),
        separator(),
        c('view.zoomReset'),
        c('view.zoomIn'),
        c('view.zoomOut'),
        separator(),
        c('view.devtools')
      ]
    },
    {
      id: 'themes',
      label: 'menu.themes',
      items: () => [c('theme.dark-2026'), separator(), c('theme.clair'), c('theme.papier')]
    },
    {
      id: 'help',
      label: 'menu.help',
      items: () => [c('help.markdown'), c('help.shortcuts'), separator(), c('help.about')]
    }
  ]
}
