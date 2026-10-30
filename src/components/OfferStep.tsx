import { useState, type FormEvent } from 'react'
import { PlanChoice } from '@/components/PlanChoice'
import { Button, ErrorBox, Input } from '@/components/ui'
import { fmt } from '@/lib/dates'
import { useRedeemCode } from '@/lib/plans'

// Saisie d'un code d'accès Premium
export function CodeForm({ onDone, className }: { onDone?: () => void; className?: string }) {
  const redeem = useRedeemCode()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState<unknown>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo('')
    try {
      const until = await redeem(code)
      setInfo(until ? `Premium activé jusqu’au ${fmt(until, 'd MMMM yyyy')} ✨` : 'Premium activé sans limite de durée ✨')
      setCode('')
      if (onDone) setTimeout(onDone, 800)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={className}>
      <p className="font-semibold">J’ai un code d’accès</p>
      <div className="mt-2 flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ton code" aria-label="Code d’accès" className="min-w-0 flex-1" />
        <Button type="submit" loading={busy} disabled={!code.trim()}>
          Activer
        </Button>
      </div>
      {info && <p className="mt-2 text-sm text-success">{info}</p>}
      <div className="mt-2">
        <ErrorBox error={error} />
      </div>
    </form>
  )
}

// Choix de l'offre à la création du compte : gratuit, essai Premium, code d'accès ou paiement
export function OfferStep({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <PlanChoice
        onPremium={onDone}
        freeAction={
          <Button className="w-full" variant="secondary" onClick={onDone}>
            Continuer gratuitement
          </Button>
        }
      />
      <CodeForm onDone={onDone} className="mx-auto w-full max-w-md rounded-[24px] border border-dashed border-border bg-surface p-5" />
    </div>
  )
}
