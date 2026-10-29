import { useQuery } from '@tanstack/react-query'
import { useJobs } from '@/context/jobs'
import { useSpace } from '@/context/space'
import { estimateSeconds } from './ai'
import { useInvalidate } from './data'
import { EXAMS, sectionOf, toeicEstimate, type ExamId } from './exams'
import { must, supabase } from './supabase'

export type SectionRun = { key: string; count?: number; question_ids?: string[]; started_at?: string | null; finished_at?: string | null }
export type SectionResult = { key: string; right: number; wrong: number; blank: number; total: number; points: number }

export type ExamSession = {
  id: string
  space_id: string
  exam: ExamId
  mode: 'section' | 'full'
  timed: boolean
  sections: SectionRun[]
  current_section: number
  answers: Record<string, number>
  status: 'preparing' | 'ready' | 'in_progress' | 'finished' | 'error'
  error: string | null
  result: SectionResult[] | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export type ExamQuestion = { id: string; section: string; passage_id: string | null; passage: string; question: string; choices: string[] }

export function useExamSessions() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: ['exam_sessions', spaceId],
    enabled: !!spaceId,
    retry: false,
    queryFn: async () =>
      must(await supabase.from('exam_sessions').select('*').eq('space_id', spaceId).is('deleted_at', null).order('created_at', { ascending: false })) as ExamSession[],
  })
}

// Durée d'une section : celle de l'épreuve officielle, au prorata du nombre de questions
export function sectionSeconds(exam: ExamId, key: string, questions: number) {
  const def = sectionOf(exam, key)
  if (!def) return 0
  return Math.round((def.minutes * 60 * questions) / def.count)
}

export function useStartExam() {
  const { spaceId } = useSpace()
  const { start } = useJobs()
  const invalidate = useInvalidate()
  return async (o: { exam: ExamId; mode: 'section' | 'full'; sections: { key: string; count: number }[]; timed: boolean }) => {
    const def = EXAMS[o.exam]
    const label =
      o.mode === 'full' ? `Examen blanc ${def.short}` : `${def.short} · ${sectionOf(o.exam, o.sections[0].key)?.label ?? 'Entraînement'}`
    const s = must(
      await supabase
        .from('exam_sessions')
        .insert({ space_id: spaceId, exam: o.exam, mode: o.mode, timed: o.timed, sections: o.sections, status: 'preparing' })
        .select('id')
        .single(),
    ) as { id: string }
    const total = o.sections.reduce((n, x) => n + x.count, 0)
    await start('exam', { session_id: s.id }, { label, estimateSec: estimateSeconds('exam', total), link: `/entrainements/${s.id}`, linkLabel: 'Commencer' })
    await invalidate('exam_sessions')
    return s.id
  }
}

export type ScoreLine = { key: string; label: string; value: string; detail: string }

// Résumé lisible du score : TAGE MAGE sur 60 par sous-test, TOEIC estimé sur 495 par partie
export function scoreSummary(exam: ExamId, result: SectionResult[]): { total: string; lines: ScoreLine[] } {
  const lines = result.map((r) => {
    const label = sectionOf(exam, r.key)?.label ?? r.key
    const detail = `${r.right} juste${r.right > 1 ? 's' : ''} · ${r.wrong} faux · ${r.blank} sans réponse`
    if (exam === 'tage') {
      // Ramené à 15 questions quand la section était plus courte
      const on60 = r.total ? Math.round((r.points * 15) / r.total) : 0
      return { key: r.key, label, value: r.total === 15 ? `${on60} / 60` : `${r.points} / ${r.total * 4} (≈ ${on60} / 60)`, detail }
    }
    return { key: r.key, label, value: `${r.right} / ${r.total}`, detail }
  })
  if (exam === 'tage') {
    const pts = result.reduce((s, r) => s + (r.total ? (r.points * 15) / r.total : 0), 0)
    const full = result.every((r) => r.total === 15)
    const raw = result.reduce((s, r) => s + r.points, 0)
    const max = result.reduce((s, r) => s + r.total * 4, 0)
    return { total: full ? `${Math.round(pts)} / ${result.length * 60}` : `${raw} / ${max} points (≈ ${Math.round(pts)} / ${result.length * 60})`, lines }
  }
  const part = (keys: string[]) => {
    const rs = result.filter((r) => keys.includes(r.key))
    if (!rs.length) return null
    return toeicEstimate(
      rs.reduce((s, r) => s + r.right, 0),
      rs.reduce((s, r) => s + r.total, 0),
    )
  }
  const listening = part(['part2', 'part3', 'part4'])
  const reading = part(['part5', 'part6', 'part7'])
  const total =
    listening !== null && reading !== null
      ? `≈ ${listening + reading} / 990 (Listening ≈ ${listening}, Reading ≈ ${reading})`
      : listening !== null
        ? `Listening ≈ ${listening} / 495`
        : `Reading ≈ ${reading} / 495`
  return { total, lines }
}
