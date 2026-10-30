// Conversion sur l'appareil d'un gros fichier audio ou vidéo en morceaux légers
// (WAV mono 16 kHz, 15 minutes par morceau ≈ 29 Mo), pour passer sous la limite
// de 50 Mo par fichier du stockage. Seule la piste son est gardée.
export const SAMPLE_RATE = 16_000

// En-tête WAV PCM 16 bits mono
export function wavHeader(samples: number, rate = SAMPLE_RATE) {
  const h = new DataView(new ArrayBuffer(44))
  const str = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  h.setUint32(4, 36 + samples * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  h.setUint32(16, 16, true)
  h.setUint16(20, 1, true)
  h.setUint16(22, 1, true)
  h.setUint32(24, rate, true)
  h.setUint32(28, rate * 2, true)
  h.setUint16(32, 2, true)
  h.setUint16(34, 16, true)
  str(36, 'data')
  h.setUint32(40, samples * 2, true)
  return h.buffer
}

// Mélange les canaux en mono et convertit en 16 bits, sur [start, end[
export function toPcm16(channels: Float32Array[], start: number, end: number) {
  const out = new Int16Array(end - start)
  const n = channels.length
  for (let i = start; i < end; i++) {
    let v = 0
    for (let c = 0; c < n; c++) v += channels[c][i]
    v = Math.max(-1, Math.min(1, v / n))
    out[i - start] = v < 0 ? v * 0x8000 : v * 0x7fff
  }
  return out
}

export async function splitToWavParts(file: File, partSec: number): Promise<{ blob: Blob; duration: number }[]> {
  const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!Ctx) throw new Error('Ce navigateur ne sait pas convertir ce fichier. Essaie sur un ordinateur avec Chrome, Edge ou Safari récent.')
  let buffer: AudioBuffer
  try {
    // Le décodage rééchantillonne directement à 16 kHz
    buffer = await new Ctx(1, 1, SAMPLE_RATE).decodeAudioData(await file.arrayBuffer())
  } catch {
    throw new Error('Impossible de lire le son de ce fichier (format non reconnu ou fichier trop lourd pour cet appareil). Essaie sur un ordinateur, ou exporte seulement l’audio.')
  }
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const per = partSec * buffer.sampleRate
  const parts: { blob: Blob; duration: number }[] = []
  for (let start = 0; start < buffer.length; start += per) {
    const end = Math.min(buffer.length, start + per)
    const pcm = toPcm16(channels, start, end)
    parts.push({ blob: new Blob([wavHeader(pcm.length, buffer.sampleRate), pcm.buffer], { type: 'audio/wav' }), duration: Math.round((end - start) / buffer.sampleRate) })
  }
  return parts
}
