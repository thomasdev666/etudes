import { useQuery } from '@tanstack/react-query'
import { useSpace } from '@/context/space'
import { useSubjects } from './data'
import { supabase } from './supabase'
import { cleanCourseTitle, sessionLabel } from './timetablePdf'
import type { Subject } from './types'

export type CalendarEvent = {
  id: string
  title: string
  // « TD n°6 », « Cours n°4 »
  detail: string
  location: string
  start: Date
  end: Date
  allDay: boolean
  subjectId: string | null
  color: string | null
}

export function matchSubject(title: string, subjects: Subject[]): Subject | null {
  const t = title.toLowerCase()
  for (const s of subjects) {
    const keys = [s.name, ...s.keywords].map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 2)
    if (keys.some((k) => t.includes(k))) return s
  }
  return null
}

// Cours importés depuis un PDF de l'emploi du temps
export type ImportedEvent = { id: string; title: string; kind?: string; session?: number | null; location: string; start_at: string; end_at: string }

export function useImportedEvents() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: ['imported_events', spaceId],
    enabled: !!spaceId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('imported_events')
        .select('*')
        .eq('space_id', spaceId)
        .is('deleted_at', null)
        .order('start_at')
      // Table absente (mise à jour 0003 non lancée) : on ignore simplement
      if (error) return [] as ImportedEvent[]
      return data as ImportedEvent[]
    },
  })
}

// Cours de l'emploi du temps (importés depuis le PDF), avec la couleur de leur matière
export function useCalendarEvents() {
  const { data: subjects = [] } = useSubjects()
  const imported = useImportedEvents()
  const events: CalendarEvent[] = (imported.data ?? []).map((e) => {
    const title = cleanCourseTitle(e.title)
    const s = matchSubject(title, subjects)
    return {
      id: e.id,
      title,
      detail: sessionLabel(e.kind ?? '', e.session ?? null),
      location: e.location,
      start: new Date(e.start_at),
      end: new Date(e.end_at),
      allDay: false,
      subjectId: s?.id ?? null,
      color: s?.color ?? null,
    }
  })
  return { ...imported, events, hasLinks: events.length > 0 }
}
