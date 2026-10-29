import { describe, expect, it } from 'vitest'
import { splitScript } from './speech'

describe('lecture TOEIC', () => {
  it('répartit les répliques entre les voix', () => {
    expect(splitScript('W: Did you book the room?\nM: Yes, for Tuesday.\nM2: I will join you.\nPlease note the change.')).toEqual([
      { speaker: 'W', text: 'Did you book the room?' },
      { speaker: 'M', text: 'Yes, for Tuesday.' },
      { speaker: 'M2', text: 'I will join you.' },
      { speaker: 'N', text: 'Please note the change.' },
    ])
  })
})
