export type Base = {
  id: string
  space_id: string
  user_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type Space = Omit<Base, 'space_id'> & { name: string; archived_at: string | null }

export type Subject = Base & {
  name: string
  color: string
  keywords: string[]
  exam_date: string | null
  position: number
}

export type Course = Base & {
  subject_id: string
  title: string
  content: string
  status: 'processing' | 'ready' | 'error'
  file_path: string | null
  file_name: string | null
}

export type AssignmentStatus = 'todo' | 'doing' | 'done'
export type Assignment = Base & {
  subject_id: string | null
  title: string
  description: string
  due_at: string
  estimated_minutes: number | null
  status: AssignmentStatus
  done_at: string | null
}

export type WorkBlock = Base & { assignment_id: string; day: string; minutes: number; done: boolean }

export type StudyPlan = Base & { subject_id: string; title: string; color: string | null }
export type PlanItem = Base & { plan_id: string; label: string; done: boolean; position: number }

export type Flashcard = Base & {
  subject_id: string
  front: string
  back: string
  source: 'manual' | 'ai'
  interval_days: number
  ease: number
  repetitions: number
  lapses: number
  due_at: string
  last_reviewed_at: string | null
}

export type Quiz = Base & {
  subject_id: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  qtype: 'mcq' | 'truefalse'
  question_count: number
  source_course_ids: string[]
  source_note_ids: string[]
  status: 'generating' | 'ready' | 'error'
  error: string | null
}

// Les colonnes correct_index et explanation ne sont jamais lisibles côté client
export type QuizQuestionPublic = {
  id: string
  quiz_id: string
  position: number
  question: string
  choices: string[]
  notion: string
}
export const QUESTION_PUBLIC_COLUMNS = 'id, quiz_id, position, question, choices, notion'

export type QuizSession = Base & {
  subject_id: string
  quiz_id: string | null
  kind: 'quiz' | 'errors'
  question_ids: string[]
  current_index: number
  progress: { question_id: string; chosen_index: number | null; time_ms: number }[]
  started_at: string
  finished_at: string | null
  score: number | null
  total: number | null
}

export type Correction = {
  question_id: string
  question: string
  choices: string[]
  correct_index: number
  chosen_index: number | null
  is_correct: boolean
  explanation: string
  notion: string
  time_ms: number | null
}

export type ErrorItem = Base & {
  subject_id: string
  question_id: string
  success_streak: number
  miss_count: number
  resolved_at: string | null
}

export type Note = Base & {
  subject_id: string | null
  title: string
  content: unknown
  content_text: string
}

export type NoteVersion = Base & { note_id: string; title: string; content: unknown }

export type FileRow = Base & { path: string; name: string; mime: string; size: number; note_id: string | null; course_id: string | null }

export type CalendarLink = Base & { label: string; url: string; last_synced_at: string | null }

export type MindNode = { id?: string; title: string; detail?: string; children?: MindNode[]; collapsed?: boolean }

export type NoteOutput = Base & {
  subject_id: string
  kind: 'mindmap' | 'sheet'
  title: string
  content: MindNode
  source_note_ids: string[]
  source_course_ids: string[]
  sources_updated_at: string | null
  status: 'generating' | 'ready' | 'error'
  error: string | null
}

export type AiJob = Base & {
  kind: 'quiz' | 'flashcards' | 'course_images' | 'mindmap'
  params: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'error'
  error: string | null
  result: { count?: number } | null
}
