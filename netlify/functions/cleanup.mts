// Tâche planifiée quotidienne : efface de Storage les fichiers dont la ligne
// a été purgée (corbeille > 30 jours, compte supprimé). Nécessite SUPABASE_SECRET_KEY.
import type { Config } from '@netlify/functions'
import { adminClient } from '../shared/supabase'

export default async () => {
  const db = adminClient()
  if (!db) {
    console.log('SUPABASE_SECRET_KEY absente : nettoyage ignoré')
    return
  }
  for (let round = 0; round < 20; round++) {
    const { data, error } = await db.from('storage_garbage').select('path').limit(100)
    if (error) throw error
    if (!data.length) break
    const paths = data.map((r) => r.path)
    const { error: rmError } = await db.storage.from('files').remove(paths)
    if (rmError) throw rmError
    await db.from('storage_garbage').delete().in('path', paths)
  }
}

export const config: Config = { schedule: '@daily' }
