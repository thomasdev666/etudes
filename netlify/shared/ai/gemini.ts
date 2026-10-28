// Fournisseur Google Gemini (offre gratuite). Seul fichier qui connaît l'API Gemini.
import { RetryableAiError, type AiProvider, type JsonRequest, type JsonSchema } from './types'

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
    async generateJson({ system, prompt, schema, images = [], temperature = 0.4 }: JsonRequest) {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [
            {
              role: 'user',
              parts: [...images.map((i) => ({ inlineData: { mimeType: i.mime, data: i.base64 } })), { text: prompt }],
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
        // Quota journalier épuisé : inutile d'attendre
        if (/per ?day|PerDay/i.test(body)) throw new Error("Quota gratuit de l'IA épuisé pour aujourd'hui. Réessaie demain.")
        throw new RetryableAiError('Limite par minute atteinte', 20_000)
      }
      if (res.status === 503 || res.status === 500 || res.status === 504) {
        throw new RetryableAiError(`Service IA surchargé (${res.status})`, 4000)
      }
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Erreur du service IA (${res.status}) : ${body.slice(0, 300)}`)
      }
      const data = await res.json()
      const text: string | undefined = data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('')
      if (!text) throw new RetryableAiError('Réponse vide du service IA', 2000)
      return JSON.parse(text)
    },
  }
}
