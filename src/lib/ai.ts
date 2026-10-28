import { authHeader, must, supabase } from './supabase'
import type { AiJob } from './types'

// Lance une tâche IA côté serveur et attend son résultat.
// La clé IA ne quitte jamais le serveur (fonction Netlify).
export async function runAiJob(spaceId: string, kind: AiJob['kind'], params: Record<string, unknown>): Promise<AiJob> {
  const job = must(await supabase.from('ai_jobs').insert({ space_id: spaceId, kind, params }).select().single()) as AiJob

  const res = await fetch('/.netlify/functions/ai-job-background', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ job_id: job.id }),
  })
  if (!res.ok && res.status !== 202) {
    throw new Error(`Le service de génération est indisponible (${res.status}).`)
  }

  const deadline = Date.now() + 6 * 60_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    const current = must(await supabase.from('ai_jobs').select('*').eq('id', job.id).single()) as AiJob
    if (current.status === 'done') return current
    if (current.status === 'error') throw new Error(current.error ?? 'La génération a échoué.')
  }
  throw new Error('La génération prend trop de temps. Réessaie avec moins de contenu ou de questions.')
}
