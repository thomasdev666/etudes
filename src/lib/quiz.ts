import { must, supabase } from './supabase'
import type { Quiz } from './types'

const shuffle = <T,>(a: T[]) => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

export async function startQuizSession(spaceId: string, quiz: Pick<Quiz, 'id' | 'subject_id'>): Promise<string> {
  const qs = must(await supabase.from('quiz_questions').select('id').eq('quiz_id', quiz.id).is('deleted_at', null).order('position')) as {
    id: string
  }[]
  if (!qs.length) throw new Error('Ce QCM ne contient aucune question.')
  const s = must(
    await supabase
      .from('quiz_sessions')
      .insert({ space_id: spaceId, subject_id: quiz.subject_id, quiz_id: quiz.id, kind: 'quiz', question_ids: qs.map((q) => q.id) })
      .select('id')
      .single(),
  ) as { id: string }
  return s.id
}

// Session « Erreurs » : questions ratées non encore réussies 2 fois de suite
export async function startErrorSession(spaceId: string, subjectId: string): Promise<string> {
  const items = must(
    await supabase.from('error_items').select('question_id').eq('subject_id', subjectId).is('resolved_at', null).is('deleted_at', null),
  ) as { question_id: string }[]
  if (!items.length) throw new Error('Aucune erreur à retravailler dans cette matière 🎉')
  const ids = shuffle(items.map((i) => i.question_id)).slice(0, 30)
  const s = must(
    await supabase
      .from('quiz_sessions')
      .insert({ space_id: spaceId, subject_id: subjectId, kind: 'errors', question_ids: ids })
      .select('id')
      .single(),
  ) as { id: string }
  return s.id
}
