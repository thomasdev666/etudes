import { AlertTriangle, CalendarCheck, ChevronDown, History, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AvailabilityEditor, availabilitySummary, durationText } from '@/components/AvailabilityEditor'
import { Button, Card, cx, EmptyState, ErrorBox, PageHeader, Spinner, SubjectDot } from '@/components/ui'
import { useSpace } from '@/context/space'
import { useCalendarEvents } from '@/lib/calendar'
import { capitalize, fmt } from '@/lib/dates'
import { useAssignments, useInvalidate, useSubjectMap, useSubjects, useWorkBlocks } from '@/lib/data'
import { buildDays, buildTasks, replacedBlock, useAvailability, type PlanTask } from '@/lib/planning'
import { schedule } from '@/lib/scheduler'
import { toHHMM, toMin } from '@/lib/availability'
import { must, supabase } from '@/lib/supabase'
import { useFirstTimeTour } from '@/lib/tours'

const ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 900, 1200]

function TaskRow({ t, onToggle, onEstimate }: { t: PlanTask; onToggle: () => void; onEstimate: (m: number) => void }) {
  const subjects = useSubjectMap()
  const s = t.subjectId ? subjects.get(t.subjectId) : undefined
  const options = [...new Set([...ESTIMATES, t.estimate])].sort((a, b) => a - b)
  return (
    <li className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2', t.included ? 'border-border bg-surface' : 'border-dashed border-border opacity-60')}>
      <input type="checkbox" checked={t.included} onChange={onToggle} aria-label={`Planifier ${t.title}`} className="size-5 shrink-0 accent-[var(--accent)]" />
      <div className="min-w-[min(100%,14rem)] flex-1">
        <p className="flex items-center gap-2 font-medium">
          {s && <SubjectDot color={s.color} />}
          <span className="truncate">{t.title}</span>
        </p>
        <p className="text-xs text-muted">
          {t.kind === 'revision' ? 'Examen' : 'À rendre'} {fmt(`${t.due}T12:00:00`, 'EEEE d MMMM')}
          {t.done > 0 && ` · déjà fait ${durationText(t.done)}`}
          {t.missed > 0 && ` · ${t.missed} séance${t.missed > 1 ? 's' : ''} manquée${t.missed > 1 ? 's' : ''}`}
        </p>
      </div>
      <label className="flex w-full items-center justify-end gap-2 text-xs text-muted sm:w-auto">
        {t.kind === 'revision' ? 'Révision visée' : 'Durée totale'}
        <select
          value={t.estimate}
          onChange={(e) => onEstimate(Number(e.target.value))}
          disabled={!t.included}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
        >
          {options.map((m) => (
            <option key={m} value={m}>
              {durationText(m)}
            </option>
          ))}
        </select>
      </label>
    </li>
  )
}

