import { describe, expect, it } from 'vitest'
import { bySubject, durationLabel, streak, weakNotions, weeklySuccess, type AnswerRow } from './stats'

const today = new Date(2026, 9, 29, 15) // jeudi 29 octobre 2026
const ans = (session_id: string, question_id: string, is_correct: boolean, answered_at: string, time_ms = 30_000): AnswerRow => ({
  session_id,
  question_id,
  is_correct,
  time_ms,
  answered_at,
})

describe('série de jours', () => {
  it('compte les jours consécutifs jusqu’à aujourd’hui', () => {
    expect(streak([new Date(2026, 9, 29, 9), new Date(2026, 9, 28), new Date(2026, 9, 27), new Date(2026, 9, 25)], today)).toBe(3)
  })
  it('garde la série si rien n’est encore fait aujourd’hui', () => {
    expect(streak([new Date(2026, 9, 28), new Date(2026, 9, 27)], today)).toBe(2)
  })
  it('repart à zéro après un jour sans révision', () => {
    expect(streak([new Date(2026, 9, 26)], today)).toBe(0)
  })
})

describe('évolution par semaine', () => {
  it('calcule le taux de la semaine et laisse vides les semaines sans QCM', () => {
    const pts = weeklySuccess([ans('s', 'q1', true, '2026-10-27T10:00:00'), ans('s', 'q2', false, '2026-10-28T10:00:00')], 3, today)
    expect(pts).toHaveLength(3)
    expect(pts[2].rate).toBe(50)
    expect(pts[0].rate).toBeNull()
  })
})

describe('par matière et par notion', () => {
  const sessions = new Map([['s1', 'fin'], ['s2', 'mkt']])
  const answers = [
    ans('s1', 'q1', false, '2026-10-28T10:00:00', 20 * 60_000),
    ans('s1', 'q1', false, '2026-10-29T10:00:00'),
    ans('s1', 'q2', true, '2026-10-29T10:00:00'),
    ans('s2', 'q3', true, '2026-10-29T10:00:00'),
  ]
  it('agrège réussite et temps (plafonné à 10 min par réponse)', () => {
    const s = bySubject(answers, [{ flashcard_id: 'c1', grade: 2, duration_ms: 5000, reviewed_at: '2026-10-29T10:00:00' }], sessions, new Map([['c1', 'fin']]))
    expect(s.get('fin')).toMatchObject({ correct: 1, total: 3, rate: 33, cards: 1, timeMs: 10 * 60_000 + 30_000 + 30_000 + 5000 })
  })
  it('classe les notions les plus ratées', () => {
    const notions = weakNotions(answers, new Map([['q1', 'VAN'], ['q2', 'BFR'], ['q3', 'Prix']]), sessions)
    expect(notions).toEqual([{ subjectId: 'fin', notion: 'VAN', misses: 2, total: 2, rate: 100 }])
  })
  it('affiche une durée lisible', () => {
    expect(durationLabel(95 * 60_000)).toBe('1 h 35')
    expect(durationLabel(12 * 60_000)).toBe('12 min')
  })
})

describe('temps mesuré', () => {
  const rows = [
    { subject_id: 'fin', activity: 'quiz', started_at: '2026-10-29T09:00:00', active_seconds: 600 },
    { subject_id: 'fin', activity: 'note', started_at: '2026-10-29T18:00:00', active_seconds: 300 },
    { subject_id: null, activity: 'exam', started_at: '2026-10-20T18:00:00', active_seconds: 1200 },
  ]
  it('additionne le temps par jour et par activité', async () => {
    const { dailyStudy } = await import('./stats')
    const d = dailyStudy(rows, 14, today)
    expect(d.at(-1)!.seconds).toBe(900)
    expect(d.at(-1)!.byActivity).toEqual({ quiz: 600, note: 300 })
    expect(d.reduce((n, x) => n + x.seconds, 0)).toBe(2100)
  })
  it('regroupe par matière et par activité sur une période', async () => {
    const { studyByKey } = await import('./stats')
    expect(studyByKey(rows, 'subject_id').get('fin')).toBe(900)
    expect(studyByKey(rows, 'activity', 7, today).has('exam')).toBe(false)
  })
})
