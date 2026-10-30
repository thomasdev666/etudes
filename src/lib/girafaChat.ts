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

// Sans prise en charge par le serveur après ce délai, inutile d'attendre davantage
const START_TIMEOUT_MS = 25_000
const ANSWER_TIMEOUT_MS = 90_000

export async function askGirafa(spaceId: string, question: string, history: ChatTurn[], onPhase?: (phase: string) => void): Promise<ChatReply> {
  const job = await createAiJob(spaceId, 'chat', { question, history: history.slice(-8) }, { label: 'GIRAFA', estimateSec: 15 })
  const started = Date.now()
  for (let wait = 1000; ; wait = Math.min(wait + 250, 2000)) {
    await sleep(wait)
    const { data } = await supabase.from('ai_jobs').select('status, error, result').eq('id', job.id).maybeSingle()
    const row = data as Pick<AiJob, 'status' | 'error' | 'result'> | null
    if (row?.status === 'done') return (row.result as unknown as { reply: ChatReply }).reply
    if (row?.status === 'error') throw new Error(row.error ?? 'GIRAFA n’a pas pu répondre.')
    if (row?.result?.phase) onPhase?.(row.result.phase)
    const elapsed = Date.now() - started
    const stuck = (row?.status ?? 'pending') === 'pending' ? elapsed > START_TIMEOUT_MS : elapsed > ANSWER_TIMEOUT_MS
    if (stuck) {
      const message =
        (row?.status ?? 'pending') === 'pending'
          ? 'Le service de GIRAFA n’a pas démarré. Réessaie dans un instant ; si ça continue, préviens-nous.'
          : 'GIRAFA met trop de temps à répondre (service IA saturé). Réessaie dans un instant.'
      await supabase.from('ai_jobs').update({ status: 'error', error: message }).eq('id', job.id).in('status', ['pending', 'running'])
      throw new Error(message)
    }
  }
}
