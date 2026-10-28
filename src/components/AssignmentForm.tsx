import { CalendarRange, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSpace } from '@/context/space'
import { useCalendarEvents } from '@/lib/calendar'
import { fmt, minutesLabel, toLocalInput } from '@/lib/dates'
import { useAssignments, useInsert, useInvalidate, useSubjects, useTrash, useUpdate, useWorkBlocks } from '@/lib/data'
import { dayKey, proposePlan, type PlanProposal } from '@/lib/planner'
import { must, supabase } from '@/lib/supabase'
import type { Assignment, AssignmentStatus } from '@/lib/types'
import { Button, ErrorBox, Field, IconButton, Input, Modal, Select, Tabs, Textarea } from './ui'

export const STATUS_LABEL: Record<AssignmentStatus, string> = { todo: 'À faire', doing: 'En cours', done: 'Fait' }

const BUDGET_KEY = 'etudes.dailyBudget'
export function getDailyBudget() {
  try {
    return Number(localStorage.getItem(BUDGET_KEY)) || 120
  } catch {
    return 120
  }
}
export function setDailyBudget(m: number) {
  try {
    localStorage.setItem(BUDGET_KEY, String(m))
  } catch {
    /* ignoré */
  }
}

function defaultDue() {
  const d = new Date(Date.now() + 7 * 86_400_000)
  d.setHours(23, 59, 0, 0)
  return toLocalInput(d)
}

function PlanEditor({ assignment, onDone }: { assignment: Assignment; onDone: () => void }) {
  const { spaceId } = useSpace()
  const { data: blocks = [] } = useWorkBlocks()
  const { events } = useCalendarEvents()
  const invalidate = useInvalidate()
  const [proposal, setProposal] = useState<PlanProposal>([])
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const busyMinutes: Record<string, number> = {}
    for (const b of blocks) if (b.assignment_id !== assignment.id && !b.done) busyMinutes[b.day] = (busyMinutes[b.day] ?? 0) + b.minutes
    // Les journées très chargées en cours laissent moins de temps de travail perso
    const classes: Record<string, number> = {}
    for (const e of events) if (!e.allDay) classes[dayKey(e.start)] = (classes[dayKey(e.start)] ?? 0) + (e.end.getTime() - e.start.getTime()) / 60_000
    for (const [d, m] of Object.entries(classes)) busyMinutes[d] = (busyMinutes[d] ?? 0) + Math.max(0, m - 300)
    setProposal(
      proposePlan({
        totalMinutes: assignment.estimated_minutes ?? 60,
        today: new Date(),
        dueAt: new Date(assignment.due_at),
        dailyBudget: getDailyBudget(),
        busyMinutes,
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.id])

  async function accept() {
    setBusy(true)
    try {
      must(await supabase.from('work_blocks').delete().eq('assignment_id', assignment.id).eq('done', false))
      if (proposal.length)
        must(
          await supabase
            .from('work_blocks')
            .insert(proposal.map((p) => ({ space_id: spaceId, assignment_id: assignment.id, day: p.day, minutes: p.minutes }))),
        )
      await invalidate('work_blocks')
      onDone()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-3">
      <p className="text-sm">
        Proposition de découpage pour <strong>{minutesLabel(assignment.estimated_minutes ?? 60)}</strong> de travail, d’ici le{' '}
        {fmt(assignment.due_at, 'd MMMM')}. Modifie si besoin, puis valide.
      </p>
      {!proposal.length && <p className="text-sm text-muted">Aucun jour disponible avant l’échéance.</p>}
      <ul className="flex flex-col gap-2">
        {proposal.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="Jour"
              value={p.day}
              onChange={(e) => setProposal(proposal.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))}
              className="py-2"
            />
            <Input
              type="number"
              min={5}
              step={5}
              aria-label="Minutes"
              value={p.minutes}
              onChange={(e) => setProposal(proposal.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)))}
              className="w-24 py-2"
            />
            <span className="text-sm text-muted">min</span>
            <IconButton label="Retirer cette séance" onClick={() => setProposal(proposal.filter((_, j) => j !== i))}>
              <X className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setProposal([...proposal, { day: dayKey(new Date()), minutes: 30 }])}>
          Ajouter une séance
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onDone}>
          Refuser
        </Button>
        <Button size="sm" onClick={accept} loading={busy} disabled={proposal.some((p) => !p.day || p.minutes <= 0)}>
          Valider le planning
        </Button>
      </div>
      <ErrorBox error={error} />
    </div>
  )
}

