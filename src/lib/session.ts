// Déconnexion propre : cet appareil ne reçoit plus les notifications du compte,
// et les données mises en cache pour le hors-ligne sont effacées.
import { disablePush } from './push'
import { supabase } from './supabase'

export const OFFLINE_KEYS = ['regulya.offline.cards', 'regulya.offline.reviews']

export async function signOutEverywhere() {
  await disablePush().catch(() => {})
  for (const k of OFFLINE_KEYS) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* stockage indisponible */
    }
  }
  await supabase.auth.signOut()
}
