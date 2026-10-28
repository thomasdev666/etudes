import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AssignmentForm, STATUS_LABEL } from '@/components/AssignmentForm'
import { Badge, Button, Card, Checkbox, cx, EmptyState, ErrorBox, IconButton, PageHeader, Tabs } from '@/components/ui'
import { useCalendarEvents, type CalendarEvent } from '@/lib/calendar'
import { capitalize, countdown, fmt, minutesLabel } from '@/lib/dates'
import { useAssignments, useSubjectMap, useUpdate, useWorkBlocks } from '@/lib/data'
import { dayKey } from '@/lib/planner'
import type { Assignment, WorkBlock } from '@/lib/types'

type View = 'day' | 'week' | 'month' | 'list'
type Item =
  | { kind: 'event'; at: Date; ev: CalendarEvent }
  | { kind: 'assignment'; at: Date; a: Assignment }
  | { kind: 'block'; at: Date; b: WorkBlock; a?: Assignment }

const WEEK = { weekStartsOn: 1 as const }

function useItems() {
  const { data: assignments = [] } = useAssignments()
  const { data: blocks = [] } = useWorkBlocks()
  const cal = useCalendarEvents()
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>()
    const add = (k: string, it: Item) => m.set(k, [...(m.get(k) ?? []), it])
    for (const ev of cal.events) add(dayKey(ev.start), { kind: 'event', at: ev.start, ev })
    for (const a of assignments) add(dayKey(new Date(a.due_at)), { kind: 'assignment', at: new Date(a.due_at), a })
    for (const b of blocks)
      add(b.day, { kind: 'block', at: new Date(b.day + 'T00:00:00'), b, a: assignments.find((x) => x.id === b.assignment_id) })
    for (const list of m.values()) list.sort((x, y) => x.at.getTime() - y.at.getTime())
    return m
  }, [assignments, blocks, cal.events])
  return { byDay, assignments, cal }
}

function ItemRow({ it, onOpen, compact }: { it: Item; onOpen: (a: Assignment) => void; compact?: boolean }) {
  const subjects = useSubjectMap()
  const updateA = useUpdate<Assignment>('assignments')
  const updateB = useUpdate<WorkBlock>('work_blocks')

  if (it.kind === 'event') {
    const color = it.ev.color ?? 'var(--muted)'
    return (
      <div className="flex gap-2 rounded-xl px-2 py-1.5 text-sm" style={{ background: it.ev.color ? `${it.ev.color}22` : 'var(--surface-2)' }}>
        <span className="w-1 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <div className="min-w-0">
          <p className={cx('font-medium', compact ? 'line-clamp-2 break-words' : 'truncate')}>{it.ev.title}</p>
          {!compact && (
            <p className="flex flex-wrap gap-x-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden />
                {it.ev.allDay ? 'Journée' : `${fmt(it.ev.start, "HH'h'mm")} – ${fmt(it.ev.end, "HH'h'mm")}`}
              </span>
              {it.ev.location && (
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="size-3" aria-hidden />
                  {it.ev.location}
                </span>
              )}
            </p>
          )}
          {compact && !it.ev.allDay && <p className="text-xs text-muted">{fmt(it.ev.start, "HH'h'mm")}</p>}
        </div>
      </div>
    )
  }

  if (it.kind === 'assignment') {
    const a = it.a
    const s = a.subject_id ? subjects.get(a.subject_id) : undefined
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-1.5" style={compact ? { borderLeft: `3px solid ${s?.color ?? 'var(--accent)'}` } : undefined}>
        {!compact && <Checkbox
          checked={a.status === 'done'}
          color={s?.color}
          label={`${a.title} fait`}
          onChange={(v) => updateA.mutate({ id: a.id, patch: { status: v ? 'done' : 'todo', done_at: v ? new Date().toISOString() : null } })}
        />}
        <button type="button" onClick={() => onOpen(a)} className="min-w-0 flex-1 text-left">
          <p className={cx('text-sm font-medium', compact ? 'line-clamp-2 break-words' : 'truncate', a.status === 'done' && 'text-muted line-through')}>📌 {a.title}</p>
          {!compact && (
            <p className="truncate text-xs text-muted">
              {s?.name ?? 'Sans matière'} · à rendre {fmt(a.due_at, "HH'h'mm")} · {STATUS_LABEL[a.status]}
            </p>
          )}
        </button>
      </div>
    )
  }

  const s = it.a?.subject_id ? subjects.get(it.a.subject_id) : undefined
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-2 py-1.5">
      {!compact && <Checkbox checked={it.b.done} color={s?.color} label="Séance faite" onChange={(done) => updateB.mutate({ id: it.b.id, patch: { done } })} />}
      <button type="button" onClick={() => it.a && onOpen(it.a)} className="min-w-0 flex-1 text-left">
        <p className={cx('text-sm', compact ? 'line-clamp-2 break-words' : 'truncate', it.b.done && 'text-muted line-through')}>⏱ {it.a?.title ?? 'Séance'}{compact && ` · ${minutesLabel(it.b.minutes)}`}</p>
        {!compact && <p className="text-xs text-muted">{minutesLabel(it.b.minutes)} de travail</p>}
      </button>
    </div>
  )
}

