import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/context/auth'
import { defaultAvailability, freeSlots, type Availability } from './availability'
import { dayKey } from './planner'
import type { PlanDay, Task } from './scheduler'
import { supabase } from './supabase'
import type { Assignment, Subject, WorkBlock } from './types'

const LOCAL = 'etudes.availability'
const LEGACY_BUDGET = 'etudes.dailyBudget'

function localAvailability(): Availability | null {
  try {
    const raw = localStorage.getItem(LOCAL)
    return raw ? (JSON.parse(raw) as Availability) : null
  } catch {
    return null
  }
}

// Ancien réglage « minutes par jour » : sert de point de départ
function fallback() {
  let budget = 120
  try {
    budget = Number(localStorage.getItem(LEGACY_BUDGET)) || 120
  } catch {
    /* stockage indisponible */
  }
  return localAvailability() ?? defaultAvailability(budget)
}

// Disponibilités : enregistrées dans le compte (synchronisées entre appareils),
// avec une copie locale si la mise à jour 0010 n'est pas encore lancée
export function useAvailability() {
  const userId = useUserId()
  const qc = useQueryClient()
  const key = ['user_settings', userId, 'availability']
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_settings').select('availability').maybeSingle()
      if (error) return fallback()
      return { ...defaultAvailability(), ...((data?.availability as Availability | null) ?? fallback()) }
    },
    staleTime: Infinity,
  })
  const save = async (next: Availability) => {
    qc.setQueryData(key, next)
    try {
      localStorage.setItem(LOCAL, JSON.stringify(next))
    } catch {
      /* stockage indisponible */
    }
    await supabase.from('user_settings').upsert({ user_id: userId, availability: next })
  }
  return { availability: query.data ?? fallback(), loading: query.isLoading, save }
}

const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const parseDay = (k: string) => new Date(`${k}T12:00:00`)

export const HORIZON_DAYS = 28
export const DEFAULT_REVISION = 6 * 60
export const DEFAULT_ESTIMATE = 60

export type PlanInputs = {
  assignments: Assignment[]
  subjects: Subject[]
  blocks: WorkBlock[]
  classes: { start: Date; end: Date }[]
  availability: Availability
  now: Date
  // estimations modifiées dans le planificateur (minutes)
  overrides: Record<string, number>
  excluded: Set<string>
}

export type PlanTask = Task & { due: string; done: number; estimate: number; missed: number; included: boolean }

// Tâches à planifier : devoirs non terminés et révisions des examens à venir
export function buildTasks(p: PlanInputs): PlanTask[] {
  const today = dayKey(p.now)
  const limit = dayKey(addDays(p.now, HORIZON_DAYS))
  const doneMin = (pred: (b: WorkBlock) => boolean) => p.blocks.filter((b) => b.done && pred(b)).reduce((n, b) => n + b.minutes, 0)
  const missedOf = (pred: (b: WorkBlock) => boolean) => p.blocks.filter((b) => !b.done && b.day < today && pred(b)).length
  const tasks: PlanTask[] = []

  for (const a of p.assignments) {
    if (a.status === 'done') continue
    const due = new Date(a.due_at)
    const dueKey = dayKey(due)
    if (dueKey < today) continue
    // On termine la veille, sauf pour un devoir à rendre aujourd'hui
    const lastDay = dueKey === today ? today : dayKey(addDays(due, -1))
    const id = `a:${a.id}`
    const estimate = p.overrides[id] ?? a.estimated_minutes ?? DEFAULT_ESTIMATE
    const done = doneMin((b) => b.assignment_id === a.id)
    tasks.push({
      id,
      kind: 'assignment',
      title: a.title,
      subjectId: a.subject_id,
      minutes: Math.max(0, estimate - done),
      lastDay,
      due: dueKey,
      done,
      estimate,
      missed: missedOf((b) => b.assignment_id === a.id),
      included: !p.excluded.has(id),
    })
  }

  for (const s of p.subjects) {
    if (!s.exam_date || s.exam_date <= today || s.exam_date > limit) continue
    const id = `r:${s.id}`
    const estimate = p.overrides[id] ?? s.revision_minutes ?? DEFAULT_REVISION
    const done = doneMin((b) => b.kind === 'revision' && b.subject_id === s.id)
    tasks.push({
      id,
      kind: 'revision',
      title: `Révisions ${s.name}`,
      subjectId: s.id,
      minutes: Math.max(0, estimate - done),
      lastDay: dayKey(addDays(parseDay(s.exam_date), -1)),
      due: s.exam_date,
      done,
      estimate,
      missed: missedOf((b) => b.kind === 'revision' && b.subject_id === s.id),
      included: !p.excluded.has(id),
    })
  }
  return tasks.sort((a, b) => a.due.localeCompare(b.due))
}

// Séances qui seront remplacées : toutes celles non faites des tâches incluses
export function replacedBlock(b: WorkBlock, tasks: PlanTask[]) {
  if (b.done) return false
  return tasks.some((t) => t.included && (t.kind === 'assignment' ? `a:${b.assignment_id}` === t.id : b.kind === 'revision' && `r:${b.subject_id}` === t.id))
}

// Jours à venir, avec leurs créneaux libres et le temps déjà pris par les autres séances
export function buildDays(p: PlanInputs, tasks: PlanTask[]): PlanDay[] {
  const last = tasks.filter((t) => t.included && t.minutes > 0).reduce((m, t) => (t.lastDay > m ? t.lastDay : m), dayKey(p.now))
  const out: PlanDay[] = []
  for (let d = new Date(p.now); dayKey(d) <= last; d = addDays(d, 1)) {
    const key = dayKey(d)
    const kept = p.blocks.filter((b) => b.day === key && !b.done && !replacedBlock(b, tasks)).reduce((n, b) => n + b.minutes, 0)
    const target = Math.max(0, p.availability.days[(d.getDay() + 6) % 7].minutes - kept)
    const date = new Date(d)
    date.setHours(0, 0, 0, 0)
    out.push({ day: key, target, slots: freeSlots(date, p.availability, p.classes, p.now) })
  }
  return out
}
