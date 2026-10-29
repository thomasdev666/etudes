import { Check, Crown, Sprout, Sparkles, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge, Button, cx } from '@/components/ui'

// Les trois offres présentées à l'inscription et sur la page Abonnement.
// Les boutons Premium restent désactivés tant que le paiement n'est pas branché.

type Offer = {
  id: 'free' | 'monthly' | 'annual'
  name: string
  icon: LucideIcon
  price: string
  unit: string
  note: string
  items: string[]
  highlight?: string
}

const PREMIUM_ITEMS = ['Quotas hebdomadaires bien plus élevés', 'Transcription de tes cours enregistrés', 'Examens blancs TAGE MAGE et TOEIC complets', 'Statistiques détaillées et export complet']

const OFFERS: Offer[] = [
  {
    id: 'free',
    name: 'Gratuit',
    icon: Sprout,
    price: '0 €',
    unit: 'pour toujours',
    note: 'Pour découvrir l’appli à ton rythme.',
    items: ['Agenda, devoirs et planification', 'Matières, notes, ressources et recherche', 'Flash cards sans limite', 'QCM, fiches et cartes mentales en quantité limitée'],
  },
  {
    id: 'monthly',
    name: 'Premium mensuel',
    icon: Sparkles,
    price: '4,99 €',
    unit: 'par mois',
    note: 'Sans engagement, arrêtable à tout moment.',
    items: PREMIUM_ITEMS,
  },
  {
    id: 'annual',
    name: 'Premium annuel',
    icon: Crown,
    price: '39 €',
    unit: 'par an',
    note: 'Soit environ 3,25 € par mois.',
    items: [...PREMIUM_ITEMS, 'Deux mois offerts par rapport au mensuel'],
    highlight: '−35 %',
  },
]

function Plan({ offer, action, current }: { offer: Offer; action: ReactNode; current: boolean }) {
  const Icon = offer.icon
  const featured = !!offer.highlight
  return (
    <article
      aria-labelledby={`plan-${offer.id}`}
      className={cx(
        'relative flex flex-col gap-5 rounded-[24px] border p-6 shadow-card motion-safe:transition-transform motion-safe:duration-200 hover:-translate-y-0.5',
        featured ? 'border-accent bg-gradient-to-b from-accent-soft to-surface ring-4 ring-accent/10' : 'border-border bg-surface',
      )}
    >
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-bold text-white shadow-card">
          {offer.highlight} · le plus choisi
        </span>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className={cx('flex size-11 items-center justify-center rounded-2xl', featured ? 'bg-accent text-white' : 'bg-accent-soft text-accent-ink')}>
          <Icon className="size-5" aria-hidden />
        </span>
        {current && <Badge tone="success">Ton offre</Badge>}
      </div>
      <div>
        <h3 id={`plan-${offer.id}`} className="text-lg font-semibold">
          {offer.name}
        </h3>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="font-display text-4xl font-bold tracking-tight">{offer.price}</span>
          <span className="text-sm text-muted">{offer.unit}</span>
        </p>
        <p className="mt-2 text-sm text-muted">{offer.note}</p>
      </div>
      <ul className="flex flex-col gap-2.5 text-sm">
        {offer.items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-3.5" strokeWidth={3} aria-hidden />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-2">{action}</div>
    </article>
  )
}

export function PlanChoice({ current, freeAction, premiumAction }: { current?: 'free' | 'premium'; freeAction?: ReactNode; premiumAction?: ReactNode }) {
  const soon = (
    <Button className="w-full" disabled>
      Bientôt disponible
    </Button>
  )
  return (
    <div className="grid grid-cols-1 gap-6 pt-3 md:grid-cols-3 md:items-stretch">
      {OFFERS.map((offer) => (
        <Plan
          key={offer.id}
          offer={offer}
          current={offer.id === 'free' && current === 'free'}
          action={offer.id === 'free' ? freeAction ?? null : premiumAction ?? soon}
        />
      ))}
      <p className="text-center text-xs text-muted md:col-span-3">Paiement par carte, Apple Pay ou Google Pay : disponible prochainement.</p>
    </div>
  )
}
