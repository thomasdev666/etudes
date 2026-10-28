import { FileUp, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSpace } from '@/context/space'
import { matchSubject, useImportedEvents } from '@/lib/calendar'
import { SUBJECT_PALETTE } from '@/lib/colors'
import { capitalize, fmt } from '@/lib/dates'
import { useInvalidate, useSubjects } from '@/lib/data'
import { must, supabase } from '@/lib/supabase'
import { parseTimetable, sessionLabel, type TimetableEvent } from '@/lib/timetablePdf'
import { Swatches } from './Swatches'
import { Button, cx, ErrorBox } from './ui'

type NewSubject = { name: string; color: string; checked: boolean; count: number }

// Import de l'emploi du temps de l'école via un PDF « imprimé » depuis Outlook
export function TimetableImport({ onImported }: { onImported?: () => void }) {
  const { spaceId } = useSpace()
  const invalidate = useInvalidate()
  const { data: subjects = [] } = useSubjects()
  const { data: existing = [], refetch } = useImportedEvents()
  const [events, setEvents] = useState<TimetableEvent[] | null>(null)
  const [newSubjects, setNewSubjects] = useState<NewSubject[]>([])
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

      // Cours sans matière correspondante : proposés comme nouvelles matières
      const counts = new Map<string, number>()
      for (const e of unique) if (!matchSubject(e.title, subjects)) counts.set(e.title, (counts.get(e.title) ?? 0) + 1)
      const used = new Set(subjects.map((s) => s.color.toLowerCase()))
      const free = SUBJECT_PALETTE.filter((p) => !used.has(p.hex.toLowerCase()))
      const palette = free.length ? free : SUBJECT_PALETTE
      setNewSubjects(
        [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count], i) => ({ name, count, color: palette[i % palette.length].hex, checked: count >= 2 || counts.size <= 12 })),
      )
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
      const rows = events.map((e) => ({
        space_id: spaceId,
        title: e.title,
        kind: e.kind,
        session: e.session,
        location: e.location,
        start_at: e.start.toISOString(),
        end_at: e.end.toISOString(),
      }))
      let withSessions = true
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        let res = await supabase.from('imported_events').insert(withSessions ? batch : batch.map(({ kind: _k, session: _s, ...r }) => r))
        // Mise à jour 0004 pas encore lancée : on importe sans le numéro de séance
        if (res.error && withSessions && /kind|session/.test(res.error.message)) {
          withSessions = false
          res = await supabase.from('imported_events').insert(batch.map(({ kind: _k, session: _s, ...r }) => r))
        }
        must(res)
      }

      const chosen = newSubjects.filter((s) => s.checked)
      if (chosen.length)
        must(
          await supabase
            .from('subjects')
            .insert(chosen.map((s, i) => ({ space_id: spaceId, name: s.name, color: s.color, keywords: [s.name], position: subjects.length + i }))),
        )
      await invalidate('subjects')
      await refetch()
      setDone(`${events.length} cours importés ✓` + (chosen.length ? ` · ${chosen.length} matière${chosen.length > 1 ? 's' : ''} créée${chosen.length > 1 ? 's' : ''}` : ''))
      setEvents(null)
      setNewSubjects([])
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
  const patch = (name: string, p: Partial<NewSubject>) => setNewSubjects((l) => l.map((s) => (s.name === name ? { ...s, ...p } : s)))
  const withSession = events?.filter((e) => e.session !== null).length ?? 0

  return (
    <div className="flex flex-col gap-3">
      <ol className="list-decimal space-y-1.5 rounded-2xl bg-surface-2 py-3 pl-8 pr-3 text-sm">
        <li>
          Ouvre Outlook : l’application, ou la <strong>version web</strong> (outlook.office.com, connecté avec ton compte de l’école). Va dans le calendrier, vue <strong>Mois</strong>, puis
          clique sur <strong>Imprimer</strong>.
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
        <span className="text-xs text-muted">Le fichier est lu sur ton appareil ; seuls les cours (titre, séance, horaire, salle) sont enregistrés.</span>
        <input type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(e) => read(e.target.files)} />
      </label>

      {events && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border p-3">
          <div>
            <p className="font-medium">
              {events.length} cours trouvés {range(events)}
            </p>
            {withSession > 0 && <p className="text-xs text-muted">Numéro de séance repéré pour {withSession} cours.</p>}
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-muted">
              {events.slice(0, 30).map((e, i) => (
                <li key={i} className="truncate">
                  {capitalize(fmt(e.start, "EEE d MMM HH'h'mm"))} · <span className="text-text">{e.title}</span>
                  {(e.kind || e.session !== null) && ` · ${sessionLabel(e.kind, e.session)}`}
                </li>
              ))}
              {events.length > 30 && <li>… et {events.length - 30} autres</li>}
            </ul>
          </div>

          {newSubjects.length > 0 && (
            <div>
              <p className="font-medium">Matières à créer</p>
              <p className="mb-2 text-xs text-muted">Choisis leurs couleurs : les cours de l’agenda prendront la couleur de leur matière. Décoche ce qui n’est pas une matière.</p>
              <ul className="flex flex-col gap-1.5">
                {newSubjects.map((s) => (
                  <li key={s.name} className={cx('flex items-center gap-3 rounded-xl border px-3 py-1.5', s.checked ? 'border-border' : 'border-dashed border-border opacity-60')}>
                    <input
                      type="checkbox"
                      checked={s.checked}
                      onChange={(e) => patch(s.name, { checked: e.target.checked })}
                      aria-label={`Créer la matière ${s.name}`}
                      className="size-4 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {s.name} <span className="font-normal text-muted">· {s.count} cours</span>
                    </span>
                    <Swatches value={s.color} label={s.name} onChange={(color) => patch(s.name, { color })} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button onClick={save} loading={busy === 'Import…'}>
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
