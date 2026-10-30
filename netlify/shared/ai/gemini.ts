// Fournisseur Google Gemini (offre gratuite). Seul fichier qui connaît l'API Gemini.
import { ModelUnavailableError, QuotaAiError, RetryableAiError, type AiProvider, type JsonRequest, type JsonSchema } from './types'

// Gemini attend les types OpenAPI en majuscules (OBJECT, STRING…)
function toGeminiSchema(s: JsonSchema): Record<string, unknown> {
  return {
    ...s,
    type: s.type.toUpperCase(),
    ...(s.items && { items: toGeminiSchema(s.items) }),
    ...(s.properties && {
      properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)])),
    }),
  }
}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export function createGeminiProvider(apiKey: string, model: string): AiProvider {
  return {
    name: `gemini:${model}`,
    async generateJson(req: JsonRequest) {
      try {
        return await call(apiKey, model, req)
      } catch (e) {
        // Réponse trop lente : on passe à un autre modèle plutôt que d'attendre indéfiniment
        if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new RetryableAiError(`Délai dépassé (${model})`, 0)
        throw e
      }
    },
  }
}

async function call(apiKey: string, model: string, { system, prompt, schema, images = [], temperature = 0.4, timeoutMs = 120_000, webSearch }: JsonRequest) {
  const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
    signal: AbortSignal.timeout(timeoutMs),
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: 'user',
          parts: [
            ...images.map((i) => ('fileUri' in i ? { fileData: { mimeType: i.mime, fileUri: i.fileUri } } : { inlineData: { mimeType: i.mime, data: i.base64 } })),
            { text: prompt },
          ],
        },
      ],
      // La recherche Google ne se combine pas avec une réponse JSON imposée : texte libre dans ce cas
      ...(webSearch
        ? { tools: [{ google_search: {} }], generationConfig: { temperature } }
        : { generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) } }),
    }),
  })
  if (res.status === 429) {
    const body = await res.text()
    throw new QuotaAiError(`Quota atteint pour ${model}`, /per ?day|PerDay/i.test(body))
  }
  if (res.status === 404 || (res.status === 400 && /not (found|supported)|unsupported|is not available/i.test(await res.clone().text()))) {
    throw new ModelUnavailableError(`Modèle indisponible : ${model}`)
  }
  if (res.status === 503 || res.status === 500 || res.status === 504) {
    throw new RetryableAiError(`Service IA surchargé (${res.status})`, 4000)
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Erreur du service IA (${res.status}) : ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) throw new RetryableAiError('Réponse vide du service IA', 2000)
  if (webSearch) {
    const chunks: { web?: { uri?: string; title?: string } }[] = data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
    const sources = chunks.flatMap((c) => (c.web?.uri ? [{ title: c.web.title ?? c.web.uri, uri: c.web.uri }] : []))
    return { text: text.trim(), sources }
  }
  try {
    return JSON.parse(text)
  } catch {
    // Réponse coupée (trop longue) : un autre modèle fera mieux
    throw new RetryableAiError('Réponse incomplète du service IA', 0)
  }
}

type ListedModel = { name: string; supportedGenerationMethods?: string[] }

// Modèles « Flash » texte disponibles pour cette clé (chacun a son propre quota gratuit)
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${ENDPOINT}?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Liste des modèles indisponible (${res.status})`)
  const data = (await res.json()) as { models?: ListedModel[] }
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-(\d+(\.\d+)?-)?flash(-lite)?(-latest|-preview(-[\w-]+)?|-\d{3})?$/.test(n))
    .filter((n) => !/image|tts|audio|live|thinking|exp/i.test(n))
}

// Dépôt d'un fichier (audio long) chez Google : gardé 48 h, utilisable par tous les modèles du projet
export async function uploadGeminiFile(apiKey: string, bytes: Uint8Array<ArrayBuffer>, mime: string, displayName: string) {
  const start = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': mime,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 100) } }),
    signal: AbortSignal.timeout(30_000),
  })
  const url = start.headers.get('x-goog-upload-url')
  if (!start.ok || !url) throw new Error(`Envoi de l'audio au service IA impossible (${start.status})`)
  const done = await fetch(url, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: bytes,
    signal: AbortSignal.timeout(180_000),
  })
  if (!done.ok) throw new Error(`Envoi de l'audio au service IA impossible (${done.status})`)
  let file = ((await done.json()) as { file: { name: string; uri: string; state?: string } }).file
  // Le fichier est traité quelques secondes avant d'être utilisable
  for (let i = 0; i < 60 && file.state === 'PROCESSING'; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, { headers: { 'x-goog-api-key': apiKey } })
    if (res.ok) file = (await res.json()) as typeof file
  }
  if (file.state === 'FAILED') throw new Error('Le service IA n’a pas pu lire ce fichier audio')
  return { uri: file.uri, name: file.name }
}

export async function deleteGeminiFile(apiKey: string, name: string) {
  await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, { method: 'DELETE', headers: { 'x-goog-api-key': apiKey } }).catch(() => {})
}

// Réponse en continu (mot à mot) : texte au fil de l'eau, puis les sources Internet éventuelles
export type StreamChunk = { text?: string; sources?: { title: string; uri: string }[] }
export type StreamRequest = {
  system: string
  contents: { role: 'user' | 'model'; text: string }[]
  webSearch?: boolean
  temperature?: number
  signal?: AbortSignal
}

export async function* streamGemini(apiKey: string, model: string, req: StreamRequest): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${ENDPOINT}/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    signal: req.signal,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
      ...(req.webSearch && { tools: [{ google_search: {} }] }),
      generationConfig: { temperature: req.temperature ?? 0.3, maxOutputTokens: 1200 },
    }),
  })
  if (res.status === 429) throw new QuotaAiError(`Quota atteint pour ${model}`, /per ?day|PerDay/i.test(await res.text()))
  if (res.status === 404) throw new ModelUnavailableError(`Modèle indisponible : ${model}`)
  if (res.status === 400) {
    const body = (await res.text()).slice(0, 300)
    if (/not (found|supported)|unsupported|is not available/i.test(body)) throw new ModelUnavailableError(`Modèle indisponible : ${model}`)
    throw new Error(`Requête refusée par Google (400, ${model}) : ${body}`)
  }
  if (res.status === 401 || res.status === 403) throw new Error(`La clé Gemini est refusée par Google (${res.status}) : vérifie GEMINI_API_KEY sur Netlify.`)
  if (!res.ok || !res.body) throw new RetryableAiError(`Service IA indisponible (${res.status})`, 0)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = JSON.parse(line.slice(5))
      const cand = data?.candidates?.[0]
      const text = (cand?.content?.parts ?? []).map((p: { text?: string; thought?: boolean }) => (p.thought ? '' : (p.text ?? ''))).join('')
      if (text) yield { text }
      const chunks: { web?: { uri?: string; title?: string } }[] = cand?.groundingMetadata?.groundingChunks ?? []
      if (chunks.length) yield { sources: chunks.flatMap((c) => (c.web?.uri ? [{ title: c.web.title ?? c.web.uri, uri: c.web.uri }] : [])) }
    }
  }
}
