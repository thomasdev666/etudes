// Planification globale : répartit tous les devoirs et les révisions d'examen
// sur les jours qui viennent, dans les créneaux libres. Ne fait que proposer :
// rien n'est enregistré sans validation.
import { dayCapacity, toHHMM, type Availability, type Slot } from './availability'

export type Task = {
  id: string
  kind: 'assignment' | 'revision'
  title: string
  subjectId: string | null
  // minutes encore à faire
  minutes: number
  // dernier jour où l'on peut y travailler (AAAA-MM-JJ)
  lastDay: string
}

export type PlanDay = { day: string; slots: Slot[]; target: number }
export type PlannedBlock = { taskId: string; day: string; minutes: number; start: string | null }
export type Shortfall = { taskId: string; missing: number }
export type Schedule = { blocks: PlannedBlock[]; shortfalls: Shortfall[]; load: Record<string, { used: number; capacity: number }> }

const round5 = (m: number) => Math.round(m / 5) * 5
// Durée visée d'une séance quand rien ne presse (minutes)
const PREFERRED = 45
const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function schedule(tasks: Task[], days: PlanDay[], opts: Pick<Availability, 'sessionMax' | 'sessionMin' | 'pause'>): Schedule {
  const left = new Map(tasks.map((t) => [t.id, t.minutes]))
  const capacity = new Map(days.map((d) => [d.day, dayCapacity(d.slots, d.target)]))
  const blocks: PlannedBlock[] = []
  const load: Schedule['load'] = {}

  // Jours où l'on peut travailler, et premier jour de chaque tâche
  const workDays = days.filter((d) => (capacity.get(d.day) ?? 0) >= opts.sessionMin).map((d) => d.day)
  const firstDay = new Map(tasks.map((t) => [t.id, days[0]?.day ?? '']))

  // Temps encore disponible d'un jour donné jusqu'à une date limite
  const capacityUntil = (from: string, to: string) => days.filter((d) => d.day >= from && d.day <= to).reduce((n, d) => n + (capacity.get(d.day) ?? 0), 0)

  for (const d of days) {
    const cap = capacity.get(d.day) ?? 0
    let free = cap
    const today: { task: Task; minutes: number }[] = []
    const used = new Set<string>()
    while (free >= opts.sessionMin) {
      // La tâche la plus urgente : le moins de marge entre le temps restant et le temps disponible
      const candidates = tasks
        .filter((t) => (left.get(t.id) ?? 0) > 0 && t.lastDay >= d.day && !used.has(t.id))
        .map((t) => ({ t, slack: capacityUntil(d.day, t.lastDay) - (left.get(t.id) ?? 0) }))
        .sort((a, b) => a.slack - b.slack || a.t.lastDay.localeCompare(b.t.lastDay))
      if (!candidates.length) break
      const { t, slack } = candidates[0]
      const remaining = left.get(t.id)!
      const later = slack < 0 ? 0 : capacityUntil(nextDay(d.day), t.lastDay)
      const mustToday = Math.max(0, remaining - later)
      // Rythme régulier : on travaille sur la tâche seulement si elle est en retard
      // sur une progression linéaire jusqu'à l'échéance (séances espacées, pas de miettes)
      const span = workDays.filter((x) => x >= firstDay.get(t.id)! && x <= t.lastDay)
      const k = span.filter((x) => x <= d.day).length
      const expected = (t.minutes * k) / Math.max(1, span.length)
      const behind = expected - (t.minutes - remaining)
      if (mustToday === 0 && behind <= 0) {
        used.add(t.id)
        continue
      }
      const preferred = Math.min(PREFERRED, opts.sessionMax)
      let m = Math.min(remaining, free, Math.max(mustToday, Math.min(opts.sessionMax, Math.max(preferred, round5(behind)))))
      // Pas de petit reste isolé : on le fait dans la foulée s'il y a la place
      if (remaining - m > 0 && remaining - m < opts.sessionMin) m = Math.min(remaining, free)
      today.push({ task: t, minutes: m })
      left.set(t.id, remaining - m)
      free -= m
      used.add(t.id)
    }

    // Heures de début : séances placées dans l'ordre des créneaux, avec une pause entre elles
    const cursor = d.slots.map((s) => ({ ...s }))
    for (const b of today) {
      const slot = cursor.find((s) => s.end - s.start >= b.minutes)
      let start: string | null = null
      if (slot) {
        start = toHHMM(slot.start)
        slot.start += b.minutes + opts.pause
      }
      blocks.push({ taskId: b.task.id, day: d.day, minutes: b.minutes, start })
    }
    load[d.day] = { used: cap - free, capacity: cap }
  }

  const shortfalls = tasks.filter((t) => (left.get(t.id) ?? 0) > 0).map((t) => ({ taskId: t.id, missing: left.get(t.id)! }))
  return { blocks, shortfalls, load }
}

// Séances de révision d'un examen : temps visé moins ce qui est déjà fait,
// jusqu'à la veille de l'examen
export function revisionNeed(targetMinutes: number, doneMinutes: number) {
  return Math.max(0, targetMinutes - doneMinutes)
}
