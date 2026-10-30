// Offres affichées dans l'appli. Les montants réels encaissés sont ceux des prix Stripe
// (variables STRIPE_PRICE_*), à créer avec les mêmes montants.
export type Billing = 'monthly' | 'semester' | 'annual'

export const OFFERS: Record<Billing, { price: number; months: number }> = {
  monthly: { price: 2.99, months: 1 },
  semester: { price: 14.99, months: 6 },
  annual: { price: 24.99, months: 12 },
}

export const ESSAI_JOURS = 7

export const euros = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

// Économie par rapport au mensuel, en pourcentage arrondi
export const saving = (b: Billing) => Math.round((1 - OFFERS[b].price / (OFFERS.monthly.price * OFFERS[b].months)) * 100)
export const perMonth = (b: Billing) => OFFERS[b].price / OFFERS[b].months
