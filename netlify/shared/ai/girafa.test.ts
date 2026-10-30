import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { girafaAnswer, isDocumentRequest, rankModels, type GirafaEvent } from './index'
import { extractJson, listGeminiModels } from './gemini'

// Liste de modèles renvoyée par Google pour la clé (comme en vrai : images, voix, intégration… à écarter)
const LIST = {
  models: [
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.0-flash',
    'gemini-3-flash-preview', 'gemma-3-27b-it', 'gemma-3-4b-it', 'gemini-2.5-flash-image', 'gemini-2.5-flash-preview-tts', 'gemini-2.0-flash-thinking-exp',
  ].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })),
}
const isList = (url: string) => url.includes('pageSize')

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
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => (isList(url) ? Response.json(LIST) : (calls.push({ body: init.body }), replies.shift()!))))
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
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (isList(url) ? Response.json(LIST) : new Response('Resource exhausted', { status: 429 }))))
    await expect(run({ question: 'BFR ?', history: [], passages: 'x', titles: [] })).rejects.toThrow(/limite par minute/)
  })
  it('clé refusée : message qui le dit', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (isList(url) ? Response.json(LIST) : new Response('API key not valid', { status: 403 }))))
    await expect(run({ question: 'BFR ?', history: [], passages: 'x', titles: [] })).rejects.toThrow(/clé Gemini est refusée/)
  })
})

describe('tous les modèles gratuits de la clé', () => {
  it('garde les modèles de texte (Gemini et Gemma), écarte images, voix et expérimentaux', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(LIST)))
    const names = await listGeminiModels('k')
    expect(names).toContain('gemini-2.5-pro')
    expect(names).toContain('gemma-3-27b-it')
    expect(names).toContain('gemini-3-flash-preview')
    expect(names).not.toContain('gemini-2.5-flash-image')
    expect(names).not.toContain('gemini-2.5-flash-preview-tts')
    expect(names).not.toContain('gemini-2.0-flash-thinking-exp')
    vi.unstubAllGlobals()
  })
  it('ordonne selon l’usage', () => {
    const all = ['gemma-3-4b-it', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemma-3-27b-it', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3-flash-preview']
    const fast = rankModels(all, 'fast')
    expect(fast.slice(0, 2)).toEqual(['gemini-flash-lite-latest', 'gemini-2.5-flash-lite'])
    expect(fast.indexOf('gemma-3-27b-it')).toBeLessThan(fast.indexOf('gemma-3-4b-it'))
    expect(fast.at(-1)).toBe('gemini-2.5-pro')
    expect(rankModels(all, 'quality')[0]).toBe('gemini-2.5-flash')
    expect(rankModels(all, 'web').some((m) => m.startsWith('gemma'))).toBe(false)
  })
  it('lit le JSON renvoyé en texte par Gemma', () => {
    expect(extractJson('Voici :\n```json\n{"a": [1, 2]}\n```')).toEqual({ a: [1, 2] })
  })
})

describe('quand tout Gemini est épuisé', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test'
  })
  afterEach(() => vi.unstubAllGlobals())
  it('répond quand même avec Gemma, en le signalant (culture générale)', async () => {
    const bodies: { model: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        if (isList(url)) return Response.json(LIST)
        const model = url.match(/models\/([^:]+)/)![1]
        bodies.push({ model, body: JSON.parse(init.body) })
        return model.startsWith('gemma') ? sse(['Réponse de Gemma']) : new Response('quota', { status: 429 })
      }),
    )
    const ev = await run({ question: 'capitale de l’Australie ?', history: [], passages: '', titles: [] })
    expect(ev).toContainEqual({ t: 'meta', from: 'general', sources: [] })
    expect(ev).toContainEqual({ t: 'delta', text: 'Réponse de Gemma' })
    // Recherche Internet : jamais demandée à Gemma ; Gemma reçoit la consigne dans le message
    expect(bodies.filter((b) => b.body.tools).every((b) => !b.model.startsWith('gemma'))).toBe(true)
    const g = bodies.find((b) => b.model.startsWith('gemma'))!
    expect(g.body.systemInstruction).toBeUndefined()
    expect(JSON.stringify(g.body.contents)).toContain('GIRAFA')
    // Tous les modèles Gemini ont été essayés avant Gemma
    expect(new Set(bodies.filter((b) => !b.model.startsWith('gemma')).map((b) => b.model)).size).toBeGreaterThanOrEqual(5)
  })
})

describe('générations (QCM, fiches…) : rotation des modèles', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test'
  })
  afterEach(() => vi.unstubAllGlobals())
  it('un modèle qui refuse ou est épuisé laisse la place au suivant, jusqu’à Gemma', async () => {
    const { getAi } = await import('./index')
    const tried: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (isList(url)) return Response.json(LIST)
        const model = url.match(/models\/([^:]+)/)![1]
        tried.push(model)
        if (model === 'gemma-3-27b-it') return Response.json({ candidates: [{ content: { parts: [{ text: '```json\n{"ok": true}\n```' }] } }] })
        return tried.length % 2 ? new Response('quota', { status: 429 }) : new Response('Image input is not enabled for this model', { status: 400 })
      }),
    )
    const out = await getAi({ quick: true }).generateJson({ system: 's', prompt: 'p', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
    expect(out).toEqual({ ok: true })
    expect(tried.at(-1)).toBe('gemma-3-27b-it')
    expect(tried.length).toBeGreaterThanOrEqual(5)
  })
})

describe('balise recopiée par un modèle', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test'
  })
  afterEach(() => vi.unstubAllGlobals())
  it('n’affiche jamais [WEB] dans une réponse Internet', async () => {
    const replies = [sse(['[WE', 'B] Le théorème…'])]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (isList(url) ? Response.json(LIST) : replies.shift() ?? sse(['x']))))
    const ev = await run({ question: 'Pythagore ?', history: [], passages: '', titles: [] })
    const text = ev.filter((e) => e.t === 'delta').map((e) => (e as { text: string }).text).join('')
    expect(text).toBe('Le théorème…')
  })
})
