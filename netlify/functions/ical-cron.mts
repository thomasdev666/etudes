// Tâche planifiée : resynchronise chaque nuit tous les agendas reliés. Nécessite SUPABASE_SECRET_KEY.
import type { Config } from '@netlify/functions'
import { syncLink, type Link } from '../shared/icalSync'
import { adminClient } from '../shared/supabase'

export default async () => {
  const db = adminClient()
  if (!db) return console.log('SUPABASE_SECRET_KEY absente : synchronisation ignorée')
  const { data: links } = await db.from('calendar_links').select('id, space_id, user_id, url').is('deleted_at', null).limit(2000)
  for (const link of (links ?? []) as Link[]) {
    try {
      await syncLink(db, link)
    } catch (e) {
      console.error('Agenda non synchronisé', link.id, e instanceof Error ? e.message : e)
    }
  }
}

// Chaque nuit à 3 h UTC
export const config: Config = { schedule: '0 3 * * *' }
