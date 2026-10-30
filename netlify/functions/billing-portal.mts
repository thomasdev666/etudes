// Portail client Stripe : changer de carte, voir les factures, arrêter l'abonnement
import { adminClient, errorResponse, HttpError, userClient } from '../shared/supabase'
import { stripe } from '../shared/stripe'

export default async (req: Request) => {
  try {
    const { userId } = await userClient(req)
    const admin = adminClient()
    if (!admin) throw new HttpError(503, 'Le paiement n’est pas encore activé.')
    const { data } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle()
    if (!data?.stripe_customer_id) throw new HttpError(404, 'Aucun abonnement payé sur ce compte.')
    const site = process.env.URL ?? new URL(req.url).origin
    const portal = await stripe<{ url: string }>('billing_portal/sessions', { customer: data.stripe_customer_id, return_url: `${site}/abonnement` })
    return Response.json({ url: portal.url })
  } catch (e) {
    return errorResponse(e)
  }
}
