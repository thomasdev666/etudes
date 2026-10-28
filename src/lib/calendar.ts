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
export type ImportedEvent = {
  id: string
  title: string
  // nom lu dans le PDF, quand le cours a été renommé
  original_title?: string | null
  kind?: string
  session?: number | null
  location: string
  start_at: string
  end_at: string
}

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

// Renomme un cours partout dans l'emploi du temps. Le nom du PDF est gardé pour
// réappliquer le nouveau nom aux plannings des mois suivants.
export async function renameCourse(from: string, to: string, events: CalendarEvent[], subjects: Subject[]) {
  const ids = events.filter((e) => e.title === from).map((e) => e.id)
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    // Sans la mise à jour 0005, le renommage marche quand même, mais pas pour les imports suivants
    await supabase.from('imported_events').update({ original_title: from }).in('id', chunk).is('original_title', null)
    const { error } = await supabase.from('imported_events').update({ title: to }).in('id', chunk)
    if (error) throw error
  }
  // La matière reconnaît aussi le nouveau nom, pour garder la couleur
  const s = matchSubject(from, subjects)
  if (s && !matchSubject(to, [s])) {
    const { error } = await supabase.from('subjects').update({ keywords: [...s.keywords, to] }).eq('id', s.id)
    if (error) throw error
  }
}
