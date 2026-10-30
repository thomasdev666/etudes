import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { girafaAnswer, isDocumentRequest, type GirafaEvent } from './index'

// Faux Gemini : chaque appel renvoie la suite de morceaux prévue, au format SSE
function sse(parts: string[], sources?: { uri: string; title: string }[]) {
  const lines = parts.map((t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`)
  if (sources) lines.push(`data: ${JSON.stringify({ candidates: [{ groundingMetadata: { groundingChunks: sources.map((web) => ({ web })) } }] })}\n\n`)
  return new Response(new ReadableStream({ start: (c) => (lines.forEach((l) => c.enqueue(new TextEncoder().encode(l))), c.close()) }), { status: 200 })
}

const run = async (o: Parameters<typeof girafaAnswer>[0]) => {
  const out: GirafaEvent[] = []
  for await (const e of girafaAnswer(o)) out.push(e)
  return out
}

describe('GIRAFA en direct', () => {
  const calls: { body: string }[] = []
  let replies: Response[] = []
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test'
    calls.length = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => (calls.push({ body: init.body }), replies.shift()!)))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('répond d’après les cours, mot à mot, avec les sources', async () => {
    replies = [sse(['Le **fonds', ' de roulement** est…'])]
    const ev = await run({ question: 'c’est quoi le fonds de roulement ?', history: [], passages: 'extrait', titles: ['Séance 2'] })
    expect(ev[0]).toEqual({ t: 'meta', from: 'courses', sources: ['Séance 2'] })
    expect(ev.filter((e) => e.t === 'delta').map((e) => (e as { text: string }).text).join('')).toBe('Le **fonds de roulement** est…')
  })

  it('bascule sur Internet quand les cours ne suffisent pas', async () => {
    replies = [sse(['[WE', 'B]']), sse(['Le théorème…'], [{ uri: 'https://fr.wikipedia.org', title: 'wikipedia' }])]
    const ev = await run({ question: 'théorème de Pythagore ?', history: [], passages: 'extrait', titles: ['Séance 2'] })
    expect(ev[0]).toEqual({ t: 'meta', from: 'web', sources: [] })
    expect(ev).toContainEqual({ t: 'delta', text: 'Le théorème…' })
    expect(ev.at(-1)).toEqual({ t: 'web', sources: [{ uri: 'https://fr.wikipedia.org', title: 'wikipedia' }] })
    expect(JSON.parse(calls[1].body).tools).toEqual([{ google_search: {} }])
  })

  it('va directement sur Internet si aucun cours n’en parle', async () => {
    replies = [sse(['Réponse web'])]
    const ev = await run({ question: 'capitale de l’Australie ?', history: [], passages: '', titles: [] })
    expect(calls).toHaveLength(1)
    expect(ev[0]).toEqual({ t: 'meta', from: 'web', sources: [] })
  })

  it('reconnaît une demande de document sans appeler l’IA', async () => {
    replies = []
    const ev = await run({ question: 'je veux que tu me fasses une liste complète des formules en analyse financière', history: [], passages: 'x', titles: [] })
    expect(ev).toEqual([{ t: 'doc', instruction: 'je veux que tu me fasses une liste complète des formules en analyse financière' }])
    expect(calls).toHaveLength(0)
    expect(isDocumentRequest('c’est quoi le BFR ?')).toBe(false)
    expect(isDocumentRequest('fais-moi une fiche sur le BFR')).toBe(true)
  })

  it('passe au modèle suivant si le premier est saturé', async () => {
    replies = [new Response('quota', { status: 429 }), sse(['OK'])]
    const ev = await run({ question: 'BFR ?', history: [], passages: 'x', titles: [] })
    expect(ev).toContainEqual({ t: 'delta', text: 'OK' })
  })
})

describe('historique envoyé à Gemini', () => {
  it('commence par l’étudiant et alterne les rôles', async () => {
    const { toContents } = await import('./index')
    const c = toContents([{ from: 'bot', text: 'Salut' }, { from: 'me', text: 'fais une fiche' }, { from: 'me', text: 'BFR ?' }, { from: 'bot', text: 'Le BFR…' }], 'et le FR ?')
    expect(c.map((x) => x.role)).toEqual(['user', 'model', 'user'])
    expect(c[0].text).toBe('fais une fiche\n\nBFR ?')
  })
})

describe('erreurs de Google', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test'
  })
  afterEach(() => vi.unstubAllGlobals())
  it('quota par minute atteint partout : message clair', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Resource exhausted', { status: 429 })))
    await expect(run({ question: 'BFR ?', history: [], passages: 'x', titles: [] })).rejects.toThrow(/limite par minute/)
  })
  it('clé refusée : message qui le dit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('API key not valid', { status: 403 })))
    await expect(run({ question: 'BFR ?', history: [], passages: 'x', titles: [] })).rejects.toThrow(/clé Gemini est refusée/)
  })
})
