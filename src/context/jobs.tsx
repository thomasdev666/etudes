import { CheckCircle2, ChevronDown, Loader2, Sparkles, X, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { cx, ProgressBar } from '@/components/ui'
import { createAiJob, type JobMeta } from '@/lib/ai'
import { useInvalidate, type Table } from '@/lib/data'
import { must, supabase } from '@/lib/supabase'
import type { AiJob } from '@/lib/types'
import { useSpace } from './space'
import { useToast } from './toast'

// « upload » : tâche locale (envoi de fichiers depuis l'appareil), sans ligne ai_jobs
type TrackedJob = {
  id: string
  kind: AiJob['kind'] | 'upload'
  params: Record<string, unknown>
  status: AiJob['status']
  error: string | null
  result: AiJob['result']
  startedAt: number
  meta: JobMeta
  dismissed?: boolean
}

type JobsState = {
  jobs: TrackedJob[]
  start: (kind: AiJob['kind'], params: Record<string, unknown>, meta: JobMeta) => Promise<string>
  find: (pred: (j: TrackedJob) => boolean) => TrackedJob | undefined
  // Tâche de fond côté appareil, suivie dans le même panneau que les générations
  runLocal: (meta: JobMeta, task: (report: (phase: string, progress: number) => void) => Promise<void>) => void
}

const Ctx = createContext<JobsState | null>(null)

const AFFECTS: Record<AiJob['kind'], Table[]> = {
  quiz: ['quizzes'],
  flashcards: ['flashcards'],
  course_images: ['courses'],
  mindmap: ['note_outputs'],
  sheet: ['notes'],
  transcription: ['recordings', 'courses'],
  exam: ['exam_sessions'],
  assistant: ['notes'],
}

// Progression : celle envoyée par le serveur quand elle existe, sinon une estimation
// qui avance vite au début, ralentit, et ne dépasse pas 95 % avant la fin.
export function jobProgress(j: TrackedJob, now = Date.now()) {
  if (j.status === 'done' || j.status === 'error') return 100
  const t = (now - j.startedAt) / 1000
  const estimated = 95 * (1 - Math.exp((-2 * t) / j.meta.estimateSec))
  const real = j.result?.progress
  return real !== undefined ? Math.max(real * 100, Math.min(estimated, real * 100 + 15)) : estimated
}

// Sans démarrage côté serveur après ce délai, la génération est considérée bloquée
const START_TIMEOUT_MS = 60_000
// Le serveur s'arrête au bout de 15 min : au-delà, la génération est perdue
export const STALE_MS = 16 * 60_000

export function JobsProvider({ children }: { children: ReactNode }) {
  const { spaceId } = useSpace()
  const toast = useToast()
  const navigate = useNavigate()
  const invalidate = useInvalidate()
  const [jobs, setJobs] = useState<TrackedJob[]>([])
  const [, tick] = useState(0)
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs
  // Références stables pour que le suivi ne redémarre pas à chaque rendu
  const deps = useRef({ invalidate, navigate, toast })
  deps.current = { invalidate, navigate, toast }
  const activeCount = jobs.filter((j) => j.status === 'pending' || j.status === 'running').length

  // Reprend le suivi des générations en cours après un rechargement de page
  useEffect(() => {
    if (!spaceId) return
    supabase
      .from('ai_jobs')
      .select('*')
      .eq('space_id', spaceId)
      .in('status', ['pending', 'running'])
      .gt('created_at', new Date(Date.now() - 70 * 60_000).toISOString())
      .then(({ data }) => {
        if (!data?.length) return
        setJobs((cur) => [
          ...cur,
          ...(data as AiJob[])
            .filter((j) => !cur.some((c) => c.id === j.id))
            .map((j) => ({
              id: j.id,
              kind: j.kind,
              params: j.params,
              status: j.status,
              error: j.error,
              result: j.result,
              startedAt: new Date(j.created_at).getTime(),
              meta: (j.params._meta as JobMeta) ?? { label: 'Génération', estimateSec: 60 },
            })),
        ])
      })
  }, [spaceId])

  const start = useCallback<JobsState['start']>(
    async (kind, params, meta) => {
      const job = await createAiJob(spaceId, kind, params, meta)
      setJobs((cur) => [...cur, { id: job.id, kind, params, status: 'pending', error: null, result: null, startedAt: Date.now(), meta }])
      return job.id
    },
    [spaceId],
  )

  // Suivi des tâches actives
  useEffect(() => {
    if (!activeCount) return
    const { invalidate, navigate, toast } = deps.current
    const anim = setInterval(() => tick((n) => n + 1), 500)
    const poll = setInterval(async () => {
      const ids = jobsRef.current.filter((j) => j.kind !== 'upload' && (j.status === 'pending' || j.status === 'running')).map((j) => j.id)
      if (!ids.length) return
      const rows = must(await supabase.from('ai_jobs').select('id, status, error, result').in('id', ids)) as Pick<AiJob, 'id' | 'status' | 'error' | 'result'>[]
      for (const r of rows) {
        const prev = jobsRef.current.find((j) => j.id === r.id)
        if (!prev || prev.kind === 'upload' || prev.status === r.status) continue
        if (r.status === 'done' || r.status === 'error') {
          invalidate(...AFFECTS[prev.kind])
          if (r.status === 'done')
            toast({
              message: `${prev.meta.label} : terminé ✓`,
              action: prev.meta.link ? { label: prev.meta.linkLabel ?? 'Voir', run: () => navigate(prev.meta.link!) } : undefined,
            })
          else toast({ message: `${prev.meta.label} : échec`, tone: 'error' })
        }
      }
      // Tâche jamais prise en charge par le serveur : on l'arrête avec un message clair
      const now = Date.now()
      for (const j of jobsRef.current) {
        if (j.kind === 'upload') continue
        const r = rows.find((x) => x.id === j.id)
        if (r?.status === 'pending' && now - j.startedAt > START_TIMEOUT_MS) {
          r.status = 'error'
          r.error = 'Le service de génération n’a pas démarré. Vérifie que le site est bien déployé depuis GitHub, puis réessaie.'
          await supabase.from('ai_jobs').update({ status: 'error', error: r.error }).eq('id', j.id)
          toast({ message: `${j.meta.label} : échec`, tone: 'error' })
        }
        // Une transcription longue se relance d'elle-même : on lui laisse une heure
        if (r?.status === 'running' && now - j.startedAt > (j.kind === 'transcription' ? 60 * 60_000 : STALE_MS)) {
          r.status = 'error'
          r.error = 'La génération a été interrompue (trop longue). Relance-la.'
          await supabase.from('ai_jobs').update({ status: 'error', error: r.error }).eq('id', j.id)
          if (j.params.output_id) await supabase.from('note_outputs').update({ status: 'error', error: r.error }).eq('id', j.params.output_id as string).eq('status', 'generating')
          invalidate(...AFFECTS[j.kind as AiJob['kind']])
          toast({ message: `${j.meta.label} : échec`, tone: 'error' })
        }
      }
      setJobs((cur) => cur.map((j) => ({ ...j, ...(rows.find((r) => r.id === j.id) ?? {}) })))
    }, 2500)
    return () => {
      clearInterval(anim)
      clearInterval(poll)
    }
  }, [activeCount])

  const find = useCallback<JobsState['find']>((pred) => [...jobsRef.current].reverse().find(pred), [])

  const runLocal = useCallback<JobsState['runLocal']>((meta, task) => {
    const id = `upload-${crypto.randomUUID()}`
    const patch = (p: Partial<TrackedJob>) => setJobs((cur) => cur.map((j) => (j.id === id ? { ...j, ...p } : j)))
    setJobs((cur) => [...cur, { id, kind: 'upload', params: {}, status: 'running', error: null, result: { phase: 'Préparation…', progress: 0 }, startedAt: Date.now(), meta }])
    task((phase, progress) => patch({ result: { phase, progress } }))
      .then(() => {
        patch({ status: 'done', result: { progress: 1 } })
        deps.current.toast({ message: `${meta.label} : terminé ✓`, action: meta.link ? { label: meta.linkLabel ?? 'Voir', run: () => deps.current.navigate(meta.link!) } : undefined })
      })
      .catch((e: unknown) => {
        patch({ status: 'error', error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) })
        deps.current.toast({ message: `${meta.label} : échec`, tone: 'error' })
      })
  }, [])

  // Un envoi en cours depuis l'appareil serait perdu si l'onglet se ferme
  const uploading = jobs.some((j) => j.kind === 'upload' && j.status === 'running')
  useEffect(() => {
    if (!uploading) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  const visible = jobs.filter((j) => !j.dismissed)
  const dismiss = useCallback((id: string) => setJobs((cur) => cur.map((j) => (j.id === id ? { ...j, dismissed: true } : j))), [])

  // Une tâche terminée se ferme seule après quelques secondes (le message « terminé » reste
  // dans la notification) ; une tâche en échec reste affichée jusqu'à ce qu'on la ferme.
  const doneIds = jobs.filter((j) => j.status === 'done' && !j.dismissed).map((j) => j.id).join(',')
  useEffect(() => {
    if (!doneIds) return
    const t = setTimeout(() => doneIds.split(',').forEach(dismiss), 6000)
    return () => clearTimeout(t)
  }, [doneIds, dismiss])

  return (
    <Ctx.Provider value={{ jobs, start, find, runLocal }}>
      {children}
      {visible.length > 0 && <JobsPanel jobs={visible} dismiss={dismiss} navigate={navigate} />}
    </Ctx.Provider>
  )
}

export function useJobs() {
  const v = useContext(Ctx)
  if (!v) throw new Error('JobsProvider manquant')
  return v
}

const isRunning = (j: TrackedJob) => j.status === 'pending' || j.status === 'running'

function JobStatusIcon({ j }: { j: TrackedJob }) {
  if (isRunning(j)) return <Loader2 className="size-4 shrink-0 animate-spin text-accent-ink" aria-hidden />
  if (j.status === 'done') return <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
  return <XCircle className="size-4 shrink-0 text-danger" aria-hidden />
}

// Une tâche : titre, progression, phase ou résultat
function JobRow({ j, dismiss, navigate, compact }: { j: TrackedJob; dismiss: (id: string) => void; navigate: (to: string) => void; compact?: boolean }) {
  const running = isRunning(j)
  return (
    <div className={compact ? 'py-2' : ''}>
      <div className="flex items-center gap-2">
        <JobStatusIcon j={j} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{j.meta.label}</p>
        <span className="text-xs tabular-nums text-muted">{running ? `${Math.round(jobProgress(j))} %` : ''}</span>
        {!running && (
          <button type="button" aria-label="Fermer" onClick={() => dismiss(j.id)} className="rounded-lg p-1 text-muted hover:bg-surface-2">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="mt-1.5">
        <ProgressBar value={jobProgress(j)} color={j.status === 'error' ? 'var(--danger)' : j.status === 'done' ? 'var(--success)' : undefined} label={j.meta.label} />
      </div>
      <div className={cx('mt-1 text-xs', j.status === 'error' ? 'text-danger' : 'text-muted')}>
        {running ? (
          (j.result?.phase ?? 'Tu peux continuer à utiliser l’application pendant ce temps.') + (j.kind === 'upload' ? ' · Garde l’appli ouverte.' : '')
        ) : j.status === 'error' ? (
          (j.error ?? 'La génération a échoué.')
        ) : (
          <span className="flex items-center gap-2">
            <Sparkles className="size-3.5" aria-hidden />
            Terminé
            {j.result?.count !== undefined && j.kind !== 'mindmap' && j.kind !== 'upload' ? ` · ${j.result.count} élément${j.result.count > 1 ? 's' : ''}` : ''}
            {j.meta.link && (
              <button
                type="button"
                className="ml-auto font-semibold text-accent-ink hover:underline"
                onClick={() => {
                  dismiss(j.id)
                  navigate(j.meta.link!)
                }}
              >
                {j.meta.linkLabel ?? 'Voir'}
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

// Panneau unique : une tâche s'affiche en entier ; plusieurs tâches sont regroupées
// en une seule barre, avec le détail à déplier.
function JobsPanel({ jobs, dismiss, navigate }: { jobs: TrackedJob[]; dismiss: (id: string) => void; navigate: (to: string) => void }) {
  const [open, setOpen] = useState(false)
  const running = jobs.filter(isRunning)
  const failed = jobs.filter((j) => j.status === 'error')
  const avg = jobs.reduce((n, j) => n + jobProgress(j), 0) / jobs.length
  return (
    <div
      aria-live="polite"
      className="fixed right-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] lg:right-5"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + var(--jobs-offset))' }}
    >
      <div className="anim-pop rounded-2xl border border-border bg-surface p-3 shadow-lg">
        {jobs.length === 1 ? (
          <JobRow j={jobs[0]} dismiss={dismiss} navigate={navigate} />
        ) : (
          <>
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
              {running.length ? <Loader2 className="size-4 shrink-0 animate-spin text-accent-ink" aria-hidden /> : failed.length ? <XCircle className="size-4 shrink-0 text-danger" aria-hidden /> : <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />}
              <span className="min-w-0 flex-1 text-sm font-medium">
                {running.length ? `${running.length} tâche${running.length > 1 ? 's' : ''} en cours` : 'Tâches terminées'}
                {failed.length ? <span className="text-danger"> · {failed.length} en échec</span> : null}
              </span>
              <span className="text-xs tabular-nums text-muted">{running.length ? `${Math.round(avg)} %` : ''}</span>
              <ChevronDown className={cx('size-4 shrink-0 text-muted motion-safe:transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
            <div className="mt-2">
              <ProgressBar value={avg} label="Progression des tâches" color={failed.length && !running.length ? 'var(--danger)' : undefined} />
            </div>
            {open ? (
              <div className="mt-2 flex max-h-[50dvh] flex-col divide-y divide-border overflow-y-auto">
                {jobs.map((j) => (
                  <JobRow key={j.id} j={j} dismiss={dismiss} navigate={navigate} compact />
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">Touche pour voir le détail. Tu peux continuer à utiliser l’appli.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
