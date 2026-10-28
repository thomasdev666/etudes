// Couche IA unique. Pour changer de fournisseur, ajouter un fichier à côté de gemini.ts
// et le sélectionner ici : le reste du code n'appelle que getAi() et les générateurs.
import { z } from 'zod'
import { createGeminiProvider } from './gemini'
import type { AiProvider, JsonSchema } from './types'

export function getAi(): AiProvider {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY n'est pas configurée sur Netlify")
  return createGeminiProvider(key, process.env.GEMINI_MODEL || 'gemini-flash-latest')
}

// Limite raisonnable de texte source envoyé (≈ 75 000 tokens)
export const MAX_SOURCE_CHARS = 300_000

export type Difficulty = 'easy' | 'medium' | 'hard'
export type QuizType = 'mcq' | 'truefalse'

const DIFFICULTY_FR: Record<Difficulty, string> = {
  easy: 'facile : définitions et notions de base',
  medium: 'moyen : compréhension et application des notions',
  hard: "difficile : raisonnement, cas pratiques, pièges courants d'examen",
}

// ---------------------------------------------------------------- QCM

const quizSchema: JsonSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          correct_index: { type: 'integer' },
          explanation: { type: 'string' },
          notion: { type: 'string', description: 'Notion du cours évaluée, en 2 à 5 mots' },
        },
        required: ['question', 'choices', 'correct_index', 'explanation', 'notion'],
      },
    },
  },
  required: ['questions'],
}

const questionValidator = (qtype: QuizType) =>
  z
    .object({
      question: z.string().trim().min(5),
      choices: z.array(z.string().trim().min(1)).length(qtype === 'mcq' ? 4 : 2),
      correct_index: z.number().int().min(0).max(qtype === 'mcq' ? 3 : 1),
      explanation: z.string().trim().min(1),
      notion: z.string().trim().min(1).max(120),
    })
    .refine((q) => new Set(q.choices.map((c) => c.toLowerCase())).size === q.choices.length, {
      message: 'Choix en double',
    })

export type GeneratedQuestion = z.infer<ReturnType<typeof questionValidator>>

export function validateQuiz(raw: unknown, qtype: QuizType, count: number, minCount: number) {
  const parsed = z.object({ questions: z.array(z.unknown()) }).parse(raw)
  const valid: GeneratedQuestion[] = []
  for (const q of parsed.questions) {
    const r = questionValidator(qtype).safeParse(q)
    if (r.success) valid.push(r.data)
  }
  if (valid.length < minCount) {
    throw new Error(`Seulement ${valid.length} questions valides sur ${count} demandées`)
  }
  return valid.slice(0, count)
}

export async function generateQuiz(opts: {
  source: string
  count: number
  difficulty: Difficulty
  qtype: QuizType
}): Promise<GeneratedQuestion[]> {
  const ai = getAi()
  const format =
    opts.qtype === 'mcq'
      ? 'QCM à 4 choix, une seule bonne réponse, distracteurs plausibles et de longueur comparable'
      : 'Vrai ou faux : choices vaut exactement ["Vrai", "Faux"] (ou ["True", "False"] si le cours est en anglais), correct_index 0 pour vrai et 1 pour faux'
  const system = [
    "Tu es un enseignant d'école de commerce qui prépare ses étudiants aux examens.",
    'Tu crées des questions qui testent la compréhension réelle, uniquement à partir du cours fourni.',
    "N'invente aucun fait absent du cours. Ne reprends jamais un sujet officiel publié.",
    'Rédige questions, choix et explications dans la langue du cours.',
    "L'explication dit pourquoi la bonne réponse est juste et pourquoi le piège principal est faux.",
    'Varie la position de la bonne réponse et couvre tout le cours, pas seulement le début.',
  ].join('\n')
  const prompt = [
    `Génère exactement ${opts.count} questions.`,
    `Format : ${format}.`,
    `Difficulté : ${DIFFICULTY_FR[opts.difficulty]}.`,
    '',
    '=== COURS ===',
    opts.source.slice(0, MAX_SOURCE_CHARS),
  ].join('\n')

  // Une tentative, puis un nouvel essai en cas de JSON invalide.
  // Au second essai on accepte un peu moins de questions (cours court).
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await ai.generateJson({ system, prompt, schema: quizSchema })
      const min = attempt === 0 ? opts.count : Math.min(opts.count, 5)
      return validateQuiz(raw, opts.qtype, opts.count, min)
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Génération impossible')
}

// ---------------------------------------------------------------- Flash cards

const cardsSchema: JsonSchema = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: { front: { type: 'string' }, back: { type: 'string' } },
        required: ['front', 'back'],
      },
    },
  },
  required: ['cards'],
}

const cardValidator = z.object({
  front: z.string().trim().min(2).max(500),
  back: z.string().trim().min(1).max(1500),
})

export async function generateFlashcards(opts: { source: string; count: number }) {
  const ai = getAi()
  const system = [
    'Tu crées des flash cards de révision efficaces (principe du rappel actif).',
    'Une seule idée par carte. Recto : une question précise. Verso : réponse courte et exacte.',
    'Uniquement à partir du texte fourni, dans sa langue.',
    'Privilégie définitions, formules, chiffres clés, auteurs, distinctions entre notions proches.',
  ].join('\n')
  const prompt = `Crée ${opts.count} flash cards.\n\n=== COURS ===\n${opts.source.slice(0, MAX_SOURCE_CHARS)}`

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = z.object({ cards: z.array(z.unknown()) }).parse(
        await ai.generateJson({ system, prompt, schema: cardsSchema }),
      )
      const cards = raw.cards.flatMap((c) => {
        const r = cardValidator.safeParse(c)
        return r.success ? [r.data] : []
      })
      if (cards.length === 0) throw new Error('Aucune carte valide')
      return cards.slice(0, opts.count)
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Génération impossible')
}
