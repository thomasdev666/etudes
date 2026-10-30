// Conversation avec GIRAFA en direct : la réponse arrive mot à mot depuis la fonction serveur
// (la clé de l'IA ne quitte jamais le serveur). Cours d'abord, Internet sinon.
import { authHeader } from './supabase'

export type ChatTurn = { from: 'me' | 'bot'; text: string }
export type LiveAnswer = { text: string; from: 'courses' | 'web' | null; sources: string[]; web: { title: string; uri: string }[] }
export type GirafaResult = { kind: 'answer'; answer: LiveAnswer } | { kind: 'doc'; instruction: string; subject_ids: string[] }

type Event =
  | { t: 'meta'; from: 'courses' | 'web'; sources: string[] }
  | { t: 'delta'; text: string }
  | { t: 'web'; sources: { title: string; uri: string }[] }
  | { t: 'doc'; instruction: string; subject_ids: string[] }
  | { t: 'error'; message: string }
  | { t: 'done' }

export async function streamGirafa(spaceId: string, question: string, history: ChatTurn[], onUpdate: (live: LiveAnswer) => void): Promise<GirafaResult> {
  const res = await fetch('/.netlify/functions/girafa-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ space_id: spaceId, question, history: history.slice(-8) }),
  })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !res.body || !type.includes('ndjson')) {
    const err = type.includes('json') ? ((await res.json().catch(() => null)) as { error?: string } | null)?.error : null
    throw new Error(err ?? (type.includes('html') ? 'GIRAFA n’est pas encore disponible sur ce site (fonction serveur non déployée).' : `GIRAFA est indisponible (${res.status}).`))
  }
  const live: LiveAnswer = { text: '', from: null, sources: [], web: [] }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let finished = false
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      const ev = JSON.parse(line) as Event
      if (ev.t === 'doc') return { kind: 'doc', instruction: ev.instruction, subject_ids: ev.subject_ids }
      if (ev.t === 'error') throw new Error(ev.message)
      if (ev.t === 'done') finished = true
      if (ev.t === 'meta') Object.assign(live, { from: ev.from, sources: ev.sources })
      if (ev.t === 'delta') live.text += ev.text
      if (ev.t === 'web') live.web = ev.sources
      onUpdate({ ...live })
    }
  }
  // Réponse coupée en route (connexion, délai du serveur) : on garde ce qui est arrivé
  if (!finished && !live.text) throw new Error('La réponse a été interrompue. Réessaie dans un instant.')
  if (!finished) live.text += '\n\n… (réponse coupée en route : repose ta question pour la suite)'
  return { kind: 'answer', answer: live }
}
