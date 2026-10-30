import { CalendarSync, RefreshCw, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button, ErrorBox, IconButton, Input } from '@/components/ui'
import { useSpace } from '@/context/space'
import { fmt } from '@/lib/dates'
import { useCalendarLinks, useInvalidate } from '@/lib/data'
import { authHeader, must, supabase } from '@/lib/supabase'

async function sync(linkId: string) {
  const res = await fetch('/.netlify/functions/ical-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ link_id: linkId }) })
  const body = (await res.json().catch(() => ({}))) as { count?: number; error?: string }
  if (!res.ok) throw new Error(body.error ?? 'Synchronisation impossible')
  return body.count ?? 0
}

// Agendas reliés par un lien iCal (Google Agenda, Hyperplanning, Celcat, Outlook publié)
export function CalendarLinks() {
  const { spaceId } = useSpace()
  const { data: links = [] } = useCalendarLinks()
  const invalidate = useInvalidate()
  const qc = useQueryClient()
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [info, setInfo] = useState('')
  const [error, setError] = useState<unknown>(null)

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id)
    setError(null)
    setInfo('')
    try {
      await fn()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
      await invalidate('calendar_links')
      await qc.invalidateQueries({ queryKey: ['imported_events'] })
    }
  }

  const add = (e: FormEvent) => {
    e.preventDefault()
    run('new', async () => {
      const clean = url.trim().replace(/^webcal:/i, 'https:')
      if (!/^https:\/\//i.test(clean)) throw new Error('Colle le lien complet, qui commence par https:// ou webcal://')
      const row = must(await supabase.from('calendar_links').insert({ space_id: spaceId, url: clean, label: label.trim() || 'Agenda' }).select('id').single()) as { id: string }
      const n = await sync(row.id)
      setInfo(`${n} événement${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} à ton agenda.`)
      setUrl('')
      setLabel('')
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {links.map((l) => (
        <div key={l.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
          <CalendarSync className="size-5 shrink-0 text-accent-ink" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{l.label}</p>
            <p className={`truncate text-xs ${l.last_error ? 'text-danger' : 'text-muted'}`}>
              {l.last_error ?? (l.last_synced_at ? `Synchronisé le ${fmt(l.last_synced_at, "d MMM 'à' HH:mm")}, puis chaque nuit` : 'Pas encore synchronisé')}
            </p>
          </div>
          <IconButton label="Synchroniser maintenant" disabled={!!busy} onClick={() => run(l.id, async () => setInfo(`${await sync(l.id)} événements à jour.`))}>
            <RefreshCw className={`size-4 ${busy === l.id ? 'animate-spin' : ''}`} />
          </IconButton>
          <IconButton
            label="Retirer cet agenda"
            disabled={!!busy}
            onClick={() =>
              run(l.id, async () => {
                must(await supabase.from('imported_events').delete().eq('link_id', l.id))
                must(await supabase.from('calendar_links').delete().eq('id', l.id))
              })
            }
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ))}
      <form onSubmit={add} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
        <p className="text-sm font-medium">Relier un agenda par son lien iCal</p>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… ou webcal://…" aria-label="Lien iCal" inputMode="url" />
        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom (ex. : Cours de l’école)" aria-label="Nom de l’agenda" className="min-w-0 flex-1" />
          <Button type="submit" loading={busy === 'new'} disabled={!url.trim()}>
            Relier
          </Button>
        </div>
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Où trouver ce lien ?</summary>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
            <li>Google Agenda : Paramètres → ton agenda → « Adresse secrète au format iCal ».</li>
            <li>Hyperplanning ou Celcat : bouton d’export ou d’abonnement iCal / ICS de ton emploi du temps.</li>
            <li>Outlook : Paramètres → Calendrier → Calendriers partagés → Publier un calendrier → lien ICS.</li>
          </ul>
        </details>
      </form>
      {info && <p className="text-sm text-success">{info}</p>}
      <ErrorBox error={error} />
    </div>
  )
}
