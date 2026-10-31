import { afterEach, describe, expect, it, vi } from 'vitest'

// Faux Gemini : enregistre la consigne envoyée et répond avec un QCM valide
function fakeGemini(bodies: string[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/models?')) return new Response(JSON.stringify({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] }))
    bodies.push(String(init?.body ?? ''))
    const questions = Array.from({ length: 5 }, (_, i) => ({
      question: `Question ${i} sur le BFR ?`,
      correct_answer: 'Bonne réponse',
      wrong_answers: ['Piège 1', 'Piège 2', 'Piège 3'],
      explanation: 'Le BFR mesure le besoin de financement du cycle d’exploitation.',
      notion: 'BFR',
      source_excerpt: 'Le BFR mesure le besoin.',
    }))
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ questions }) }] }, finishReason: 'STOP' }] }))
  })
}

describe('QCM inspiré des anciens partiels', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('envoie les anciens partiels comme modèles, séparés du cours', async () => {
    process.env.GEMINI_API_KEY = 'test'
    const bodies: string[] = []
    vi.stubGlobal('fetch', fakeGemini(bodies))
    const { generateQuiz } = await import('./index')
    const qs = await generateQuiz({ source: 'Le BFR mesure le besoin. '.repeat(20), count: 5, difficulty: 'hard', qtype: 'mcq', examples: '## Partiel 2024\nExercice 1 (6 points) : calculez le BFR de la société Alpha.' })
    expect(qs).toHaveLength(5)
    const sent = bodies.join('\n')
    expect(sent).toContain('ANCIENS PARTIELS')
    expect(sent).toContain('calculez le BFR de la société Alpha')
    expect(sent).toContain('Ne recopie jamais une question')
    // Le cours vient après les modèles
    expect(sent.indexOf('ANCIENS PARTIELS')).toBeLessThan(sent.indexOf('=== COURS ==='))
  })

  it('sans partiel, la consigne ne change pas', async () => {
    process.env.GEMINI_API_KEY = 'test'
    const bodies: string[] = []
    vi.stubGlobal('fetch', fakeGemini(bodies))
    const { generateQuiz } = await import('./index')
    await generateQuiz({ source: 'Le BFR mesure le besoin. '.repeat(20), count: 5, difficulty: 'medium', qtype: 'mcq' })
    expect(bodies.join('\n')).not.toContain('ANCIENS PARTIELS')
  })
})
