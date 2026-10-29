import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSpace } from '@/context/space'
import { useToast } from '@/context/toast'
import { must, supabase } from './supabase'
import type {
  Assignment,
  CalendarLink,
  Course,
  ErrorItem,
  Flashcard,
  Note,
  NoteOutput,
  PlanItem,
  Quiz,
  QuizSession,
  StudyPlan,
  Subject,
  Recording,
  Resource,
  WorkBlock,
} from './types'

export type Table =
  | 'subjects'
  | 'courses'
  | 'assignments'
  | 'work_blocks'
  | 'study_plans'
  | 'plan_items'
  | 'flashcards'
  | 'flashcard_reviews'
  | 'quizzes'
  | 'quiz_sessions'
  | 'error_items'
  | 'notes'
  | 'note_outputs'
  | 'files'
  | 'calendar_links'
  | 'ai_jobs'
  | 'recordings'
  | 'resources'
  | 'spaces'

// Lecture de toutes les lignes actives d'une table dans l'espace courant
function useTable<T>(table: Table, opts: { order?: string; ascending?: boolean; enabled?: boolean } = {}) {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: [table, spaceId],
    enabled: !!spaceId && opts.enabled !== false,
    queryFn: async () => {
      let q = supabase.from(table).select('*').eq('space_id', spaceId).is('deleted_at', null)
      if (opts.order) q = q.order(opts.order, { ascending: opts.ascending ?? true })
      return must(await q) as T[]
    },
  })
}

export const useSubjects = () => useTable<Subject>('subjects', { order: 'position' })
export const useCourses = () => useTable<Course>('courses', { order: 'created_at', ascending: false })
export const useAssignments = () => useTable<Assignment>('assignments', { order: 'due_at' })
export const useWorkBlocks = () => useTable<WorkBlock>('work_blocks', { order: 'day' })
export const usePlans = () => useTable<StudyPlan>('study_plans', { order: 'created_at' })
export const usePlanItems = () => useTable<PlanItem>('plan_items', { order: 'position' })
export const useFlashcards = () => useTable<Flashcard>('flashcards', { order: 'created_at' })
export const useQuizzes = () => useTable<Quiz>('quizzes', { order: 'created_at', ascending: false })
export const useQuizSessions = () => useTable<QuizSession>('quiz_sessions', { order: 'started_at', ascending: false })
export const useErrorItems = () => useTable<ErrorItem>('error_items')
export const useNoteOutputs = () => useTable<NoteOutput>('note_outputs', { order: 'created_at', ascending: false })
export const useRecordings = () => useTable<Recording>('recordings', { order: 'created_at', ascending: false })
export const useResources = () => useTable<Resource>('resources', { order: 'created_at', ascending: false })
export const useCalendarLinks = () => useTable<CalendarLink>('calendar_links')

// Notes sans le contenu complet (liste)
export function useNotesList() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: ['notes', spaceId, 'list'],
    enabled: !!spaceId,
    queryFn: async () =>
      must(
        await supabase
          .from('notes')
          .select('id, space_id, user_id, subject_id, title, content_text, created_at, updated_at, deleted_at')
          .eq('space_id', spaceId)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false }),
      ) as Omit<Note, 'content'>[],
  })
}

export function useSubjectMap() {
  const { data = [] } = useSubjects()
  return new Map(data.map((s) => [s.id, s]))
}

export function useInvalidate() {
  const qc = useQueryClient()
  return (...tables: Table[]) =>
    Promise.all(tables.map((t) => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === t })))
}

export function useInsert<T = Record<string, unknown>>(table: Table) {
  const { spaceId } = useSpace()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (values: Partial<T> | Partial<T>[]) => {
      const rows = (Array.isArray(values) ? values : [values]).map((v) => ({ space_id: spaceId, ...v }))
      return must(await supabase.from(table).insert(rows).select()) as T[]
    },
    onSuccess: () => invalidate(table),
  })
}

export function useUpdate<T = Record<string, unknown>>(table: Table, also: Table[] = []) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<T> }) =>
      must(await supabase.from(table).update(patch as Record<string, unknown>).eq('id', id).select().single()) as T,
    onSuccess: () => invalidate(table, ...also),
  })
}

// Suppression = mise à la corbeille, avec annulation immédiate possible
export function useTrash(table: Table, also: Table[] = []) {
  const invalidate = useInvalidate()
  const toast = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      must(await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id))
      return id
    },
    onSuccess: async (id) => {
      await invalidate(table, ...also)
      toast({
        message: 'Mis à la corbeille (récupérable 30 jours)',
        action: {
          label: 'Annuler',
          run: async () => {
            await supabase.from(table).update({ deleted_at: null }).eq('id', id)
            invalidate(table, ...also)
          },
        },
      })
    },
  })
}
