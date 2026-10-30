// Conversation avec GIRAFA : chaque question devient une tâche « chat » traitée par le serveur
// (réponse tirée des cours, sinon d'Internet). La fenêtre attend la réponse sans passer par le panneau des tâches.
import { createAiJob } from './ai'
import { supabase } from './supabase'
import type { AiJob } from './types'

export type ChatTurn = { from: 'me' | 'bot'; text: string }
export type ChatReply = {
  intent: 'answer' | 'document'
  answer: string
  from: 'courses' | 'web' | 'none'
  sources: string[]
  web_sources: { title: string; uri: string }[]
  suggest_document: boolean
  document_instruction: string
  subject_ids: string[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function askGirafa(spaceId: string, question: string, history: ChatTurn[], signal?: AbortSignal): Promise<ChatReply> {
  const job = await createAiJob(spaceId, 'chat', { question, history: history.slice(-8) }, { label: 'GIRAFA', estimateSec: 15 })
  const until = Date.now() + 120_000
  for (let wait = 1200; Date.now() < until; wait = Math.min(wait + 300, 2500)) {
    await sleep(wait)
    if (signal?.aborted) throw new DOMException('Annulé', 'AbortError')
    const { data } = await supabase.from('ai_jobs').select('status, error, result').eq('id', job.id).single()
    const row = data as Pick<AiJob, 'status' | 'error' | 'result'> | null
    if (row?.status === 'done') return (row.result as unknown as { reply: ChatReply }).reply
    if (row?.status === 'error') throw new Error(row.error ?? 'GIRAFA n’a pas pu répondre.')
  }
  throw new Error('GIRAFA met trop de temps à répondre. Réessaie dans un instant.')
}
