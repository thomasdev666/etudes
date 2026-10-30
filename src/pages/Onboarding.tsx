import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui'
import { OfferStep } from '@/components/OfferStep'
import { signOutEverywhere } from '@/lib/session'
import { supabase } from '@/lib/supabase'

export function Onboarding() {
  const qc = useQueryClient()
  const [step, setStep] = useState<'offre' | 'espace'>('offre')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Premier écran après l'inscription : choisir son offre avant de créer l'espace
  if (step === 'offre')
    return (
      <div className="flex min-h-dvh items-start justify-center px-4 py-10">
        <div className="w-full max-w-4xl">
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-bold">Choisis ton offre</h1>
            <p className="mt-1 text-muted">Tu pourras changer à tout moment, dans Paramètres.</p>
          </div>
          <OfferStep onDone={() => setStep('espace')} />
          <button type="button" onClick={signOutEverywhere} className="mt-6 w-full text-center text-sm text-muted hover:underline">
            Se déconnecter
          </button>
        </div>
      </div>
    )

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('spaces').insert({ name: name.trim() })
    setBusy(false)
    if (error) setError(error.message)
    else qc.invalidateQueries({ queryKey: ['spaces'] })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">Bienvenue 👋</h1>
        <p className="mt-1 text-muted">
          Crée ton premier espace : ton école. Si tu changes d’établissement (échange, master…), tu créeras un autre espace, et les données de chacun restent séparées.
        </p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <Field label="Nom de l’espace" id="space">
            <Input id="space" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : EDHEC, KEDGE, NEOMA, IAE de Lyon…" autoFocus />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" loading={busy}>
            Commencer
          </Button>
        </form>
        <button type="button" onClick={signOutEverywhere} className="mt-4 w-full text-center text-sm text-muted hover:underline">
          Se déconnecter
        </button>
      </Card>
    </div>
  )
}
