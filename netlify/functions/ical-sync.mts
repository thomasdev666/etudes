// Synchronise maintenant un agenda relié (bouton dans l'appli)
import { syncLink, type Link } from '../shared/icalSync'
import { errorResponse, HttpError, userClient } from '../shared/supabase'

export default async (req: Request) => {
  try {
    const { db } = await userClient(req)
    const { link_id } = (await req.json().catch(() => ({}))) as { link_id?: string }
    if (!link_id) throw new HttpError(400, 'Agenda manquant')
    // La RLS garantit que le lien appartient à l'utilisateur
    const { data: link } = await db.from('calendar_links').select('id, space_id, user_id, url').eq('id', link_id).is('deleted_at', null).maybeSingle()
    if (!link) throw new HttpError(404, 'Agenda introuvable')
    try {
      return Response.json({ count: await syncLink(db, link as Link) })
    } catch (e) {
      throw new HttpError(422, e instanceof Error ? e.message : 'Synchronisation impossible')
    }
  } catch (e) {
    return errorResponse(e)
  }
}
