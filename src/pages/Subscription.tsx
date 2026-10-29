import { Lock, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { PlanChoice } from '@/components/PlanChoice'
import { Badge, Button, Card, ErrorBox, Input, PageHeader, ProgressBar, Spinner } from '@/components/ui'
import { fmt } from '@/lib/dates'
import { KIND_LABEL, usePlan, useRedeemCode, useUsage } from '@/lib/plans'

export default function SubscriptionPage() {
  const { data: plan, isLoading } = usePlan()
  const { data: usage = [] } = useUsage()
  const redeem = useRedeemCode()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState<unknown>(null)

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo('')
    try {
      const until = await redeem(code)
      setInfo(until ? `Premium activé jusqu’au ${fmt(until, 'd MMMM yyyy')} ✨` : 'Premium activé sans limite de durée ✨')
      setCode('')
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) return <Spinner />
  const isPremium = plan === 'premium'

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader title="Mon abonnement" subtitle="Ton offre, tes quotas de la semaine et l’accès Premium." />

      <Card className="flex flex-wrap items-center gap-3">
        <Sparkles className="size-6 text-accent-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Ton offre actuelle</p>
          <p className="text-sm text-muted">{isPremium ? 'Premium' : 'Gratuit'}</p>
        </div>
        <Badge tone={isPremium ? 'success' : 'muted'}>{isPremium ? 'Premium' : 'Gratuit'}</Badge>
      </Card>

      {usage.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Ce que tu as utilisé cette semaine</h2>
          <ul className="flex flex-col gap-3">
            {usage.map((u) => {
              const locked = u.max === 0
              return (
                <li key={u.kind}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5">
                      {locked && <Lock className="size-3.5 text-muted" aria-hidden />}
                      {KIND_LABEL[u.kind] ?? u.kind}
                    </span>
                    <span className="text-muted">{locked ? 'Premium uniquement' : `${u.used} / ${u.max}`}</span>
                  </div>
                  {!locked && <ProgressBar value={u.max ? (u.used / u.max) * 100 : 0} label={KIND_LABEL[u.kind] ?? u.kind} />}
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">Les quotas se remettent à zéro sur une fenêtre glissante de 7 jours.</p>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">J’ai un code d’accès</h2>
        <form onSubmit={submitCode} className="flex flex-col gap-3 sm:flex-row">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ton code" aria-label="Code d’accès" className="flex-1" required />
          <Button type="submit" loading={busy} disabled={!code.trim()}>
            Activer
          </Button>
        </form>
        {info && <p className="mt-3 text-sm text-success">{info}</p>}
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      </Card>

      <PlanChoice current={isPremium ? 'premium' : 'free'} />
    </div>
  )
}
