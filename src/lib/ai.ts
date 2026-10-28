import { authHeader, must, supabase } from './supabase'
import type { AiJob } from './types'

export type JobMeta = {
  label: string
  estimateSec: number
  link?: string
  linkLabel?: string
}

// Durée estimée affichée dans la barre de progression
export function estimateSeconds(kind: AiJob['kind'], count = 0) {
  switch (kind) {
    case 'quiz':
      return 30 + count * 5
    case 'flashcards':
      return 25 + count * 4
    case 'course_images':
      return 15 + count * 5
    case 'mindmap':
      return 75
  }
}

// Crée la tâche et réveille la fonction serveur (réponse immédiate).
// La clé IA ne quitte jamais le serveur.
export async function createAiJob(spaceId: string, kind: AiJob['kind'], params: Record<string, unknown>, meta: JobMeta): Promise<AiJob> {
  const job = must(
    await supabase
      .from('ai_jobs')
      .insert({ space_id: spaceId, kind, params: { ...params, _meta: meta } })
      .select()
      .single(),
  ) as AiJob
  const res = await fetch('/.netlify/functions/ai-job-background', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ job_id: job.id }),
  })
  // Une fonction d'arrière-plan répond toujours 202. Un 200 signifie que la fonction
  // n'existe pas sur le site déployé (la page de l'appli est renvoyée à la place).
  if (res.status !== 202) {
    const message =
      res.status === 200
        ? 'Les fonctions serveur ne sont pas déployées : le site doit être publié depuis GitHub (et non par glisser-déposer).'
        : `Le service de génération est indisponible (${res.status}).`
    await supabase.from('ai_jobs').update({ status: 'error', error: message }).eq('id', job.id)
    throw new Error(message)
  }
  return job
}
