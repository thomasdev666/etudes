import { CreditCard, Gift, Lock, Sparkles } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CodeForm } from '@/components/OfferStep'
import { PlanChoice } from '@/components/PlanChoice'
import { Badge, Button, Card, ErrorBox, PageHeader, ProgressBar, Spinner } from '@/components/ui'
import { openBillingPortal } from '@/lib/billing'
import { fmt } from '@/lib/dates'
import { KIND_LABEL, usePlanDetails, useUsage } from '@/lib/plans'

const SOURCE_LABEL = { none: '', code: 'avec un code d’accès', stripe: 'abonnement payé', trial: 'essai gratuit' }

export default function SubscriptionPage() {
  const { data: details, isLoading } = usePlanDetails()
  const { data: usage = [] } = useUsage()
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [params] = useSearchParams()
  const paid = params.get('paiement')
  const qc = useQueryClient()

  // Retour de la page de paiement : l'abonnement arrive par le webhook, on relit l'offre
  useEffect(() => {
    if (paid !== 'ok') return
    const t = [2000, 6000, 15000].map((ms) => setTimeout(() => ['plan', 'plan_details', 'usage'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })), ms))
    return () => t.forEach(clearTimeout)
  }, [paid, qc])

  if (isLoading) return <Spinner />
  const isPremium = details?.plan === 'premium'

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader title="Mon abonnement" subtitle="Ton offre, tes quotas de la semaine et l’accès Premium." />
      {paid === 'ok' && <p className="rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">Merci ! Ton paiement est validé. Premium s’active dans quelques secondes.</p>}
      {paid === 'annule' && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">Paiement annulé : rien n’a été prélevé.</p>}

      <Card className="flex flex-wrap items-center gap-3">
        {details?.source === 'trial' ? <Gift className="size-6 text-accent-ink" aria-hidden /> : <Sparkles className="size-6 text-accent-ink" aria-hidden />}
        <div className="min-w-[min(100%,14rem)] flex-1">
          <p className="font-semibold">Ton offre actuelle</p>
          <p className="text-sm text-muted">
            {isPremium ? `Premium ${SOURCE_LABEL[details?.source ?? 'none']}` : 'Gratuit'}
            {isPremium && details?.period_end && ` · jusqu’au ${fmt(details.period_end, 'd MMMM yyyy')}`}
            {!isPremium && details?.welcome_until && ` · quotas de bienvenue jusqu’au ${fmt(details.welcome_until, 'd MMMM')}`}
          </p>
        </div>
        <Badge tone={isPremium ? 'success' : 'muted'}>{isPremium ? 'Premium' : 'Gratuit'}</Badge>
        {details?.source === 'stripe' && (
          <Button
            variant="secondary"
            size="sm"
            icon={<CreditCard className="size-4" />}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await openBillingPortal()
              } catch (e) {
                setError(e)
                setBusy(false)
              }
            }}
          >
            Gérer le paiement
          </Button>
        )}
        <div className="w-full empty:hidden">
          <ErrorBox error={error} />
        </div>
      </Card>

      {usage.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Ce que tu as utilisé cette semaine</h2>
          <ul className="flex flex-col gap-3">
            {usage.map((u) => {
              const locked = u.max === 0
              return (
                <li key={u.kind}>
                  <div className="mb-1 flex flex-wrap justify-between gap-x-2 text-sm">
                    <span className="flex items-center gap-1.5">
                      {locked && <Lock className="size-3.5 text-muted" aria-hidden />}
                      {KIND_LABEL[u.kind] ?? u.kind}
                    </span>
                    <span className="text-muted">{locked ? 'Premium uniquement' : `${u.used} / ${u.max}`}</span>
                  </div>
                  {!locked && <ProgressBar value={u.max ? (u.used / u.max) * 100 : 0} label={KIND_LABEL[u.kind] ?? u.kind} />}
                  {!locked && u.next_free_at && u.used > 0 && (
                    <p className="mt-1 text-xs text-muted">
                      {u.used >= u.max ? 'Prochaine place libre le ' : 'Une place se libère le '}
                      {fmt(u.next_free_at, "EEEE d MMMM 'à' HH'h'mm")}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">Chaque usage compte pendant 7 jours, puis il est rendu automatiquement.</p>
        </Card>
      )}

      <PlanChoice />

      <Card>
        <CodeForm />
      </Card>
    </div>
  )
}
