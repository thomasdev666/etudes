// Couche IA unique. Pour changer de fournisseur, ajouter un fichier à côté de gemini.ts
// et l'ajouter dans getAi() : le reste du code n'appelle que getAi() et les générateurs.
import { z } from 'zod'
import { createGeminiProvider, deleteGeminiFile, listGeminiModels, uploadGeminiFile } from './gemini'
import { ModelUnavailableError, QuotaAiError, RetryableAiError, type AiProvider, type JsonRequest, type JsonSchema } from './types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Ordre de préférence. Chaque modèle a son propre quota gratuit (par minute et par jour) :
// quand l'un est épuisé, on passe au suivant au lieu d'échouer.
const QUALITY = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite']
const BULK = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash']
const MAX_MODELS = 7

// Modèles écartés pour un moment (quota du jour épuisé, modèle inconnu), mémorisés tant que la fonction reste chaude
const benched = new Map<string, number>()
let discovered: Promise<string[]> | null = null

const version = (m: string) => Number(m.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0)

async function modelChain(key: string, bulk: boolean): Promise<string[]> {
  discovered ??= listGeminiModels(key).catch(() => [])
  const found = await discovered
  const lite = (m: string) => m.includes('lite')
  // Les plus récents d'abord ; « lite » en premier pour les gros volumes (lecture d'images)
  const extra = found
    .filter((m) => !m.includes('preview'))
    .sort((a, b) => (bulk ? Number(lite(b)) - Number(lite(a)) : Number(lite(a)) - Number(lite(b))) || version(b) - version(a))
  const base = bulk ? BULK : QUALITY
  const preferred = process.env.GEMINI_MODEL && !bulk ? [process.env.GEMINI_MODEL] : []
  const chain = [...new Set([...preferred, ...base.slice(0, 1), ...extra, ...base])]
  const now = Date.now()
  return chain.filter((m) => (benched.get(m) ?? 0) < now).slice(0, MAX_MODELS)
}

