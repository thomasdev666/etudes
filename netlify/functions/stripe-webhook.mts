// Événements Stripe : met à jour l'abonnement Premium de l'utilisateur.
// À déclarer dans Stripe → Développeurs → Webhooks, avec l'adresse /.netlify/functions/stripe-webhook
import { adminClient } from '../shared/supabase'
import { activeStatus, stripe, verifySignature } from '../shared/stripe'

type Sub = {
  id: string
  customer: string
  status: string
  metadata?: { user_id?: string; billing?: string }
  current_period_end?: number
  items?: { data?: { current_period_end?: number }[] }
}

export default async (req: Request) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const admin = adminClient()
  if (!secret || !admin) return new Response('Paiement non configuré', { status: 503 })
  const body = await req.text()
  if (!verifySignature(body, req.headers.get('stripe-signature') ?? '', secret)) return new Response('Signature invalide', { status: 400 })

  const event = JSON.parse(body) as { type: string; data: { object: Record<string, unknown> } }
  let sub: Sub | null = null
  if (event.type === 'checkout.session.completed') {
    const id = event.data.object.subscription as string | undefined
    if (id) sub = await stripe<Sub>(`subscriptions/${id}`)
  } else if (event.type.startsWith('customer.subscription.')) {
    sub = event.data.object as unknown as Sub
  }
  if (!sub) return new Response('ignoré')

  // Retrouve l'utilisateur par les métadonnées, sinon par le client Stripe
  let userId = sub.metadata?.user_id
  if (!userId) {
    const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', sub.customer).maybeSingle()
    userId = data?.user_id
  }
  if (!userId) return new Response('utilisateur inconnu', { status: 200 })

  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end
  const active = activeStatus(sub.status)
  const billing = ['monthly', 'semester', 'annual'].includes(sub.metadata?.billing ?? '') ? sub.metadata?.billing : null
  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      plan: active ? 'premium' : 'free',
      source: active ? 'stripe' : 'none',
      current_period_end: active && end ? new Date(end * 1000).toISOString() : null,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      billing_period: billing,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) return new Response(error.message, { status: 500 })
  return new Response('ok')
}
