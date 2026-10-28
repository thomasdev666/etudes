// Couche IA unique. Pour changer de fournisseur, ajouter un fichier à côté de gemini.ts
// et l'ajouter dans getAi() : le reste du code n'appelle que getAi() et les générateurs.
import { z } from 'zod'
import { createGeminiProvider } from './gemini'
import { RetryableAiError, type AiProvider, type JsonRequest, type JsonSchema } from './types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Fournisseur résilient : nouvelles tentatives si le service est surchargé,
// puis bascule sur un modèle de secours plus léger.
export function getAi(): AiProvider {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY n'est pas configurée sur Netlify")
  const models = [process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-flash-lite-latest']
  const providers = [...new Set(models)].map((m) => createGeminiProvider(key, m))
  return {
    name: providers.map((p) => p.name).join(' > '),
    async generateJson(req: JsonRequest) {
      let last: unknown
      for (const p of providers) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await p.generateJson(req)
          } catch (e) {
            last = e
            if (!(e instanceof RetryableAiError)) throw e
            await sleep(e.waitMs * (attempt + 1))
          }
        }
      }
      throw new Error(
        last instanceof Error && /surchargé|Limite/.test(last.message)
          ? 'Le service IA de Google est saturé en ce moment. Réessaie dans quelques minutes.'
          : last instanceof Error
            ? last.message
            : 'Génération impossible',
      )
    },
  }
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

// ---------------------------------------------------------------- Images de cours

const imagesSchema: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, text: { type: 'string' } },
        required: ['index', 'text'],
      },
    },
  },
  required: ['items'],
}

// Transcrit le contenu utile des images (formules, schémas, tableaux) pour qu'il
// serve ensuite aux QCM, flash cards et cartes mentales.
export async function describeImages(images: { mime: string; base64: string; label: string }[], context: string) {
  const ai = getAi()
  const system = [
    "Tu transcris le contenu pédagogique d'images extraites d'un support de cours d'école de commerce.",
    'Pour chaque image : formules en LaTeX entre $...$, tableaux en lignes « col1 | col2 », schémas et graphiques décrits en 1 à 4 phrases (axes, tendances, chiffres clés), texte recopié.',
    'Image décorative (logo, photo d’illustration, fond) : renvoie un texte vide.',
    'Écris dans la langue du cours. Ne commente pas, transcris.',
  ].join('\n')
  const prompt = [
    `Il y a ${images.length} images, numérotées de 0 à ${images.length - 1} dans l'ordre : ${images.map((im, i) => `${i} = ${im.label}`).join(', ')}.`,
    'Contexte (texte du cours, extrait) :',
    context.slice(0, 4000),
  ].join('\n')
  const raw = z
    .object({ items: z.array(z.object({ index: z.number().int(), text: z.string() })) })
    .parse(await ai.generateJson({ system, prompt, schema: imagesSchema, images, temperature: 0.1 }))
  return raw.items
}

// ---------------------------------------------------------------- Cartes mentales

export type MindNode = { title: string; detail?: string; children?: MindNode[] }

const leaf: JsonSchema = {
  type: 'object',
  properties: { title: { type: 'string' }, detail: { type: 'string' } },
  required: ['title'],
}
const level = (child: JsonSchema): JsonSchema => ({
  type: 'object',
  properties: { title: { type: 'string' }, detail: { type: 'string' }, children: { type: 'array', items: child } },
  required: ['title'],
})
const mindmapSchema = level(level(level(level(leaf))))

const nodeValidator: z.ZodType<MindNode> = z.lazy(() =>
  z.object({
    title: z.string().trim().min(1).max(200),
    detail: z.string().trim().max(600).optional(),
    children: z.array(nodeValidator).optional(),
  }),
)

export async function generateMindmap(opts: { source: string; title: string }): Promise<MindNode> {
  const ai = getAi()
  const system = [
    "Tu construis des cartes mentales de révision détaillées et bien structurées pour des étudiants d'école de commerce.",
    'Racine : le thème du cours. 4 à 8 branches principales qui suivent la logique du cours.',
    'Chaque branche se décompose en sous-notions, puis en détails : définitions, formules (LaTeX entre $...$), exemples, chiffres clés, auteurs, avantages / limites.',
    'title : 2 à 8 mots. detail : une phrase courte qui explique, seulement si utile.',
    'Uniquement à partir du contenu fourni, dans sa langue. Couvre tout le contenu.',
  ].join('\n')
  const prompt = `Thème : ${opts.title}\n\n=== CONTENU ===\n${opts.source.slice(0, MAX_SOURCE_CHARS)}`
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const root = nodeValidator.parse(await ai.generateJson({ system, prompt, schema: mindmapSchema, temperature: 0.3 }))
      if (!root.children?.length) throw new Error('Carte mentale vide')
      return root
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Génération impossible')
}
