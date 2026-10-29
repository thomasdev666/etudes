import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useUserId } from '@/context/auth'
import { useJobs } from '@/context/jobs'
import { useSpace } from '@/context/space'
import { estimateSeconds } from '@/lib/ai'
import { useInvalidate } from '@/lib/data'
import { BUCKET, must, supabase } from '@/lib/supabase'

// Un fichier par tranche de 15 minutes : rien n'est perdu si la page se ferme,
// et chaque morceau se transcrit vite
export const PART_SEC = 15 * 60
const BITRATE = 32_000

type Meta = { recordingId: string; subjectId: string; title: string }
type Status = 'idle' | 'starting' | 'recording' | 'paused' | 'saving'

type RecorderState = {
  status: Status
  meta: Meta | null
  elapsed: number
  error: string | null
  start: (o: { subjectId: string; title: string; language: string }) => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => Promise<void>
}

const Ctx = createContext<RecorderState | null>(null)

function pickMime() {
  for (const m of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'])
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  return ''
}
const extOf = (mime: string) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm')

// Lance la transcription d'un enregistrement dont l'audio est déjà envoyé
export function useStartTranscription() {
  const { start } = useJobs()
  const invalidate = useInvalidate()
  return async (r: { id: string; subjectId: string; title: string; durationSec: number }) => {
    must(await supabase.from('recordings').update({ status: 'transcribing', error: null }).eq('id', r.id))
    await start(
      'transcription',
      { recording_id: r.id },
      {
        label: `Transcription « ${r.title} »`,
        estimateSec: estimateSeconds('transcription', Math.ceil(r.durationSec / 60)),
        link: `/matieres/${r.subjectId}`,
        linkLabel: 'Voir',
      },
    )
    await invalidate('recordings')
  }
}

export function RecorderProvider({ children }: { children: ReactNode }) {
  const { spaceId } = useSpace()
  const userId = useUserId()
  const invalidate = useInvalidate()
  const startTranscription = useStartTranscription()
  const [status, setStatus] = useState<Status>('idle')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const r = useRef({
    stream: null as MediaStream | null,
    rec: null as MediaRecorder | null,
    mime: '',
    part: 0,
    // temps cumulé des morceaux terminés et début (horloge) du passage en cours
    doneMs: 0,
    partMs: 0,
    runningSince: 0,
    uploads: Promise.resolve() as Promise<unknown>,
    size: 0,
    failed: false,
    wake: null as WakeLockSentinel | null,
    meta: null as Meta | null,
  })

  const now = () => r.current.partMs + (r.current.runningSince ? Date.now() - r.current.runningSince : 0)
  const durations = useRef(new WeakMap<MediaRecorder, number>()).current

  // Termine le morceau en cours : on fige sa durée, puis l'encodeur l'envoie
  const endPart = () => {
    const cur = r.current
    if (!cur.rec) return
    const ms = now()
    durations.set(cur.rec, ms / 1000)
    cur.doneMs += ms
    cur.partMs = 0
    cur.runningSince = 0
    cur.rec.stop()
  }

  // Envoi d'un morceau terminé (à la suite des précédents, avec nouvelles tentatives)
  const queueUpload = useCallback(
    (blob: Blob, index: number, durationSec: number) => {
      const m = r.current.meta!
      const path = `${userId}/${spaceId}/recordings/${m.recordingId}/part-${index}.${extOf(r.current.mime)}`
      r.current.size += blob.size
      r.current.uploads = r.current.uploads.then(async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            must(await supabase.storage.from(BUCKET).upload(path, blob, { contentType: r.current.mime.split(';')[0], upsert: true }))
            must(
              await supabase.from('files').insert({
                space_id: spaceId,
                path,
                name: `part-${index}.${extOf(r.current.mime)}`,
                mime: r.current.mime.split(';')[0],
                size: blob.size,
                recording_id: m.recordingId,
                part_index: index,
                duration_sec: Math.round(durationSec),
              }),
            )
            return
          } catch (e) {
            if (attempt === 2) {
              r.current.failed = true
              setError(`Un morceau de l’enregistrement n’a pas pu être envoyé : ${e instanceof Error ? e.message : e}`)
            } else await new Promise((res) => setTimeout(res, 3000))
          }
        }
      })
    },
    [spaceId, userId],
  )

  // Démarre un nouveau morceau sur le même micro
  const startPart = useCallback(() => {
    const cur = r.current
    const rec = new MediaRecorder(cur.stream!, { ...(cur.mime && { mimeType: cur.mime }), audioBitsPerSecond: BITRATE })
    const chunks: Blob[] = []
    const index = cur.part
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    // La durée est mesurée au moment de l'arrêt demandé (voir endPart), pas à la fin de l'encodage
    rec.onstop = () => queueUpload(new Blob(chunks, { type: cur.mime || rec.mimeType }), index, durations.get(rec) ?? 0)
    if (!cur.mime) cur.mime = rec.mimeType
    rec.start(10_000)
    cur.rec = rec
    cur.part++
    cur.partMs = 0
    cur.runningSince = Date.now()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueUpload])

  async function keepAwake() {
    try {
      r.current.wake = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      /* pas de verrouillage d'écran possible : on continue quand même */
    }
  }

  const start: RecorderState['start'] = async (o) => {
    if (status !== 'idle') return
    setError(null)
    setStatus('starting')
    try {
      if (typeof MediaRecorder === 'undefined') throw new Error('Ce navigateur ne permet pas d’enregistrer. Utilise Chrome, Edge ou Safari à jour.')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } }).catch(() => {
        throw new Error('Accès au micro refusé. Autorise le micro pour ce site dans les réglages du navigateur.')
      })
      const rec = must(
        await supabase
          .from('recordings')
          .insert({ space_id: spaceId, subject_id: o.subjectId, title: o.title, language: o.language, source: 'micro', status: 'uploading' })
          .select('id')
          .single(),
      ) as { id: string }
      const m = { recordingId: rec.id, subjectId: o.subjectId, title: o.title }
      Object.assign(r.current, { stream, mime: pickMime(), part: 0, doneMs: 0, partMs: 0, runningSince: 0, uploads: Promise.resolve(), size: 0, failed: false, meta: m })
      setMeta(m)
      startPart()
      await keepAwake()
      setStatus('recording')
      invalidate('recordings')
    } catch (e) {
      r.current.stream?.getTracks().forEach((t) => t.stop())
      setStatus('idle')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const pause = () => {
    const cur = r.current
    if (cur.rec?.state !== 'recording') return
    cur.rec.pause()
    cur.partMs = now()
    cur.runningSince = 0
    setStatus('paused')
  }
  const resume = () => {
    const cur = r.current
    if (cur.rec?.state !== 'paused') return
    cur.rec.resume()
    cur.runningSince = Date.now()
    setStatus('recording')
  }

  const stop = async () => {
    const cur = r.current
    if (!cur.rec || !cur.meta) return
    setStatus('saving')
    const stopped = new Promise<void>((res) => cur.rec!.addEventListener('stop', () => res(), { once: true }))
    endPart()
    await stopped
    await cur.uploads
    cur.stream?.getTracks().forEach((t) => t.stop())
    cur.wake?.release().catch(() => {})
    const m = cur.meta
    const durationSec = Math.round(cur.doneMs / 1000)
    try {
      must(await supabase.from('recordings').update({ duration_sec: durationSec, size_bytes: cur.size }).eq('id', m.recordingId))
      if (!cur.failed) await startTranscription({ id: m.recordingId, subjectId: m.subjectId, title: m.title, durationSec })
      else must(await supabase.from('recordings').update({ status: 'error', error: 'Une partie de l’audio n’a pas pu être envoyée.' }).eq('id', m.recordingId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    Object.assign(cur, { rec: null, stream: null, meta: null, wake: null })
    setMeta(null)
    setElapsed(0)
    setStatus('idle')
    invalidate('recordings')
  }

  // Chronomètre, et passage au morceau suivant toutes les 15 minutes
  useEffect(() => {
    if (status !== 'recording' && status !== 'paused') return
    const t = setInterval(() => {
      const cur = r.current
      setElapsed(Math.floor((cur.doneMs + now()) / 1000))
      if (status === 'recording' && now() / 1000 >= PART_SEC && cur.rec?.state === 'recording') {
        endPart()
        startPart()
      }
    }, 500)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, startPart])

  // Écran gardé allumé, et alerte si on ferme la page pendant l'enregistrement
  useEffect(() => {
    if (status !== 'recording' && status !== 'paused' && status !== 'saving') return
    // Le navigateur libère le verrou quand on quitte l'onglet : on le reprend au retour
    const onVisible = () => document.visibilityState === 'visible' && (!r.current.wake || r.current.wake.released) && keepAwake()
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('beforeunload', onLeave)
    }
  }, [status])

  return <Ctx.Provider value={{ status, meta, elapsed, error, start, pause, resume, stop }}>{children}</Ctx.Provider>
}

export function useRecorder() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useRecorder hors de RecorderProvider')
  return c
}
