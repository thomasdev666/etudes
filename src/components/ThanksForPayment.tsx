import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Card } from './ui'

// Message après un paiement : Premium s'active par le serveur quelques secondes plus tard
export function ThanksForPayment({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  useEffect(() => {
    // Relit l'offre à plusieurs reprises, le temps que le serveur enregistre l'abonnement
    const timers = [2000, 6000, 15000].map((ms) =>
      setTimeout(() => ['plan', 'plan_details', 'usage', 'session'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })), ms),
    )
    return () => timers.forEach(clearTimeout)
  }, [qc])
  return (
    <Card className="mb-5 flex flex-wrap items-center gap-3 bg-success-soft">
      <p className="min-w-0 flex-1">
        <strong>Merci pour ton abonnement ! 🦒</strong> Premium s’active dans quelques secondes. Tu peux commencer tout de suite.
      </p>
      <button type="button" onClick={onClose} className="text-sm font-medium text-accent-ink hover:underline">
        Fermer
      </button>
    </Card>
  )
}
