// Fonction d'arrière-plan Netlify (jusqu'à 15 min) : traite une tâche ai_jobs.
// Le client crée la tâche, appelle cette fonction (réponse 202 immédiate),
// puis suit le statut de la tâche dans la base.
import { describeImages, generateFlashcards, generateMindmap, generateQuiz, type Difficulty, type QuizType } from '../shared/ai'
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

type ImagesParams = { course_id: string; images: { path: string; label: string; marker: string }[] }
type MindmapParams = { output_id: string; course_ids?: string[]; note_ids?: string[]; title: string }

const IMAGE_BATCH = 6

async function toBase64(db: SupabaseClient, path: string) {
  const { data, error } = await db.storage.from('files').download(path)
  if (error || !data) throw new Error(`Image illisible : ${path}`)
  return { mime: data.type || 'image/jpeg', base64: Buffer.from(await data.arrayBuffer()).toString('base64') }
}

// Remplace les repères [[image:N]] du cours par la transcription des images
async function processCourseImages(db: SupabaseClient, p: ImagesParams) {
  const { data: course, error } = await db.from('courses').select('content').eq('id', p.course_id).single()
  if (error) throw error
  let content: string = course.content
  let failed = 0
  for (let i = 0; i < p.images.length; i += IMAGE_BATCH) {
    const batch = p.images.slice(i, i + IMAGE_BATCH)
    try {
      const images = await Promise.all(batch.map(async (im) => ({ ...(await toBase64(db, im.path)), label: im.label })))
      const items = await describeImages(images, content)
      batch.forEach((im, j) => {
        const text = items.find((it) => it.index === j)?.text.trim() ?? ''
        content = content.replace(im.marker, text ? `\n[Image — ${im.label}]\n${text}\n` : '')
      })
    } catch {
      failed += batch.length
      for (const im of batch) content = content.replace(im.marker, '')
    }
    // Sauvegarde progressive : le cours reste utilisable même si la suite échoue
    await db.from('courses').update({ content }).eq('id', p.course_id)
  }
  content = content.replace(/\[\[image:\d+\]\]/g, '')
  await db.from('courses').update({ content, status: failed === p.images.length && failed > 0 ? 'error' : 'ready' }).eq('id', p.course_id)
  return { count: p.images.length - failed, failed }
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
  if (source.length < 80) throw new Error('Le contenu choisi est presque vide : écris un peu plus dans ta note ou ajoute un cours.')
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
        // En cas de relance, on repart d'un QCM vide
        await db.from('quiz_questions').delete().eq('quiz_id', p.quiz_id)
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
    } else if (job.kind === 'course_images') {
      const p = job.params as ImagesParams
      try {
        const result = await processCourseImages(db, p)
        await db.from('ai_jobs').update({ status: 'done', result }).eq('id', job_id)
      } catch (e) {
        await db.from('courses').update({ status: 'error' }).eq('id', p.course_id)
        throw e
      }
    } else if (job.kind === 'mindmap') {
      const p = job.params as MindmapParams
      try {
        const source = await loadSource(db, p)
        const root = await generateMindmap({ source, title: p.title })
        const dates: string[] = []
        if (p.note_ids?.length) {
          const { data } = await db.from('notes').select('updated_at').in('id', p.note_ids)
          dates.push(...(data ?? []).map((d) => d.updated_at))
        }
        if (p.course_ids?.length) {
          const { data } = await db.from('courses').select('updated_at').in('id', p.course_ids)
          dates.push(...(data ?? []).map((d) => d.updated_at))
        }
        await db
          .from('note_outputs')
          .update({ content: root, status: 'ready', error: null, sources_updated_at: dates.sort().pop() ?? null })
          .eq('id', p.output_id)
        await db.from('ai_jobs').update({ status: 'done', result: { count: 1 } }).eq('id', job_id)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await db.from('note_outputs').update({ status: 'error', error: message }).eq('id', p.output_id)
        throw e
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e)
    await db.from('ai_jobs').update({ status: 'error', error: message }).eq('id', job_id)
  }
}
