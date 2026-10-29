// Fonction d'arrière-plan Netlify (jusqu'à 15 min) : traite une tâche ai_jobs.
// Le client crée la tâche, appelle cette fonction (réponse 202 immédiate),
// puis suit le statut de la tâche dans la base.
import { describeImages, generateFlashcards, generateMindmap, generateQuiz, generateSheet, type Difficulty, type QuizType } from '../shared/ai'
import { sheetToDoc } from '../shared/sheetDoc'
import { userClient } from '../shared/supabase'
import { prepareExam } from '../shared/examPrep'
import { runTranscription, type TranscriptionState } from '../shared/transcription'
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
type SheetParams = { note_id: string; course_ids?: string[]; note_ids?: string[]; title: string }
type MindmapParams = { output_id: string; course_ids?: string[]; note_ids?: string[]; title: string }

const IMAGE_BATCH = 10
const IMAGE_PARALLEL = 2

type Progress = (value: number, phase?: string) => Promise<void>

async function toBase64(db: SupabaseClient, path: string) {
  const { data, error } = await db.storage.from('files').download(path)
  if (error || !data) throw new Error(`Image illisible : ${path}`)
  return { mime: data.type || 'image/jpeg', base64: Buffer.from(await data.arrayBuffer()).toString('base64') }
}

// Remplace les repères [[image:N]] du cours par la transcription des images
async function processCourseImages(db: SupabaseClient, p: ImagesParams, progress: Progress) {
  const { data: course, error } = await db.from('courses').select('content').eq('id', p.course_id).single()
  if (error) throw error
  const context: string = course.content
  const texts = new Map<string, string>()
  let failed = 0
  let done = 0
  const batches: (typeof p.images)[] = []
  for (let i = 0; i < p.images.length; i += IMAGE_BATCH) batches.push(p.images.slice(i, i + IMAGE_BATCH))

  async function run(batch: typeof p.images) {
    try {
      const images = await Promise.all(batch.map(async (im) => ({ ...(await toBase64(db, im.path)), label: im.label })))
      const items = await describeImages(images, context)
      batch.forEach((im, j) => texts.set(im.marker, items.find((it) => it.index === j)?.text.trim() ?? ''))
    } catch {
      failed += batch.length
      for (const im of batch) texts.set(im.marker, '')
    }
    done += batch.length
    await progress(done / p.images.length, `${done} / ${p.images.length} images lues`)
  }

  // Quelques lots en parallèle : plus rapide, sans dépasser le quota gratuit
  const queue = [...batches]
  await Promise.all(
    Array.from({ length: Math.min(IMAGE_PARALLEL, queue.length) }, async () => {
      for (let b = queue.shift(); b; b = queue.shift()) await run(b)
    }),
  )

  // Relit le contenu au cas où il aurait été modifié entre-temps
  const { data: fresh } = await db.from('courses').select('content').eq('id', p.course_id).single()
  let content: string = fresh?.content ?? context
  for (const im of p.images) {
    const text = texts.get(im.marker) ?? ''
    content = content.replace(im.marker, text ? `\n[Image — ${im.label}]\n${text}\n` : '')
  }
  content = content.replace(/\[\[image:\d+\]\]/g, '')
  await db.from('courses').update({ content, status: failed === p.images.length && failed > 0 ? 'error' : 'ready' }).eq('id', p.course_id)
  return { count: p.images.length - failed, failed }
}

