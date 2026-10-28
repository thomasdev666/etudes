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

// Événements Outlook de l'espace, mis en cache 15 minutes
export function useCalendarEvents() {
  const { spaceId } = useSpace()
  const { data: links = [] } = useCalendarLinks()
  const { data: subjects = [] } = useSubjects()
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
      return all.sort((a, b) => a.start.getTime() - b.start.getTime())
    },
  })
  const events: CalendarEvent[] = (query.data ?? []).map((e) => {
    const s = matchSubject(e.title, subjects)
    return { ...e, subjectId: s?.id ?? null, color: s?.color ?? null }
  })
  return { ...query, events, hasLinks: links.length > 0 }
}
