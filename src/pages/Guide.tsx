import { CalendarCheck, Check, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarConnect } from '@/components/CalendarConnect'
import { Button, Card, cx, ErrorBox, Input, ProgressBar, Spinner, SubjectDot } from '@/components/ui'
import { useSpace } from '@/context/space'
import { useCalendarEvents, useImportedEvents } from '@/lib/calendar'
import { suggestSubjects, type SubjectSuggestion } from '@/lib/calendarSubjects'
import { SUBJECT_PALETTE } from '@/lib/colors'
import { useCalendarLinks, useInvalidate, useSubjects, useTrash, useUpdate } from '@/lib/data'
import { SETUP_ORDER, useOnboarding, type SetupStep } from '@/lib/onboarding'
import { must, supabase } from '@/lib/supabase'
import type { Subject } from '@/lib/types'

// Pastilles de couleur compactes (palette + couleur libre)
function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Couleur de ${label}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="size-8 rounded-full border-2 border-surface shadow-card ring-1 ring-border"
        style={{ background: value }}
      />
      {open && (
        <div className="anim-pop absolute right-0 z-20 mt-2 flex w-48 flex-wrap gap-1.5 rounded-2xl border border-border bg-surface p-2 shadow-lg">
          {SUBJECT_PALETTE.map((p) => (
            <button
              key={p.hex}
              type="button"
              aria-label={p.name}
              onClick={() => {
                onChange(p.hex)
                setOpen(false)
              }}
              className={cx('size-7 rounded-full', p.hex.toLowerCase() === value.toLowerCase() && 'ring-2 ring-text ring-offset-2 ring-offset-surface')}
              style={{ background: p.hex }}
            />
          ))}
          <label className="relative flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border text-xs text-muted" title="Couleur libre">
            +
            <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Couleur libre" />
          </label>
        </div>
      )}
    </div>
  )
}

type Draft = SubjectSuggestion & { key: string; color: string; checked: boolean }

function SubjectsStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { spaceId } = useSpace()
  const invalidate = useInvalidate()
  const { data: existing = [] } = useSubjects()
  const update = useUpdate<Subject>('subjects')
  const trash = useTrash('subjects')
  const cal = useCalendarEvents()
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const started = useRef(false)

  // Repère les matières dans l'emploi du temps (une seule fois)
  useEffect(() => {
    if (started.current) return
    if (!cal.hasLinks) {
      setDrafts([])
      return
    }
    if (cal.isLoading) return
    started.current = true
    const known = new Set(existing.map((s) => s.name.toLowerCase()))
    suggestSubjects(cal.events.map((e) => e.title)).then(({ list }) => {
      setDrafts(
        list
          .filter((s) => !known.has(s.name.toLowerCase()))
          .map((s, i) => ({ ...s, key: `${i}-${s.name}`, color: SUBJECT_PALETTE[(existing.length + i) % SUBJECT_PALETTE.length].hex, checked: true })),
      )
    })
  }, [cal.hasLinks, cal.isLoading, cal.events, existing])

  const patch = (key: string, p: Partial<Draft>) => setDrafts((d) => d!.map((x) => (x.key === key ? { ...x, ...p } : x)))

  function addManual(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const n = (drafts?.length ?? 0) + existing.length
    setDrafts((d) => [...(d ?? []), { key: `m-${Date.now()}`, name: name.trim(), keywords: [], count: 0, color: SUBJECT_PALETTE[n % SUBJECT_PALETTE.length].hex, checked: true }])
    setName('')
  }

  const chosen = (drafts ?? []).filter((d) => d.checked && d.name.trim())

  async function validate() {
    setBusy(true)
    setError(null)
    try {
      if (chosen.length)
        must(
          await supabase.from('subjects').insert(
            chosen.map((d, i) => ({ space_id: spaceId, name: d.name.trim(), color: d.color, keywords: d.keywords, position: existing.length + i })),
          ),
        )
      await invalidate('subjects')
      onDone()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {drafts === null ? (
        <div className="flex items-center gap-3 rounded-2xl bg-accent-soft p-4 text-sm">
          <Loader2 className="size-5 animate-spin text-accent-ink" aria-hidden />
          Je repère tes matières dans ton emploi du temps…
        </div>
      ) : (
        cal.hasLinks &&
        drafts.length > 0 && (
          <p className="flex items-start gap-2 rounded-2xl bg-accent-soft p-3 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
            <span>
              {drafts.length} matière{drafts.length > 1 ? 's' : ''} trouvée{drafts.length > 1 ? 's' : ''} dans ton emploi du temps. Vérifie les noms, décoche ce qui n’est pas une matière et choisis
              tes couleurs.
            </span>
          </p>
        )
      )}

      {existing.length > 0 && (
        <ul className="flex flex-col gap-2">
          {existing.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2">
              <Check className="size-4 shrink-0 text-success" aria-label="Déjà créée" />
              <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
              <Swatches value={s.color} label={s.name} onChange={(color) => update.mutate({ id: s.id, patch: { color } })} />
              <button type="button" aria-label={`Supprimer ${s.name}`} onClick={() => trash.mutate(s.id)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {drafts && drafts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {drafts.map((d) => (
            <li key={d.key} className={cx('flex items-center gap-3 rounded-2xl border px-3 py-2 transition-opacity', d.checked ? 'border-border bg-surface' : 'border-dashed border-border opacity-60')}>
              <input
                type="checkbox"
                checked={d.checked}
                onChange={(e) => patch(d.key, { checked: e.target.checked })}
                aria-label={`Garder ${d.name}`}
                className="size-5 shrink-0 accent-[var(--accent)]"
              />
              <div className="min-w-0 flex-1">
                <input
                  value={d.name}
                  onChange={(e) => patch(d.key, { name: e.target.value })}
                  aria-label="Nom de la matière"
                  className="w-full bg-transparent font-medium outline-none focus:underline"
                />
                {(d.count > 0 || d.keywords.length > 0) && (
                  <p className="truncate text-xs text-muted">
                    {d.count > 0 && `${d.count} séance${d.count > 1 ? 's' : ''}`}
                    {d.keywords.length > 0 && ` · reconnue par « ${d.keywords.join(' », « ')} »`}
                  </p>
                )}
              </div>
              <Swatches value={d.color} label={d.name} onChange={(color) => patch(d.key, { color })} />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addManual} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ajouter une matière à la main" aria-label="Nouvelle matière" />
        <Button type="submit" variant="secondary" disabled={!name.trim()} aria-label="Ajouter">
          <Plus className="size-4" />
        </Button>
      </form>

      <ErrorBox error={error} />
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={onBack}>
          Retour
        </Button>
        <span className="flex-1" />
        <Button onClick={validate} loading={busy} disabled={!existing.length && !chosen.length}>
          Valider mes matières{chosen.length ? ` (${chosen.length + existing.length})` : ''}
        </Button>
      </div>
    </div>
  )
}

function ExamsStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { data: subjects = [] } = useSubjects()
  const update = useUpdate<Subject>('subjects')
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {subjects.map((s) => (
          <li key={s.id} className="flex items-center gap-3">
            <SubjectDot color={s.color} className="size-3" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
            <Input
              type="date"
              aria-label={`Date d’examen de ${s.name}`}
              value={s.exam_date ?? ''}
              onChange={(e) => update.mutate({ id: s.id, patch: { exam_date: e.target.value || null } })}
              className="w-44 py-1.5"
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={onBack}>
          Retour
        </Button>
        <span className="flex-1" />
        <Button onClick={onDone}>{subjects.some((s) => s.exam_date) ? 'Terminer' : 'Je les ajouterai plus tard'}</Button>
      </div>
    </div>
  )
}

const TEXTS: Record<SetupStep, { title: string; why: string }> = {
  agenda: {
    title: 'Relie ton emploi du temps',
    why: 'Tes cours s’affichent dans l’agenda avec la couleur de leur matière, et on s’en sert pour créer tes matières automatiquement.',
  },
  matieres: {
    title: 'Vérifie tes matières',
    why: 'Chaque matière regroupe ses cours, notes, QCM, flash cards et cartes mentales. Garde les bonnes et choisis leurs couleurs.',
  },
  examens: {
    title: 'Tes dates d’examen',
    why: 'Un compte à rebours par matière, et les révisions des examens les plus proches passent en premier. Facultatif.',
  },
}

export default function GuidePage() {
  const ob = useOnboarding()
  const navigate = useNavigate()
  const firstUndone = useMemo(() => SETUP_ORDER.findIndex((s) => !ob.done[s]), [ob.done])
  const [index, setIndex] = useState<number | null>(null)
  const { data: links = [] } = useCalendarLinks()
  const { data: imported = [] } = useImportedEvents()

  if (ob.loading) return <Spinner />
  const i = index ?? (firstUndone < 0 ? 0 : firstUndone)
  const step = SETUP_ORDER[i]
  const pct = Math.round((SETUP_ORDER.filter((s) => ob.done[s]).length / SETUP_ORDER.length) * 100)

  async function next(action: 'confirm' | 'skip') {
    if (action === 'confirm') await ob.confirm(step)
    else await ob.skip(step)
    if (i < SETUP_ORDER.length - 1) setIndex(i + 1)
    else navigate('/', { replace: true })
  }

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-medium text-accent-ink">Bienvenue 👋</p>
      <h1 className="text-2xl font-bold sm:text-3xl">Préparons ton espace</h1>
      <div className="mt-4 mb-5">
        <div className="mb-1.5 flex justify-between text-sm text-muted">
          <span>
            Étape {i + 1} sur {SETUP_ORDER.length}
          </span>
          <span>{pct} %</span>
        </div>
        <ProgressBar value={pct} label="Progression de la configuration" />
      </div>

      <Card key={step} className="anim-pop">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          {step === 'agenda' && <CalendarCheck className="size-5 text-accent-ink" aria-hidden />}
          {TEXTS[step].title}
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">{TEXTS[step].why}</p>

        {step === 'agenda' && (
          <div className="flex flex-col gap-4">
            <CalendarConnect />
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => next('skip')}>
                Plus tard
              </Button>
              <span className="flex-1" />
              <Button onClick={() => next('confirm')} disabled={!links.length && !imported.length}>
                Continuer
              </Button>
            </div>
          </div>
        )}
        {step === 'matieres' && <SubjectsStep onDone={() => next('confirm')} onBack={() => setIndex(0)} />}
        {step === 'examens' && <ExamsStep onDone={() => next('confirm')} onBack={() => setIndex(1)} />}
      </Card>

      {!ob.available && (
        <p className="mt-4 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
          La progression ne peut pas être enregistrée : lance la mise à jour de la base (fichier 0002) dans Supabase.
        </p>
      )}
    </div>
  )
}
