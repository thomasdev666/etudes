import { BookOpen, NotebookPen, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, cx, ErrorBox, PageHeader, Select, Textarea } from '@/components/ui'
import { useJobs } from '@/context/jobs'
import { useSpace } from '@/context/space'
import { estimateSeconds } from '@/lib/ai'
import { useCourses, useInvalidate, useNotesList, useSubjectMap, useSubjects } from '@/lib/data'
import { useUsage } from '@/lib/plans'
import { must, supabase } from '@/lib/supabase'

// Assistant : une demande libre (« une fiche avec seulement les formules »…), traitée à partir
// des cours et notes choisis. Le résultat est une nouvelle note : les sources ne sont jamais modifiées.

const SUGGESTIONS = [
  'Une fiche avec seulement les formules à retenir, et ce que représente chaque variable',
  'Les définitions à connaître par cœur, classées par chapitre',
  'Un résumé d’une page de l’essentiel',
  '15 questions probables à l’examen, avec leurs réponses',
  'Les pièges et erreurs fréquentes à éviter le jour de l’examen',
  'Les méthodes de calcul, étape par étape, avec un exemple chiffré',
]

// Au-delà, l'IA ne lit que le début du contenu
const MAX_CHARS = 300_000

type Source = { id: string; kind: 'course' | 'note'; title: string; subjectId: string | null; chars: number }

export default function AssistantPage() {
  const { spaceId } = useSpace()
  const navigate = useNavigate()
  const { start } = useJobs()
  const invalidate = useInvalidate()
  const { data: subjects = [] } = useSubjects()
  const subjectMap = useSubjectMap()
  const { data: courses = [] } = useCourses()
  const { data: notes = [] } = useNotesList()
  const { data: usage = [] } = useUsage()
  const [subject, setSubject] = useState(subjects[0]?.id ?? '')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const sources = useMemo<Source[]>(
    () =>
      [
        ...courses.map((c) => ({ id: c.id, kind: 'course' as const, title: c.title, subjectId: c.subject_id, chars: c.content.length })),
        ...notes.map((n) => ({ id: n.id, kind: 'note' as const, title: n.title, subjectId: n.subject_id, chars: n.content_text.length })),
      ].filter((s) => (!subject || s.subjectId === subject) && s.chars > 0),
    [courses, notes, subject],
  )
  const chosen = sources.filter((s) => !excluded.has(s.id))
  const total = chosen.reduce((n, s) => n + s.chars, 0)
  const quota = usage.find((u) => u.kind === 'sheet')
  const left = quota ? Math.max(0, quota.max - quota.used) : null

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const ask = instruction.trim()
      const short = ask.length > 60 ? ask.slice(0, 57) + '…' : ask
      const note = must(
        await supabase
          .from('notes')
          .insert({
            space_id: spaceId,
            subject_id: subject || null,
            title: `Assistant — ${short}`,
            content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'L’assistant prépare ce document…' }] }] },
          })
          .select('id')
          .single(),
      ) as { id: string }
      await start(
        'assistant',
        { note_id: note.id, course_ids: chosen.filter((s) => s.kind === 'course').map((s) => s.id), note_ids: chosen.filter((s) => s.kind === 'note').map((s) => s.id), instruction: ask },
        { label: `Assistant : « ${short} »`, estimateSec: estimateSeconds('assistant', chosen.length), link: `/notes/${note.id}`, linkLabel: 'Ouvrir' },
      )
      await invalidate('notes')
      setInstruction('')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 pb-10">
      <PageHeader title="Assistant" subtitle="Demande ce que tu veux à partir de tes cours. Le résultat devient une note que tu peux modifier, exporter ou partager." />

      <Card className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">À partir de</span>
          <Select
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value)
              setExcluded(new Set())
            }}
          >
            <option value="">Toutes les matières</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>

        {sources.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Aucun cours ni note ici pour l’instant. Importe d’abord un cours dans cette matière.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {chosen.length} / {sources.length} contenu{sources.length > 1 ? 's' : ''} utilisé{chosen.length > 1 ? 's' : ''}
              </span>
              <span className="flex gap-3">
                <button type="button" className="text-accent-ink hover:underline" onClick={() => setExcluded(new Set())}>
                  Tout
                </button>
                <button type="button" className="text-muted hover:underline" onClick={() => setExcluded(new Set(sources.map((s) => s.id)))}>
                  Aucun
                </button>
              </span>
            </div>
            <ul className="flex max-h-60 flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {sources.map((s) => {
                const on = !excluded.has(s.id)
                const subj = s.subjectId ? subjectMap.get(s.subjectId) : undefined
                return (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setExcluded((cur) => {
                            const next = new Set(cur)
                            if (on) next.add(s.id)
                            else next.delete(s.id)
                            return next
                          })
                        }
                        className="size-4 shrink-0 accent-[var(--accent)]"
                      />
                      {s.kind === 'course' ? <BookOpen className="size-4 shrink-0 text-muted" aria-hidden /> : <NotebookPen className="size-4 shrink-0 text-muted" aria-hidden />}
                      <span className="min-w-0 flex-1 truncate" translate="no">
                        {s.title}
                      </span>
                      {!subject && subj && (
                        <span className="shrink-0 text-xs text-muted" translate="no">
                          {subj.name}
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
            {total > MAX_CHARS && <p className="text-xs text-warning">Beaucoup de contenu : l’assistant lira environ les {Math.round((MAX_CHARS / total) * 100)} % premiers. Choisis une matière ou moins de cours pour un résultat plus complet.</p>}
          </div>
        )}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Ta demande</span>
          <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={4} maxLength={2000} placeholder="Ex. : une fiche avec seulement les formules d’analyse financière à retenir" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setInstruction(s)}
              className={cx('rounded-full border px-3 py-1 text-left text-xs', instruction === s ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-muted hover:bg-surface-2')}
            >
              {s}
            </button>
          ))}
        </div>

        <ErrorBox error={error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<Sparkles className="size-4" />} loading={busy} disabled={!instruction.trim() || !chosen.length || left === 0} onClick={run}>
            Créer le document
          </Button>
          {left !== null && (
            <span className="text-xs text-muted">
              {left === 0 ? 'Plus de documents disponibles cette semaine.' : `Encore ${left} document${left > 1 ? 's' : ''} cette semaine (compte avec les fiches de révision).`}
            </span>
          )}
        </div>
        {left === 0 && (
          <button type="button" onClick={() => navigate('/abonnement')} className="self-start text-sm font-medium text-accent-ink hover:underline">
            Voir les offres →
          </button>
        )}
      </Card>

      <p className="text-center text-xs text-muted">L’assistant ne s’appuie que sur les contenus cochés, et ne modifie jamais tes cours ni tes notes. Vérifie le résultat : une IA peut se tromper.</p>
    </div>
  )
}
