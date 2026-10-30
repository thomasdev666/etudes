// Hors ligne : les données déjà chargées restent lisibles sans réseau (cache sur l'appareil),
// et les révisions de flash cards faites hors ligne sont envoyées au retour du réseau.
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { clear, createStore, del, get, set } from 'idb-keyval'
import { supabase } from './supabase'

const store = createStore('regulya', 'cache')
const REVIEWS = 'regulya.offline.reviews'

export const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => get(k, store), setItem: (k, v) => set(k, v, store), removeItem: (k) => del(k, store) },
  throttleTime: 2000,
})

// Requêtes non conservées : contenus partagés publics, quotas et offre (toujours relus en ligne)
const SKIP = new Set(['share', 'usage', 'plan_details', 'search'])
export const persistOptions = {
  persister,
  maxAge: 7 * 24 * 3600_000,
  buster: 'v1',
  dehydrateOptions: { shouldDehydrateQuery: (q: { queryKey: readonly unknown[]; state: { status: string } }) => q.state.status === 'success' && !SKIP.has(String(q.queryKey[0])) },
}

export async function clearOfflineCache() {
  await clear(store).catch(() => {})
  try {
    localStorage.removeItem(REVIEWS)
  } catch {
    /* stockage indisponible */
  }
}

export const isNetworkError = (e: unknown) => !navigator.onLine || /fetch|network|load failed/i.test(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))

type PendingReview = { cardId: string; patch: Record<string, unknown>; review: Record<string, unknown> }

function readQueue(): PendingReview[] {
  try {
    return JSON.parse(localStorage.getItem(REVIEWS) ?? '[]') as PendingReview[]
  } catch {
    return []
  }
}
function writeQueue(q: PendingReview[]) {
  try {
    if (q.length) localStorage.setItem(REVIEWS, JSON.stringify(q))
    else localStorage.removeItem(REVIEWS)
  } catch {
    /* stockage indisponible */
  }
}

export const pendingReviews = () => readQueue().length

export function queueReview(r: PendingReview) {
  // Une seule mise à jour par carte suffit : la dernière l'emporte, toutes les réponses sont gardées
  const q = readQueue()
  writeQueue([...q, r])
}

let flushing = false
export async function flushReviews() {
  if (flushing || !navigator.onLine) return 0
  flushing = true
  let sent = 0
  try {
    const q = readQueue()
    const rest: PendingReview[] = []
    for (const [i, r] of q.entries()) {
      const later = q.slice(i + 1).some((x) => x.cardId === r.cardId)
      const up = later ? { error: null } : await supabase.from('flashcards').update(r.patch).eq('id', r.cardId)
      const ins = up.error ? up : await supabase.from('flashcard_reviews').insert(r.review)
      if (up.error || ins.error) rest.push(r)
      else sent++
    }
    writeQueue(rest)
  } finally {
    flushing = false
  }
  return sent
}
