// Relais pour lire un calendrier Outlook publié (lien ICS).
// Le navigateur ne peut pas le lire directement (CORS) ; on le récupère ici.
import { errorResponse, HttpError, userClient } from '../shared/supabase'

const MAX_BYTES = 8 * 1024 * 1024

function checkUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw.replace(/^webcal:\/\//i, 'https://'))
  } catch {
    throw new HttpError(400, 'Lien invalide')
  }
  if (u.protocol !== 'https:') throw new HttpError(400, 'Le lien doit commencer par https:// ou webcal://')
  const host = u.hostname
  const privateHost =
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.includes(':')
  if (privateHost) throw new HttpError(400, 'Adresse non autorisée')
  return u
}

export default async (req: Request) => {
  try {
    await userClient(req)
    const target = new URL(req.url).searchParams.get('url')
    if (!target) throw new HttpError(400, 'Paramètre url manquant')
    const url = checkUrl(target)

    const res = await fetch(url, {
      headers: { accept: 'text/calendar, */*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) throw new HttpError(502, `Le calendrier a répondu ${res.status}. Vérifie le lien.`)
    const text = await res.text()
    if (text.length > MAX_BYTES) throw new HttpError(413, 'Calendrier trop volumineux')
    if (!text.includes('BEGIN:VCALENDAR')) throw new HttpError(422, "Ce lien ne renvoie pas un calendrier ICS")

    return new Response(text, {
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300' },
    })
  } catch (e) {
    return errorResponse(e)
  }
}
