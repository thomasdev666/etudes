// Appels à l'API Stripe sans SDK (requêtes HTTP), et vérification de la signature des webhooks.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError } from './supabase'

export type Billing = 'monthly' | 'semester' | 'annual'

export const priceFor = (billing: Billing) =>
  ({ monthly: process.env.STRIPE_PRICE_MONTHLY, semester: process.env.STRIPE_PRICE_SEMESTER, annual: process.env.STRIPE_PRICE_ANNUAL })[billing]

export const stripeReady = () => !!process.env.STRIPE_SECRET_KEY

// Paramètres imbriqués au format attendu par Stripe : a[b][0][c]=valeur
export function formEncode(params: Record<string, unknown>, prefix = ''): string {
  const out: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object') out.push(formEncode(v as Record<string, unknown>, key))
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
  }
  return out.filter(Boolean).join('&')
}

export async function stripe<T = Record<string, unknown>>(path: string, params?: Record<string, unknown>, method = params ? 'POST' : 'GET'): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new HttpError(503, 'Le paiement n’est pas encore activé.')
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? formEncode(params) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json()) as T & { error?: { message?: string } }
  if (!res.ok) throw new HttpError(502, json.error?.message ?? 'Erreur du service de paiement')
  return json
}

// En-tête Stripe-Signature : « t=horodatage,v1=signature ». Tolérance de 5 minutes.
export function verifySignature(payload: string, header: string, secret: string, now = Date.now()): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]))
  const t = Number(parts.t)
  if (!t || Math.abs(now / 1000 - t) > 300) return false
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  return header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .some((p) => {
      const sig = Buffer.from(p.slice(3), 'hex')
      const exp = Buffer.from(expected, 'hex')
      return sig.length === exp.length && timingSafeEqual(sig, exp)
    })
}

// Statuts Stripe qui donnent accès à Premium
export const activeStatus = (status: string) => ['active', 'trialing', 'past_due'].includes(status)
