import { describe, expect, it } from 'vitest'
import { daysUntil, pickReminders, reminderEmail, type DueItem } from './reminders'

const now = new Date('2026-10-29T06:00:00Z') // jeudi 7 h à Paris

describe('rappels par email', () => {
  it('compte les jours calendaires à l’heure de Paris', () => {
    expect(daysUntil(new Date('2026-10-30T22:30:00Z'), now)).toBe(1) // vendredi 23 h 30 à Paris
    expect(daysUntil(new Date('2026-10-30T23:30:00Z'), now)).toBe(2) // samedi 0 h 30 à Paris
    expect(daysUntil(new Date('2026-10-29T20:00:00Z'), now)).toBe(0)
  })

  const items: DueItem[] = [
    { id: 'a', user_id: 'u1', title: 'Dossier', due_at: '2026-10-30T16:00:00Z', subject: 'Finance', space: 's' },
    { id: 'b', user_id: 'u1', title: 'Essay', due_at: '2026-11-01T16:00:00Z', subject: null, space: 's' },
    { id: 'c', user_id: 'u2', title: 'Exposé', due_at: '2026-10-30T16:00:00Z', subject: null, space: 's' },
  ]

  it('rappelle à J-3 et J-1 par défaut, une seule fois', () => {
    const picks = pickReminders(items, new Map(), new Set(['c|1']), now)
    expect(picks.get('u1')!.map((p) => [p.id, p.days])).toEqual([
      ['a', 1],
      ['b', 3],
    ])
    expect(picks.has('u2')).toBe(false)
  })

  it('respecte les réglages de chacun', () => {
    const picks = pickReminders(items, new Map([['u1', { notify_email: false, notify_days: [1] }]]), new Set(), now)
    expect(picks.has('u1')).toBe(false)
    expect(picks.get('u2')!.length).toBe(1)
  })

  it('écrit un message lisible', () => {
    const mail = reminderEmail([{ ...items[0], days: 1 }], 'https://jadecaruana.fr')
    expect(mail.subject).toBe('À rendre demain : Dossier')
    expect(mail.text).toContain('Finance')
    expect(mail.html).toContain('https://jadecaruana.fr/agenda')
  })
})

describe('notifications', () => {
  it('résume une ou plusieurs échéances', async () => {
    const { reminderPush, cardsPush } = await import('./reminders')
    const base = { id: '1', user_id: 'u', due_at: '2026-11-02T10:00:00Z', subject: 'Finance', space: 'École' }
    expect(reminderPush([{ ...base, title: 'Cas pratique', days: 1 }]).title).toBe('À rendre demain')
    expect(reminderPush([{ ...base, title: 'A', days: 1 }, { ...base, id: '2', title: 'B', days: 3 }]).title).toBe('2 devoirs à rendre bientôt')
    expect(cardsPush(14).title).toBe('14 flash cards à revoir')
    expect(cardsPush(1).body).toContain('1 minute.')
  })
})
