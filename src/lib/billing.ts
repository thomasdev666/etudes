// Paiement Stripe : redirection vers la page de paiement ou le portail client.
// Tant que VITE_PAYMENTS_ENABLED n'est pas « true », les boutons de paiement restent masqués.
import type { Billing } from '@/config/offers'
import { authHeader } from './supabase'

export const PAYMENTS_ENABLED = import.meta.env.VITE_PAYMENTS_ENABLED === 'true'

async function go(path: string, body: unknown) {
  const res = await fetch(`/.netlify/functions/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok || !json.url) throw new Error(json.error ?? 'Le paiement est indisponible pour le moment.')
  window.location.assign(json.url)
}

export const startCheckout = (billing: Billing) => go('checkout', { billing, origin: window.location.origin })
export const openBillingPortal = () => go('billing-portal', { origin: window.location.origin })
