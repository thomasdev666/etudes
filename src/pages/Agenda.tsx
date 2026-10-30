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
import { Check, ChevronLeft, ChevronRight, Clock, MapPin, Pencil, Plus, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AssignmentForm, STATUS_LABEL } from '@/components/AssignmentForm'
import { Badge, Button, Card, Checkbox, cx, EmptyState, ErrorBox, IconButton, PageHeader, Tabs } from '@/components/ui'
import { useToast } from '@/context/toast'
import { renameCourse, useCalendarEvents, type CalendarEvent } from '@/lib/calendar'
import { capitalize, countdown, fmt, minutesLabel } from '@/lib/dates'
import { useAssignments, useInvalidate, useSubjectMap, useSubjects, useUpdate, useWorkBlocks } from '@/lib/data'
import { dayKey } from '@/lib/planner'
import type { Assignment, WorkBlock } from '@/lib/types'

type View = 'day' | 'week' | 'month' | 'list'
type Item =
  | { kind: 'event'; at: Date; ev: CalendarEvent }
  | { kind: 'assignment'; at: Date; a: Assignment }
  | { kind: 'block'; at: Date; b: WorkBlock; a?: Assignment }

const WEEK = { weekStartsOn: 1 as const }
const MONTH_MAX = 4

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
      add(b.day, { kind: 'block', at: new Date(`${b.day}T${b.start_time ?? '00:00:00'}`), b, a: assignments.find((x) => x.id === b.assignment_id) })
    for (const list of m.values()) list.sort((x, y) => x.at.getTime() - y.at.getTime())
    return m
  }, [assignments, blocks, cal.events])
  return { byDay, assignments, cal }
}