export default function AgendaPage() {
  const [view, setView] = useState<View>(() => (window.innerWidth < 640 ? 'list' : 'week'))
  const [cursor, setCursor] = useState(new Date())
  const [form, setForm] = useState<{ open: boolean; a?: Assignment; date?: Date }>({ open: false })
  const { byDay, assignments, cal } = useItems()
  const open = (a: Assignment) => setForm({ open: true, a })

  const move = (dir: 1 | -1) =>
    setCursor((c) => (view === 'day' ? addDays(c, dir) : view === 'month' ? addMonths(c, dir) : addWeeks(c, dir)))

  const title =
    view === 'day'
      ? capitalize(fmt(cursor, 'EEEE d MMMM yyyy'))
      : view === 'month'
        ? capitalize(fmt(cursor, 'MMMM yyyy'))
        : view === 'week'
          ? `Semaine du ${fmt(startOfWeek(cursor, WEEK), 'd MMM')}`
          : 'À venir'

  return (
    <>
      <PageHeader
        title="Agenda"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setForm({ open: true, date: view === 'day' ? cursor : undefined })}>
            Devoir
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          label="Vue"
          value={view}
          onChange={setView}
          items={[
            { value: 'day', label: 'Jour' },
            { value: 'week', label: 'Semaine' },
            { value: 'month', label: 'Mois' },
            { value: 'list', label: 'Liste' },
          ]}
        />
        {view !== 'list' && (
          <div className="flex items-center gap-1">
            <IconButton label="Précédent" onClick={() => move(-1)}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <Button size="sm" variant="secondary" onClick={() => setCursor(new Date())}>
              Aujourd’hui
            </Button>
            <IconButton label="Suivant" onClick={() => move(1)}>
              <ChevronRight className="size-5" />
            </IconButton>
          </div>
        )}
        <h2 className="ml-1 font-display text-lg font-semibold">{title}</h2>
        <span className="flex-1" />
        {cal.hasLinks ? (
          <IconButton label="Actualiser Outlook" onClick={() => cal.refetch()}>
            <RefreshCw className={cx('size-4', cal.isFetching && 'animate-spin')} />
          </IconButton>
        ) : (
          <Link to="/parametres#calendrier" className="text-sm text-accent-ink hover:underline">
            Connecter Outlook
          </Link>
        )}
      </div>
      {cal.error && (
        <div className="mb-3">
          <ErrorBox error={cal.error} />
        </div>
      )}

      {view === 'day' && <DayView items={byDay.get(dayKey(cursor)) ?? []} onOpen={open} />}
      {view === 'week' && <WeekView cursor={cursor} byDay={byDay} onOpen={open} onAdd={(d) => setForm({ open: true, date: d })} />}
      {view === 'month' && (
        <MonthView
          cursor={cursor}
          byDay={byDay}
          onPick={(d) => {
            setCursor(d)
            setView('day')
          }}
        />
      )}
      {view === 'list' && <ListView assignments={assignments} byDay={byDay} onOpen={open} />}

      <AssignmentForm open={form.open} assignment={form.a} defaultDate={form.date} onClose={() => setForm({ open: false })} />
    </>
  )
}

function DayView({ items, onOpen }: { items: Item[]; onOpen: (a: Assignment) => void }) {
  if (!items.length) return <EmptyState title="Journée libre">Aucun cours ni devoir ce jour-là.</EmptyState>
  return (
    <Card className="flex flex-col gap-2">
      {items.map((it, i) => (
        <ItemRow key={i} it={it} onOpen={onOpen} />
      ))}
    </Card>
  )
}

