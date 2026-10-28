// Opérations sur l'arbre d'une carte mentale (immuables, testées)
import type { MindNode } from './types'

export type Node = { id: string; title: string; detail?: string; collapsed?: boolean; children?: Node[] }

const newId = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))

export function withIds(n: MindNode): Node {
  return { ...n, id: n.id ?? newId(), children: n.children?.map(withIds) }
}

export function newNode(title = 'Nouvelle idée'): Node {
  return { id: newId(), title }
}

type Loc = { parent: Node | null; index: number; node: Node }

export function locate(root: Node, id: string, parent: Node | null = null, index = 0): Loc | null {
  if (root.id === id) return { parent, index, node: root }
  for (const [i, c] of (root.children ?? []).entries()) {
    const r = locate(c, id, root, i)
    if (r) return r
  }
  return null
}

// Remplace un nœud par le résultat de fn (null = supprimer)
function mapNode(root: Node, id: string, fn: (n: Node) => Node): Node {
  if (root.id === id) return fn(root)
  if (!root.children) return root
  return { ...root, children: root.children.map((c) => mapNode(c, id, fn)) }
}

export function update(root: Node, id: string, patch: Partial<Pick<Node, 'title' | 'detail' | 'collapsed'>>): Node {
  return mapNode(root, id, (n) => ({ ...n, ...patch }))
}

export function addChild(root: Node, parentId: string, child: Node = newNode()): [Node, string] {
  return [mapNode(root, parentId, (n) => ({ ...n, collapsed: false, children: [...(n.children ?? []), child] })), child.id]
}

export function addSibling(root: Node, id: string, sibling: Node = newNode()): [Node, string] {
  const loc = locate(root, id)
  if (!loc?.parent) return addChild(root, id, sibling)
  const parent = loc.parent
  const children = [...(parent.children ?? [])]
  children.splice(loc.index + 1, 0, sibling)
  return [mapNode(root, parent.id, (n) => ({ ...n, children })), sibling.id]
}

export function remove(root: Node, id: string): [Node, string | null] {
  const loc = locate(root, id)
  if (!loc?.parent) return [root, null] // la racine ne se supprime pas
  const siblings = loc.parent.children ?? []
  const next = siblings[loc.index + 1]?.id ?? siblings[loc.index - 1]?.id ?? loc.parent.id
  return [mapNode(root, loc.parent.id, (n) => ({ ...n, children: siblings.filter((c) => c.id !== id) })), next]
}

export function move(root: Node, id: string, dir: -1 | 1): Node {
  const loc = locate(root, id)
  if (!loc?.parent) return root
  const children = [...(loc.parent.children ?? [])]
  const j = loc.index + dir
  if (j < 0 || j >= children.length) return root
  ;[children[loc.index], children[j]] = [children[j], children[loc.index]]
  return mapNode(root, loc.parent.id, (n) => ({ ...n, children }))
}

// Devient enfant du frère précédent
export function indent(root: Node, id: string): Node {
  const loc = locate(root, id)
  if (!loc?.parent || loc.index === 0) return root
  const prev = loc.parent.children![loc.index - 1]
  const without = mapNode(root, loc.parent.id, (n) => ({ ...n, children: n.children!.filter((c) => c.id !== id) }))
  return mapNode(without, prev.id, (n) => ({ ...n, collapsed: false, children: [...(n.children ?? []), loc.node] }))
}

// Remonte d'un niveau, juste après son ancien parent
export function outdent(root: Node, id: string): Node {
  const loc = locate(root, id)
  if (!loc?.parent) return root
  const grand = locate(root, loc.parent.id)
  if (!grand?.parent) return root
  const without = mapNode(root, loc.parent.id, (n) => ({ ...n, children: n.children!.filter((c) => c.id !== id) }))
  return mapNode(without, grand.parent.id, (n) => {
    const children = [...(n.children ?? [])]
    children.splice(grand.index + 1, 0, loc.node)
    return { ...n, children }
  })
}

export function toOutline(n: MindNode, depth = 0): string {
  const line = `${'  '.repeat(depth)}${depth ? '- ' : ''}${n.title}${n.detail ? ` : ${n.detail}` : ''}`
  return [line, ...(n.children ?? []).map((c) => toOutline(c, depth + 1))].join('\n')
}