export function getAi(opts: { quick?: boolean; bulk?: boolean; budgetMs?: number } = {}): AiProvider {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY n'est pas configurée sur Netlify")
  // quick : un seul tour (fonctions qui doivent répondre en quelques secondes)
  const rounds = opts.quick ? 1 : 3
  // Au-delà, on abandonne avec un message clair plutôt que de laisser tourner
  const budgetMs = opts.budgetMs ?? (opts.quick ? 25_000 : 6 * 60_000)
  return {
    name: 'gemini',
    async generateJson(req: JsonRequest) {
      let last: unknown
      let dailyOnly = true
      const deadline = Date.now() + budgetMs
      for (let round = 0; round < rounds && Date.now() < deadline; round++) {
        const models = await modelChain(key, !!opts.bulk)
        if (!models.length) break
        for (const m of models) {
          const left = deadline - Date.now()
          if (left < 5000) break
          try {
            return await createGeminiProvider(key, m).generateJson({ ...req, timeoutMs: Math.min(req.timeoutMs ?? 120_000, left) })
          } catch (e) {
            last = e
            if (e instanceof QuotaAiError) {
              if (e.daily) benched.set(m, Date.now() + 60 * 60_000)
              else dailyOnly = false
            } else if (e instanceof ModelUnavailableError) {
              benched.set(m, Date.now() + 24 * 60 * 60_000)
            } else if (e instanceof RetryableAiError) {
              dailyOnly = false
            } else throw e
          }
        }
        // Tous les modèles sont saturés pour la minute : on attend un peu avant un nouveau tour
        if (round < rounds - 1 && !dailyOnly && deadline - Date.now() > 30_000) await sleep(20_000)
      }
      if (last instanceof QuotaAiError && dailyOnly)
        throw new Error("Quota gratuit de l'IA épuisé pour aujourd'hui sur tous les modèles. Réessaie demain (remise à zéro vers 9 h).")
      throw new Error(
        last instanceof QuotaAiError || (last instanceof Error && /surchargé|Limite|Délai|incomplète/.test(last.message))
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
  const ai = getAi({ bulk: true })
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
// Les enfants sont obligatoires sur les niveaux du haut : sinon certains modèles
// renvoient le thème seul, sans aucune branche
const level = (child: JsonSchema, childrenRequired: boolean): JsonSchema => ({
  type: 'object',
  properties: { title: { type: 'string' }, detail: { type: 'string' }, children: { type: 'array', items: child } },
  required: childrenRequired ? ['title', 'children'] : ['title'],
  propertyOrdering: ['title', 'detail', 'children'],
})
// Racine → branches → sous-notions → détails : assez riche, et bien plus rapide à produire qu'un niveau de plus
const mindmapSchema = level(level(level(leaf, false), true), true)

const clip = (t: string, max: number) => (t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t)

export const nodeValidator: z.ZodType<MindNode, unknown> = z.lazy(() =>
  z.object({
    // Texte trop long : on le raccourcit plutôt que de rejeter toute la carte
    title: z.string().trim().min(1).transform((t) => clip(t, 200)),
    detail: z.string().trim().transform((t) => clip(t, 600)).optional(),
    children: z.array(nodeValidator).optional(),
  }),
)

// Une carte mentale résume : inutile d'envoyer un cours entier très long (plus lent)
const MINDMAP_SOURCE_CHARS = 120_000

// Certains modèles enveloppent la carte ({ "mindmap": {...} }) ou nomment autrement les branches
export function unwrapRoot(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const o = raw as Record<string, unknown>
  if (!('title' in o)) {
    const inner = Object.values(o).find((v) => v && typeof v === 'object' && !Array.isArray(v) && 'title' in (v as object))
    if (inner) return unwrapRoot(inner)
  }
  if (!Array.isArray(o.children)) {
    const list = Object.values(o).find((v) => Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'title' in x))
    if (list) return { ...o, children: list }
  }
  return o
}

export async function generateMindmap(opts: { source: string; title: string }): Promise<MindNode> {
  const ai = getAi()
  const system = [
    "Tu construis des cartes mentales de révision détaillées et bien structurées pour des étudiants d'école de commerce.",
    'Racine : le thème du cours. 4 à 8 branches principales qui suivent la logique du cours.',
    'Chaque branche se décompose en sous-notions, puis en détails : définitions, formules (LaTeX entre $...$), exemples, chiffres clés, auteurs, avantages / limites.',
    'title : 2 à 8 mots. detail : une phrase courte (moins de 200 caractères) qui explique, seulement si utile.',
    'Uniquement à partir du contenu fourni, dans sa langue. Couvre tout le contenu.',
  ].join('\n')
  const prompt = `Thème : ${opts.title}\n\n=== CONTENU ===\n${opts.source.slice(0, MINDMAP_SOURCE_CHARS)}`
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Au second essai, on commence par un autre modèle
      const model = attempt === 0 ? ai : getAi({ bulk: true })
      const root = nodeValidator.parse(unwrapRoot(await model.generateJson({ system, prompt, schema: mindmapSchema, temperature: 0.3 })))
      if (!root.children?.length) throw new Error('L’IA a renvoyé une carte mentale vide. Réessaie : un autre modèle sera utilisé.')
      return root
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Génération impossible')
}

// ---------------------------------------------------------------- Matières depuis l'agenda

const subjectsSchema: JsonSchema = {
  type: 'object',
  properties: {
    subjects: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } } },
        required: ['name', 'keywords'],
      },
    },
  },
  required: ['subjects'],
}

