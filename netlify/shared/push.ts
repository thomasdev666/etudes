// Envoi de notifications Web Push aux appareils d'un utilisateur.
// Nécessite VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (et VAPID_SUBJECT, une adresse mailto:).
import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'

export type PushMessage = { title: string; body: string; url?: string; tag?: string }

export function pushReady() {
  const pub = process.env.VITE_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contact@regulya.fr', pub, priv)
  return true
}

// Envoie à tous les appareils de l'utilisateur ; supprime les abonnements expirés
export async function pushToUser(db: SupabaseClient, userId: string, msg: PushMessage) {
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
  let sent = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 12 * 3600 })
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      else console.error('Notification non envoyée', status ?? e)
    }
  }
  return sent
}
