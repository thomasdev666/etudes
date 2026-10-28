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
  const [label, setLabel] = useState('')
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
      const name = label.trim() || (links.length ? `Calendrier ${links.length + 1}` : 'Emploi du temps')
      must(await supabase.from('calendar_links').insert({ space_id: spaceId, url: clean, label: name, last_synced_at: new Date().toISOString() }))
      await invalidate('calendar_links')
      const busy = events.filter((e) => /^(occupé|busy|provisoire|tentative)$/i.test(e.title.trim())).length
      setInfo(
        `« ${name} » connecté : ${events.length} événement${events.length > 1 ? 's' : ''} trouvé${events.length > 1 ? 's' : ''}.` +
          (busy > events.length / 2 ? ' ⚠️ Les titres sont masqués (« Occupé ») : republie le calendrier avec « Peut afficher tous les détails ».' : ''),
      )
      setUrl('')
      setLabel('')
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
      <details className="rounded-xl border border-border px-3 py-2 text-sm" open={!links.length}>
        <summary className="cursor-pointer font-medium">Où trouver le lien de mon emploi du temps ?</summary>
        <div className="mt-2 space-y-3 text-muted">
          <div>
            <p className="font-medium text-text">Emploi du temps de l’école (le plus important)</p>
            <p>
              Il est en général dans un calendrier à part, créé par l’école. Outlook ne permet pas de republier ce type de calendrier : il faut son lien d’origine.
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                <strong>Dans Outlook web</strong> : à gauche, fais un clic droit (ou ⋯) sur le calendrier de l’école → <em>Paramètres</em> / <em>Propriétés</em>. S’il a été ajouté
                « depuis Internet », son lien (https://… ou webcal://…) y est affiché : copie-le.
              </li>
              <li>
                <strong>Dans l’outil de planning de l’école</strong> (Hyperplanning, Celcat, MyTimetable, Aurion, l’appli de l’école…) : cherche « Exporter », « iCal », « S’abonner » ou
                « Synchroniser avec mon agenda ». Le lien obtenu fonctionne ici.
              </li>
              <li>Sinon, demande au service scolarité le « lien iCal de l’emploi du temps ».</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-text">Ton calendrier Outlook personnel</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Outlook web → Paramètres (⚙️) → Calendrier → Calendriers partagés.</li>
              <li>« Publier un calendrier » : choisis le calendrier et « Peut afficher tous les détails », puis Publier.</li>
              <li>Copie le lien <strong>ICS</strong>.</li>
            </ol>
          </div>
          <p>Tu peux relier plusieurs calendriers (école + perso) : ajoute-les l’un après l’autre.</p>
        </div>
      </details>
      <div className="flex flex-col gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={links.length ? 'Nom (ex. Perso)' : 'Nom (ex. Emploi du temps TBS)'} aria-label="Nom du calendrier" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… .ics ou webcal://…" aria-label="Lien du calendrier" />
          <Button onClick={add} loading={busy} disabled={!/^(https|webcal):\/\//i.test(url.trim())}>
            {links.length ? 'Ajouter' : 'Connecter'}
          </Button>
        </div>
      </div>
      {info && <p className="text-sm text-success">{info}</p>}
      <ErrorBox error={error} />
      <p className="text-xs text-muted">
        Lecture seule. Les cours prennent la couleur de la matière dont le nom (ou un mot-clé) apparaît dans leur titre.
      </p>
    </div>
  )
}

