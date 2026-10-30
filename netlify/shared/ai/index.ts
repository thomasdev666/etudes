// Couche IA unique. Pour changer de fournisseur, ajouter un fichier à côté de gemini.ts
// et l'ajouter dans getAi() : le reste du code n'appelle que getAi() et les générateurs.
import { z } from 'zod'
import { createGeminiProvider, deleteGeminiFile, listGeminiModels, streamGemini, uploadGeminiFile, type StreamChunk, type StreamRequest } from './gemini'
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
  hard: "difficile, niveau partiel : mini-cas chiffrés, raisonnement en plusieurs étapes, comparaison de notions proches, distracteurs qui reprennent les erreurs classiques des étudiants. Aucune question de simple définition",
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
          source_excerpt: { type: 'string', description: 'Phrase du cours, recopiée mot pour mot, qui justifie la bonne réponse (300 caractères au plus)' },
        },
        required: ['question', 'choices', 'correct_index', 'explanation', 'notion', 'source_excerpt'],
      },
    },
  },
  required: ['questions'],
}

// Marques de gras (**…**) du texte extrait : utiles à l'IA, pas à l'affichage
export const stripBold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*\*/g, '')

const questionValidator = (qtype: QuizType) =>
  z
    .object({
      question: z.string().trim().min(5),
      choices: z.array(z.string().trim().min(1)).length(qtype === 'mcq' ? 4 : 2),
      correct_index: z.number().int().min(0).max(qtype === 'mcq' ? 3 : 1),
      explanation: z.string().trim().min(1),
      notion: z.string().trim().min(1).max(120),
      source_excerpt: z
        .string()
        .trim()
        .optional()
        .transform((v) => (v ? stripBold(v).slice(0, 400) : '')),
    })
    .transform((q) => ({ ...q, question: stripBold(q.question), choices: q.choices.map(stripBold), explanation: stripBold(q.explanation) }))
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
    'Pour chaque question, recopie mot pour mot la phrase du cours qui justifie la bonne réponse (source_excerpt). Si aucune phrase ne la justifie, ne pose pas cette question.',
    'Varie la position de la bonne réponse et couvre tout le cours, pas seulement le début.',
    "Ne pose que des questions sur le fond : notions, définitions, mécanismes, calculs, exemples, auteurs et théories. Aucune question sur l'organisation ou la forme du cours (nombre de séances, plan, déroulé, modalités d'évaluation, barème, dates, salle, enseignant, contacts, bibliographie, consignes, numéros de diapositive).",
    "Dans le cours, les passages entre ** ** sont en gras dans le document d'origine : ce sont les termes que l'enseignant juge essentiels. Base en priorité les questions sur eux. N'écris pas les ** dans les questions, les choix ni source_excerpt.",
    "Quand une question porte sur une formule ou un calcul, écris les formules en LaTeX entre $ … $ (par exemple $ROE = \\frac{Résultat\\ net}{Capitaux\\ propres}$), dans la question, les choix et l'explication. Un choix peut être une formule seule, ou une courte phrase suivie de la formule.",
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

// Bloc visuel d'une section : schéma (étapes, cycle, carte), tableau ou encadré
export type Visual = { kind: VisualKind; title: string; items: string[] }
export const VISUAL_KINDS = ['etapes', 'cycle', 'carte', 'tableau', 'exemple', 'a_retenir', 'attention', 'chiffre_cle', 'definition'] as const
type VisualKind = (typeof VISUAL_KINDS)[number]

const visualsSchema: JsonSchema = {
  type: 'array',
  description: 'Illustrations de la section (0 à 3) : mieux qu’un long texte quand le cours s’y prête',
  items: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: [...VISUAL_KINDS],
        description:
          'etapes : processus ou méthode dans l’ordre ; cycle : étapes qui se répètent ; carte : une notion et ses composantes ; tableau : comparaison ; exemple : cas concret ou chiffré ; a_retenir : l’idée clé ; attention : piège ; chiffre_cle : un chiffre important et sa signification ; definition : un terme à connaître (title = le terme)',
      },
      title: { type: 'string', description: 'Titre court (pour carte : la notion centrale)' },
      items: {
        type: 'array',
        items: { type: 'string' },
        description:
          'etapes, cycle : 2 à 7 étapes de quelques mots ; carte : 2 à 8 composantes de quelques mots ; tableau : première ligne = en-têtes, puis une ligne par élément, cellules séparées par « | » ; exemple, a_retenir, attention, chiffre_cle, definition : 1 à 3 phrases',
      },
    },
    required: ['kind', 'title', 'items'],
  },
}

