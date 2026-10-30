// Synchronisation d'un agenda relié : remplace ses événements sur les 6 prochains mois
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchIcs, parseIcs } from './ical'

export type Link = { id: string; space_id: string; user_id: string; url: string }

export async function syncLink(db: SupabaseClient, link: Link) {
  const now = Date.now()
  try {
    const events = parseIcs(await fetchIcs(link.url), new Date(now - 7 * 86_400_000), new Date(now + 183 * 86_400_000)).slice(0, 3000)
    const del = await db.from('imported_events').delete().eq('link_id', link.id)
    if (del.error) throw del.error
    for (let i = 0; i < events.length; i += 500) {
      const { error } = await db.from('imported_events').insert(
        events.slice(i, i + 500).map((e) => ({
          space_id: link.space_id,
          user_id: link.user_id,
          link_id: link.id,
          title: e.title,
          location: e.location,
          start_at: e.start.toISOString(),
          end_at: e.end.toISOString(),
        })),
      )
      if (error) throw error
    }
    await db.from('calendar_links').update({ last_synced_at: new Date().toISOString(), last_error: null }).eq('id', link.id)
    return events.length
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Synchronisation impossible'
    await db.from('calendar_links').update({ last_error: message.slice(0, 300) }).eq('id', link.id)
    throw e
  }
}
