// Commandes ProseMirror de Plume (blocs, insertions, sélection, déplacement).
import { Fragment, type Node as PmNode, type NodeType, type Schema } from '@milkdown/kit/prose/model'
import { NodeSelection, Selection, TextSelection, type Command, type EditorState } from '@milkdown/kit/prose/state'
import { lift, setBlockType, wrapIn } from '@milkdown/kit/prose/commands'
import { liftListItem, sinkListItem, wrapInList } from '@milkdown/kit/prose/schema-list'

/** Profondeur du bloc de texte courant (ou du bloc de code, etc.). */
function textblockDepth(state: EditorState): number {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).isTextblock) return d
  return $from.depth
}

export function currentBlock(state: EditorState): { node: PmNode; pos: number; depth: number } | null {
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.isBlock) {
    return { node: selection.node, pos: selection.from, depth: selection.$from.depth + 1 }
  }
  const d = textblockDepth(state)
  if (d === 0) return null
  return { node: selection.$from.node(d), pos: selection.$from.before(d), depth: d }
}

export const setHeading =
  (level: number): Command =>
  (state, dispatch) => {
    const heading = state.schema.nodes.heading
    const block = currentBlock(state)
    if (block?.node.type === heading && block.node.attrs.level === level) {
      return setBlockType(state.schema.nodes.paragraph)(state, dispatch)
    }
    return setBlockType(heading, { level })(state, dispatch)
  }

export const setParagraph: Command = (state, dispatch) => setBlockType(state.schema.nodes.paragraph)(state, dispatch)

export const shiftHeading =
  (delta: 1 | -1): Command =>
  (state, dispatch) => {
    const block = currentBlock(state)
    if (!block) return false
    const { heading, paragraph } = state.schema.nodes
    if (block.node.type === paragraph) {
      // Monter d'un niveau depuis un paragraphe donne un titre 6.
      return delta === 1 ? setBlockType(heading, { level: 6 })(state, dispatch) : false
    }
    if (block.node.type !== heading) return false
    const level = (block.node.attrs.level as number) - delta
    if (level > 6) return setBlockType(paragraph)(state, dispatch)
    if (level < 1) return false
    return setBlockType(heading, { level })(state, dispatch)
  }

/**
 * Insère un bloc de type `type` : remplace le paragraphe courant s'il est vide,
 * sinon l'ajoute après le bloc courant ; place le curseur dedans.
 */
export function insertBlock(type: NodeType, attrs: Record<string, unknown> = {}, text = ''): Command {
  return (state, dispatch) => {
    const block = currentBlock(state)
    const node = type.create(attrs, text ? state.schema.text(text) : undefined)
    let tr = state.tr
    let insertAt: number
    if (block && block.node.type === state.schema.nodes.paragraph && block.node.content.size === 0) {
      tr = tr.replaceWith(block.pos, block.pos + block.node.nodeSize, node)
      insertAt = block.pos
    } else {
      insertAt = block ? block.pos + block.node.nodeSize : state.selection.to
      tr = tr.insert(insertAt, node)
    }
    if (node.isAtom) {
      // Les nœuds atomiques (TOC) sont suivis d'un paragraphe pour continuer à écrire.
      const after = insertAt + node.nodeSize
      if (!tr.doc.nodeAt(after)) tr = tr.insert(after, state.schema.nodes.paragraph.create())
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)))
    } else {
      tr = tr.setSelection(TextSelection.create(tr.doc, insertAt + 1 + node.content.size))
    }
    dispatch?.(tr.scrollIntoView())
    return true
  }
}

export const insertCodeBlock =
  (language = ''): Command =>
  (state, dispatch) =>
    insertBlock(state.schema.nodes.code_block, { language })(state, dispatch)

export const insertMathBlock: Command = (state, dispatch) => insertBlock(state.schema.nodes.math_block)(state, dispatch)

export const insertToc: Command = (state, dispatch) => insertBlock(state.schema.nodes.toc)(state, dispatch)

export const insertHr: Command = (state, dispatch) => insertBlock(state.schema.nodes.hr)(state, dispatch)

export function hasFrontmatter(state: EditorState): boolean {
  return state.doc.firstChild?.type.name === 'frontmatter'
}

