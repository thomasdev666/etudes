import { describe, expect, it } from 'vitest'
import { mistakesInstruction } from './mistakesSheet'

const c = (notion: string, ok: boolean, chosen: number | null = ok ? 0 : 1) => ({
  question_id: notion, question: `Q sur ${notion}`, choices: ['Bonne', 'Fausse'], correct_index: 0, chosen_index: chosen, is_correct: ok, explanation: '', notion, time_ms: null,
})

describe('mistakesInstruction', () => {
  it('sépare les acquis et les erreurs', () => {
    const s = mistakesInstruction('Finance', [c('BFR', true), c('VAN', false), c('TRI', false, null)])
    expect(s).toContain('Notions réussies : BFR.')
    expect(s).toContain('Notion : VAN')
    expect(s).toContain('Ma réponse : Fausse')
    expect(s).toContain('Ma réponse : pas de réponse')
    expect(s).toContain('Bonne réponse : Bonne')
    expect(s).not.toContain('Notion : BFR')
  })
})
