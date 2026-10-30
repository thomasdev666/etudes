// GIRAFA en direct : la réponse arrive mot à mot (une ligne JSON par événement).
// Cours de l'étudiant d'abord, Internet sinon ; une demande de document renvoie vers le choix des matières.
import { girafaAnswer, type ChatTurn } from '../shared/ai'
import { errorResponse, HttpError, userClient } from '../shared/supabase'
import { pickPassages, rankSubjects, type Doc } from '../../src/lib/relevance'

export default async (req: Request) => {
  try {
    const { db } = await userClient(req)
    const body = (await req.json().catch(() => ({}))) as { question?: unknown; history?: unknown; space_id?: unknown }
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 2000) : ''
    const spaceId = typeof body.space_id === 'string' ? body.space_id : ''
    if (!question || !spaceId) throw new HttpError(400, 'Question vide')
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((t): t is ChatTurn => !!t && (t.from === 'me' || t.from === 'bot') && typeof t.text === 'string')
      .slice(-8)

    const { error: quotaError } = await db.rpc('consume_quota', { p_kind: 'chat', p_amount: 1 })
    if (quotaError) throw new HttpError(429, quotaError.message)

    // Cours et notes de l'espace (la sécurité de la base limite la lecture à l'étudiant)
    const [{ data: subjects }, { data: courses }, { data: notes }] = await Promise.all([
      db.from('subjects').select('id, name, keywords').eq('space_id', spaceId).is('deleted_at', null),
      db.from('courses').select('id, title, subject_id, content').eq('space_id', spaceId).is('deleted_at', null),
      db.from('notes').select('id, title, subject_id, content_text').eq('space_id', spaceId).is('deleted_at', null),
    ])
    const docs: Doc[] = [
      ...(courses ?? []).map((c) => ({ id: c.id, title: c.title, subject_id: c.subject_id, text: c.content ?? '' })),
      ...(notes ?? []).map((n) => ({ id: n.id, title: n.title, subject_id: n.subject_id, text: n.content_text ?? '' })),
    ]
    // La question précédente aide pour les questions de suivi (« et pour le BFR ? »)
    const lastAsk = [...history].reverse().find((t) => t.from === 'me')?.text ?? ''
    const { text: passages, titles } = pickPassages(`${question} ${question} ${lastAsk}`, docs)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'))
        try {
          for await (const ev of girafaAnswer({ question, history, passages, titles, signal: req.signal })) {
            if (ev.t === 'doc') send({ ...ev, subject_ids: rankSubjects(ev.instruction, subjects ?? [], docs) })
            else send(ev)
          }
          send({ t: 'done' })
        } catch (e) {
          send({ t: 'error', message: e instanceof Error ? e.message : 'GIRAFA n’a pas pu répondre.' })
        } finally {
          controller.close()
        }
      },
    })
    return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } })
  } catch (e) {
    return errorResponse(e)
  }
}
