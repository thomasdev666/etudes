import { isSameDay } from 'date-fns'
import { AlertTriangle, Brain, CalendarClock, CheckCircle2, Play, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AssignmentForm } from '@/components/AssignmentForm'
import { planProgress } from '@/components/Plans'
import { Badge, Button, Card, Checkbox, EmptyState, ProgressBar, SubjectChip, SubjectDot } from '@/components/ui'
import { capitalize, countdown, fmt, minutesLabel } from '@/lib/dates'
import { dayKey } from '@/lib/planner'
import {
  useAssignments,
  useErrorItems,
  useFlashcards,
  usePlanItems,
  usePlans,
  useQuizSessions,
  useSubjectMap,
  useSubjects,
  useUpdate,
  useWorkBlocks,
} from '@/lib/data'
import { useOnboarding } from '@/lib/onboarding'
import { MASTERED_DAYS } from '@/lib/sm2'
import { useFirstTimeTour } from '@/lib/tours'
import type { Assignment, WorkBlock } from '@/lib/types'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir'
}

export function HomePage() {
  const subjectsMap = useSubjectMap()
  const { data: subjects = [] } = useSubjects()
  const { data: assignments = [] } = useAssignments()
  const { data: blocks = [] } = useWorkBlocks()
  const { data: cards = [] } = useFlashcards()
  const { data: errors = [] } = useErrorItems()
  const { data: plans = [] } = usePlans()
  const { data: items = [] } = usePlanItems()
  const { data: sessions = [] } = useQuizSessions()
  const updateA = useUpdate<Assignment>('assignments')
  const updateB = useUpdate<WorkBlock>('work_blocks')
  const [form, setForm] = useState(false)
  const onboarding = useOnboarding()
  // Nouveau compte : la présentation complète (qui inclut les nouveautés).
  // Compte existant qui l'a déjà vue : seulement les nouveautés.
  const ready = !onboarding.loading && onboarding.setupDone
  const mainTour = useFirstTimeTour('main', ready, ['news'])
  const newsTour = useFirstTimeTour('news', ready && onboarding.tourSeen('main'))
  const tour = mainTour ?? newsTour

  const now = new Date()
  const pending = assignments.filter((a) => a.status !== 'done')
  const upcoming = pending.slice(0, 5)
  const todayAssignments = assignments.filter((a) => isSameDay(new Date(a.due_at), now))
  const todayBlocks = blocks.filter((b) => b.day === dayKey(now)).sort((x, y) => (x.start_time ?? '99').localeCompare(y.start_time ?? '99'))
  const due = cards.filter((c) => new Date(c.due_at) <= now).length
  const openErrors = errors.filter((e) => !e.resolved_at).length
  const resume = sessions.find((s) => !s.finished_at)
  const exams = subjects
    .filter((s) => s.exam_date && new Date(s.exam_date + 'T23:59:00') >= now)
    .sort((a, b) => a.exam_date!.localeCompare(b.exam_date!))
    .slice(0, 3)

  const progress = subjects
    .map((s) => {
      const sp = plans.filter((p) => p.subject_id === s.id)
      const si = items.filter((i) => sp.some((p) => p.id === i.plan_id))
      const sc = cards.filter((c) => c.subject_id === s.id)
      const pct = si.length ? planProgress(si) : sc.length ? (sc.filter((c) => c.interval_days >= MASTERED_DAYS).length / sc.length) * 100 : null
      return { s, pct, kind: si.length ? 'plan' : 'cartes' }
    })
    .filter((x) => x.pct !== null)

  // Tant que la configuration de base n'est pas faite, on suit le guide
  if (!onboarding.loading && !onboarding.setupDone) return <Navigate to="/bienvenue" replace />

  return (
    <>
      {tour}
      <div className="mb-5">
        <p className="text-muted">{capitalize(fmt(now, 'EEEE d MMMM'))}</p>
        <h1 className="text-2xl font-bold sm:text-3xl">{greeting()} 👋</h1>
      </div>

      {/* Priorité du jour : ce qui fait vraiment progresser */}
      <div data-tour="today" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link to="/reviser/cartes" className="group">
          <Card className="flex h-full items-center gap-4 border-accent/30 bg-accent-soft transition-shadow group-hover:shadow-md">
            <Brain className="size-9 shrink-0 text-accent-ink" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-display text-2xl font-bold">{due}</p>
              <p className="text-sm text-muted">carte{due > 1 ? 's' : ''} à réviser aujourd’hui</p>
            </div>
            {due > 0 && <Badge tone="accent">Go</Badge>}
          </Card>
        </Link>
        {resume ? (
          <Link to={`/qcm/session/${resume.id}`} className="group">
            <Card className="flex h-full items-center gap-4 transition-shadow group-hover:shadow-md">
              <Play className="size-9 shrink-0 text-accent-ink" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Session en cours</p>
                <p className="truncate text-sm text-muted">
                  {subjectsMap.get(resume.subject_id)?.name} · question {resume.current_index + 1} / {resume.question_ids.length}
                </p>
              </div>
              <Button size="sm">Reprendre</Button>
            </Card>
          </Link>
        ) : (
          <Link to="/reviser?vue=erreurs" className="group">
            <Card className="flex h-full items-center gap-4 transition-shadow group-hover:shadow-md">
              <AlertTriangle className="size-9 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-display text-2xl font-bold">{openErrors}</p>
                <p className="text-sm text-muted">erreur{openErrors > 1 ? 's' : ''} de QCM à retravailler</p>
              </div>
            </Card>
          </Link>
        )}
      </div>

      {exams.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {exams.map((s) => (
            <Link key={s.id} to={`/matieres/${s.id}`} className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2">
              <SubjectDot color={s.color} />
              <span className="font-medium">{s.name}</span>
              <span className="text-muted">examen {countdown(s.exam_date + 'T08:00:00').label}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card data-tour="deadlines">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CalendarClock className="size-5 text-muted" aria-hidden /> Prochaines échéances
            </h2>
            <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setForm(true)}>
              Devoir
            </Button>
          </div>
          {!upcoming.length ? (
            <EmptyState title="Aucun devoir à venir">Ajoute tes devoirs pour voir les échéances ici.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.map((a) => {
                const s = a.subject_id ? subjectsMap.get(a.subject_id) : undefined
                const c = countdown(a.due_at)
                return (
                  <li key={a.id} className="flex items-center gap-3">
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: s?.color ?? 'var(--border)' }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.title}</p>
                      <p className="truncate text-xs text-muted">
                        {s?.name ?? 'Sans matière'} · {fmt(a.due_at, "EEE d MMM 'à' HH'h'mm")}
                      </p>
                    </div>
                    <Badge tone={c.tone}>{c.label}</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="size-5 text-muted" aria-hidden /> Aujourd’hui
          </h2>
          {!todayAssignments.length && !todayBlocks.length ? (
            <p className="text-sm text-muted">Rien de prévu aujourd’hui. Profites-en pour réviser tes cartes.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {todayAssignments.map((a) => {
                const s = a.subject_id ? subjectsMap.get(a.subject_id) : undefined
                return (
                  <li key={a.id} className="flex items-center gap-3">
                    <Checkbox
                      checked={a.status === 'done'}
                      color={s?.color}
                      label={`Marquer ${a.title} comme fait`}
                      onChange={(v) => updateA.mutate({ id: a.id, patch: { status: v ? 'done' : 'todo', done_at: v ? new Date().toISOString() : null } })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={a.status === 'done' ? 'truncate text-muted line-through' : 'truncate font-medium'}>{a.title}</p>
                      <p className="text-xs text-muted">À rendre à {fmt(a.due_at, "HH'h'mm")}</p>
                    </div>
                    {s && <SubjectChip name={s.name} color={s.color} />}
                  </li>
                )
              })}
              {todayBlocks.map((b) => {
                const a = assignments.find((x) => x.id === b.assignment_id)
                const sid = a?.subject_id ?? b.subject_id
                const s = sid ? subjectsMap.get(sid) : undefined
                const label = b.kind === 'revision' ? (b.title ?? `Révisions ${s?.name ?? ''}`) : `Travailler : ${a?.title ?? 'devoir'}`
                return (
                  <li key={b.id} className="flex items-center gap-3">
                    <Checkbox checked={b.done} color={s?.color} label={`Séance ${label} faite`} onChange={(done) => updateB.mutate({ id: b.id, patch: { done } })} />
                    <div className="min-w-0 flex-1">
                      <p className={b.done ? 'truncate text-muted line-through' : 'truncate font-medium'}>{label}</p>
                      <p className="text-xs text-muted">
                        {b.start_time ? `${b.start_time.slice(0, 5).replace(':', 'h')} · ` : ''}
                        {minutesLabel(b.minutes)} prévues
                      </p>
                    </div>
                    {s && <SubjectChip name={s.name} color={s.color} />}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Avancement des révisions</h2>
          {!progress.length ? (
            <p className="text-sm text-muted">
              Crée un plan de révision ou des flash cards dans une matière pour suivre ta progression.{' '}
              <Link to="/matieres" className="text-accent-ink underline">
                Mes matières
              </Link>
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {progress.map(({ s, pct, kind }) => (
                <li key={s.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <Link to={`/matieres/${s.id}`} className="truncate font-medium hover:underline">
                      {s.name}
                    </Link>
                    <span className="shrink-0 text-muted">
                      {Math.round(pct!)} % <span className="text-xs">({kind === 'plan' ? 'plan' : 'cartes maîtrisées'})</span>
                    </span>
                  </div>
                  <ProgressBar value={pct!} color={s.color} label={`Avancement ${s.name}`} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AssignmentForm open={form} onClose={() => setForm(false)} />
    </>
  )
}