/** Ajoute l'en-tête YAML en tête de document, ou y place le curseur s'il existe. */
export const toggleFrontmatter: Command = (state, dispatch) => {
  let tr = state.tr
  if (!hasFrontmatter(state)) tr = tr.insert(0, state.schema.nodes.frontmatter.create())
  tr = tr.setSelection(TextSelection.create(tr.doc, 1 + tr.doc.firstChild!.content.size))
  dispatch?.(tr.scrollIntoView())
  return true
}

export function createTable(schema: Schema, header: string[], bodyRows = 1): PmNode {
  const { table, table_header_row, table_row, table_header, table_cell, paragraph } = schema.nodes
  const cell = (type: NodeType, text: string) => type.create(null, paragraph.create(null, text ? schema.text(text) : undefined))
  const head = table_header_row.create(
    null,
    header.map((h) => cell(table_header, h))
  )
  const rows = Array.from({ length: bodyRows }, () =>
    table_row.create(
      null,
      header.map(() => cell(table_cell, ''))
    )
  )
  return table.create(null, [head, ...rows])
}

export const insertTable =
  (cols = 3, rows = 2): Command =>
  (state, dispatch) => {
    const node = createTable(state.schema, Array(cols).fill(''), rows)
    const block = currentBlock(state)
    let tr = state.tr
    let at: number
    if (block && block.node.type === state.schema.nodes.paragraph && block.node.content.size === 0 && block.depth === 1) {
      tr = tr.replaceWith(block.pos, block.pos + block.node.nodeSize, node)
      at = block.pos
    } else {
      at = block ? block.pos + block.node.nodeSize : state.selection.to
      tr = tr.insert(at, node)
    }
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)))
    dispatch?.(tr.scrollIntoView())
    return true
  }

/** Insère un paragraphe vide avant ou après le bloc de premier niveau courant. */
export const insertParagraph =
  (where: 'before' | 'after'): Command =>
  (state, dispatch) => {
    const { $from } = state.selection
    const depth = Math.max(1, Math.min($from.depth, 1))
    const pos = where === 'before' ? $from.before(depth) : $from.after(depth)
    const tr = state.tr.insert(pos, state.schema.nodes.paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, pos + 1))
    dispatch?.(tr.scrollIntoView())
    return true
  }

/** Note de bas de page : référence au curseur et définition en fin de document. */
export const insertFootnote: Command = (state, dispatch) => {
  const { footnote_reference, footnote_definition, paragraph } = state.schema.nodes
  if (!footnote_reference || !footnote_definition) return false
  const used = new Set<string>()
  state.doc.descendants((n) => {
    if (n.type === footnote_reference || n.type === footnote_definition) used.add(String(n.attrs.label))
  })
  let n = 1
  while (used.has(String(n))) n++
  const label = String(n)
  let tr = state.tr.replaceSelectionWith(footnote_reference.create({ label }), false)
  const end = tr.doc.content.size
  tr = tr.insert(end, footnote_definition.create({ label }, paragraph.create()))
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(end + 2)))
  dispatch?.(tr.scrollIntoView())
  return true
}

export const toggleBlockquote: Command = (state, dispatch) => {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'blockquote') return lift(state, dispatch)
  return wrapIn(state.schema.nodes.blockquote)(state, dispatch)
}

function inList(state: EditorState, listName: string): number | null {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === listName) return d
  return null
}

export const toggleList =
  (kind: 'bullet_list' | 'ordered_list' | 'task'): Command =>
  (state, dispatch) => {
    const listName = kind === 'task' ? 'bullet_list' : kind
    const type = state.schema.nodes[listName]
    const depth = inList(state, listName)
    const isTask = (d: number) => state.selection.$from.node(d + 1)?.attrs.checked != null
    if (depth !== null && (kind !== 'task' || isTask(depth)) && (kind === 'task' || !isTask(depth))) {
      return liftListItem(state.schema.nodes.list_item)(state, dispatch)
    }
    if (depth !== null && kind === 'task') {
      // Liste à puces existante : on bascule les éléments en tâches.
      const listPos = state.selection.$from.before(depth)
      const list = state.doc.nodeAt(listPos)!
      const tr = state.tr
      list.forEach((item, offset) => tr.setNodeMarkup(listPos + 1 + offset, undefined, { ...item.attrs, checked: false }))
      dispatch?.(tr)
      return true
    }
    if (!wrapInList(type)(state)) return false
    if (!dispatch) return true
    return wrapInList(type)(state, (tr) => {
      if (kind === 'task') {
        const d = tr.selection.$from.depth
        for (let i = d; i > 0; i--) {
          const n = tr.selection.$from.node(i)
          if (n.type.name === 'list_item') {
            tr.setNodeMarkup(tr.selection.$from.before(i), undefined, { ...n.attrs, checked: false })
            break
          }
        }
      }
      dispatch(tr)
    })
  }

