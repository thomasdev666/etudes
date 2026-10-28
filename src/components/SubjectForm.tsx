import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SUBJECT_PALETTE, readableOn } from '@/lib/colors'
import { useInsert, useSubjects, useUpdate } from '@/lib/data'
import type { Subject } from '@/lib/types'
import { Button, ErrorBox, Field, Input, Modal } from './ui'

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const custom = !SUBJECT_PALETTE.some((p) => p.hex.toLowerCase() === value.toLowerCase())
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Couleur">
      {SUBJECT_PALETTE.map((p) => {
        const selected = p.hex.toLowerCase() === value.toLowerCase()
        return (
          <button
            key={p.hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={p.name}
            title={p.name}
            onClick={() => onChange(p.hex)}
            className="flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110"
            style={{ background: p.hex, boxShadow: selected ? `0 0 0 2px var(--surface), 0 0 0 4px ${p.hex}` : undefined }}
          >
            {selected && <Check className="size-4" style={{ color: readableOn(p.hex) }} strokeWidth={3} />}
          </button>
        )
      })}
      <label
        className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border text-xs text-muted"
        title="Couleur libre"
        style={custom ? { background: value, borderStyle: 'solid', borderColor: value } : undefined}
      >
        <span className="sr-only">Couleur libre</span>
        {!custom && '+'}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  )
}

export function SubjectForm({ open, onClose, subject }: { open: boolean; onClose: () => void; subject?: Subject }) {
  const { data: subjects = [] } = useSubjects()
  const insert = useInsert<Subject>('subjects')
  const update = useUpdate<Subject>('subjects')
  const [name, setName] = useState('')
  const [color, setColor] = useState(SUBJECT_PALETTE[0].hex)
  const [keywords, setKeywords] = useState('')
  const [examDate, setExamDate] = useState('')

  useEffect(() => {
    if (!open) return
    setName(subject?.name ?? '')
    setColor(subject?.color ?? SUBJECT_PALETTE[subjects.length % SUBJECT_PALETTE.length].hex)
    setKeywords(subject?.keywords.join(', ') ?? '')
    setExamDate(subject?.exam_date ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject])

  const busy = insert.isPending || update.isPending
  async function save() {
    const values = {
      name: name.trim(),
      color,
      keywords: keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      exam_date: examDate || null,
    }
    if (subject) await update.mutateAsync({ id: subject.id, patch: values })
    else await insert.mutateAsync({ ...values, position: subjects.length })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? 'Modifier la matière' : 'Nouvelle matière'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={save} loading={busy} disabled={!name.trim()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) save()
        }}
      >
        <Field label="Nom" id="sname">
          <Input id="sname" autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Finance d’entreprise" />
        </Field>
        <Field label="Couleur">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Date de l’examen (optionnelle)" id="sexam" hint="Affiche un compte à rebours et priorise les révisions.">
          <Input id="sexam" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </Field>
        <Field
          label="Mots-clés du calendrier (optionnel)"
          id="skw"
          hint="Les cours de l’emploi du temps dont le titre contient le nom de la matière ou l’un de ces mots prennent sa couleur. Séparés par des virgules."
        >
          <Input id="skw" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="FIN301, Corporate Finance" />
        </Field>
        <ErrorBox error={insert.error ?? update.error} />
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
