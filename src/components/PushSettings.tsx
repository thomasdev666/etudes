import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, ErrorBox } from '@/components/ui'
import { useUserId } from '@/context/auth'
import { currentSubscription, disablePush, enablePush, isInstalled, isIos, pushConfigured, pushSupported } from '@/lib/push'
import { supabase } from '@/lib/supabase'

// Notifications sur cet appareil : échéances et cartes du jour
export function PushSettings() {
  const userId = useUserId()
  const qc = useQueryClient()
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const key = ['user_settings', userId, 'notify_cards']
  const { data: cards } = useQuery({
    queryKey: key,
    queryFn: async () => ((await supabase.from('user_settings').select('notify_cards').maybeSingle()).data?.notify_cards as boolean | undefined) ?? true,
    retry: false,
  })

  useEffect(() => {
    currentSubscription().then((s) => setOn(!!s && Notification.permission === 'granted'))
  }, [])

  if (!pushConfigured()) return <p className="text-sm text-muted">Les notifications seront disponibles prochainement.</p>
  if (isIos() && !isInstalled())
    return (
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
        Sur iPhone, ajoute d’abord Regulya à ton écran d’accueil (bouton Partager, puis « Sur l’écran d’accueil »), ouvre-la depuis l’icône, puis reviens ici.
      </p>
    )
  if (!pushSupported()) return <p className="text-sm text-muted">Ce navigateur ne gère pas les notifications.</p>

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (on) await disablePush()
      else await enablePush()
      setOn(!on)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <BellRing className="size-5 text-accent-ink" aria-hidden />
        <span className="flex-1 font-medium">{on ? 'Notifications activées sur cet appareil' : 'Notifications désactivées sur cet appareil'}</span>
        <Button size="sm" variant={on ? 'secondary' : 'primary'} loading={busy || on === null} onClick={toggle}>
          {on ? 'Désactiver' : 'Activer'}
        </Button>
      </div>
      {on && (
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={cards ?? true}
            onChange={async (e) => {
              qc.setQueryData(key, e.target.checked)
              await supabase.from('user_settings').upsert({ user_id: userId, notify_cards: e.target.checked })
            }}
            className="size-5 accent-[var(--accent)]"
          />
          Me prévenir chaque matin quand des flash cards sont à revoir
        </label>
      )}
      <p className="text-xs text-muted">Les échéances suivent les délais choisis ci-dessous. Une notification par matin au plus, jamais la nuit.</p>
      <ErrorBox error={error} />
    </div>
  )
}
