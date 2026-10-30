// Création d'une page de paiement Stripe pour l'abonnement Premium
import { adminClient, errorResponse, HttpError, userClient } from '../shared/supabase'
import { priceFor, stripe, type Billing } from '../shared/stripe'

export default async (req: Request) => {
  try {
    const { userId, email } = await userClient(req)
    const { billing } = (await req.json().catch(() => ({}))) as { billing?: Billing }
    if (!billing || !['monthly', 'semester', 'annual'].includes(billing)) throw new HttpError(400, 'Offre inconnue')
    const price = priceFor(billing)
    const admin = adminClient()
    if (!price || !admin) throw new HttpError(503, 'Le paiement n’est pas encore activé.')
    // Adresse de retour : toujours le site lui-même, jamais une adresse fournie par le navigateur
    const site = process.env.URL ?? new URL(req.url).origin

    const { data: sub } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle()
    let customer = sub?.stripe_customer_id as string | undefined
    if (!customer) {
      const created = await stripe<{ id: string }>('customers', { email, metadata: { user_id: userId } })
      customer = created.id
      await admin.from('subscriptions').upsert({ user_id: userId, stripe_customer_id: customer, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    }

    const session = await stripe<{ url: string }>('checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: userId,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { user_id: userId, billing } },
      allow_promotion_codes: 'true',
      locale: 'auto',
      success_url: `${site}/abonnement?paiement=ok`,
      cancel_url: `${site}/abonnement?paiement=annule`,
    })
    return Response.json({ url: session.url })
  } catch (e) {
    return errorResponse(e)
  }
}
