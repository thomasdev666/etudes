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
