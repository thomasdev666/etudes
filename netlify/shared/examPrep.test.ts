import { describe, expect, it } from 'vitest'
import { pickGroups } from './examPrep'

const row = (id: string, passage: string | null, t: number) => ({ id, passage_id: passage, question: id, created_at: new Date(2026, 0, 1, 0, t).toISOString() })

describe('préparation des épreuves', () => {
  it('prend des textes entiers jamais vus, dans l’ordre', () => {
    const rows = [row('a1', 'A', 1), row('a2', 'A', 1), row('b1', 'B', 2), row('b2', 'B', 2), row('c1', 'C', 3), row('c2', 'C', 3)]
    expect(pickGroups(rows, new Set(['a1', 'a2']), 4)).toEqual(['b1', 'b2', 'c1', 'c2'])
  })
  it('prend des questions isolées', () => {
    expect(pickGroups([row('x', null, 1), row('y', null, 2), row('z', null, 3)], new Set(['y']), 2)).toEqual(['x', 'z'])
  })
})