// Une illustration mal formée est ignorée, sans faire échouer toute la fiche
const visualValidator = z.object({ kind: z.enum(VISUAL_KINDS), title: z.string().trim(), items: z.array(z.string().trim().min(1)).min(1).max(12) })
const visualsValidator = z
  .array(z.unknown())
  .optional()
  .transform((v): Visual[] => (v ?? []).flatMap((x) => {
    const r = visualValidator.safeParse(x)
    return r.success ? [r.data] : []
  }))

const VISUAL_RULES = [
  'Rends la fiche visuelle : dans chaque section, ajoute quand le contenu s’y prête 1 à 3 illustrations (visuals) plutôt que du texte seul.',
  'Un processus ou une méthode → etapes ; un mécanisme qui boucle → cycle ; une notion et ses composantes → carte ; deux notions ou plus à comparer → tableau ; un cas concret → exemple ; l’idée à ne pas oublier → a_retenir ; un piège → attention ; un chiffre marquant → chiffre_cle.',
  'Ne répète pas dans points ce qu’une illustration montre déjà. Chaque section a un emoji qui l’illustre.',
].join('\n')

export type Sheet = {
  intro: string
  sections: { heading: string; emoji?: string; points: string[]; visuals?: Visual[]; subsections?: { heading: string; points: string[] }[] }[]
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
          emoji: { type: 'string', description: 'Un emoji qui illustre la section' },
          points: pointsSchema,
          visuals: visualsSchema,
          subsections: {
            type: 'array',
            items: { type: 'object', properties: { heading: { type: 'string' }, points: pointsSchema }, required: ['heading', 'points'] },
          },
        },
        required: ['heading', 'emoji', 'points', 'visuals'],
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
        emoji: str.max(16).optional(),
        points: z.array(str.min(1)),
        visuals: visualsValidator,
        subsections: z.array(z.object({ heading: str.min(1), points: z.array(str.min(1)) })).optional(),
      }),
    )
    .min(1),
  definitions: z.array(z.object({ term: str.min(1), definition: str.min(1) })),
  formulas: z.array(z.object({ name: str, latex: str.min(1), explanation: str })),
  pitfalls: z.array(str.min(1)),
  checklist: z.array(str.min(1)),
})

export type Density = 'compact' | 'aere'

const DENSITY_RULES: Record<Density, string> = {
  compact:
    'Format COMPACT : la fiche doit tenir sur 1 à 2 pages. 3 à 5 points par section au maximum, chacun en 12 mots au plus. Pas de sous-sections. Au plus 1 illustration par section, de préférence un tableau ou un schéma qui condense plusieurs idées. 8 définitions au plus, 4 pièges au plus, 4 à 6 éléments de checklist. Regroupe les petites parties du cours.',
  aere: 'Format AÉRÉ : fiche détaillée et illustrée, sans limite de longueur, qui couvre tout le cours.',
}

export async function generateSheet(opts: { source: string; title: string; density?: Density }): Promise<Sheet> {
  const ai = getAi()
  const system = [
    "Tu rédiges des fiches de révision complètes et synthétiques pour des étudiants d'école de commerce.",
    'Suis le plan du cours. Chaque point : une idée, une phrase courte, les mots clés en **gras**.',
    'Garde tous les chiffres clés, exemples marquants, auteurs, dates et méthodes de calcul. Formules en LaTeX ($...$ dans le texte).',
    'definitions : les notions à connaître par cœur. formulas : seulement si le cours en contient. pitfalls : erreurs fréquentes à l’examen.',
    'checklist : 4 à 10 compétences vérifiables (« Savoir calculer… », « Savoir expliquer… »).',
    'Uniquement à partir du contenu fourni, dans sa langue. Ne laisse de côté aucune partie du cours.',
    VISUAL_RULES,
    DENSITY_RULES[opts.density ?? 'aere'],
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

// ---------------------------------------------------------------- Assistant (demande libre)

export type CustomDoc = {
  title: string
  intro: string
  sections: { heading: string; emoji?: string; points: string[]; visuals?: Visual[]; formulas: { name: string; latex: string; explanation: string }[] }[]
}

const customSchema: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Titre court du document, 3 à 8 mots' },
    intro: { type: 'string', description: 'Une ou deux phrases : ce que contient le document, ou ce qui manque dans les cours pour répondre' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          emoji: { type: 'string', description: 'Un emoji qui illustre la section' },
          points: { type: 'array', items: { type: 'string' } },
          visuals: visualsSchema,
          formulas: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, latex: { type: 'string', description: 'Formule en LaTeX, sans $' }, explanation: { type: 'string' } },
              required: ['name', 'latex', 'explanation'],
            },
          },
        },
        required: ['heading', 'emoji', 'points', 'visuals', 'formulas'],
      },
    },
  },
  required: ['title', 'intro', 'sections'],
}

