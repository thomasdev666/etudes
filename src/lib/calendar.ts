import { useQuery } from '@tanstack/react-query'
import ICAL from 'ical.js'
import { useSpace } from '@/context/space'
import { useCalendarLinks, useSubjects } from './data'
import { authHeader, supabase } from './supabase'
import type { Subject } from './types'

type IcalEvent = InstanceType<typeof ICAL.Event>
type IcalTime = InstanceType<typeof ICAL.Time>

export type CalendarEvent = {
  id: string
  title: string
  location: string
  start: Date
  end: Date
  allDay: boolean
  subjectId: string | null
  color: string | null
}

const PAST_DAYS = 60
const FUTURE_DAYS = 240
const MAX_OCCURRENCES = 1500

export function parseIcs(text: string, from: Date, to: Date): Omit<CalendarEvent, 'subjectId' | 'color'>[] {
  const root = new ICAL.Component(ICAL.parse(text))
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz)

  const masters = new Map<string, IcalEvent>()
  const exceptions: IcalEvent[] = []
  for (const v of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v)
    if (ev.isRecurrenceException()) exceptions.push(ev)
    else masters.set(ev.uid, ev)
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex)

  const out: Omit<CalendarEvent, 'subjectId' | 'color'>[] = []
  const toTime = ICAL.Time.fromJSDate(to, true)
  for (const ev of masters.values()) {
    if (ev.component.getFirstPropertyValue('status') === 'CANCELLED') continue
    const push = (start: IcalTime, end: IcalTime, summary: string, location: string) => {
      const s = start.toJSDate()
      const e = end.toJSDate()
      if (e < from || s > to) return
      out.push({ id: `${ev.uid}-${s.getTime()}`, title: summary || '(sans titre)', location: location || '', start: s, end: e, allDay: start.isDate })
    }
    if (ev.isRecurring()) {
      const it = ev.iterator()
      let next: IcalTime | null
      let n = 0
      while ((next = it.next()) && n++ < MAX_OCCURRENCES) {
        if (next.compare(toTime) > 0) break
        const d = ev.getOccurrenceDetails(next)
        push(d.startDate, d.endDate, d.item.summary, d.item.location)
      }
    } else if (ev.startDate) {
      push(ev.startDate, ev.endDate ?? ev.startDate, ev.summary, ev.location)
    }
  }
  return out
}

export function matchSubject(title: string, subjects: Subject[]): Subject | null {
  const t = title.toLowerCase()
  for (const s of subjects) {
    const keys = [s.name, ...s.keywords].map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 2)
    if (keys.some((k) => t.includes(k))) return s
  }
  return null
}

export async function fetchIcs(url: string): Promise<string> {
  const res = await fetch(`/.netlify/functions/ics?url=${encodeURIComponent(url)}`, { headers: await authHeader() })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Calendrier indisponible (${res.status})`)
  }
  return res.text()
}

// Cours importés depuis un PDF de l'emploi du temps
export type ImportedEvent = { id: string; title: string; location: string; start_at: string; end_at: string }

export function useImportedEvents() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: ['imported_events', spaceId],
    enabled: !!spaceId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('imported_events')
        .select('id, title, location, start_at, end_at')
        .eq('space_id', spaceId)
        .is('deleted_at', null)
        .order('start_at')
      // Table absente (mise à jour 0003 non lancée) : on ignore simplement
      if (error) return [] as ImportedEvent[]
      return data as ImportedEvent[]
    },
  })
}

// Événements de l'emploi du temps (liens ICS + PDF importés), mis en cache 15 minutes
export function useCalendarEvents() {
  const { spaceId } = useSpace()
  const { data: links = [] } = useCalendarLinks()
  const { data: subjects = [] } = useSubjects()
  const imported = useImportedEvents()
  const query = useQuery({
    queryKey: ['calendar_events', spaceId, links.map((l) => l.id + l.url).join('|')],
    enabled: links.length > 0,
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const from = new Date(Date.now() - PAST_DAYS * 86_400_000)
      const to = new Date(Date.now() + FUTURE_DAYS * 86_400_000)
      const all: Omit<CalendarEvent, 'subjectId' | 'color'>[] = []
      for (const l of links) {
        all.push(...parseIcs(await fetchIcs(l.url), from, to))
        supabase.from('calendar_links').update({ last_synced_at: new Date().toISOString() }).eq('id', l.id).then()
      }
      return all
    },
  })
  const fromPdf: Omit<CalendarEvent, 'subjectId' | 'color'>[] = (imported.data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    location: e.location,
    start: new Date(e.start_at),
    end: new Date(e.end_at),
    allDay: false,
  }))
  const events: CalendarEvent[] = [...(query.data ?? []), ...fromPdf]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((e) => {
      const s = matchSubject(e.title, subjects)
      return { ...e, subjectId: s?.id ?? null, color: s?.color ?? null }
    })
  return {
    ...query,
    isLoading: query.isLoading || imported.isLoading,
    events,
    hasLinks: links.length > 0 || fromPdf.length > 0,
  }
}
