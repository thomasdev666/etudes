import { describe, expect, it } from 'vitest'
import { proposePlan } from './planner'

const today = new Date('2026-10-28T09:00:00')
const sum = (p: { minutes: number }[]) => p.reduce((s, x) => s + x.minutes, 0)

describe('proposePlan', () => {
  it('répartit toute la durée avant le jour de rendu', () => {
    const p = proposePlan({ totalMinutes: 180, today, dueAt: new Date('2026-11-04T23:59:00'), dailyBudget: 120, busyMinutes: {} })
    expect(sum(p)).toBe(180)
    expect(p.length).toBe(3)
    expect(p.every((x) => x.day < '2026-11-04')).toBe(true)
    expect(p[0].day).toBe('2026-10-28')
  })

  it('évite les jours déjà pleins', () => {
    const p = proposePlan({
      totalMinutes: 60,
      today,
      dueAt: new Date('2026-10-31T12:00:00'),
      dailyBudget: 120,
      busyMinutes: { '2026-10-28': 120, '2026-10-29': 110 },
    })
    expect(p.map((x) => x.day)).toEqual(['2026-10-30'])
  })

  it("garde toute la durée même quand le temps manque", () => {
    const p = proposePlan({ totalMinutes: 300, today, dueAt: new Date('2026-10-29T18:00:00'), dailyBudget: 60, busyMinutes: {} })
    expect(sum(p)).toBe(300)
  })

  it('échéance aujourd’hui : tout aujourd’hui', () => {
    const p = proposePlan({ totalMinutes: 45, today, dueAt: new Date('2026-10-28T20:00:00'), dailyBudget: 120, busyMinutes: {} })
    expect(p).toEqual([{ day: '2026-10-28', minutes: 45 }])
  })
})
