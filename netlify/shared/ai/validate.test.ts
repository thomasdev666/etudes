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

describe('entraînements : questions générées', () => {
  it('nettoie les lettres et écarte les questions mal formées', async () => {
    const { validateExamBatch } = await import('./index')
    const items = validateExamBatch(
      {
        items: [
          {
            passage: '',
            questions: [
              { question: 'Combien font 15 % de 80 ?', choices: ['A. 10', 'B. 12', 'C. 14', 'D. 15', 'E. 16'], correct_index: 1, explanation: '0,15 × 80 = 12' },
              { question: 'Question à 4 choix', choices: ['1', '2', '3', '4'], correct_index: 0, explanation: '' },
              { question: 'Index hors limites', choices: ['1', '2', '3', '4', '5'], correct_index: 7, explanation: '' },
            ],
          },
        ],
      },
      { key: 'calcul', choices: 5 },
    )
    expect(items[0].questions).toHaveLength(1)
    expect(items[0].questions[0].choices[1]).toBe('12')
  })
  it('garde un texte seulement avec toutes ses questions', async () => {
    const { validateExamBatch } = await import('./index')
    const q = { question: 'Q ?', choices: ['a', 'b', 'c', 'd'], correct_index: 0, explanation: '' }
    const long = 'Texte suffisamment long pour être un vrai document de travail.'
    expect(() => validateExamBatch({ items: [{ passage: long, questions: [q, q] }] }, { key: 'part7', choices: 4, perPassage: 3 })).toThrow()
    expect(validateExamBatch({ items: [{ passage: long, questions: [q, q, q] }] }, { key: 'part7', choices: 4, perPassage: 3 })).toHaveLength(1)
  })
})

describe('QCM : bonne réponse écrite en toutes lettres, place tirée au sort', () => {
  const nq = (over: Record<string, unknown> = {}) => ({
    question: 'Que regroupe le capital économique ?',
    correct_answer: 'Le montant des besoins à financer',
    wrong_answers: ['Les capitaux propres', 'Le total des dettes', 'La somme des résultats'],
    explanation: 'Le capital économique regroupe les besoins de financement de l’outil productif.',
    notion: 'Capital économique',
    source_excerpt: 'Le CE représente les besoins à financer.',
    ...over,
  })
  it('place la bonne réponse à un endroit différent selon le tirage, et l’indice suit', async () => {
    const { validateQuiz } = await import('./index')
    const positions = new Set<number>()
    for (let k = 0; k < 4; k++) {
      const rand = () => (k + 0.5) / 4
      const [q] = validateQuiz({ questions: [nq()] }, 'mcq', 1, 1, rand)
      expect(q.choices).toHaveLength(4)
      expect(q.choices[q.correct_index]).toBe('Le montant des besoins à financer')
      positions.add(q.correct_index)
    }
    expect(positions.size).toBeGreaterThan(1)
  })
  it('répartit les bonnes réponses sur A, B, C et D', async () => {
    const { validateQuiz } = await import('./index')
    const qs = validateQuiz({ questions: Array.from({ length: 400 }, () => nq()) }, 'mcq', 400, 400)
    const counts = [0, 0, 0, 0]
    for (const q of qs) counts[q.correct_index]++
    for (const c of counts) expect(c).toBeGreaterThan(60)
  })
  it('refuse une question sans 3 pièges distincts', async () => {
    const { validateQuiz } = await import('./index')
    expect(() => validateQuiz({ questions: [nq({ wrong_answers: ['Le total des dettes', 'le total des dettes', 'Le montant des besoins à financer'] })] }, 'mcq', 1, 1)).toThrow()
  })
  it('vrai/faux : ordre fixe, la bonne réponse dit laquelle', async () => {
    const { validateQuiz } = await import('./index')
    const [f] = validateQuiz({ questions: [nq({ correct_answer: 'Faux', wrong_answers: ['Vrai'] })] }, 'truefalse', 1, 1)
    expect(f.choices).toEqual(['Vrai', 'Faux'])
    expect(f.correct_index).toBe(1)
    const [t] = validateQuiz({ questions: [nq({ correct_answer: 'True', wrong_answers: ['False'] })] }, 'truefalse', 1, 1)
    expect(t.choices).toEqual(['True', 'False'])
    expect(t.correct_index).toBe(0)
  })
  it('retire la réflexion de l’IA laissée dans l’explication', async () => {
    const { cleanExplanation } = await import('./index')
    const raw =
      "Le capital économique regroupe l'ensemble des besoins de financement nécessaires pour faire fonctionner l'outil productif (immobilisations, BFR et trésorerie positive). Note : L'index de cette réponse est 2 dans ce choix, mais vérifions l'ordre : 0: capitaux propres, 1: montant des besoins..., 2: total des dettes, 3: somme... Attendez, la bonne réponse est 'Le montant en euros des besoins à financer...' qui correspond à l'index 1."
    expect(cleanExplanation(raw)).toBe(
      "Le capital économique regroupe l'ensemble des besoins de financement nécessaires pour faire fonctionner l'outil productif (immobilisations, BFR et trésorerie positive).",
    )
    // Le vocabulaire du cours n'est pas touché
    const ok = "L'indice de sécurité mesure la marge de baisse possible du CA. La réponse B est un piège classique."
    expect(cleanExplanation(ok)).toBe("L'indice de sécurité mesure la marge de baisse possible du CA.")
  })
})
