import { Check, Gift, Sparkles, Sprout } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge, Button, cx, ErrorBox } from '@/components/ui'
import { ESSAI_JOURS, euros, OFFERS, perMonth, saving, type Billing } from '@/config/offers'
import { PAYMENTS_ENABLED, startCheckout } from '@/lib/billing'
import { fmt } from '@/lib/dates'
import { usePlanDetails, useStartTrial } from '@/lib/plans'

// Choix de l'offre : Gratuit, ou Premium avec trois durées (mois, semestre, année).
// Essai Premium gratuit de 7 jours, sans carte bancaire. Paiement Stripe quand il est activé.

const FREE_ITEMS = ['Agenda, devoirs et planification', 'Matières, notes, ressources et recherche', 'Flash cards sans limite', 'QCM, fiches et cartes mentales : 10 la première semaine, puis 3 par semaine']
const PREMIUM_ITEMS = ['30 QCM, fiches et cartes mentales par semaine', 'Transcription de tes cours : 5 h par semaine', 'Examens blancs TAGE MAGE et TOEIC complets', 'Statistiques détaillées et export complet']

const BILLING_LABEL: Record<Billing, string> = { monthly: 'Mois', semester: 'Semestre', annual: 'Année' }
const UNIT: Record<Billing, string> = { monthly: 'par mois', semester: 'pour 6 mois', annual: 'par an' }

function Items({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5 text-sm">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function PlanChoice({ freeAction, onPremium, publicMode, onSignup }: { freeAction?: ReactNode; onPremium?: () => void; publicMode?: boolean; onSignup?: () => void }) {
  const { data: details } = usePlanDetails()
  const startTrial = useStartTrial()
  const [billing, setBilling] = useState<Billing>('semester')
  const [busy, setBusy] = useState<'trial' | 'pay' | null>(null)
  const [error, setError] = useState<unknown>(null)
  const premium = details?.plan === 'premium'
  const offer = OFFERS[billing]

  async function run(kind: 'trial' | 'pay') {
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'trial') {
        await startTrial()
        onPremium?.()
      } else await startCheckout(billing)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="@container">
      <div className="mx-auto grid max-w-md grid-cols-1 gap-5 @2xl:max-w-none @2xl:grid-cols-[1fr_1.25fr]">
        <article aria-labelledby="plan-free" className="flex min-w-0 flex-col gap-5 rounded-[24px] border border-border bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
              <Sprout className="size-5" aria-hidden />
            </span>
            {details && !premium && <Badge tone="success">Ton offre</Badge>}
          </div>
          <div>
            <h3 id="plan-free" className="text-lg font-semibold">
              Gratuit
            </h3>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
              <span className="whitespace-nowrap font-display text-4xl font-bold tracking-tight">0 €</span>
              <span className="text-sm text-muted">pour toujours</span>
            </p>
            <p className="mt-2 text-sm text-muted">Pour t’organiser et découvrir l’appli à ton rythme.</p>
          </div>
          <Items items={FREE_ITEMS} />
          {freeAction && <div className="mt-auto pt-2">{freeAction}</div>}
        </article>

        <article aria-labelledby="plan-premium" className="flex min-w-0 flex-col gap-5 rounded-[24px] border border-accent bg-gradient-to-b from-accent-soft to-surface p-6 shadow-card ring-4 ring-accent/10">
          <div className="flex items-center justify-between gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-white">
              <Sparkles className="size-5" aria-hidden />
            </span>
            {premium && <Badge tone="success">Ton offre</Badge>}
          </div>
          <div>
            <h3 id="plan-premium" className="text-lg font-semibold">
              Premium
            </h3>
            <div role="radiogroup" aria-label="Durée" className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1">
              {(Object.keys(OFFERS) as Billing[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={billing === b}
                  onClick={() => setBilling(b)}
                  className={cx('rounded-xl px-2 py-1.5 text-sm font-medium', billing === b ? 'bg-accent text-white shadow-card' : 'text-muted hover:bg-surface-2')}
                >
                  {BILLING_LABEL[b]}
                </button>
              ))}
            </div>
            <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
              <span className="whitespace-nowrap font-display text-4xl font-bold tracking-tight">{euros(offer.price)}</span>
              <span className="text-sm text-muted">{UNIT[billing]}</span>
              {saving(billing) > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white">−{saving(billing)} %</span>}
            </p>
            <p className="mt-2 text-sm text-muted">
              {billing === 'monthly' ? 'Sans engagement, arrêtable à tout moment.' : `Soit ${euros(perMonth(billing))} par mois${billing === 'semester' ? ', le temps d’un semestre et de ses partiels.' : '.'}`}
            </p>
          </div>
          <Items items={PREMIUM_ITEMS} />
          <div className="mt-auto flex flex-col gap-2 pt-2">
            {publicMode && (
              <Button className="w-full" icon={<Gift className="size-4" />} onClick={onSignup}>
                Essayer gratuitement {ESSAI_JOURS} jours
              </Button>
            )}
            {details?.trial_available && (
              <Button className="w-full" icon={<Gift className="size-4" />} loading={busy === 'trial'} onClick={() => run('trial')}>
                Essayer gratuitement {ESSAI_JOURS} jours
              </Button>
            )}
            {PAYMENTS_ENABLED && !premium && (
              <Button className="w-full" variant={details?.trial_available ? 'secondary' : 'primary'} loading={busy === 'pay'} onClick={() => run('pay')}>
                Choisir Premium · {euros(offer.price)}
              </Button>
            )}
            {premium && details?.period_end && (
              <p className="text-center text-sm text-muted">
                {details.source === 'trial' ? 'Essai' : 'Premium'} actif jusqu’au {fmt(details.period_end, 'd MMMM yyyy')}
              </p>
            )}
            {(publicMode || details?.trial_available) && <p className="text-center text-xs text-muted">Sans carte bancaire. À la fin de l’essai, tu repasses en gratuit automatiquement.</p>}
            <ErrorBox error={error} />
          </div>
        </article>
      </div>
      {!PAYMENTS_ENABLED && <p className="mt-4 text-center text-xs text-muted">Le paiement en ligne (carte, Apple Pay, Google Pay) ouvre prochainement. En attendant, profite de l’essai gratuit.</p>}
    </div>
  )
}
