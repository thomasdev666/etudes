// Blocs visuels des fiches : schémas (étapes, cycle, carte autour d'une notion) et encadrés.
// Rendus en HTML simple + CSS : identiques dans l'éditeur, le partage et l'export PDF.
import { mergeAttributes, Node } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

export const DIAGRAM_KINDS = ['flow', 'cycle', 'tree'] as const
export const CALLOUT_TONES = ['example', 'key', 'warning', 'figure'] as const

export const Diagram = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: 'flow', parseHTML: (el) => el.getAttribute('data-kind') ?? 'flow', renderHTML: () => ({}) },
      title: { default: '', parseHTML: (el) => el.querySelector('.diagram-title')?.textContent ?? '', renderHTML: () => ({}) },
      items: { default: [], parseHTML: (el) => [...el.querySelectorAll('li')].map((li) => li.textContent ?? ''), renderHTML: () => ({}) },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="diagram"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const kind = DIAGRAM_KINDS.includes(node.attrs.kind) ? node.attrs.kind : 'flow'
    const items = (node.attrs.items as string[]) ?? []
    const title = String(node.attrs.title ?? '')
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'diagram', 'data-kind': kind, class: `diagram diagram-${kind}` }),
      ...(title ? [['p', { class: 'diagram-title' }, title]] : []),
      ['ol', {}, ...items.map((i) => ['li', {}, ['span', {}, i]])],
    ]
  },

  // Texte brut (recherche, aperçu) : « A → B → C »
  renderText({ node }) {
    const items = (node.attrs.items as string[]) ?? []
    return [node.attrs.title, items.join(node.attrs.kind === 'tree' ? ', ' : ' → ')].filter(Boolean).join(' : ')
  },

  // Double-clic : modifier les cases du schéma (séparées par « ; »)
  addProseMirrorPlugins() {
    const type = this.type
    return [
      new Plugin({
        props: {
          handleDoubleClickOn(view, _pos, node, nodePos) {
            if (node.type !== type) return false
            const next = prompt('Cases du schéma, séparées par « ; »', (node.attrs.items as string[]).join(' ; '))
            if (next === null) return true
            const items = next.split(';').map((s) => s.trim()).filter(Boolean)
            view.dispatch(view.state.tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, items }))
            return true
          },
        },
      }),
    ]
  },
})

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return { tone: { default: 'key', parseHTML: (el) => el.getAttribute('data-tone') ?? 'key', renderHTML: (a) => ({ 'data-tone': a.tone }) } }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'callout' }), 0]
  },
})
