import { describe, expect, it } from 'vitest'
import { clock, parseClock, transcriptText } from './ai'
import { audioMime, rangesFor } from './transcription'

describe('transcription', () => {
  it('lit et écrit les horodatages', () => {
    expect(parseClock('01:05')).toBe(65)
    expect(parseClock('1:02:03')).toBe(3723)
    expect(clock(3723)).toBe('1:02:03')
    expect(clock(65)).toBe('01:05')
  })
  it('découpe un long audio en passages de 20 minutes', () => {
    expect(rangesFor(15 * 60)).toBeNull()
    expect(rangesFor(null)).toBeNull()
    expect(rangesFor(50 * 60)).toEqual([
      [0, 1200],
      [1200, 2400],
      [2400, 3000],
    ])
  })
  it('donne un type audio compris par le service IA', () => {
    expect(audioMime('audio/webm;codecs=opus', 'a.webm')).toBe('audio/webm')
    expect(audioMime('audio/x-m4a', 'a.m4a')).toBe('audio/mp4')
    expect(audioMime('', 'cours.mp3')).toBe('audio/mp3')
  })
  it('met en forme la transcription', () => {
    expect(transcriptText([{ start: 0, text: 'Bonjour.' }, { start: 75, text: 'La VAN.' }])).toBe('[00:00] Bonjour.\n\n[01:15] La VAN.')
  })
})