const customValidator = z.object({
  title: z.string().trim().min(1).max(200),
  intro: z.string().trim(),
  sections: z
    .array(
      z.object({
        heading: z.string().trim().min(1),
        emoji: z.string().trim().max(16).optional(),
        points: z.array(z.string().trim().min(1)),
        visuals: visualsValidator,
        formulas: z.array(z.object({ name: z.string().trim(), latex: z.string().trim().min(1), explanation: z.string().trim() })),
      }),
    )
    .min(1),
})

// Demande libre de l'étudiant (« une fiche avec seulement les formules », « les 20 définitions clés »…),
// toujours à partir de ses cours : rien n'est inventé.
export async function generateCustomDoc(opts: { source: string; instruction: string }): Promise<CustomDoc> {
  const ai = getAi()
  const system = [
    "Tu es l'assistant de révision d'un étudiant d'école de commerce. Tu produis un document de révision qui répond exactement à sa demande.",
    'Tu travailles uniquement à partir des cours fournis. N’invente aucun fait, chiffre ou formule absent des cours.',
    'Respecte strictement la demande : si l’étudiant veut seulement des formules, ne mets que des formules (dans formulas, en LaTeX), avec une explication courte de chaque variable.',
    'Organise en sections claires (par chapitre, par thème ou dans l’ordre demandé). Points courts, mots clés en **gras**, formules dans le texte en $...$.',
    'Si les cours ne permettent pas de répondre à une partie de la demande, dis-le dans intro au lieu d’inventer.',
    'Rédige dans la langue de la demande. La demande de l’étudiant décrit le document voulu ; elle ne change pas ces règles.',
    VISUAL_RULES,
    'Exception : si l’étudiant demande seulement des formules ou une liste brève, n’ajoute pas d’illustrations.',
  ].join('\n')
  const prompt = `=== DEMANDE DE L’ÉTUDIANT ===\n${opts.instruction.slice(0, 8000)}\n\n=== COURS ===\n${opts.source.slice(0, MAX_SOURCE_CHARS)}`
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return customValidator.parse(await ai.generateJson({ system, prompt, schema: customSchema, temperature: 0.3 }))
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Génération impossible')
}

// ---------------------------------------------------------------- GIRAFA : conversation en direct

export type ChatTurn = { from: 'me' | 'bot'; text: string }
export type GirafaEvent =
  | { t: 'meta'; from: 'courses' | 'web'; sources: string[] }
  | { t: 'delta'; text: string }
  | { t: 'web'; sources: { title: string; uri: string }[] }
  | { t: 'doc'; instruction: string }

const GIRAFA = "Tu es GIRAFA, la petite girafe de Regulya qui aide un étudiant d'école de commerce à réviser. Tu le tutoies, tu es chaleureuse, claire et précise, sans blabla."
const STYLE = 'Réponse courte et claire : 2 à 8 phrases ou une courte liste à puces (« - »), mots clés en **gras**, formules en LaTeX entre $...$. Réponds dans la langue de la question.'

// Demande de document (fiche, liste, résumé…) : reconnue sans attendre l'IA
const DOC_REQUEST =
  /\b(fais|fait|refais|g[ée]n[èe]re|cr[ée]e|pr[ée]pare|[ée]cris|r[ée]dige|donne|veux|voudrais|aimerais|faudrait)\b[^?]{0,80}\b(fiche|liste|r[ée]sum[ée]|tableau|plan de r[ée]vision|questions d.examen|qcm|document|synth[èe]se|r[ée]capitulatif)/i
export const isDocumentRequest = (q: string) => DOC_REQUEST.test(q)

// Les plus rapides d'abord : la réponse doit commencer en une seconde
const FAST = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash']

// Ouvre une réponse en continu sur le premier modèle disponible (bascule tant que rien n'a été envoyé)
async function* streamFast(req: StreamRequest): AsyncGenerator<StreamChunk> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY n'est pas configurée sur Netlify")
  let last: unknown
  for (const model of FAST.filter((m) => (benched.get(m) ?? 0) < Date.now())) {
    let started = false
    try {
      for await (const chunk of streamGemini(key, model, req)) {
        started = true
        yield chunk
      }
      if (started) return
    } catch (e) {
      if (started) throw e
      last = e
      if (e instanceof QuotaAiError && e.daily) benched.set(model, Date.now() + 60 * 60_000)
      if (e instanceof ModelUnavailableError) benched.set(model, Date.now() + 24 * 60 * 60_000)
      if (e instanceof Error && e.name === 'AbortError') throw e
    }
  }
  throw last instanceof QuotaAiError ? new Error('Le service IA de Google est saturé en ce moment. Réessaie dans quelques instants.') : (last ?? new Error('GIRAFA n’a pas pu répondre.'))
}