// Si un cours est encore en cours de lecture (images), on attend la fin
// pour que la génération utilise tout son contenu.
async function waitForCourses(db: SupabaseClient, ids: string[] | undefined, progress: Progress) {
  if (!ids?.length) return
  const deadline = Date.now() + 8 * 60_000
  while (Date.now() < deadline) {
    const { data } = await db.from('courses').select('status').in('id', ids)
    if (!data?.some((c) => c.status === 'processing')) return
    await progress(0.02, 'En attente de la lecture des images du cours…')
    await new Promise((r) => setTimeout(r, 5000))
  }
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
  const startedAt = Date.now()
  let db: SupabaseClient
  try {
    ;({ db } = await userClient(req))
  } catch {
    return
  }
  const { job_id, resume } = (await req.json().catch(() => ({}))) as { job_id?: string; resume?: boolean }
  if (!job_id) return

  const { data: job } = await db.from('ai_jobs').select('*').eq('id', job_id).single()
  // Une transcription longue se relance elle-même pour continuer (status déjà « running »)
  const resuming = resume === true && job?.kind === 'transcription' && job.status === 'running'
  if (!job || (job.status !== 'pending' && !resuming)) return
  if (!resuming)
    await db.from('ai_jobs').update({ status: 'running', result: { progress: 0.03, phase: 'Lecture du contenu…' } }).eq('id', job_id)

  const progress: Progress = async (value, phase) => {
    await db.from('ai_jobs').update({ result: { progress: value, phase } }).eq('id', job_id)
  }
  // Pendant la rédaction, la barre avance avec le temps écoulé : on voit que ça travaille
  let beat: ReturnType<typeof setInterval> | undefined
  const prepare = async (p: { course_ids?: string[]; note_ids?: string[]; text?: string }) => {
    await waitForCourses(db, p.course_ids, progress)
    const source = await loadSource(db, p)
    await progress(0.1, 'L’IA rédige…')
    const t0 = Date.now()
    beat = setInterval(() => {
      const sec = Math.round((Date.now() - t0) / 1000)
      const value = 0.1 + 0.8 * (1 - Math.exp(-sec / 90))
      const elapsed = sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')}`
      progress(value, `L’IA rédige… (${elapsed})`).catch(() => {})
    }, 8000)
    return source
  }
  // Netlify arrête la fonction à 15 min : on s'arrête avant, avec un message clair
  let guard: ReturnType<typeof setTimeout> | undefined
  const watchdog = new Promise<never>((_, reject) => {
    guard = setTimeout(() => reject(new Error('La génération a pris trop de temps (service IA saturé). Réessaie dans quelques minutes.')), 13 * 60_000)
  })

  // Quotas : vérifiés côté serveur avant toute dépense d'IA (ne pas reconsommer lors d'une reprise)
  const quotaFor = async (): Promise<{ kind: string; amount: number } | null> => {
    const p = job.params as Record<string, unknown>
    switch (job.kind) {
      case 'quiz':
        return { kind: 'quiz', amount: 1 }
      case 'flashcards':
        return { kind: 'cards', amount: 1 }
      case 'mindmap':
        return { kind: 'mindmap', amount: 1 }
      case 'sheet':
        return { kind: 'sheet', amount: 1 }
      case 'course_images':
        return { kind: 'images', amount: 1 }
      case 'transcription': {
        const { data: rec } = await db.from('recordings').select('duration_sec').eq('id', p.recording_id as string).single()
        return { kind: 'transcription', amount: Math.max(1, Math.ceil((rec?.duration_sec ?? 0) / 60)) }
      }
      case 'exam': {
        const { data: ex } = await db.from('exam_sessions').select('mode').eq('id', p.session_id as string).single()
        return { kind: ex?.mode === 'full' ? 'exam_full' : 'exam_section', amount: 1 }
      }
      default:
        return null
    }
  }
  const run = async () => {
    if (!resuming) {
      const q = await quotaFor()
      if (q) {
        const { error: qe } = await db.rpc('consume_quota', { p_kind: q.kind, p_amount: q.amount })
        if (qe) throw new Error(qe.message)
      }
    }
    if (job.kind === 'exam') {
      const sessionId = (job.params as { session_id: string }).session_id
      try {
        await prepareExam(db, sessionId, progress)
        await db.from('ai_jobs').update({ status: 'done', result: { count: 1, progress: 1 } }).eq('id', job_id)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await db.from('exam_sessions').update({ status: 'error', error: message }).eq('id', sessionId)
        throw e
      }
    } else if (job.kind === 'transcription') {
      const recordingId = (job.params as { recording_id: string }).recording_id
      try {
        await db.from('recordings').update({ status: 'transcribing', error: null }).eq('id', recordingId)
        const state = resuming ? (job.result as TranscriptionState) : null
        const outcome = await runTranscription(
          db,
          { ...job, result: state },
          {
            // Marge avant l'arrêt de sécurité : on sauvegarde et on se relance
            stopAt: startedAt + 9 * 60_000,
            save: async (st) => {
              await db.from('ai_jobs').update({ result: st }).eq('id', job_id)
            },
          },
        )
        if (outcome === 'continue') {
          await fetch(new URL('/.netlify/functions/ai-job-background', req.url), {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: req.headers.get('authorization') ?? '' },
            body: JSON.stringify({ job_id, resume: true }),
          })
          return
        }
        await db.from('ai_jobs').update({ status: 'done', result: { count: 1, progress: 1 } }).eq('id', job_id)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await db.from('recordings').update({ status: 'error', error: message }).eq('id', recordingId)
        throw e
      }
    } else if (job.kind === 'quiz') {
      const p = job.params as QuizParams
      try {
        const source = await prepare(p)
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
      const source = await prepare(p)
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
        const result = await processCourseImages(db, p, progress)
        await db.from('ai_jobs').update({ status: 'done', result }).eq('id', job_id)
      } catch (e) {
        await db.from('courses').update({ status: 'error' }).eq('id', p.course_id)
        throw e
      }
    } else if (job.kind === 'sheet') {
      const p = job.params as SheetParams
      try {
        const source = await prepare(p)
        const { doc, text } = sheetToDoc(await generateSheet({ source, title: p.title }))
        const { error } = await db.from('notes').update({ content: doc, content_text: text }).eq('id', p.note_id)
        if (error) throw error
        await db.from('ai_jobs').update({ status: 'done', result: { count: 1 } }).eq('id', job_id)
      } catch (e) {
        // La note vide préparée pour la fiche est retirée
        await db.from('notes').delete().eq('id', p.note_id)
        throw e
      }
    } else if (job.kind === 'mindmap') {
      const p = job.params as MindmapParams
      try {
        const source = await prepare(p)
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
  }

  try {
    await Promise.race([run(), watchdog])
  } catch (e) {
    // Arrêt de sécurité : les éléments en attente passent en erreur, pour pouvoir relancer
    const p = job.params as { quiz_id?: string; output_id?: string; note_id?: string; course_id?: string }
    const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e)
    if (p.output_id) await db.from('note_outputs').update({ status: 'error', error: message }).eq('id', p.output_id).eq('status', 'generating')
    if (p.quiz_id) await db.from('quizzes').update({ status: 'error', error: message }).eq('id', p.quiz_id).neq('status', 'ready')
    if (p.note_id && job.kind === 'sheet') await db.from('notes').delete().eq('id', p.note_id)
    const sid = (job.params as { session_id?: string }).session_id
    if (sid && job.kind === 'exam') await db.from('exam_sessions').update({ status: 'error', error: message }).eq('id', sid).eq('status', 'preparing')
    const rid = (job.params as { recording_id?: string }).recording_id
    if (rid) await db.from('recordings').update({ status: 'error', error: message }).eq('id', rid).neq('status', 'done')
    if (p.course_id && job.kind === 'course_images') await db.from('courses').update({ status: 'ready' }).eq('id', p.course_id).eq('status', 'processing')
    await db.from('ai_jobs').update({ status: 'error', error: message }).eq('id', job_id)
  } finally {
    clearInterval(beat)
    clearTimeout(guard)
  }
}
