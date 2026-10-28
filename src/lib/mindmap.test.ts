import { describe, expect, it } from 'vitest'
import { addChild, addSibling, indent, locate, move, outdent, remove, update, withIds, type Node } from './mindmap'

const tree = (): Node =>
  withIds({
    id: 'r',
    title: 'Finance',
    children: [
      { id: 'a', title: 'Valorisation', children: [{ id: 'a1', title: 'DCF' }, { id: 'a2', title: 'Multiples' }] },
      { id: 'b', title: 'Financement' },
    ],
  })

const titles = (n: Node | undefined) => (n?.children ?? []).map((c) => c.title)

describe('carte mentale', () => {
  it('ajoute un enfant et un frère', () => {
    const [t1] = addChild(tree(), 'b', { id: 'b1', title: 'Dette' })
    expect(titles(locate(t1, 'b')!.node)).toEqual(['Dette'])
    const [t2] = addSibling(t1, 'a1', { id: 'x', title: 'APV' })
    expect(titles(locate(t2, 'a')!.node)).toEqual(['DCF', 'APV', 'Multiples'])
  })

  it('supprime un nœud mais jamais la racine', () => {
    const [t, next] = remove(tree(), 'a1')
    expect(titles(locate(t, 'a')!.node)).toEqual(['Multiples'])
    expect(next).toBe('a2')
    expect(remove(t, 'r')[0]).toBe(t)
  })

  it('déplace, décale et remonte', () => {
    expect(titles(move(tree(), 'b', -1))).toEqual(['Financement', 'Valorisation'])
    const ind = indent(tree(), 'b')
    expect(titles(ind)).toEqual(['Valorisation'])
    expect(titles(locate(ind, 'a')!.node)).toEqual(['DCF', 'Multiples', 'Financement'])
    const out = outdent(tree(), 'a2')
    expect(titles(out)).toEqual(['Valorisation', 'Multiples', 'Financement'])
  })

  it('ne modifie jamais l’arbre d’origine', () => {
    const t = tree()
    const before = JSON.stringify(t)
    update(t, 'a1', { title: 'changé' })
    addChild(t, 'a')
    remove(t, 'b')
    indent(t, 'b')
    expect(JSON.stringify(t)).toBe(before)
  })
})