const toContents = (history: ChatTurn[], last: string) => [
  ...history.slice(-8).map((t) => ({ role: (t.from === 'me' ? 'user' : 'model') as 'user' | 'model', text: t.text.slice(0, 1500) })),
  { role: 'user' as const, text: last },
]

// Réponse de GIRAFA : d'après les cours si possible, sinon d'après Internet ; ou bascule vers un document
export async function* girafaAnswer(opts: { question: string; history: ChatTurn[]; passages: string; titles: string[]; signal?: AbortSignal }): AsyncGenerator<GirafaEvent> {
  const question = opts.question.slice(0, 2000)
  if (isDocumentRequest(question)) {
    yield { t: 'doc', instruction: question }
    return
  }

  if (opts.passages) {
    const system = [
      GIRAFA,
      "Réponds à la question en t'appuyant sur les EXTRAITS DE SES COURS fournis. " + STYLE,
      "Si l'étudiant te demande de PRODUIRE un document (fiche, liste complète, résumé, questions d'examen, tableau…), réponds uniquement : [DOC] suivi de sa demande reformulée.",
      'Si les extraits ne permettent pas de répondre correctement, réponds uniquement : [WEB]. N’invente rien.',
      'Tiens compte de la conversation (questions de suivi).',
    ].join('\n')
    const ctrl = new AbortController()
    opts.signal?.addEventListener('abort', () => ctrl.abort())
    let head = ''
    let decided: 'answer' | 'web' | 'doc' | null = null
    let doc = ''
    for await (const c of streamFast({ system, contents: toContents(opts.history, `=== EXTRAITS DE MES COURS ===\n${opts.passages}\n\n=== MA QUESTION ===\n${question}`), signal: ctrl.signal })) {
      if (!c.text) continue
      if (decided === 'answer') {
        yield { t: 'delta', text: c.text }
        continue
      }
      if (decided === 'doc') {
        doc += c.text
        continue
      }
      // Les premiers caractères disent s'il s'agit d'une réponse, d'un renvoi vers Internet ou d'un document
      head += c.text
      const h = head.trimStart()
      // Un « [ » en tête : on attend de savoir si c'est [WEB] ou [DOC]
      if (!h || (h.startsWith('[') && h.length < 5)) continue
      if (h.toUpperCase().startsWith('[WEB')) {
        decided = 'web'
        ctrl.abort()
        break
      }
      if (h.toUpperCase().startsWith('[DOC')) {
        decided = 'doc'
        doc = h.replace(/^\[DOC\]?/i, '')
        continue
      }
      decided = 'answer'
      yield { t: 'meta', from: 'courses', sources: opts.titles.slice(0, 3) }
      yield { t: 'delta', text: h }
    }
    if (decided === 'doc') {
      yield { t: 'doc', instruction: doc.trim() || question }
      return
    }
    if (decided === 'answer') return
    if (decided === null && head.trim()) {
      yield { t: 'meta', from: 'courses', sources: opts.titles.slice(0, 3) }
      yield { t: 'delta', text: head.trim() }
      return
    }
  }

  // Pas dans ses cours : recherche sur Internet, signalée à l'étudiant
  yield { t: 'meta', from: 'web', sources: [] }
  const web = [GIRAFA, "La réponse n'est pas dans les cours de l'étudiant : appuie-toi sur une recherche Internet fiable. " + STYLE, 'Ne dis pas que tu as fait une recherche : l’application le signale déjà.'].join('\n')
  const seen = new Map<string, { title: string; uri: string }>()
  for await (const c of streamFast({ system: web, contents: toContents(opts.history, question), webSearch: true, signal: opts.signal })) {
    if (c.text) yield { t: 'delta', text: c.text }
    for (const src of c.sources ?? []) seen.set(src.uri, src)
  }
  if (seen.size) yield { t: 'web', sources: [...seen.values()].slice(0, 4) }
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

// ---------------------------------------------------------------- Entraînements TAGE MAGE et TOEIC

export type ExamItem = { passage: string; questions: { question: string; choices: string[]; correct_index: number; explanation: string }[] }

const examQuestion: JsonSchema = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' } },
    correct_index: { type: 'integer' },
    explanation: { type: 'string', description: 'En français : pourquoi la bonne réponse est juste (calcul détaillé si besoin) et pourquoi le piège principal est faux' },
  },
  required: ['question', 'choices', 'correct_index', 'explanation'],
  propertyOrdering: ['question', 'choices', 'correct_index', 'explanation'],
}
const examSchema: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { passage: { type: 'string' }, questions: { type: 'array', items: examQuestion } },
        required: ['passage', 'questions'],
        propertyOrdering: ['passage', 'questions'],
      },
    },
  },
  required: ['items'],
}