function WeekView({ cursor, byDay, onOpen, onAdd }: { cursor: Date; byDay: Map<string, Item[]>; onOpen: (a: Assignment) => void; onAdd: (d: Date) => void }) {
  const start = startOfWeek(cursor, WEEK)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-7">
      {days.map((d) => {
        const items = byDay.get(dayKey(d)) ?? []
        return (
          <div key={d.toISOString()} className={cx('flex min-h-24 flex-col gap-1.5 rounded-2xl border bg-surface p-2', isToday(d) ? 'border-accent' : 'border-border')}>
            <div className="flex items-center justify-between px-1">
              <span className={cx('text-sm font-semibold', isToday(d) && 'text-accent-ink')}>{capitalize(fmt(d, 'EEE d'))}</span>
              <IconButton label={`Ajouter un devoir le ${fmt(d, 'd MMMM')}`} className="size-7" onClick={() => onAdd(d)}>
                <Plus className="size-3.5" />
              </IconButton>
            </div>
            {items.map((it, i) => (
              <ItemRow key={i} it={it} onOpen={onOpen} compact />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function MonthView({ cursor, byDay, onPick }: { cursor: Date; byDay: Map<string, Item[]>; onPick: (d: Date) => void }) {
  const subjects = useSubjectMap()
  const start = startOfWeek(startOfMonth(cursor), WEEK)
  const end = endOfWeek(endOfMonth(cursor), WEEK)
  const days: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border text-center text-xs font-semibold text-muted">
        {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const items = byDay.get(dayKey(d)) ?? []
          const deadlines = items.filter((i) => i.kind === 'assignment')
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPick(d)}
              className={cx('flex min-h-16 flex-col items-start gap-1 border-b border-r border-border p-1.5 text-left hover:bg-surface-2 sm:min-h-24', !isSameMonth(d, cursor) && 'opacity-40')}
              aria-label={`${fmt(d, 'EEEE d MMMM')} : ${items.length} élément(s)`}
            >
              <span className={cx('flex size-6 items-center justify-center rounded-full text-xs font-semibold', isToday(d) && 'bg-accent text-white')}>{d.getDate()}</span>
              <div className="flex flex-wrap gap-0.5">
                {items.slice(0, 6).map((it, i) => {
                  const color =
                    it.kind === 'event'
                      ? (it.ev.color ?? 'var(--muted)')
                      : it.kind === 'assignment'
                        ? (it.a.subject_id && subjects.get(it.a.subject_id)?.color) || 'var(--accent)'
                        : 'var(--border)'
                  return <span key={i} className={cx('size-1.5 rounded-full', it.kind === 'assignment' && 'size-2')} style={{ background: color }} />
                })}
              </div>
              {deadlines[0]?.kind === 'assignment' && <span className="hidden w-full truncate text-[11px] sm:block">📌 {deadlines[0].a.title}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ListView({ assignments, byDay, onOpen }: { assignments: Assignment[]; byDay: Map<string, Item[]>; onOpen: (a: Assignment) => void }) {
  const [showDone, setShowDone] = useState(false)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const late = assignments.filter((a) => a.status !== 'done' && new Date(a.due_at) < today)
  const days = [...byDay.keys()].filter((k) => k >= dayKey(today)).sort().slice(0, 45)

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-[var(--accent)]" /> Afficher les devoirs faits
      </label>
      {late.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-danger">En retard</h3>
          <div className="flex flex-col gap-1.5">
            {late.map((a) => (
              <div key={a.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <ItemRow it={{ kind: 'assignment', at: new Date(a.due_at), a }} onOpen={onOpen} />
                </div>
                <Badge tone="danger">{countdown(a.due_at).label}</Badge>
              </div>
            ))}
          </div>
        </section>
      )}
      {!days.length && <EmptyState title="Rien à venir">Ajoute un devoir ou connecte ton calendrier Outlook.</EmptyState>}
      {days.map((k) => {
        const items = (byDay.get(k) ?? []).filter((it) => showDone || !(it.kind === 'assignment' && it.a.status === 'done'))
        if (!items.length) return null
        const d = new Date(k + 'T12:00:00')
        return (
          <section key={k}>
            <h3 className={cx('mb-2 text-sm font-semibold', isSameDay(d, new Date()) ? 'text-accent-ink' : 'text-muted')}>
              {isSameDay(d, new Date()) ? "Aujourd'hui" : capitalize(fmt(d, 'EEEE d MMMM'))}
            </h3>
            <div className="flex flex-col gap-1.5">
              {items.map((it, i) => (
                <ItemRow key={i} it={it} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
