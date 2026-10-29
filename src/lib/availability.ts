// Disponibilités de travail personnel et créneaux libres d'une journée
// (plage horaire choisie, moins les cours de l'emploi du temps).

export type DayAvailability = { minutes: number; from: string; to: string }
export type Availability = {
  // index 0 = lundi … 6 = dimanche
  days: DayAvailability[]
  // pause après un cours avant de pouvoir travailler (minutes)
  afterClass: number
  // durée d'une séance : au plus / au moins (minutes)
  sessionMax: number
  sessionMin: number
  // pause entre deux séances (minutes)
  pause: number
}

export function defaultAvailability(weekday = 120): Availability {
  const week = { minutes: weekday, from: '17:30', to: '22:00' }
  return {
    days: [week, week, week, week, week, { minutes: 180, from: '10:00', to: '19:00' }, { minutes: 120, from: '14:00', to: '20:00' }].map((d) => ({ ...d })),
    afterClass: 15,
    sessionMax: 60,
    sessionMin: 20,
    pause: 10,
  }
}

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// Lundi = 0
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7

export type Slot = { start: number; end: number }

// Créneaux libres d'une journée, en minutes depuis minuit
export function freeSlots(
  date: Date,
  avail: Availability,
  classes: { start: Date; end: Date }[],
  now?: Date,
): Slot[] {
  const day = avail.days[weekdayIndex(date)]
  if (!day || day.minutes <= 0) return []
  let from = toMin(day.from)
  const to = toMin(day.to)
  // Aujourd'hui : on commence à l'heure actuelle, arrondie au quart d'heure suivant
  if (now && sameDay(now, date)) from = Math.max(from, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15)
  let slots: Slot[] = from < to ? [{ start: from, end: to }] : []
  for (const c of classes) {
    if (!sameDay(c.start, date)) continue
    const cs = c.start.getHours() * 60 + c.start.getMinutes()
    const ce = sameDay(c.end, date) ? c.end.getHours() * 60 + c.end.getMinutes() + avail.afterClass : 24 * 60
    slots = slots.flatMap((s) => {
      if (ce <= s.start || cs >= s.end) return [s]
      const out: Slot[] = []
      if (cs > s.start) out.push({ start: s.start, end: cs })
      if (ce < s.end) out.push({ start: ce, end: s.end })
      return out
    })
  }
  return slots.filter((s) => s.end - s.start >= avail.sessionMin)
}

// Temps de travail possible ce jour-là : le plus petit entre l'objectif et le temps libre
export function dayCapacity(slots: Slot[], target: number) {
  return Math.min(
    target,
    slots.reduce((n, s) => n + s.end - s.start, 0),
  )
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
