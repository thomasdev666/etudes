// Répétition espacée — algorithme SM-2 (Wozniak, 1987).
// Les 4 boutons correspondent aux notes de qualité SM-2 :
//   0 « Je ne savais pas » → q = 1   (échec)
//   1 « Difficile »        → q = 3
//   2 « Bien »             → q = 4
//   3 « Facile »           → q = 5
// Un échec remet la carte au début et la reprogramme 10 minutes plus tard,
// pour la revoir pendant la même session (SM-2 demande de répéter le jour même
// les cartes notées sous 4).

export type Grade = 0 | 1 | 2 | 3

export const GRADE_LABELS: Record<Grade, string> = {
  0: 'Je ne savais pas',
  1: 'Difficile',
  2: 'Bien',
  3: 'Facile',
}

const QUALITY: Record<Grade, number> = { 0: 1, 1: 3, 2: 4, 3: 5 }

export type CardState = {
  interval_days: number
  ease: number
  repetitions: number
  lapses: number
}

export type Sm2Result = CardState & { due_at: Date }

export const MIN_EASE = 1.3
export const RELEARN_MINUTES = 10
const DAY_MS = 86_400_000

export function nextEase(ease: number, q: number): number {
  const e = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  return Math.max(MIN_EASE, Math.round(e * 100) / 100)
}

export function review(card: CardState, grade: Grade, now: Date = new Date()): Sm2Result {
  const q = QUALITY[grade]
  const ease = nextEase(card.ease, q)

  if (q < 3) {
    return {
      interval_days: 0,
      ease,
      repetitions: 0,
      lapses: card.lapses + 1,
      due_at: new Date(now.getTime() + RELEARN_MINUTES * 60_000),
    }
  }

  const repetitions = card.repetitions + 1
  let interval: number
  if (repetitions === 1) interval = 1
  else if (repetitions === 2) interval = 6
  else interval = Math.round(Math.max(card.interval_days, 1) * ease)

  return {
    interval_days: interval,
    ease,
    repetitions,
    lapses: card.lapses,
    due_at: startOfDayPlus(now, interval),
  }
}

// Échéance au début du jour cible : la carte est « due » dès le matin.
function startOfDayPlus(now: Date, days: number): Date {
  const d = new Date(now.getTime() + days * DAY_MS)
  d.setHours(4, 0, 0, 0)
  return d
}

// Aperçu de l'intervalle affiché sous chaque bouton
export function previewLabel(card: CardState, grade: Grade, now = new Date()): string {
  const r = review(card, grade, now)
  if (r.interval_days === 0) return `${RELEARN_MINUTES} min`
  if (r.interval_days < 30) return `${r.interval_days} j`
  if (r.interval_days < 365) return `${Math.round(r.interval_days / 30)} mois`
  return `${(r.interval_days / 365).toFixed(1).replace('.', ',')} an`
}

// Une carte est considérée « maîtrisée » quand son intervalle dépasse 3 semaines
export const MASTERED_DAYS = 21
