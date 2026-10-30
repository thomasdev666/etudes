// Notifications sur cet appareil (Web Push). Sur iPhone, elles ne marchent qu'une fois
// l'appli ajoutée à l'écran d'accueil (iOS 16.4 et plus).
import { supabase } from './supabase'

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushConfigured = () => !!KEY
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function enablePush() {
  if (!KEY) throw new Error('Les notifications ne sont pas encore configurées sur le serveur.')
  if (!pushSupported()) throw new Error(isIos() && !isInstalled() ? 'Sur iPhone, ajoute d’abord Regulya à ton écran d’accueil, puis ouvre-la depuis l’icône.' : 'Ce navigateur ne gère pas les notifications.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications refusées. Tu peux les autoriser dans les réglages du navigateur.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }))
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth })
  if (error) throw new Error(error.message)
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
