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
    case 'sheet':
      return 60
    case 'assistant':
      // count = nombre de cours et notes utilisés
      return 45 + count * 4
    case 'exam':
      // count = nombre de questions
      return 30 + count * 2
    case 'transcription':
      // count = durée en minutes
      return 40 + count * 12
    case 'chat':
      return 15
  }
}

// Réveille la fonction serveur pour une tâche. Si la tâche attend son tour dans la file,
// la fonction ne fait rien : l'appli la renvoie ici jusqu'à ce qu'elle démarre.
export async function kickAiJob(jobId: string) {
  return fetch('/.netlify/functions/ai-job-background', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ job_id: jobId }),
  })
}

// Quota correspondant à chaque type de génération (les autres types sont vérifiés par le serveur)
const QUOTA_KIND: Partial<Record<AiJob['kind'], string>> = { quiz: 'quiz', flashcards: 'cards', mindmap: 'mindmap', sheet: 'sheet', assistant: 'sheet' }

// Vérifie la limite de la semaine et la limite de session avant de lancer (et d'attendre dans la file)
// pour rien. À appeler avant de créer la note, le QCM ou la carte qui recevra le résultat.
export async function checkQuota(kind: AiJob['kind']) {
  const q = QUOTA_KIND[kind]
  if (!q) return
  const { error } = await supabase.rpc('check_quota', { p_kind: q, p_amount: 1 })
  // Mise à jour 22 pas encore lancée : le serveur vérifiera au démarrage, comme avant
  if (error && !/check_quota/i.test(error.message)) throw new Error(error.message)
}

// La file avec réservation (mise à jour 22) est-elle installée dans la base ? Vérifié une fois.
// Sans elle, la fonction serveur demande elle-même son tour (fonctionnement de la mise à jour 21).
let queueV2: Promise<boolean> | null = null
function hasQueueV2() {
  queueV2 ??= Promise.resolve(supabase.rpc('check_quota', { p_kind: '__version__', p_amount: 0 })).then(
    ({ error }) => !(error && /check_quota/i.test(error.message)),
    () => false,
  )
  return queueV2
}

// Demande son tour dans la file. « start » : c'est parti ; « wait » : on attend, l'appli redemandera ;
// « legacy » : la fonction serveur demande elle-même son tour (base sans la mise à jour 22).
export async function reserveTurn(jobId: string): Promise<'start' | 'wait' | 'legacy'> {
  if (!(await hasQueueV2())) return 'legacy'
  const { data, error } = await supabase.rpc('start_ai_job', { p_job: jobId })
  if (error) return /start_ai_job/i.test(error.message) ? 'legacy' : 'wait'
  return data ? 'start' : 'wait'
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
  // Pas encore son tour : la tâche attend dans la file, l'appli redemandera régulièrement
  if ((await reserveTurn(job.id)) === 'wait') return job
  const res = await kickAiJob(job.id)
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
