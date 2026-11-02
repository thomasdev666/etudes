import { useQuery } from '@tanstack/react-query'
import { useUserId } from '@/context/auth'
import { usePlanDetails } from '@/lib/plans'
import { QUEUE_NOTICE } from '@/lib/queue'
import { supabase } from '@/lib/supabase'

// Session de 5 heures, comme dans les assistants IA : combien il reste avant la pause
type SessionRow = { kind: 'gen' | 'chat'; used: number; max: number | null; reset_at: string | null }

export function useSessionStatus() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['session', userId],
    enabled: !!userId,
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('session_status')
      if (error) throw error
      return (data ?? []) as SessionRow[]
    },
  })
}

const remainingLabel = (kind: 'gen' | 'chat', left: number) =>
  kind === 'gen' ? (left === 1 ? 'plus qu’une génération' : `plus que ${left} générations`) : left === 1 ? 'plus qu’une question' : `plus que ${left} questions`

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')

// Affiche la session restante, et prévient quand la limite approche
export function SessionMeter({ kind }: { kind: 'gen' | 'chat' }) {
  const { data } = useSessionStatus()
  const row = data?.find((r) => r.kind === kind)
  if (!row || row.max === null || row.max === 0) return null
  const left = row.max - row.used
  const soon = kind === 'gen' ? 1 : 3
  if (left <= 0)
    return (
      <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="status">
        Limite de session atteinte. Elle se réinitialise vers {clock(row.reset_at)}. Tu peux attendre, ou passer en Premium pour aller plus vite.
      </p>
    )
  if (left <= soon)
    return (
      <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm" role="status">
        <strong>Bientôt la limite de session</strong> : {remainingLabel(kind, left)} · la session se réinitialise vers {clock(row.reset_at)}.
      </p>
    )
  if (row.used === 0) return null
  return (
    <p className="text-xs text-muted">
      Session : {row.used} / {row.max} · se réinitialise vers {clock(row.reset_at)}
    </p>
  )
}

// Message de la file d'attente, affiché là où l'on lance une génération
// Masqué pour un compte Premium : il n'a pas de file d'attente
export function QueueNotice({ inline }: { inline?: boolean }) {
  const { data: details } = usePlanDetails()
  if (details?.plan === 'premium') return null
  if (inline) return <span className="mt-0.5 block">{QUEUE_NOTICE}</span>
  return <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">{QUEUE_NOTICE}</p>
}
