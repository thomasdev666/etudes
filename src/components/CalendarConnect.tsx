import { CalendarPlus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSpace } from '@/context/space'
import { fetchIcs, parseIcs } from '@/lib/calendar'
import { fmt } from '@/lib/dates'
import { useCalendarLinks, useInvalidate } from '@/lib/data'
import { must, supabase } from '@/lib/supabase'
import { Button, ErrorBox, IconButton, Input } from './ui'

export function CalendarConnect() {
  const { spaceId } = useSpace()
  const { data: links = [] } = useCalendarLinks()
  const invalidate = useInvalidate()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [info, setInfo] = useState('')

  async function add() {
    setBusy(true)
    setError(null)
    setInfo('')
    try {
      const clean = url.trim()
      const events = parseIcs(await fetchIcs(clean), new Date(Date.now() - 30 * 86_400_000), new Date(Date.now() + 120 * 86_400_000))
      must(await supabase.from('calendar_links').insert({ space_id: spaceId, url: clean, label: 'Outlook', last_synced_at: new Date().toISOString() }))
      await invalidate('calendar_links')
      setInfo(`Calendrier connecté : ${events.length} événements trouvés.`)
      setUrl('')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {links.map((l) => (
        <div key={l.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
          <CalendarPlus className="size-4 text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{l.label}</p>
            <p className="truncate text-xs text-muted">{l.last_synced_at ? `Synchronisé le ${fmt(l.last_synced_at, "d MMM 'à' HH'h'mm")}` : 'Jamais synchronisé'}</p>
          </div>
          <IconButton
            label="Déconnecter"
            onClick={async () => {
              await supabase.from('calendar_links').delete().eq('id', l.id)
              invalidate('calendar_links')
            }}
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ))}
      <details className="rounded-xl border border-border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Comment obtenir le lien de mon calendrier Outlook ?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Ouvre Outlook sur le web (outlook.office.com) avec ton compte de l’école.</li>
          <li>Paramètres (⚙️) → Calendrier → Calendriers partagés.</li>
          <li>Dans « Publier un calendrier », choisis ton calendrier et « Peut afficher tous les détails », puis Publier.</li>
          <li>Copie le lien <strong>ICS</strong> et colle-le ci-dessous.</li>
        </ol>
        <p className="mt-2 text-muted">Si l’option est grisée, ton école l’a désactivée : demande au service informatique, ou exporte tes cours depuis l’ENT s’il propose un lien iCal.</p>
      </details>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics" aria-label="Lien ICS" />
        <Button onClick={add} loading={busy} disabled={!/^(https|webcal):\/\//i.test(url.trim())}>
          Connecter
        </Button>
      </div>
      {info && <p className="text-sm text-success">{info}</p>}
      <ErrorBox error={error} />
      <p className="text-xs text-muted">
        Lecture seule. Les cours prennent la couleur de la matière dont le nom (ou un mot-clé) apparaît dans leur titre.
      </p>
    </div>
  )
}

