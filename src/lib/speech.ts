// Lecture à voix haute (TOEIC Listening) avec les voix anglaises de l'appareil.
// Les répliques « M: », « W: », « M2: » sont lues par des voix différentes si possible.

const FEMALE = /female|woman|samantha|karen|moira|tessa|serena|victoria|zira|susan|hazel|libby|sonia|aria|jenny|fiona|kate|google uk english female|google us english/i
const MALE = /male|daniel|alex|fred|oliver|arthur|david|mark|george|ryan|guy|thomas|rishi|google uk english male/i

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

// Les voix se chargent parfois après coup (Chrome)
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)
  })
}

async function englishVoices() {
  const all = (await loadVoices()).filter((v) => /^en[-_]/i.test(v.lang))
  // Les voix « naturelles » (neuronales) d'Edge, Chrome, macOS et iOS d'abord : bien plus proches d'un vrai enregistrement
  const quality = (v: SpeechSynthesisVoice) => (/natural|neural|premium|enhanced|siri/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : 2)
  const rank = (v: SpeechSynthesisVoice) => quality(v) * 2 + (/en[-_](US|GB)/i.test(v.lang) ? 0 : 1)
  const sorted = all.sort((a, b) => rank(a) - rank(b))
  const woman = sorted.find((v) => FEMALE.test(v.name) && !/\bmale\b/i.test(v.name)) ?? sorted[0]
  const man = sorted.find((v) => MALE.test(v.name) && v !== woman) ?? sorted.find((v) => v !== woman) ?? woman
  return { woman, man, other: sorted.find((v) => v !== woman && v !== man) ?? man }
}

export type Line = { speaker: 'W' | 'M' | 'M2' | 'N'; text: string }

// « W: Hello » → { speaker: 'W', text: 'Hello' } ; sans indication : narrateur
export function splitScript(script: string): Line[] {
  return script
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(W|M2|M|Woman|Man|Narrator)\s*\d?\s*:\s*(.+)$/i)
      if (!m) return { speaker: 'N' as const, text: l }
      const who = m[1].toUpperCase()
      return { speaker: (who.startsWith('W') ? 'W' : who === 'M2' ? 'M2' : who === 'NARRATOR' ? 'N' : 'M') as Line['speaker'], text: m[2] }
    })
}

let token = 0

export function stopSpeaking() {
  token++
  if (speechSupported()) speechSynthesis.cancel()
}

// Lit les lignes l'une après l'autre ; se résout à la fin (ou à l'arrêt)
export async function speak(lines: Line[], opts: { rate?: number; pauseMs?: number } = {}) {
  if (!speechSupported()) throw new Error('La lecture audio n’est pas disponible sur ce navigateur.')
  stopSpeaking()
  const mine = ++token
  const v = await englishVoices()
  for (const line of lines) {
    if (mine !== token) return
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(line.text)
      const voice = line.speaker === 'W' ? v.woman : line.speaker === 'M2' ? v.other : line.speaker === 'M' ? v.man : v.woman
      if (voice) u.voice = voice
      u.lang = voice?.lang ?? 'en-US'
      u.rate = opts.rate ?? 0.95
      // Sans voix masculine distincte, on change un peu la hauteur
      u.pitch = line.speaker === 'M' && v.man === v.woman ? 0.8 : line.speaker === 'M2' && v.other === v.man ? 0.65 : 1
      u.onend = () => resolve()
      u.onerror = () => resolve()
      speechSynthesis.speak(u)
    })
    if (opts.pauseMs) await new Promise((r) => setTimeout(r, opts.pauseMs))
  }
}