export default function PlannerPage() {
  const navigate = useNavigate()
  const { spaceId } = useSpace()
  const invalidate = useInvalidate()
  const subjectMap = useSubjectMap()
  const { data: assignments = [], isLoading: la } = useAssignments()
  const { data: subjects = [], isLoading: ls } = useSubjects()
  const { data: blocks = [], isLoading: lb } = useWorkBlocks()
  const cal = useCalendarEvents()
  const { availability, save: saveAvailability, loading: lav } = useAvailability()
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [editAvail, setEditAvail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [now] = useState(() => new Date())

  const plan = useMemo(() => {
    const inputs = { assignments, subjects, blocks, classes: cal.events.filter((e) => !e.allDay), availability, now, overrides, excluded }
    const tasks = buildTasks(inputs)
    const days = buildDays(inputs, tasks)
    const result = schedule(
      tasks.filter((t) => t.included),
      days,
      availability,
    )
    return { tasks, days, result }
  }, [assignments, subjects, blocks, cal.events, availability, now, overrides, excluded])

  const tour = useFirstTimeTour('planner', !(la || ls || lb || lav))
  if (la || ls || lb || lav) return <Spinner />
  const { tasks, days, result } = plan
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const replaced = blocks.filter((b) => replacedBlock(b, tasks))
  const missed = tasks.filter((t) => t.included).reduce((n, t) => n + t.missed, 0)

  async function validate() {
    setBusy(true)
    setError(null)
    try {
      // Les séances non faites des tâches planifiées sont remplacées par la proposition
      const ids = replaced.map((b) => b.id)
      for (let i = 0; i < ids.length; i += 200) must(await supabase.from('work_blocks').delete().in('id', ids.slice(i, i + 200)))
      const rows = result.blocks.map((b) => {
        const t = byId.get(b.taskId)!
        const ref = t.id.slice(2)
        return t.kind === 'assignment'
          ? { space_id: spaceId, kind: 'assignment', assignment_id: ref, day: b.day, minutes: b.minutes, start_time: b.start }
          : { space_id: spaceId, kind: 'revision', subject_id: ref, title: t.title, day: b.day, minutes: b.minutes, start_time: b.start }
      })
      if (rows.length) {
        const res = await supabase.from('work_blocks').insert(rows)
        if (res.error && /kind|subject_id|start_time|title/.test(res.error.message))
          throw new Error('Lance d’abord la mise à jour 0010_planning.sql dans Supabase (séances de révision et horaires).')
        must(res)
      }
      // Estimations modifiées : enregistrées dans le devoir ou la matière
      for (const [id, minutes] of Object.entries(overrides)) {
        if (id.startsWith('a:')) await supabase.from('assignments').update({ estimated_minutes: minutes }).eq('id', id.slice(2))
        else await supabase.from('subjects').update({ revision_minutes: minutes }).eq('id', id.slice(2))
      }
      await invalidate('work_blocks', 'assignments', 'subjects')
      navigate('/agenda')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  // Jusqu'à la dernière séance proposée (les jours vides après n'apportent rien)
  const lastBlock = result.blocks.reduce((m, b) => (b.day > m ? b.day : m), '')
  const planned = days.filter((d) => d.day <= lastBlock)

  return (
    <div className="pb-24">
      {tour}
      <PageHeader
        title="Planifier"
        subtitle="Une proposition de séances de travail jusqu’à tes prochaines échéances, dans tes créneaux libres. Rien n’est enregistré sans ta validation."
      />

      <Card className="mb-4" data-tour="plan-avail">
        <button type="button" onClick={() => setEditAvail(!editAvail)} className="flex w-full items-center gap-3 text-left" aria-expanded={editAvail}>
          <CalendarCheck className="size-5 shrink-0 text-accent-ink" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Mes disponibilités</p>
            <p className="text-sm text-muted">{availabilitySummary(availability)}. Les heures de cours sont retirées automatiquement.</p>
          </div>
          <ChevronDown className={cx('size-5 shrink-0 text-muted transition-transform', editAvail && 'rotate-180')} aria-hidden />
        </button>
        {editAvail && (
          <div className="mt-4 border-t border-border pt-4">
            <AvailabilityEditor value={availability} onChange={saveAvailability} />
          </div>
        )}
      </Card>

      {!tasks.length ? (
        <EmptyState
          icon={<Wand2 className="size-8" />}
          title="Rien à planifier"
          action={
            <Link to="/agenda">
              <Button>Ajouter un devoir</Button>
            </Link>
          }
        >
          Ajoute des devoirs avec leur échéance, ou une date d’examen dans tes matières (dans les 4 semaines) : le planificateur répartira le travail.
        </EmptyState>
      ) : (
        <>
          <h2 className="mb-2 font-semibold">À planifier</h2>
          <ul className="mb-4 flex flex-col gap-2" data-tour="plan-tasks">
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                t={t}
                onToggle={() =>
                  setExcluded((s) => {
                    const n = new Set(s)
                    if (n.has(t.id)) n.delete(t.id)
                    else n.add(t.id)
                    return n
                  })
                }
                onEstimate={(m) => setOverrides((o) => ({ ...o, [t.id]: m }))}
              />
            ))}
          </ul>

          {missed > 0 && (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <History className="size-4 shrink-0 text-muted" aria-hidden />
              {missed} séance{missed > 1 ? 's' : ''} passée{missed > 1 ? 's' : ''} non faite{missed > 1 ? 's' : ''} : le temps restant est réparti sur les jours qui viennent.
            </p>
          )}
          {result.shortfalls.map((s) => {
            const t = byId.get(s.taskId)!
            return (
              <p key={s.taskId} className="mb-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Il manque <strong>{durationText(s.missing)}</strong> pour « {t.title} » avant le {fmt(`${t.due}T12:00:00`, 'd MMMM')} : ajoute du temps dans tes disponibilités, ou réduis la durée prévue.
                </span>
              </p>
            )
          })}

          <h2 className="mb-2 mt-5 font-semibold">Proposition</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-tour="plan-proposal">
            {planned.map((d) => {
              const list = result.blocks.filter((b) => b.day === d.day)
              const load = result.load[d.day] ?? { used: 0, capacity: 0 }
              return (
                <Card key={d.day} className="p-3">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <p className="font-semibold">{capitalize(fmt(`${d.day}T12:00:00`, 'EEEE d MMM'))}</p>
                    <span className="text-xs text-muted">
                      {!load.capacity ? 'Repos' : load.used ? `${durationText(load.used)} / ${durationText(load.capacity)}` : `${durationText(load.capacity)} dispo`}
                    </span>
                  </div>
                  <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${load.capacity ? (load.used / load.capacity) * 100 : 0}%` }} />
                  </div>
                  {!list.length ? (
                    <p className="text-sm text-muted">{load.capacity ? 'Libre' : 'Pas de créneau libre'}</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {list.map((b, i) => {
                        const t = byId.get(b.taskId)!
                        const s = t.subjectId ? subjectMap.get(t.subjectId) : undefined
                        return (
                          <li key={i} className="flex items-start gap-2 text-sm" style={{ borderLeft: `3px solid ${s?.color ?? 'var(--accent)'}`, paddingLeft: 8 }}>
                            <span className="w-24 shrink-0 tabular-nums text-muted">{b.start ? `${b.start}–${toHHMM(toMin(b.start) + b.minutes)}` : durationText(b.minutes)}</span>
                            <span className="min-w-0 flex-1">{t.title}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}

      {tasks.length > 0 && (
        <div data-tour="plan-validate" className="fixed inset-x-0 bottom-16 z-10 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <p className="hidden min-w-0 flex-1 text-sm text-muted sm:block">
              {result.blocks.length} séance{result.blocks.length > 1 ? 's' : ''} proposée{result.blocks.length > 1 ? 's' : ''}
              {replaced.length > 0 && ` · remplace ${replaced.length} séance${replaced.length > 1 ? 's' : ''} non faite${replaced.length > 1 ? 's' : ''}`}
            </p>
            <ErrorBox error={error} />
            <Button variant="secondary" onClick={() => navigate(-1)} className="flex-1 sm:flex-none">
              Annuler
            </Button>
            <Button icon={<CalendarCheck className="size-4" />} loading={busy} disabled={!result.blocks.length} onClick={validate} className="flex-[2] sm:flex-none">
              Valider ({result.blocks.length} séances)
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