// Déduit la liste des matières à partir des titres des cours de l'emploi du temps
export async function subjectsFromTitles(titles: string[]) {
  const ai = getAi({ quick: true })
  const system = [
    "Tu reçois les titres d'événements de l'emploi du temps d'un étudiant d'école de commerce.",
    'Déduis-en la liste des matières (cours) distinctes. Fusionne les variantes (CM, TD, groupe, salle, examen) d’une même matière.',
    'name : nom clair et court de la matière, dans la langue d’origine, sans code ni type de séance.',
    'keywords : 1 à 3 morceaux de texte EXACTS présents dans les titres d’origine qui permettent de reconnaître la matière (code du cours, nom tel qu’écrit).',
    'Ignore ce qui n’est pas un cours : réunions, événements associatifs, jours fériés, rendez-vous personnels.',
  ].join('\n')
  const raw = z
    .object({ subjects: z.array(z.object({ name: z.string().trim().min(1).max(80), keywords: z.array(z.string()) })) })
    .parse(await ai.generateJson({ system, prompt: titles.slice(0, 200).join('\n'), schema: subjectsSchema, temperature: 0.1 }))
  return raw.subjects
}

// ---------------------------------------------------------------- Fiches de révision

export type Sheet = {
  intro: string
  sections: { heading: string; points: string[]; subsections?: { heading: string; points: string[] }[] }[]
  definitions: { term: string; definition: string }[]
  formulas: { name: string; latex: string; explanation: string }[]
  pitfalls: string[]
  checklist: string[]
}

const pointsSchema: JsonSchema = { type: 'array', items: { type: 'string' } }
const sheetSchema: JsonSchema = {
  type: 'object',
  properties: {
    intro: { type: 'string', description: 'Le cours en 2 ou 3 phrases' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          points: pointsSchema,
          subsections: {
            type: 'array',
            items: { type: 'object', properties: { heading: { type: 'string' }, points: pointsSchema }, required: ['heading', 'points'] },
          },
        },
        required: ['heading', 'points'],
      },
    },
    definitions: {
      type: 'array',
      items: { type: 'object', properties: { term: { type: 'string' }, definition: { type: 'string' } }, required: ['term', 'definition'] },
    },
    formulas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, latex: { type: 'string', description: 'Formule en LaTeX, sans $' }, explanation: { type: 'string' } },
        required: ['name', 'latex', 'explanation'],
      },
    },
    pitfalls: pointsSchema,
    checklist: { type: 'array', items: { type: 'string' }, description: 'Ce que je dois savoir faire le jour de l’examen' },
  },
  required: ['intro', 'sections', 'definitions', 'formulas', 'pitfalls', 'checklist'],
}

const str = z.string().trim()
const sheetValidator = z.object({
  intro: str,
  sections: z
    .array(
      z.object({
        heading: str.min(1),
        points: z.array(str.min(1)),
        subsections: z.array(z.object({ heading: str.min(1), points: z.array(str.min(1)) })).optional(),
      }),
    )
    .min(1),
  definitions: z.array(z.object({ term: str.min(1), definition: str.min(1) })),
  formulas: z.array(z.object({ name: str, latex: str.min(1), explanation: str })),
  pitfalls: z.array(str.min(1)),
  checklist: z.array(str.min(1)),
})

export async function generateSheet(opts: { source: string; title: string }): Promise<Sheet> {
  const ai = getAi()
  const system = [
    "Tu rédiges des fiches de révision complètes et synthétiques pour des étudiants d'école de commerce.",
    'Suis le plan du cours. Chaque point : une idée, une phrase courte, les mots clés en **gras**.',
    'Garde tous les chiffres clés, exemples marquants, auteurs, dates et méthodes de calcul. Formules en LaTeX ($...$ dans le texte).',
    'definitions : les notions à connaître par cœur. formulas : seulement si le cours en contient. pitfalls : erreurs fréquentes à l’examen.',
    'checklist : 4 à 10 compétences vérifiables (« Savoir calculer… », « Savoir expliquer… »).',
    'Uniquement à partir du contenu fourni, dans sa langue. Ne laisse de côté aucune partie du cours.',
  ].join('\n')
  const prompt = `Cours : ${opts.title}\n\n=== CONTENU ===\n${opts.source.slice(0, MAX_SOURCE_CHARS)}`
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return sheetValidator.parse(await ai.generateJson({ system, prompt, schema: sheetSchema, temperature: 0.3 }))
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Génération impossible')
}

