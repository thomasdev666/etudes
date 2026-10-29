// Planification d'un devoir : découpe la durée estimée en séances réparties
// sur les jours disponibles avant l'échéance. Ne fait que proposer :
// rien n'est enregistré sans validation de l'utilisateur.

export type PlanProposal = { day: string; minutes: number }[]

export type PlannerInput = {
  totalMinutes: number
  today: Date
  dueAt: Date
  dailyBudget: number // minutes de travail personnel visées par jour
  // temps de travail possible un jour donné (créneaux libres) ; remplace dailyBudget
  capacity?: (day: string) => number
  busyMinutes: Record<string, number> // minutes déjà prévues par jour (yyyy-mm-dd)
  sessionMax?: number
  sessionMin?: number
}

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function proposePlan(input: PlannerInput): PlanProposal {
  const sessionMax = input.sessionMax ?? 60
  const sessionMin = input.sessionMin ?? 20
  const start = new Date(input.today)
  start.setHours(0, 0, 0, 0)
  const last = new Date(input.dueAt)
  last.setHours(0, 0, 0, 0)
  // On s'arrête la veille de l'échéance, sauf si elle tombe aujourd'hui
  if (last.getTime() > start.getTime()) last.setDate(last.getDate() - 1)

  const days: { day: string; free: number }[] = []
  for (const d = new Date(start); d <= last; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d)
    const target = input.capacity ? input.capacity(key) : input.dailyBudget
    days.push({ day: key, free: Math.max(0, target - (input.busyMinutes[key] ?? 0)) })
  }
  if (!days.length || input.totalMinutes <= 0) return []

  // Nombre de séances : assez pour ne pas dépasser sessionMax, réparties au mieux
  let remaining = input.totalMinutes
  const sessions = Math.max(1, Math.ceil(input.totalMinutes / sessionMax))
  const target = Math.max(sessionMin, Math.ceil(input.totalMinutes / sessions / 5) * 5)

  // Jours candidats espacés régulièrement (meilleure mémorisation que tout la veille)
  const available = days.filter((d) => d.free >= sessionMin)
  const pool = available.length ? available : days
  const step = pool.length / Math.min(sessions, pool.length)
  const chosen = new Set<number>()
  for (let i = 0; i < Math.min(sessions, pool.length); i++) chosen.add(Math.floor(i * step))

  const out = new Map<string, number>()
  const order = [...chosen].map((i) => pool[i])
  // Premier passage : une séance par jour choisi
  for (const d of order) {
    if (remaining <= 0) break
    const m = Math.min(target, remaining, Math.max(d.free, sessionMin))
    out.set(d.day, m)
    d.free -= m
    remaining -= m
  }
  // Reste éventuel : on complète les jours qui ont encore de la place, puis on force
  for (const d of pool) {
    if (remaining <= 0) break
    if (d.free <= 0) continue
    const m = Math.min(d.free, remaining)
    out.set(d.day, (out.get(d.day) ?? 0) + m)
    d.free -= m
    remaining -= m
  }
  if (remaining > 0) {
    const lastDay = order[order.length - 1] ?? pool[pool.length - 1]
    out.set(lastDay.day, (out.get(lastDay.day) ?? 0) + remaining)
  }

  return [...out.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, minutes]) => ({ day, minutes: Math.round(minutes) }))
}