// Génère un lot de questions originales pour une section (jamais de sujet officiel)
export async function generateExamBatch(opts: {
  exam: 'tage' | 'toeic'
  section: { key: string; label: string; choices: number; perPassage?: number; brief: string }
  count: number
  fixedChoices?: string[]
  avoid: string[]
}): Promise<ExamItem[]> {
  const { section } = opts
  const passages = section.perPassage ? Math.max(1, Math.round(opts.count / section.perPassage)) : 0
  const tage = opts.exam === 'tage'
  // Les sections où l'exactitude compte le plus utilisent les meilleurs modèles en premier
  const ai = getAi({ bulk: !tage, budgetMs: 5 * 60_000 })
  const system = [
    tage
      ? 'Tu es un concepteur expérimenté de questions d’entraînement au TAGE MAGE (test d’aptitude aux études de gestion, en français).'
      : 'You are an experienced writer of TOEIC Listening & Reading practice questions (business English).',
    'Tu crées des questions ORIGINALES, au niveau et dans le format de l’épreuve réelle. Ne reprends jamais un sujet officiel publié ni une annale.',
    'Une seule bonne réponse, indiscutable ; les autres sont des pièges plausibles. Vérifie chaque calcul et chaque raisonnement avant de répondre.',
    'Varie la position de la bonne réponse (correct_index commence à 0) et varie les thèmes.',
    tage ? 'Tout est en français.' : 'Questions, choix et textes en anglais ; explications en français.',
    `Chaque question a exactement ${section.choices} choix${opts.fixedChoices ? ', identiques aux choix standard donnés' : ''}, sans lettre devant (pas de « A. »).`,
  ].join('\n')
  const prompt = [
    `Section : ${section.label}.`,
    `Consigne de la section : ${section.brief}`,
    passages
      ? `Crée ${passages} ${tage ? 'textes' : 'documents ou enregistrements'} (passage), chacun suivi d’exactement ${section.perPassage} questions.`
      : `Crée ${opts.count} questions indépendantes : un seul élément dans items, avec passage vide et ${opts.count} questions.`,
    section.key === 'part2' ? 'Pour chaque question : passage vide, question = la phrase entendue, choices = les 3 réponses entendues.' : '',
    opts.fixedChoices ? `Choix standard, dans cet ordre : ${opts.fixedChoices.map((c, i) => `${i + 1}) ${c}`).join(' ; ')}.` : '',
    opts.avoid.length ? `Évite de reprendre ces sujets déjà utilisés :\n- ${opts.avoid.slice(0, 40).join('\n- ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const raw = await ai.generateJson({ system, prompt, schema: examSchema, temperature: 0.8, timeoutMs: 3 * 60_000 })
  return validateExamBatch(raw, section, opts.fixedChoices)
}

export function validateExamBatch(raw: unknown, section: { key: string; choices: number; perPassage?: number }, fixedChoices?: string[]): ExamItem[] {
  const parsed = z
    .object({
      items: z.array(
        z.object({
          passage: z.string(),
          questions: z.array(z.object({ question: z.string(), choices: z.array(z.string()), correct_index: z.number().int(), explanation: z.string() })),
        }),
      ),
    })
    .parse(raw)
  const items: ExamItem[] = []
  for (const it of parsed.items) {
    const qs = it.questions
      .map((q) => ({
        question: q.question.trim(),
        // « A. Texte » → « Texte »
        choices: fixedChoices ?? q.choices.map((c) => c.trim().replace(/^\(?[A-Ea-e][).:]\s+/, '')),
        correct_index: q.correct_index,
        explanation: q.explanation.trim(),
      }))
      .filter(
        (q) =>
          q.question.length >= 3 &&
          q.choices.length === section.choices &&
          q.correct_index >= 0 &&
          q.correct_index < section.choices &&
          new Set(q.choices.map((c) => c.toLowerCase())).size === q.choices.length &&
          q.choices.every((c) => c.length > 0),
      )
    // Un texte n'est gardé qu'avec toutes ses questions valides
    if (section.perPassage ? qs.length === section.perPassage && it.passage.trim().length > 40 : qs.length > 0) items.push({ passage: it.passage.trim(), questions: qs })
  }
  if (!items.length) throw new Error('Aucune question valide générée')
  return items
}