export function AssignmentForm({
  open,
  onClose,
  assignment,
  defaultDate,
}: {
  open: boolean
  onClose: () => void
  assignment?: Assignment
  defaultDate?: Date
}) {
  const { data: subjects = [] } = useSubjects()
  const { data: assignments = [] } = useAssignments()
  const { data: blocks = [] } = useWorkBlocks()
  const insert = useInsert<Assignment>('assignments')
  const update = useUpdate<Assignment>('assignments')
  const trash = useTrash('assignments')
  const [subjectId, setSubjectId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [due, setDue] = useState(defaultDue())
  const [minutes, setMinutes] = useState('')
  const [status, setStatus] = useState<AssignmentStatus>('todo')
  const [planning, setPlanning] = useState<Assignment | null>(null)

  useEffect(() => {
    if (!open) return
    setSubjectId(assignment?.subject_id ?? '')
    setTitle(assignment?.title ?? '')
    setDescription(assignment?.description ?? '')
    if (assignment) setDue(toLocalInput(assignment.due_at))
    else if (defaultDate) {
      const d = new Date(defaultDate)
      d.setHours(23, 59, 0, 0)
      setDue(toLocalInput(d))
    } else setDue(defaultDue())
    setMinutes(assignment?.estimated_minutes ? String(assignment.estimated_minutes) : '')
    setStatus(assignment?.status ?? 'todo')
    setPlanning(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment?.id])

  const current = assignment ? (assignments.find((a) => a.id === assignment.id) ?? assignment) : null
  const myBlocks = current ? blocks.filter((b) => b.assignment_id === current.id) : []

  async function save(thenPlan = false) {
    const values = {
      subject_id: subjectId || null,
      title: title.trim(),
      description,
      due_at: new Date(due).toISOString(),
      estimated_minutes: minutes ? Number(minutes) : null,
      status,
      done_at: status === 'done' ? (current?.done_at ?? new Date().toISOString()) : null,
    }
    const saved = current ? await update.mutateAsync({ id: current.id, patch: values }) : (await insert.mutateAsync(values))[0]
    if (thenPlan) setPlanning(saved)
    else onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={current ? 'Devoir' : 'Nouveau devoir'}
      footer={
        <>
          {current && (
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => {
                trash.mutate(current.id)
                onClose()
              }}
            >
              Supprimer
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="secondary" icon={<CalendarRange className="size-4" />} disabled={!title.trim() || !due} onClick={() => save(true)}>
            Planifier
          </Button>
          <Button onClick={() => save()} loading={insert.isPending || update.isPending} disabled={!title.trim() || !due}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Titre" id="atitle">
          <Input id="atitle" autoFocus={!current} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dossier marketing" />
        </Field>
        <Field label="Matière" id="asubj">
          <Select id="asubj" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Sans matière</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="À rendre le" id="adue">
            <Input id="adue" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Durée estimée (min)" id="amin" hint="Optionnelle, sert à planifier.">
            <Input id="amin" type="number" min={5} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="90" />
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Statut</span>
          <Tabs
            label="Statut"
            value={status}
            onChange={setStatus}
            items={(Object.keys(STATUS_LABEL) as AssignmentStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          />
        </div>
        <Field label="Description" id="adesc">
          <Textarea id="adesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Consignes, liens, groupe…" />
        </Field>
        {myBlocks.length > 0 && !planning && (
          <div className="text-sm">
            <p className="font-medium">Séances prévues</p>
            <ul className="mt-1 text-muted">
              {myBlocks.map((b) => (
                <li key={b.id}>
                  {b.done ? '✓ ' : '• '}
                  {fmt(b.day + 'T12:00:00', 'EEEE d MMM')} · {minutesLabel(b.minutes)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {planning && <PlanEditor assignment={planning} onDone={onClose} />}
        <ErrorBox error={insert.error ?? update.error} />
      </div>
    </Modal>
  )
}
