// Calculs des statistiques (fonctions pures, testées)
import { addDays, startOfDay, startOfWeek } from 'date-fns'
import { dayKey } from './planner'

export type AnswerRow = { session_id: string; question_id: string; is_correct: boolean; time_ms: number | null; answered_at: string }
export type ReviewRow = { flashcard_id: string; grade: number; duration_ms: number | null; reviewed_at: string }

// Au-delà de 10 minutes sans action, le chronomètre est considéré arrêté
export const IDLE_CAP_MS = 10 * 60_000
const capped = (ms: number | null) => Math.min(Math.max(ms ?? 0, 0), IDLE_CAP_MS)

// Jours consécutifs de révision, jusqu'à aujourd'hui (ou hier, si rien encore aujourd'hui)
export function streak(dates: Date[], today = new Date()): number {
  const days = new Set(dates.map((d) => dayKey(d)))
  let d = startOfDay(today)
  if (!days.has(dayKey(d))) d = addDays(d, -1)
  let n = 0
  while (days.has(dayKey(d))) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export type WeekPoint = { week: Date; correct: number; total: number; rate: number | null }

// Taux de réussite aux QCM, semaine par semaine (semaines sans QCM : rate = null)
export function weeklySuccess(answers: AnswerRow[], weeks = 10, today = new Date()): WeekPoint[] {
  const first = addDays(startOfWeek(today, { weekStartsOn: 1 }), -7 * (weeks - 1))
  const points: WeekPoint[] = Array.from({ length: weeks }, (_, i) => ({ week: addDays(first, 7 * i), correct: 0, total: 0, rate: null }))
  for (const a of answers) {
    const i = Math.floor((new Date(a.answered_at).getTime() - first.getTime()) / (7 * 86_400_000))
    if (i < 0 || i >= weeks) continue
    points[i].total++
    if (a.is_correct) points[i].correct++
  }
  for (const p of points) p.rate = p.total ? Math.round((p.correct / p.total) * 100) : null
  return points
}

export type SubjectStat = { subjectId: string; correct: number; total: number; rate: number | null; timeMs: number; cards: number }

export function bySubject(
  answers: AnswerRow[],
  reviews: ReviewRow[],
  sessionSubject: Map<string, string>,
  cardSubject: Map<string, string>,
): Map<string, SubjectStat> {
  const out = new Map<string, SubjectStat>()
  const get = (id: string) => {
    let s = out.get(id)
    if (!s) out.set(id, (s = { subjectId: id, correct: 0, total: 0, rate: null, timeMs: 0, cards: 0 }))
    return s
  }
  for (const a of answers) {
    const sid = sessionSubject.get(a.session_id)
    if (!sid) continue
    const s = get(sid)
    s.total++
    if (a.is_correct) s.correct++
    s.timeMs += capped(a.time_ms)
  }
  for (const r of reviews) {
    const sid = cardSubject.get(r.flashcard_id)
    if (!sid) continue
    const s = get(sid)
    s.cards++
    s.timeMs += capped(r.duration_ms)
  }
  for (const s of out.values()) s.rate = s.total ? Math.round((s.correct / s.total) * 100) : null
  return out
}

export type NotionStat = { subjectId: string; notion: string; misses: number; total: number; rate: number }

// Notions les plus souvent ratées (au moins 2 réponses, au moins 1 erreur)
export function weakNotions(
  answers: AnswerRow[],
  questionNotion: Map<string, string>,
  sessionSubject: Map<string, string>,
  limit = 10,
): NotionStat[] {
  const groups = new Map<string, NotionStat>()
  for (const a of answers) {
    const notion = questionNotion.get(a.question_id)?.trim()
    const sid = sessionSubject.get(a.session_id)
    if (!notion || !sid) continue
    const key = `${sid}|${notion.toLowerCase()}`
    const g = groups.get(key) ?? { subjectId: sid, notion, misses: 0, total: 0, rate: 0 }
    g.total++
    if (!a.is_correct) g.misses++
    groups.set(key, g)
  }
  return [...groups.values()]
    .filter((g) => g.total >= 2 && g.misses >= 1)
    .map((g) => ({ ...g, rate: Math.round((g.misses / g.total) * 100) }))
    .sort((a, b) => b.misses - a.misses || b.rate - a.rate)
    .slice(0, limit)
}

// Temps de révision (QCM + flash cards) sur les derniers jours
export function recentTime(answers: AnswerRow[], reviews: ReviewRow[], days = 7, today = new Date()) {
  const from = addDays(startOfDay(today), -(days - 1)).getTime()
  let ms = 0
  for (const a of answers) if (new Date(a.answered_at).getTime() >= from) ms += capped(a.time_ms)
  for (const r of reviews) if (new Date(r.reviewed_at).getTime() >= from) ms += capped(r.duration_ms)
  return ms
}

export function durationLabel(ms: number) {
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}
