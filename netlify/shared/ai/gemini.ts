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

async function call(apiKey: string, model: string, { system, prompt, schema, images = [], temperature = 0.4, timeoutMs = 120_000 }: JsonRequest) {
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
            ...images.map((i) => ({
              inlineData: { mimeType: i.mime, data: i.base64 },
            })),
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature,
        responseMimeType: 'application/json',
        responseSchema: toGeminiSchema(schema),
      },
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