export const indentList: Command = (state, dispatch) => sinkListItem(state.schema.nodes.list_item)(state, dispatch)
export const outdentList: Command = (state, dispatch) => liftListItem(state.schema.nodes.list_item)(state, dispatch)

/** Coche/décoche la tâche courante. */
export const toggleTask: Command = (state, dispatch) => {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (n.type.name === 'list_item' && n.attrs.checked != null) {
      dispatch?.(state.tr.setNodeMarkup($from.before(d), undefined, { ...n.attrs, checked: !n.attrs.checked }))
      return true
    }
  }
  return false
}

/** Déplace le bloc de premier niveau courant vers le haut ou le bas. */
export const moveBlock =
  (dir: -1 | 1): Command =>
  (state, dispatch) => {
    const { $from } = state.selection
    if ($from.depth < 1) return false
    const index = $from.index(0)
    const target = index + dir
    if (target < 0 || target >= state.doc.childCount) return false
    const node = state.doc.child(index)
    const other = state.doc.child(target)
    const start = $from.before(1)
    const offsetInNode = state.selection.from - start
    let tr = state.tr
    if (dir === -1) {
      const otherStart = start - other.nodeSize
      tr = tr.replaceWith(otherStart, start + node.nodeSize, Fragment.from([node, other]))
      tr = tr.setSelection(Selection.near(tr.doc.resolve(otherStart + offsetInNode)))
    } else {
      const end = start + node.nodeSize + other.nodeSize
      tr = tr.replaceWith(start, end, Fragment.from([other, node]))
      tr = tr.setSelection(Selection.near(tr.doc.resolve(start + other.nodeSize + offsetInNode)))
    }
    dispatch?.(tr.scrollIntoView())
    return true
  }

export const selectWord: Command = (state, dispatch) => {
  const { $head } = state.selection
  const text = $head.parent.textBetween(0, $head.parent.content.size, '\u0000', '\u0000')
  let a = $head.parentOffset
  let b = a
  const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c)
  while (a > 0 && isWord(text[a - 1])) a--
  while (b < text.length && isWord(text[b])) b++
  if (a === b) return false
  const start = $head.start()
  dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, start + a, start + b)))
  return true
}

export const selectLine: Command = (state, dispatch) => {
  const { $from } = state.selection
  if (!$from.parent.isTextblock) return false
  dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, $from.start(), $from.end())))
  return true
}

export const selectScope: Command = (state, dispatch) => {
  const block = currentBlock(state)
  if (!block) return false
  const { $from } = state.selection
  const depth = state.selection instanceof NodeSelection ? block.depth - 1 : block.depth
  if (depth < 1) return false
  dispatch?.(state.tr.setSelection(NodeSelection.create(state.doc, $from.before(depth))))
  return true
}

export const clearFormat: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection
  if (empty) return false
  dispatch?.(state.tr.removeMark(from, to))
  return true
}

export const toggleMarkByName =
  (name: string, attrs?: Record<string, unknown>): Command =>
  (state, dispatch) => {
    const type = state.schema.marks[name]
    if (!type) return false
    const { from, to, empty, $from } = state.selection
    if (empty) {
      const stored = state.storedMarks ?? $from.marks()
      const tr = type.isInSet(stored) ? state.tr.removeStoredMark(type) : state.tr.addStoredMark(type.create(attrs))
      dispatch?.(tr)
      return true
    }
    const has = state.doc.rangeHasMark(from, to, type)
    dispatch?.(has ? state.tr.removeMark(from, to, type) : state.tr.addMark(from, to, type.create(attrs)))
    return true
  }

/** Nom du type de bloc courant, pour l'étiquette du menu contextuel. */
export function blockKind(state: EditorState): string {
  const block = currentBlock(state)
  if (!block) return 'paragraph'
  if (block.node.type.name === 'heading') return `h${block.node.attrs.level}`
  return block.node.type.name
}
