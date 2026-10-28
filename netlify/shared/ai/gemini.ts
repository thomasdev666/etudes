// Fournisseur Google Gemini (offre gratuite). Seul fichier qui connaît l'API Gemini.
import type { AiProvider, JsonRequest, JsonSchema } from './types'

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
    async generateJson({ system, prompt, schema, temperature = 0.4 }: JsonRequest) {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            responseMimeType: 'application/json',
            responseSchema: toGeminiSchema(schema),
          },
        }),
      })
      if (res.status === 429) {
        throw new Error("Limite gratuite de l'IA atteinte pour le moment. Réessaie dans une minute.")
      }
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Erreur du service IA (${res.status}) : ${body.slice(0, 300)}`)
      }
      const data = await res.json()
      const text: string | undefined = data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('')
      if (!text) throw new Error("Réponse vide du service IA")
      return JSON.parse(text)
    },
  }
}
