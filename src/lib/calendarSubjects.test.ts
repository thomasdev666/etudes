import { describe, expect, it } from 'vitest'
import { suggestFromTitles } from './calendarSubjects'

describe('matières depuis l’emploi du temps', () => {
  it('regroupe CM / TD d’une même matière et garde le code', () => {
    const titles = [
      'FIN301 - Corporate Finance - CM',
      'FIN301 - Corporate Finance - TD Gr4',
      'FIN301 - Corporate Finance (Amphi A)',
      'Marketing digital - TD',
      'Marketing digital - CM',
      'Réunion BDE',
      'Business English',
      'Business English',
    ]
    const s = suggestFromTitles(titles)
    const names = s.map((x) => x.name)
    expect(names).toContain('Corporate Finance')
    expect(names).toContain('Marketing digital')
    expect(names).toContain('Business English')
    expect(names.some((n) => /BDE/i.test(n))).toBe(false)
    expect(s.find((x) => x.name === 'Corporate Finance')!.keywords).toEqual(['FIN301'])
    expect(s[0].count).toBe(3)
  })
})
