import { describe, expect, it } from 'vitest'
import { MIN_EASE, nextEase, previewLabel, review, type CardState } from './sm2'

const fresh: CardState = { interval_days: 0, ease: 2.5, repetitions: 0, lapses: 0 }
const now = new Date('2026-10-28T10:00:00')

const days = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000)

describe('SM-2', () => {
  it('« Bien » : 2 jours, puis 6 jours, puis intervalle × facilité', () => {
    const r1 = review(fresh, 2, now)
    expect(r1.interval_days).toBe(2)
    expect(r1.repetitions).toBe(1)
    const r2 = review(r1, 2, now)
    expect(r2.interval_days).toBe(6)
    const r3 = review(r2, 2, now)
    expect(r3.interval_days).toBe(Math.round(6 * r3.ease))
    expect(r3.interval_days).toBe(15)
  })

  it('la facilité suit la formule SM-2', () => {
    expect(nextEase(2.5, 5)).toBe(2.6)
    expect(nextEase(2.5, 4)).toBe(2.5)
    expect(nextEase(2.5, 3)).toBe(2.36)
    expect(nextEase(2.5, 1)).toBe(1.96)
  })

  it('la facilité ne descend jamais sous 1,3', () => {
    let c: CardState = { ...fresh, ease: 1.35 }
    for (let i = 0; i < 5; i++) c = review(c, 0, now)
    expect(c.ease).toBe(MIN_EASE)
  })

  it('« Je ne savais pas » remet la carte à zéro et la repropose dans 10 minutes', () => {
    const learned: CardState = { interval_days: 15, ease: 2.5, repetitions: 3, lapses: 0 }
    const r = review(learned, 0, now)
    expect(r.repetitions).toBe(0)
    expect(r.interval_days).toBe(0)
    expect(r.lapses).toBe(1)
    expect(r.due_at.getTime() - now.getTime()).toBe(10 * 60_000)
  })

  it('dès la première révision, le délai dépend de la réponse', () => {
    expect([1, 2, 3].map((g) => review(fresh, g as 1 | 2 | 3, now).interval_days)).toEqual([1, 2, 4])
    const once: CardState = { interval_days: 2, ease: 2.5, repetitions: 1, lapses: 0 }
    expect([1, 2, 3].map((g) => review(once, g as 1 | 2 | 3, now).interval_days)).toEqual([3, 6, 10])
    expect([0, 1, 2, 3].map((g) => previewLabel(fresh, g as 0 | 1 | 2 | 3, now))).toEqual(['10 min', '1 j', '2 j', '4 j'])
  })

  it('« Facile » espace plus que « Bien », qui espace plus que « Difficile »', () => {
    const c: CardState = { interval_days: 6, ease: 2.5, repetitions: 2, lapses: 0 }
    const hard = review(c, 1, now).interval_days
    const good = review(c, 2, now).interval_days
    const easy = review(c, 3, now).interval_days
    expect(hard).toBeLessThan(good)
    expect(good).toBeLessThan(easy)
  })

  it("la prochaine révision tombe le bon jour, en début de journée", () => {
    const r = review({ interval_days: 6, ease: 2.5, repetitions: 2, lapses: 0 }, 2, now)
    expect(days(r.due_at, new Date('2026-10-28T04:00:00'))).toBe(r.interval_days)
    expect(r.due_at.getHours()).toBe(4)
  })

  it('aperçu lisible des intervalles', () => {
    expect(previewLabel(fresh, 0, now)).toBe('10 min')
    expect(previewLabel(fresh, 2, now)).toBe('2 j')
    expect(previewLabel({ interval_days: 100, ease: 2.5, repetitions: 5, lapses: 0 }, 2, now)).toBe('8 mois')
  })
})
