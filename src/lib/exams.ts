// Description des épreuves TAGE MAGE et TOEIC : sections, nombre de questions,
// durée, barème et consignes de génération. Partagé par l'appli et le serveur
// (aucun import : ce fichier est compilé des deux côtés).

export type ExamId = 'tage' | 'toeic'

export type SectionDef = {
  key: string
  label: string
  // nombre de questions et durée de l'épreuve officielle
  count: number
  minutes: number
  choices: number
  // questions regroupées autour d'un même texte ou enregistrement
  perPassage?: number
  // lu à voix haute (TOEIC Listening) plutôt qu'affiché
  audio?: boolean
  // réponses de la partie 2 du TOEIC : entendues, pas écrites
  hiddenChoices?: boolean
  // consignes pour l'IA : le « modèle de consigne » de la section
  brief: string
}

export type ExamDef = {
  id: ExamId
  name: string
  short: string
  description: string
  // barème : points par bonne réponse, par erreur, sans réponse
  scoring: { right: number; wrong: number; blank: number }
  sections: SectionDef[]
  // libellés fixes des réponses (conditions minimales du TAGE MAGE)
  fixedChoices?: Record<string, string[]>
}

export const MINIMAL_CHOICES = [
  'La condition (1) seule suffit, mais pas la (2) seule',
  'La condition (2) seule suffit, mais pas la (1) seule',
  'Les deux conditions ensemble suffisent, mais aucune seule',
  'Chaque condition suffit seule',
  'Les deux conditions ensemble ne suffisent pas',
]

