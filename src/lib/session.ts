// Déconnexion propre : cet appareil ne reçoit plus les notifications du compte,
// et les données mises en cache pour le hors-ligne sont effacées.
import { clearOfflineCache, flushReviews } from './offline'
import { disablePush } from './push'
import { supabase } from './supabase'

export async function signOutEverywhere() {
  await flushReviews().catch(() => 0)
  await disablePush().catch(() => {})
  await clearOfflineCache()
  await supabase.auth.signOut()
}
