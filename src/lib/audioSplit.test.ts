import { describe, expect, it } from 'vitest'
import { toPcm16, wavHeader } from './audioSplit'

describe('conversion audio', () => {
  it('écrit un en-tête WAV valide', () => {
    const h = new DataView(wavHeader(16_000))
    expect(String.fromCharCode(...new Uint8Array(h.buffer, 0, 4))).toBe('RIFF')
    expect(h.getUint32(24, true)).toBe(16_000)
    expect(h.getUint32(40, true)).toBe(32_000)
    expect(h.getUint32(4, true)).toBe(36 + 32_000)
  })

  it('mélange en mono et borne les valeurs', () => {
    const pcm = toPcm16([new Float32Array([1, -1, 0.5, 2]), new Float32Array([1, -1, -0.5, 2])], 0, 4)
    expect(Array.from(pcm)).toEqual([32767, -32768, 0, 32767])
  })
})
