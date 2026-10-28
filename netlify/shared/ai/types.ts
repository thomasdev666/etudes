// Schéma de sortie au format OpenAPI simplifié (compris par Gemini, OpenAI et Anthropic)
export type JsonSchema = {
  type: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean'
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  description?: string
  enum?: string[]
}

export type JsonRequest = {
  system: string
  prompt: string
  schema: JsonSchema
  temperature?: number
}

export interface AiProvider {
  name: string
  generateJson(req: JsonRequest): Promise<unknown>
}
