import { FileUp, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSpace } from '@/context/space'
import { useImportedEvents } from '@/lib/calendar'
import { capitalize, fmt } from '@/lib/dates'
import { useInvalidate } from '@/lib/data'
import { must, supabase } from '@/lib/supabase'
import { parseTimetable, type TimetableEvent } from '@/lib/timetablePdf'
import { Button, ErrorBox } from './ui'

// Import de l'emploi du temps de l'école via un PDF « imprimé » depuis Outlook
export function TimetableImport({ onImported }: { onImported?: () => void }) {
  const { spaceId } = useSpace()
  const invalidate = useInvalidate()
  const { data: existing = [], refetch } = useImportedEvents()
  const [events, setEvents] = useState<TimetableEvent[] | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState('')

  async function read(list: FileList | null) {
    if (!list?.length) return
    setError(null)
    setDone('')
    setBusy('Lecture du PDF…')
    try {
      const { readPdfText } = await import('@/lib/pdf')
      const all: TimetableEvent[] = []
      for (const f of list) all.push(...parseTimetable(await readPdfText(f)))
      // Un même cours présent dans deux PDF n'est gardé qu'une fois
      const unique = [...new Map(all.map((e) => [`${e.title}|${e.start.getTime()}`, e])).values()].sort((a, b) => a.start.getTime() - b.start.getTime())
      if (!unique.length)
        throw new Error('Aucun cours trouvé dans ce PDF. Vérifie que « Imprimer l’agenda détaillé » était bien coché avant d’enregistrer le PDF.')
      setEvents(unique)
      setFiles([...list].map((f) => f.name))
    } catch (e) {
      setError(e)
      setEvents(null)
    } finally {
      setBusy('')
    }
  }

  async function save() {
    if (!events?.length) return
    setBusy('Import…')
    setError(null)
    try {
      const from = new Date(events[0].start)
      from.setHours(0, 0, 0, 0)
      const to = new Date(events[events.length - 1].start)
      to.setHours(23, 59, 59, 999)
      // Les cours déjà importés sur la même période sont remplacés (planning mis à jour)
      must(await supabase.from('imported_events').delete().eq('space_id', spaceId).gte('start_at', from.toISOString()).lte('start_at', to.toISOString()))
      for (let i = 0; i < events.length; i += 500)
        must(
          await supabase.from('imported_events').insert(
            events.slice(i, i + 500).map((e) => ({ space_id: spaceId, title: e.title, location: e.location, start_at: e.start.toISOString(), end_at: e.end.toISOString() })),
          ),
        )
      await invalidate('calendar_links')
      await refetch()
      setDone(`${events.length} cours importés ✓`)
      setEvents(null)
      onImported?.()
    } catch (e) {
      setError(e)
    } finally {
      setBusy('')
    }
  }

  const range = (list: { start: Date }[]) =>
    list.length ? `du ${fmt(list[0].start, 'd MMM')} au ${fmt(list[list.length - 1].start, 'd MMM yyyy')}` : ''
  const existingDates = existing.map((e) => ({ start: new Date(e.start_at) }))

  return (
    <div className="flex flex-col gap-3">
      <ol className="list-decimal space-y-1.5 rounded-2xl bg-surface-2 py-3 pl-8 pr-3 text-sm">
        <li>
          Dans Outlook, ouvre ton planning de cours en vue <strong>Mois</strong>, puis clique sur <strong>Imprimer</strong>.
        </li>
        <li>
          Choisis le calendrier <strong>« Planning de cours… »</strong>.
        </li>
        <li>
          Intervalle de temps : de <strong>08:00 à 18:00</strong> (ou plus tard si tu as des cours le soir).
        </li>
        <li>
          Coche <strong>« Imprimer l’agenda détaillé »</strong>, puis clique sur <strong>Imprimer</strong>.
        </li>
        <li>
          Destination : <strong>« Fichier PDF »</strong> (ou « Enregistrer au format PDF »), puis <strong>Enregistrer</strong>.
        </li>
        <li>Dépose le PDF ici. Tu peux en déposer plusieurs à la fois, un par mois.</li>
      </ol>

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center hover:border-accent">
        <FileUp className="size-6 text-muted" aria-hidden />
        <span className="font-medium">{busy || (files.length ? files.join(', ') : 'Déposer le PDF du planning')}</span>
        <span className="text-xs text-muted">Le fichier est lu sur ton appareil ; seuls les cours (titre, horaire, salle) sont enregistrés.</span>
        <input type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(e) => read(e.target.files)} />
      </label>

      {events && (
        <div className="rounded-2xl border border-border p-3">
          <p className="font-medium">
            {events.length} cours trouvés {range(events)}
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-muted">
            {events.slice(0, 30).map((e, i) => (
              <li key={i} className="truncate">
                {capitalize(fmt(e.start, "EEE d MMM HH'h'mm"))} · {e.title}
              </li>
            ))}
            {events.length > 30 && <li>… et {events.length - 30} autres</li>}
          </ul>
          <Button className="mt-3" onClick={save} loading={busy === 'Import…'}>
            Importer ces {events.length} cours
          </Button>
        </div>
      )}
      {done && <p className="text-sm text-success">{done}</p>}
      <ErrorBox error={error} />

      {existing.length > 0 && !events && (
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span className="flex-1">
            {existing.length} cours importés {range(existingDates)}
          </span>
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-danger hover:bg-danger-soft"
            onClick={async () => {
              if (!confirm('Retirer tous les cours importés depuis un PDF ?')) return
              await supabase.from('imported_events').delete().eq('space_id', spaceId)
              await refetch()
            }}
          >
            <Trash2 className="size-4" aria-hidden /> Tout retirer
          </button>
        </div>
      )}
    </div>
  )
}
