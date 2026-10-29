import { describe, expect, it } from 'vitest'
import { IDLE_MS, isActive, timerLabel } from './studyTimer'

describe('chronomètre de session', () => {
  it('compte tant qu’une action a eu lieu il y a moins de 10 minutes', () => {
    expect(isActive(1_000_000, 1_000_000 - IDLE_MS + 1000, true)).toBe(true)
    expect(isActive(1_000_000, 1_000_000 - IDLE_MS, true)).toBe(false)
  })
  it('ne compte pas quand la page est cachée', () => {
    expect(isActive(10, 9, false)).toBe(false)
  })
  it('affiche une durée lisible', () => {
    expect(timerLabel(42)).toBe('42 s')
    expect(timerLabel(125)).toBe('2 min')
    expect(timerLabel(3720)).toBe('1 h 02')
  })
})
