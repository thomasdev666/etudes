// Suggestion des matières à partir des titres de l'emploi du temps (réponse rapide)
import { subjectsFromTitles } from '../shared/ai'
import { errorResponse, HttpError, userClient } from '../shared/supabase'

export default async (req: Request) => {
  try {
    await userClient(req)
    const { titles } = (await req.json().catch(() => ({}))) as { titles?: unknown }
    if (!Array.isArray(titles) || !titles.length) throw new HttpError(400, 'Aucun titre')
    const clean = [...new Set(titles.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 200)))]
    return Response.json({ subjects: await subjectsFromTitles(clean) })
  } catch (e) {
    return errorResponse(e)
  }
}
