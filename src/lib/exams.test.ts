import { describe, expect, it } from 'vitest'
import { EXAMS, sectionPoints, toeicEstimate } from './exams'
import { scoreSummary, sectionSeconds } from './examSession'

describe('épreuves', () => {
  it('reprend le format du TAGE MAGE : 6 × 15 questions, 20 min, 5 choix', () => {
    expect(EXAMS.tage.sections).toHaveLength(6)
    expect(EXAMS.tage.sections.every((s) => s.count === 15 && s.minutes === 20 && s.choices === 5)).toBe(true)
  })
  it('donne 75 minutes au Reading du TOEIC', () => {
    expect(EXAMS.toeic.sections.filter((s) => s.key >= 'part5').reduce((n, s) => n + s.minutes, 0)).toBe(75)
  })
  it('applique le barème du TAGE MAGE', () => {
    expect(sectionPoints('tage', 10, 3, 2)).toBe(37)
    expect(scoreSummary('tage', [{ key: 'calcul', right: 10, wrong: 3, blank: 2, total: 15, points: 37 }]).lines[0].value).toBe('37 / 60')
    // Entraînement court : points réels, et l'équivalent sur 60
    expect(scoreSummary('tage', [{ key: 'calcul', right: 1, wrong: 1, blank: 1, total: 3, points: 3 }]).total).toBe('3 / 12 points (≈ 15 / 60)')
  })
  it('ramène le temps au nombre de questions', () => {
    expect(sectionSeconds('tage', 'calcul', 5)).toBe(400)
  })
  it('estime un score TOEIC', () => {
    expect(toeicEstimate(0, 10)).toBe(5)
    expect(toeicEstimate(10, 10)).toBe(495)
    expect(scoreSummary('toeic', [{ key: 'part5', right: 15, wrong: 15, blank: 0, total: 30, points: 15 }]).total).toBe('Reading ≈ 250 / 495')
  })
})