// ---------------------------------------------------------------- Transcription audio

export type Segment = { start: number; text: string }

// Au-delà, l'audio est déposé chez Google plutôt qu'envoyé dans la requête (limite 20 Mo)
export const INLINE_AUDIO_MAX = 14 * 1024 * 1024

export async function uploadAudio(bytes: Uint8Array<ArrayBuffer>, mime: string, name: string) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY n'est pas configurée sur Netlify")
  return uploadGeminiFile(key, bytes, mime, name)
}

export async function forgetAudio(name: string) {
  const key = process.env.GEMINI_API_KEY
  if (key) await deleteGeminiFile(key, name)
}

const segmentsSchema: JsonSchema = {
  type: 'object',
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Début du passage, au format mm:ss ou h:mm:ss depuis le début du fichier' },
          text: { type: 'string' },
        },
        required: ['start', 'text'],
        propertyOrdering: ['start', 'text'],
      },
    },
  },
  required: ['segments'],
}

// « 1:02:03 », « 62:03 » ou « 03 » → secondes
export function parseClock(s: string): number {
  const parts = s.trim().split(':').map((x) => Number(x))
  if (parts.some((n) => !Number.isFinite(n))) return 0
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${String(m).padStart(2, '0')}:${r}`
}

const LANG: Record<string, string> = {
  fr: 'Le cours est en français.',
  en: 'The lecture is in English: transcribe in English, do not translate.',
  auto: 'Détecte la langue parlée et transcris dans cette langue, sans traduire.',
}

// Transcrit un passage [from, to] (secondes) d'un audio. Les horodatages renvoyés
// sont relatifs au début du fichier.
export async function transcribeAudio(opts: {
  audio: { mime: string; base64: string } | { mime: string; fileUri: string }
  language: string
  subject: string
  from?: number
  to?: number
}): Promise<Segment[]> {
  const ai = getAi({ bulk: true, budgetMs: 4 * 60_000 })
  const system = [
    "Tu transcris des enregistrements de cours d'école de commerce, mot pour mot.",
    'Ne résume pas, ne traduis pas, ne commente pas. Retire seulement les hésitations (euh, hum) et les répétitions involontaires.',
    'Garde exactement le vocabulaire technique, les chiffres, les noms propres et les formules (en LaTeX entre $...$ si elles sont dictées).',
    'Découpe en passages de 20 secondes à 2 minutes, coupés aux changements d’idée, chacun avec l’horodatage de son début.',
    'Passage inaudible : [inaudible]. Aucune parole dans la partie demandée : renvoie une liste vide.',
  ].join('\n')
  const range =
    opts.from !== undefined && opts.to !== undefined
      ? `Transcris uniquement la partie de l'audio entre ${clock(opts.from)} et ${clock(opts.to)}. Les horodatages restent comptés depuis le début du fichier.`
      : "Transcris tout l'audio."
  const prompt = [range, LANG[opts.language] ?? LANG.auto, `Matière : ${opts.subject}.`].join('\n')
  const raw = await ai.generateJson({ system, prompt, schema: segmentsSchema, images: [opts.audio], temperature: 0, timeoutMs: 3 * 60_000 })
  const parsed = z.object({ segments: z.array(z.object({ start: z.string(), text: z.string() })) }).parse(raw)
  return parsed.segments.map((x) => ({ start: parseClock(x.start), text: x.text.trim() })).filter((x) => x.text)
}

// Texte final du cours : un paragraphe par passage, précédé de son horodatage
export function transcriptText(segments: Segment[]) {
  return segments.map((x) => `[${clock(x.start)}] ${x.text}`).join('\n\n')
}