// Nom du cours avec un crayon pour le renommer (partout dans l'emploi du temps)
function CourseTitle({ title }: { title: string }) {
  const cal = useCalendarEvents()
  const { data: subjects = [] } = useSubjects()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const [busy, setBusy] = useState(false)

  async function save() {
    const to = value.trim()
    if (!to || to === title) return setEditing(false)
    setBusy(true)
    try {
      await renameCourse(title, to, cal.events, subjects)
      await invalidate('subjects')
      await cal.refetch()
      setEditing(false)
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : String(e), tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (editing)
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          aria-label="Nouveau nom du cours"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-0.5 font-medium"
        />
        <IconButton type="submit" label="Enregistrer le nom" className="size-7" disabled={busy}>
          <Check className="size-4" />
        </IconButton>
      </form>
    )
  return (
    <p className="group flex min-w-0 items-center gap-1 font-medium">
      <span className="truncate">{title}</span>
      <button
        type="button"
        onClick={() => {
          setValue(title)
          setEditing(true)
        }}
        aria-label={`Renommer le cours ${title}`}
        title="Renommer ce cours"
        className="shrink-0 rounded-md p-1 text-muted opacity-60 hover:bg-surface-2 hover:opacity-100 focus-visible:opacity-100"
      >
        <Pencil className="size-3.5" />
      </button>
    </p>
  )
}

const blockTitle = (it: Extract<Item, { kind: 'block' }>) => (it.b.kind === 'revision' ? (it.b.title ?? 'Révisions') : (it.a?.title ?? 'Séance'))

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
          {compact ? <p className="line-clamp-2 break-words font-medium">{it.ev.title}</p> : <CourseTitle title={it.ev.title} />}
          {!compact && (
            <p className="flex flex-wrap gap-x-2 text-xs text-muted">
              {it.ev.detail && <span className="font-medium text-text/80">{it.ev.detail}</span>}
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
          {compact && !it.ev.allDay && (
            <p className="text-xs text-muted">
              {fmt(it.ev.start, "HH'h'mm")}
              {it.ev.detail && ` · ${it.ev.detail}`}
            </p>
          )}
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

  const sid = it.a?.subject_id ?? it.b.subject_id
  const s = sid ? subjects.get(sid) : undefined
  const time = it.b.start_time ? `${it.b.start_time.slice(0, 5).replace(':', 'h')} · ` : ''
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed px-2 py-1.5" style={{ borderColor: s?.color ?? 'var(--border)' }}>
      {!compact && <Checkbox checked={it.b.done} color={s?.color} label="Séance faite" onChange={(done) => updateB.mutate({ id: it.b.id, patch: { done } })} />}
      <button type="button" onClick={() => it.a && onOpen(it.a)} className="min-w-0 flex-1 text-left">
        <p className={cx('text-sm', compact ? 'line-clamp-2 break-words' : 'truncate', it.b.done && 'text-muted line-through')}>⏱ {blockTitle(it)}{compact && ` · ${time}${minutesLabel(it.b.minutes)}`}</p>
        {!compact && (
          <p className="text-xs text-muted">
            {time}
            {minutesLabel(it.b.minutes)} de {it.b.kind === 'revision' ? 'révision' : 'travail'}
          </p>
        )}
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
          <>
            <Link to="/planification" data-tour="plan-button">
              <Button variant="secondary" icon={<Wand2 className="size-4" />}>
                Planifier
              </Button>
            </Link>
            <Button icon={<Plus className="size-4" />} onClick={() => setForm({ open: true, date: view === 'day' ? cursor : undefined })}>
              Devoir
            </Button>
          </>
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
        {!cal.hasLinks && (
          <Link to="/parametres#calendrier" className="text-sm text-accent-ink hover:underline">
            Importer mon emploi du temps
          </Link>
        )}
      </div>
      {cal.error && (
        <div className="mb-3">
          <ErrorBox error={cal.error} />
        </div>
      )}

      {cal.hasLinks && (view === 'month' || view === 'week') && !cal.events.some((e) => isSameMonth(e.start, cursor)) && (
        <p className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-accent-soft px-3 py-2 text-sm">
          <span className="flex-1">Pas encore de cours importés pour {fmt(cursor, 'MMMM')}.</span>
          <Link to="/parametres#calendrier" className="font-medium text-accent-ink hover:underline">
            Importer le PDF de {fmt(cursor, 'MMMM')}
          </Link>
        </p>
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
  const colorOf = (it: Item) =>
    it.kind === 'event'
      ? (it.ev.color ?? 'var(--muted)')
      : it.kind === 'assignment'
        ? (it.a.subject_id && subjects.get(it.a.subject_id)?.color) || 'var(--accent)'
        : ((it.a?.subject_id ?? it.b.subject_id) && subjects.get((it.a?.subject_id ?? it.b.subject_id)!)?.color) || 'var(--border)'
  const label = (it: Item) =>
    it.kind === 'event'
      ? `${it.ev.title}${it.ev.detail ? ` · ${it.ev.detail.replace(' n°', ' ')}` : ''}`
      : it.kind === 'assignment'
        ? `📌 ${it.a.title}`
        : `⏱ ${blockTitle(it)}`
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
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPick(d)}
              className={cx('flex min-h-16 flex-col items-start gap-1 border-b border-r border-border p-1.5 text-left hover:bg-surface-2 sm:min-h-24', !isSameMonth(d, cursor) && 'opacity-40')}
              aria-label={`${fmt(d, 'EEEE d MMMM')} : ${items.length} élément(s)`}
            >
              <span className={cx('flex size-6 items-center justify-center rounded-full text-xs font-semibold', isToday(d) && 'bg-accent text-white')}>{d.getDate()}</span>
              {/* Téléphone : pastilles ; écran plus large : nom court des cours */}
              <div className="flex flex-wrap gap-0.5 sm:hidden">
                {items.slice(0, 6).map((it, i) => (
                  <span key={i} className={cx('size-1.5 rounded-full', it.kind === 'assignment' && 'size-2')} style={{ background: colorOf(it) }} />
                ))}
              </div>
              <div className="hidden w-full min-w-0 flex-col gap-0.5 sm:flex">
                {items.slice(0, MONTH_MAX).map((it, i) => (
                  <span
                    key={i}
                    className="line-clamp-2 w-full break-words rounded-md px-1 py-px text-[11px] leading-[14px]"
                    style={{ background: it.kind === 'event' ? `color-mix(in srgb, ${colorOf(it)} 18%, transparent)` : undefined, borderLeft: `3px solid ${colorOf(it)}` }}
                    title={it.kind === 'event' && !it.ev.allDay ? `${fmt(it.ev.start, "H'h'mm")} ${label(it)}` : label(it)}
                  >
                    {label(it)}
                  </span>
                ))}
                {items.length > MONTH_MAX && <span className="px-1 text-[11px] text-muted">+{items.length - MONTH_MAX} autre{items.length - MONTH_MAX > 1 ? 's' : ''}</span>}
              </div>
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
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="size-4 accent-[var(--accent)]" /> Afficher les devoirs faits
      </label>
      {late.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-danger">En retard</h3>
          <div className="flex flex-col gap-1.5">
            {late.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <div className="min-w-[min(100%,14rem)] flex-1">
                  <ItemRow it={{ kind: 'assignment', at: new Date(a.due_at), a }} onOpen={onOpen} />
                </div>
                <span className="shrink-0 whitespace-nowrap">
                  <Badge tone="danger">{countdown(a.due_at).label}</Badge>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {!days.length && <EmptyState title="Rien à venir">Ajoute un devoir ou importe ton emploi du temps (Paramètres).</EmptyState>}
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
