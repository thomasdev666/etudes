// Transcription d'un enregistrement, morceau par morceau.
// L'avancement est sauvegardé après chaque passage : si le temps de la fonction
// est presque écoulé, on s'arrête et la fonction se relance pour continuer.
import type { SupabaseClient } from '@supabase/supabase-js'
import { forgetAudio, INLINE_AUDIO_MAX, transcribeAudio, transcriptText, uploadAudio, type Segment } from './ai'

// Au-delà de cette durée, un morceau est transcrit en plusieurs passages
export const RANGE_SEC = 20 * 60

type Part = { id: string; path: string; mime: string; size: number; duration_sec: number | null; part_index: number }
export type TranscriptionState = {
  progress?: number
  phase?: string
  part?: number
  range?: number
  segments?: Segment[]
  // fichiers déjà déposés chez Google (réutilisés en cas de reprise)
  uploads?: Record<string, { uri: string; name: string }>
}

// Passages [début, fin] d'un morceau
export function rangesFor(duration: number | null): [number, number][] | null {
  if (!duration || duration <= RANGE_SEC + 120) return null
  const out: [number, number][] = []
  for (let t = 0; t < duration; t += RANGE_SEC) out.push([t, Math.min(duration, t + RANGE_SEC)])
  return out
}

// « audio/webm;codecs=opus » → « audio/webm » ; extension si le type est inconnu
export function audioMime(mime: string, path: string) {
  const m = mime.split(';')[0].trim().toLowerCase()
  if (m && m !== 'application/octet-stream') return m === 'audio/x-m4a' || m === 'audio/m4a' ? 'audio/mp4' : m
  const ext = path.split('.').pop()?.toLowerCase()
  return (
    { mp3: 'audio/mp3', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg', aac: 'audio/aac', mp4: 'video/mp4', mov: 'video/quicktime' }[ext ?? ''] ??
    'audio/mpeg'
  )
}

export async function runTranscription(
  db: SupabaseClient,
  job: { id: string; space_id: string; params: { recording_id: string }; result: TranscriptionState | null },
  opts: { stopAt: number; save: (state: TranscriptionState) => Promise<void> },
): Promise<'done' | 'continue'> {
  const { data: rec, error } = await db.from('recordings').select('*').eq('id', job.params.recording_id).single()
  if (error || !rec) throw new Error('Enregistrement introuvable')
  const { data: subject } = await db.from('subjects').select('name').eq('id', rec.subject_id).single()
  const { data: files, error: fe } = await db
    .from('files')
    .select('id, path, mime, size, duration_sec, part_index')
    .eq('recording_id', rec.id)
    .is('deleted_at', null)
    .order('part_index')
  if (fe) throw fe
  const parts = (files ?? []) as Part[]
  if (!parts.length) throw new Error('L’audio de cet enregistrement n’est plus disponible')

  const state: TranscriptionState = { segments: [], uploads: {}, part: 0, range: 0, ...(job.result ?? {}) }
  const totalSec = Math.max(1, parts.reduce((s, p) => s + (p.duration_sec ?? 0), 0))
  // Début de chaque morceau dans l'enregistrement complet
  const offsets = parts.map((_, i) => parts.slice(0, i).reduce((s, p) => s + (p.duration_sec ?? 0), 0))

  for (let i = state.part ?? 0; i < parts.length; i++) {
    const part = parts[i]
    const mime = audioMime(part.mime, part.path)
    const ranges = rangesFor(part.duration_sec) ?? [[undefined, undefined] as unknown as [number, number]]
    let audio: { mime: string; base64: string } | { mime: string; fileUri: string } | null = null

    for (let r = i === state.part ? (state.range ?? 0) : 0; r < ranges.length; r++) {
      if (Date.now() > opts.stopAt) {
        await opts.save({ ...state, part: i, range: r })
        return 'continue'
      }
      if (!audio) {
        const known = state.uploads?.[part.id]
        if (known) audio = { mime, fileUri: known.uri }
        else {
          await opts.save({ ...state, part: i, range: r, phase: 'Envoi de l’audio au service IA…' })
          const { data: blob, error: de } = await db.storage.from('files').download(part.path)
          if (de || !blob) throw new Error('Audio illisible dans le stockage')
          const bytes = new Uint8Array(await blob.arrayBuffer())
          if (bytes.byteLength <= INLINE_AUDIO_MAX && ranges.length === 1) audio = { mime, base64: Buffer.from(bytes).toString('base64') }
          else {
            const up = await uploadAudio(bytes, mime, `${rec.title} (${i + 1})`)
            state.uploads = { ...state.uploads, [part.id]: up }
            audio = { mime, fileUri: up.uri }
          }
        }
      }
      const [from, to] = ranges[r]
      const done = offsets[i] + (from ?? 0)
      await opts.save({
        ...state,
        part: i,
        range: r,
        progress: 0.05 + 0.9 * (done / totalSec),
        phase: `Transcription… ${Math.round((done / totalSec) * 100)} %`,
      })
      const segs = await transcribeAudio({ audio, language: rec.language, subject: subject?.name ?? '', from, to })
      // Horodatages ramenés au début de l'enregistrement complet (et dans le passage demandé)
      const inRange = segs.filter((x) => from === undefined || (x.start >= from - 30 && x.start < to + 30))
      state.segments = [...(state.segments ?? []), ...inRange.map((x) => ({ start: x.start + offsets[i], text: x.text }))]
      state.part = r + 1 < ranges.length ? i : i + 1
      state.range = r + 1 < ranges.length ? r + 1 : 0
    }
  }

  // Terminé : la transcription devient un cours de la matière
  const segments = state.segments ?? []
  if (!segments.length) throw new Error('Aucune parole reconnue dans cet enregistrement')
  const content = transcriptText(segments)
  let courseId: string | null = rec.course_id
  if (courseId) {
    const { error: ue } = await db.from('courses').update({ content }).eq('id', courseId)
    if (ue) throw ue
  } else {
    const { data: course, error: ce } = await db
      .from('courses')
      .insert({ space_id: rec.space_id, subject_id: rec.subject_id, title: rec.title, content, status: 'ready' })
      .select('id')
      .single()
    if (ce) throw ce
    courseId = course.id
  }
  await db.from('recordings').update({ status: 'done', error: null, course_id: courseId }).eq('id', rec.id)

  for (const up of Object.values(state.uploads ?? {})) await forgetAudio(up.name)

  // Cycle de vie de l'audio, selon le réglage (par défaut : suppression)
  const { data: settings } = await db.from('user_settings').select('audio_after').maybeSingle()
  if ((settings?.audio_after ?? 'delete') === 'delete') {
    await db.storage.from('files').remove(parts.map((p) => p.path))
    await db.from('files').delete().in('id', parts.map((p) => p.id))
    await db.from('recordings').update({ audio_state: 'deleted' }).eq('id', rec.id)
  }
  return 'done'
}
