// Préparation d'une épreuve d'entraînement : on prend dans la banque les questions
// jamais vues, et l'IA génère ce qui manque.
import type { SupabaseClient } from '@supabase/supabase-js'
import { EXAMS, type ExamId, type SectionDef } from '../../src/lib/exams'
import { generateExamBatch, type ExamItem } from './ai'

type BankRow = { id: string; passage_id: string | null; question: string; created_at: string }
type Progress = (value: number, phase?: string) => Promise<void>

// Questions par appel à l'IA (un texte long de compréhension coûte cher à écrire)
function batchSize(s: SectionDef) {
  if (!s.perPassage) return 15
  const passages = s.key === 'comprehension' ? 1 : s.key === 'part7' ? 4 : 5
  return passages * s.perPassage
}

// Groupes entiers (un texte et toutes ses questions), dans l'ordre de création
export function pickGroups(rows: BankRow[], used: Set<string>, count: number): string[] {
  const groups = new Map<string, BankRow[]>()
  for (const r of rows) {
    if (used.has(r.id)) continue
    const k = r.passage_id ?? r.id
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const out: string[] = []
  for (const g of [...groups.values()].sort((a, b) => a[0].created_at.localeCompare(b[0].created_at))) {
    if (out.length >= count) break
    out.push(...g.map((r) => r.id))
  }
  return out
}

async function runLimited<T>(tasks: (() => Promise<T>)[], limit: number) {
  const results: PromiseSettledResult<T>[] = []
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (i < tasks.length) {
        const idx = i++
        results[idx] = await tasks[idx]().then(
          (value) => ({ status: 'fulfilled', value }) as const,
          (reason) => ({ status: 'rejected', reason }) as const,
        )
      }
    }),
  )
  return results
}

export async function prepareExam(db: SupabaseClient, sessionId: string, progress: Progress) {
  const { data: session, error } = await db.from('exam_sessions').select('*').eq('id', sessionId).single()
  if (error || !session) throw new Error('Épreuve introuvable')
  const exam = EXAMS[session.exam as ExamId]
  const wanted = session.sections as { key: string; count: number }[]

  // Questions déjà proposées dans une autre épreuve : on ne les redonne pas
  const { data: others } = await db.from('exam_sessions').select('sections').eq('exam', exam.id).neq('id', sessionId).is('deleted_at', null)
  const used = new Set<string>((others ?? []).flatMap((o) => (o.sections as { question_ids?: string[] }[]).flatMap((s) => s.question_ids ?? [])))

  const bank = async (key: string) => {
    const { data, error: e } = await db
      .from('exam_questions')
      .select('id, passage_id, question, created_at')
      .eq('exam', exam.id)
      .eq('section', key)
      .is('deleted_at', null)
      .order('created_at')
    if (e) throw e
    return (data ?? []) as BankRow[]
  }

  // Lots à générer pour compléter chaque section
  const tasks: (() => Promise<void>)[] = []
  let done = 0
  for (const w of wanted) {
    const def = exam.sections.find((s) => s.key === w.key)
    if (!def) throw new Error(`Section inconnue : ${w.key}`)
    const rows = await bank(w.key)
    const missing = w.count - pickGroups(rows, used, w.count).length
    const avoid = rows.slice(-40).map((r) => r.question.slice(0, 90))
    for (let left = missing; left > 0; left -= batchSize(def)) {
      const count = Math.min(batchSize(def), Math.max(left, def.perPassage ?? 1))
      tasks.push(async () => {
        let items: ExamItem[] | null = null
        for (let attempt = 0; attempt < 2 && !items; attempt++) {
          try {
            items = await generateExamBatch({ exam: exam.id, section: def, count, fixedChoices: exam.fixedChoices?.[def.key], avoid })
          } catch (e) {
            if (attempt === 1) throw e
          }
        }
        const rowsToInsert = items!.flatMap((it) => {
          const passageId = def.perPassage ? crypto.randomUUID() : null
          return it.questions.map((q) => ({
            space_id: session.space_id,
            exam: exam.id,
            section: def.key,
            passage_id: passageId,
            passage: it.passage,
            question: q.question,
            choices: q.choices,
            correct_index: q.correct_index,
            explanation: q.explanation,
          }))
        })
        const { error: ie } = await db.from('exam_questions').insert(rowsToInsert)
        if (ie) throw ie
        done++
        await progress(0.05 + 0.9 * (done / tasks.length), `Questions en préparation… ${Math.round((done / tasks.length) * 100)} %`)
      })
    }
  }
  if (tasks.length) await progress(0.05, 'L’IA rédige les questions…')
  const results = await runLimited(tasks, 3)
  const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined

  // Sélection finale : des groupes entiers, jamais vus
  const sections = []
  for (const w of wanted) {
    const ids = pickGroups(await bank(w.key), used, w.count)
    if (!ids.length) throw failure?.reason ?? new Error('Aucune question disponible pour cette section')
    sections.push({ key: w.key, question_ids: ids })
  }
  const { error: ue } = await db.from('exam_sessions').update({ sections, status: 'ready', error: null }).eq('id', sessionId)
  if (ue) throw ue
}
