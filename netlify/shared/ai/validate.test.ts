import { describe, expect, it } from 'vitest'
import { validateQuiz } from './index'

const q = (over: Record<string, unknown> = {}) => ({
  question: 'Que mesure le WACC ?',
  choices: ['Le coût du capital', 'La rentabilité', 'Le BFR', 'La marge'],
  correct_index: 0,
  explanation: 'Le WACC est le coût moyen pondéré du capital.',
  notion: 'WACC',
  ...over,
})

describe('validation du JSON de QCM', () => {
  it('accepte un JSON correct et coupe au nombre demandé', () => {
    expect(validateQuiz({ questions: [q(), q(), q()] }, 'mcq', 2, 2)).toHaveLength(2)
  })
  it('écarte les questions mal formées', () => {
    const raw = { questions: [q(), q({ choices: ['a', 'b'] }), q({ correct_index: 7 }), q({ choices: ['a', 'a', 'b', 'c'] }), { foo: 1 }] }
    expect(validateQuiz(raw, 'mcq', 5, 1)).toHaveLength(1)
  })
  it('échoue s’il manque trop de questions (déclenche le nouvel essai)', () => {
    expect(() => validateQuiz({ questions: [q()] }, 'mcq', 10, 10)).toThrow()
  })
  it('échoue sur un JSON sans tableau questions', () => {
    expect(() => validateQuiz({ items: [] }, 'mcq', 5, 5)).toThrow()
  })
  it('vrai/faux : exactement 2 choix', () => {
    const tf = q({ choices: ['Vrai', 'Faux'], correct_index: 1 })
    expect(validateQuiz({ questions: [tf] }, 'truefalse', 1, 1)).toHaveLength(1)
    expect(() => validateQuiz({ questions: [q()] }, 'truefalse', 1, 1)).toThrow()
  })
})

describe('carte mentale', () => {
  it('raccourcit une explication trop longue au lieu de rejeter la carte', async () => {
    const { nodeValidator } = await import('./index')
    const root = nodeValidator.parse({ title: 'Place', children: [{ title: 'A', detail: 'x'.repeat(900) }] })
    expect(root.children![0].detail!.length).toBe(600)
  })
})

describe('carte mentale : réponses mal formées', () => {
  it('retrouve la carte enveloppée ou des branches mal nommées', async () => {
    const { unwrapRoot } = await import('./index')
    expect(unwrapRoot({ mindmap: { title: 'T', children: [{ title: 'A' }] } })).toEqual({ title: 'T', children: [{ title: 'A' }] })
    expect(unwrapRoot({ title: 'T', branches: [{ title: 'A' }] })).toMatchObject({ children: [{ title: 'A' }] })
  })
})
