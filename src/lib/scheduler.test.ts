import { describe, expect, it } from 'vitest'
import { defaultAvailability, freeSlots, toHHMM } from './availability'
import { schedule, type PlanDay, type Task } from './scheduler'

const avail = defaultAvailability(120)
const opts = { sessionMax: avail.sessionMax, sessionMin: avail.sessionMin, pause: avail.pause }
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m) // novembre 2026 (le 2 est un lundi)

describe('créneaux libres', () => {
  it('retire les cours et la pause qui suit de la plage de travail', () => {
    // Lundi 2 novembre : plage 17:30 – 22:00, cours de 16:00 à 18:30
    const slots = freeSlots(at(2, 0), avail, [{ start: at(2, 16), end: at(2, 18, 30) }])
    expect(slots.map((s) => [toHHMM(s.start), toHHMM(s.end)])).toEqual([['18:45', '22:00']])
  })
  it('commence à l’heure actuelle pour aujourd’hui', () => {
    const slots = freeSlots(at(2, 0), avail, [], at(2, 19, 7))
    expect(toHHMM(slots[0].start)).toBe('19:15')
  })
  it('ignore un jour sans temps de travail', () => {
    const a = defaultAvailability(0)
    expect(freeSlots(at(2, 0), a, [])).toEqual([])
  })
})

const day = (d: string, target = 120, from = 18 * 60, to = 22 * 60): PlanDay => ({ day: d, target, slots: [{ start: from, end: to }] })
const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((d) => day(d))
const task = (id: string, minutes: number, lastDay: string): Task => ({ id, kind: 'assignment', title: id, subjectId: null, minutes, lastDay })

describe('planification globale', () => {
  it('étale un devoir jusqu’à la veille de l’échéance', () => {
    const s = schedule([task('dossier', 180, '2026-11-05')], days, opts)
    expect(s.blocks.map((b) => [b.day, b.minutes])).toEqual([
      ['2026-11-02', 45],
      ['2026-11-03', 45],
      ['2026-11-04', 45],
      ['2026-11-05', 45],
    ])
    expect(s.shortfalls).toEqual([])
  })
  it('fait passer le plus urgent en premier et donne une heure à chaque séance', () => {
    const s = schedule([task('lointain', 60, '2026-11-06'), task('urgent', 100, '2026-11-02')], days, opts)
    const lundi = s.blocks.filter((b) => b.day === '2026-11-02')
    expect(lundi[0].taskId).toBe('urgent')
    expect(lundi[0].start).toBe('18:00')
    // dû le lendemain : tout est fait le lundi, rien n'est perdu
    expect(lundi[0].minutes).toBe(100)
    expect(s.shortfalls).toEqual([])
    // la séance suivante commence après la première et la pause
    expect(lundi[1]?.start).toBe(`${toHHMM(18 * 60 + lundi[0].minutes + 10)}`)
  })
  it('signale ce qui ne tient pas avant l’échéance', () => {
    const s = schedule([task('trop', 400, '2026-11-03')], days, opts)
    expect(s.shortfalls).toEqual([{ taskId: 'trop', missing: 160 }])
    expect(s.load['2026-11-02'].used).toBe(120)
  })
  it('ne dépasse jamais le temps disponible d’une journée', () => {
    const s = schedule([task('a', 300, '2026-11-06'), task('b', 300, '2026-11-06'), task('c', 300, '2026-11-06')], days, opts)
    for (const d of days) expect(s.blocks.filter((b) => b.day === d.day).reduce((n, b) => n + b.minutes, 0)).toBeLessThanOrEqual(120)
  })
  it('fait un petit devoir d’une traite plutôt qu’en miettes', () => {
    const s = schedule([task('essay', 60, '2026-11-05')], days, opts)
    expect(s.blocks.map((b) => b.minutes)).toEqual([60])
  })
  it('espace les révisions jusqu’à l’examen, en séances d’au moins 45 min', () => {
    const many = Array.from({ length: 21 }, (_, i) => day(`2026-11-${String(i + 2).padStart(2, '0')}`))
    const s = schedule([{ ...task('rev', 360, '2026-11-22'), kind: 'revision' }], many, opts)
    expect(s.blocks.every((b) => b.minutes >= 45)).toBe(true)
    expect(s.blocks.length).toBeLessThanOrEqual(8)
    // la dernière séance tombe dans la dernière semaine, pas tout au début
    expect(s.blocks.at(-1)!.day >= '2026-11-16').toBe(true)
    expect(s.shortfalls).toEqual([])
  })
})
