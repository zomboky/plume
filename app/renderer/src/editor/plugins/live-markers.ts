// Affiche les marqueurs Markdown (« ## », « ** », « ` »…) seulement pour l'élément
// qui contient le curseur ; ailleurs le texte reste entièrement rendu.
import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Mark, Node as PmNode, ResolvedPos } from '@milkdown/kit/prose/model'

export const liveMarkersKey = new PluginKey('plume-live-markers')

function markerFor(mark: Mark): [string, string] | null {
  switch (mark.type.name) {
    case 'strong': {
      const m = (mark.attrs.marker as string) || '*'
      return [m + m, m + m]
    }
    case 'emphasis': {
      const m = (mark.attrs.marker as string) || '*'
      return [m, m]
    }
    case 'inlineCode':
      return ['`', '`']
    case 'strike_through':
      return ['~~', '~~']
    case 'link': {
      const title = mark.attrs.title ? ` "${mark.attrs.title}"` : ''
      return ['[', `](${mark.attrs.href}${title})`]
    }
    default:
      return null
  }
}

/** Étendue continue (dans le bloc) portant `mark` autour de `pos`, ou null. */
function markRange($pos: ResolvedPos, mark: Mark): { from: number; to: number } | null {
  const parent = $pos.parent
  const start = $pos.start()
  const ranges: { from: number; to: number }[] = []
  let current: { from: number; to: number } | null = null
  parent.forEach((child: PmNode, offset: number) => {
    const from = start + offset
    const to = from + child.nodeSize
    if (mark.isInSet(child.marks)) {
      if (current && current.to === from) current.to = to
      else {
        current = { from, to }
        ranges.push(current)
      }
    } else current = null
  })
  return ranges.find((r) => r.from <= $pos.pos && $pos.pos <= r.to) ?? null
}

export function buildMarkerDecorations(state: EditorState): DecorationSet {
  const { selection, doc } = state
  const $head = selection.$head
  const decos: Decoration[] = []
  const parent = $head.parent
  if (!parent.isTextblock) return DecorationSet.empty

  // Marqueur de bloc : titres.
  if (parent.type.name === 'heading') {
    const level = parent.attrs.level as number
    decos.push(Decoration.widget($head.start(), () => widgetEl('#'.repeat(level) + ' '), { side: -1, key: `h${level}`, marks: [] }))
  }
  // Bloc focalisé (utilisé aussi par le mode focus).
  const depth = $head.depth
  const top = depth >= 1 ? $head.before(1) : null
  if (top !== null) {
    const topNode = doc.nodeAt(top)
    if (topNode) decos.push(Decoration.node(top, top + topNode.nodeSize, { class: 'is-focused-block' }))
  }

  // Marqueurs en ligne : marques présentes juste avant ou juste après le curseur.
  const seen: Mark[] = []
  const around = [$head.nodeBefore, $head.nodeAfter]
  for (const node of around) {
    for (const m of node?.marks ?? []) if (!seen.some((s) => s.eq(m))) seen.push(m)
  }
  seen.forEach((m, i) => {
    const text = markerFor(m)
    if (!text) return
    const range = markRange($head, m)
    if (!range) return
    decos.push(
      Decoration.widget(range.from, () => widgetEl(text[0]), { side: -1 - i, key: `o${i}${text[0]}`, marks: [] }),
      Decoration.widget(range.to, () => widgetEl(text[1]), { side: 1 + i, key: `c${i}${text[1]}`, marks: [] }),
      Decoration.inline(range.from, range.to, { class: 'is-focused-mark' })
    )
  })
  return DecorationSet.create(doc, decos)
}

function widgetEl(text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'md-marker'
  span.textContent = text
  span.setAttribute('contenteditable', 'false')
  return span
}

export const liveMarkers = $prose(
  () =>
    new Plugin({
      key: liveMarkersKey,
      state: {
        init: (_config, state) => buildMarkerDecorations(state),
        apply: (tr, value, _old, state) => (tr.docChanged || tr.selectionSet ? buildMarkerDecorations(state) : value)
      },
      props: {
        decorations(state) {
          return liveMarkersKey.getState(state) as DecorationSet
        }
      }
    })
)
