// Fonction d'arrière-plan Netlify (jusqu'à 15 min) : traite une tâche ai_jobs.
// Le client crée la tâche, appelle cette fonction (réponse 202 immédiate),
// puis suit le statut de la tâche dans la base.
import { generateFlashcards, generateQuiz, type Difficulty, type QuizType } from '../shared/ai'
import { userClient } from '../shared/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

type QuizParams = {
  quiz_id: string
  course_ids?: string[]
  note_ids?: string[]
  count: number
  difficulty: Difficulty
  qtype: QuizType
}
type CardsParams = {
  subject_id: string
  course_ids?: string[]
  note_ids?: string[]
  text?: string
  count: number
}

async function loadSource(db: SupabaseClient, p: { course_ids?: string[]; note_ids?: string[]; text?: string }) {
  const parts: string[] = []
  if (p.course_ids?.length) {
    const { data, error } = await db.from('courses').select('title, content').in('id', p.course_ids)
    if (error) throw error
    for (const c of data) parts.push(`## ${c.title}\n${c.content}`)
  }
  if (p.note_ids?.length) {
    const { data, error } = await db.from('notes').select('title, content_text').in('id', p.note_ids)
    if (error) throw error
    for (const n of data) parts.push(`## ${n.title}\n${n.content_text}`)
  }
  if (p.text) parts.push(p.text)
  const source = parts.join('\n\n').trim()
  if (source.length < 200) throw new Error('Le contenu source est trop court pour générer des questions utiles.')
  return source
}

export default async (req: Request) => {
  let db: SupabaseClient
  try {
    ;({ db } = await userClient(req))
  } catch {
    return
  }
  const { job_id } = (await req.json().catch(() => ({}))) as { job_id?: string }
  if (!job_id) return

  const { data: job } = await db.from('ai_jobs').select('*').eq('id', job_id).single()
  if (!job || job.status !== 'pending') return
  await db.from('ai_jobs').update({ status: 'running' }).eq('id', job_id)

  try {
    if (job.kind === 'quiz') {
      const p = job.params as QuizParams
      try {
        const source = await loadSource(db, p)
        const questions = await generateQuiz({ source, count: p.count, difficulty: p.difficulty, qtype: p.qtype })
        const { error } = await db.from('quiz_questions').insert(
          questions.map((q, i) => ({
            space_id: job.space_id,
            quiz_id: p.quiz_id,
            position: i,
            question: q.question,
            choices: q.choices,
            correct_index: q.correct_index,
            explanation: q.explanation,
            notion: q.notion,
          })),
        )
        if (error) throw error
        await db
          .from('quizzes')
          .update({ status: 'ready', question_count: questions.length, error: null })
          .eq('id', p.quiz_id)
        await db.from('ai_jobs').update({ status: 'done', result: { count: questions.length } }).eq('id', job_id)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await db.from('quizzes').update({ status: 'error', error: message }).eq('id', p.quiz_id)
        throw e
      }
    } else if (job.kind === 'flashcards') {
      const p = job.params as CardsParams
      const source = await loadSource(db, p)
      const cards = await generateFlashcards({ source, count: p.count })
      const { error } = await db.from('flashcards').insert(
        cards.map((c) => ({
          space_id: job.space_id,
          subject_id: p.subject_id,
          front: c.front,
          back: c.back,
          source: 'ai',
        })),
      )
      if (error) throw error
      await db.from('ai_jobs').update({ status: 'done', result: { count: cards.length } }).eq('id', job_id)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e)
    await db.from('ai_jobs').update({ status: 'error', error: message }).eq('id', job_id)
  }
}
