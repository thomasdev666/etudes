// Schéma de sortie au format OpenAPI simplifié (compris par Gemini, OpenAI et Anthropic)
export type JsonSchema = {
  type: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean'
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  description?: string
  enum?: string[]
  // ordre de génération des champs (Gemini)
  propertyOrdering?: string[]
}

// Image ou audio : envoyé dans la requête (base64) ou déjà déposé chez le fournisseur (fileUri)
export type InlineImage = { mime: string; base64: string } | { mime: string; fileUri: string }

export type JsonRequest = {
  system: string
  prompt: string
  schema: JsonSchema
  images?: InlineImage[]
  temperature?: number
  // délai maximal d'un appel avant de passer à un autre modèle
  timeoutMs?: number
  // Réponse en texte libre appuyée sur une recherche Internet : le résultat est alors
  // { text, sources: { title, uri }[] } au lieu d'un JSON conforme au schéma
  webSearch?: boolean
}

export type WebAnswer = { text: string; sources: { title: string; uri: string }[] }

export interface AiProvider {
  name: string
  generateJson(req: JsonRequest): Promise<unknown>
}

// Erreur temporaire (service surchargé, quota par minute) : on peut réessayer
export class RetryableAiError extends Error {
  constructor(
    message: string,
    public waitMs = 3000,
  ) {
    super(message)
  }
}

// Quota épuisé pour ce modèle (par minute ou par jour) : on passe à un autre modèle
export class QuotaAiError extends Error {
  constructor(
    message: string,
    public daily: boolean,
  ) {
    super(message)
  }
}

// Modèle inconnu ou indisponible pour cette clé : on l'écarte
export class ModelUnavailableError extends Error {}