export const EXAMS: Record<ExamId, ExamDef> = {
  tage: {
    id: 'tage',
    name: 'TAGE MAGE',
    short: 'TAGE MAGE',
    description: '6 sous-tests de 15 questions, 20 minutes chacun. +4 par bonne réponse, −1 par erreur, 0 sans réponse : chaque sous-test est noté sur 60, le total sur 600.',
    scoring: { right: 4, wrong: -1, blank: 0 },
    fixedChoices: { conditions: MINIMAL_CHOICES },
    sections: [
      {
        key: 'comprehension',
        label: 'Compréhension de textes',
        count: 15,
        minutes: 20,
        choices: 5,
        perPassage: 5,
        brief:
          'Un texte original d’environ 450 mots (essai, article d’idées ou extrait argumenté : économie, société, sciences, histoire, culture), puis des questions sur le sens, l’idée principale, la position de l’auteur, le sens d’un mot dans le contexte, ce que le texte permet ou non d’affirmer. Les mauvaises réponses sont plausibles (déformation, généralisation, contresens).',
      },
      {
        key: 'calcul',
        label: 'Calcul',
        count: 15,
        minutes: 20,
        choices: 5,
        brief:
          'Problèmes de calcul sans calculatrice, faisables de tête en 1 minute 20 : pourcentages et évolutions, fractions, puissances et racines, équations, proportionnalité, vitesses, mélanges, âges, probabilités et dénombrement simples, géométrie plane (aires, périmètres, Pythagore, Thalès). Réponses numériques proches pour piéger les erreurs de calcul.',
      },
      {
        key: 'argumentation',
        label: 'Raisonnement et argumentation',
        count: 15,
        minutes: 20,
        choices: 5,
        brief:
          'Un court argument (3 à 6 phrases) suivi d’une question : quelle affirmation le renforce, l’affaiblit, quelle hypothèse il suppose, quelle conclusion on peut en tirer, quel raisonnement est similaire, quelle est la faille du raisonnement.',
      },
      {
        key: 'conditions',
        label: 'Conditions minimales',
        count: 15,
        minutes: 20,
        choices: 5,
        brief:
          'Une question de mathématiques ou de logique, suivie de deux informations numérotées (1) et (2). Il faut dire si elles suffisent pour répondre. La question et les deux conditions sont dans « question », sur des lignes séparées, sous la forme : la question, puis « (1) … », puis « (2) … ». Les choix sont toujours les 5 réponses standard, dans cet ordre : (1) seule suffit, (2) seule suffit, les deux ensemble, chacune suffit, ni l’une ni l’autre. Ne réponds jamais à la question elle-même.',
      },
      {
        key: 'expression',
        label: 'Expression',
        count: 15,
        minutes: 20,
        choices: 5,
        brief:
          'Maîtrise du français écrit : phrase correcte ou incorrecte (grammaire, accords, concordance des temps, subjonctif), mot juste et paronymes (éminent / imminent), synonymes et antonymes, sens d’une expression, ponctuation, remise en ordre d’une phrase, connecteur logique adapté.',
      },
      {
        key: 'logique',
        label: 'Logique',
        count: 15,
        minutes: 20,
        choices: 5,
        brief:
          'Logique sans figure : suites de nombres ou de lettres à compléter, tableaux de nombres à règle cachée (écrits en texte), déductions (qui est où, ordre de classement, vrai/faux, menteurs), codages de mots, calendriers et horloges. Une seule règle possible et vérifiable.',
      },
    ],
  },
  toeic: {
    id: 'toeic',
    name: 'TOEIC Listening & Reading',
    short: 'TOEIC',
    description: 'Listening (lu par la voix anglaise de ton appareil) puis Reading. Score estimé sur 990. La partie 1 (photos) n’est pas proposée.',
    scoring: { right: 1, wrong: 0, blank: 0 },
    sections: [
      {
        key: 'part2',
        label: 'Listening — Questions-réponses (partie 2)',
        count: 25,
        minutes: 9,
        choices: 3,
        audio: true,
        hiddenChoices: true,
        brief:
          'Partie 2 du TOEIC : une question ou une affirmation courte du monde professionnel (passage = la phrase entendue), puis 3 réponses entendues. Une seule réponse est logique ; les pièges reprennent des mots de la question, des sons proches, ou répondent à une autre question (où / quand / qui).',
      },
      {
        key: 'part3',
        label: 'Listening — Conversations (partie 3)',
        count: 39,
        minutes: 18,
        choices: 4,
        perPassage: 3,
        audio: true,
        brief:
          'Partie 3 du TOEIC : une conversation de bureau entre 2 ou 3 personnes (8 à 12 répliques, chaque ligne commence par « M: », « W: » ou « M2: »), puis 3 questions écrites (sujet, détail, ce qui va se passer, intention d’une phrase).',
      },
      {
        key: 'part4',
        label: 'Listening — Exposés (partie 4)',
        count: 30,
        minutes: 15,
        choices: 4,
        perPassage: 3,
        audio: true,
        brief:
          'Partie 4 du TOEIC : un monologue professionnel d’environ 120 mots (annonce, message téléphonique, publicité, visite guidée, réunion, bulletin), puis 3 questions écrites.',
      },
      {
        key: 'part5',
        label: 'Reading — Phrases incomplètes (partie 5)',
        count: 30,
        minutes: 15,
        choices: 4,
        brief:
          'Partie 5 du TOEIC : une phrase professionnelle avec un blanc « ------- », 4 propositions. Teste la grammaire (temps, formes du mot, prépositions, pronoms, conjonctions) et le vocabulaire des affaires.',
      },
      {
        key: 'part6',
        label: 'Reading — Textes incomplets (partie 6)',
        count: 16,
        minutes: 12,
        choices: 4,
        perPassage: 4,
        brief:
          'Partie 6 du TOEIC : un texte professionnel (email, note, annonce, article) d’environ 150 mots avec 4 blancs numérotés [1] à [4]. Chaque question correspond à un blanc (« Blank [1] » …) ; l’une d’elles demande la phrase entière à insérer.',
      },
      {
        key: 'part7',
        label: 'Reading — Compréhension écrite (partie 7)',
        count: 54,
        minutes: 48,
        choices: 4,
        perPassage: 3,
        brief:
          'Partie 7 du TOEIC : un ou plusieurs documents professionnels (email, formulaire, article, chat, publicité, facture ; parfois deux documents liés séparés par « --- »), environ 200 à 350 mots, puis 3 questions (idée générale, détail, inférence, vocabulaire, « ce qui n’est PAS mentionné »).',
      },
    ],
  },
}

export function sectionOf(exam: ExamId, key: string) {
  return EXAMS[exam].sections.find((s) => s.key === key)
}

// Points d'une section selon le barème de l'épreuve
export function sectionPoints(exam: ExamId, right: number, wrong: number, blank: number) {
  const s = EXAMS[exam].scoring
  return right * s.right + wrong * s.wrong + blank * s.blank
}

// Score TOEIC estimé (5 à 495 par partie) à partir du taux de réussite. Simple estimation :
// la vraie conversion dépend de chaque session officielle.
export function toeicEstimate(right: number, total: number) {
  if (!total) return 5
  const raw = 5 + 490 * (right / total)
  return Math.min(495, Math.max(5, Math.round(raw / 5) * 5))
}
