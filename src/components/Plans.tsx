import { ListChecks, Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useInsert, usePlanItems, usePlans, useTrash, useUpdate } from '@/lib/data'
import type { PlanItem, StudyPlan, Subject } from '@/lib/types'
import { Button, Card, Checkbox, EmptyState, Field, IconButton, Input, Modal, ProgressBar, Textarea } from './ui'
import { ColorPicker } from './SubjectForm'

export function planProgress(items: PlanItem[]) {
  if (!items.length) return 0
  return (items.filter((i) => i.done).length / items.length) * 100
}

function PlanCard({ plan, items, subject }: { plan: StudyPlan; items: PlanItem[]; subject: Subject }) {
  const update = useUpdate<PlanItem>('plan_items')
  const insert = useInsert<PlanItem>('plan_items')
  const trashItem = useTrash('plan_items')
  const trashPlan = useTrash('study_plans')
  const [label, setLabel] = useState('')
  const color = plan.color ?? subject.color
  const pct = planProgress(items)

  function add(e: FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    insert.mutate({ plan_id: plan.id, label: label.trim(), position: items.length })
    setLabel('')
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{plan.title}</h3>
          <p className="text-sm text-muted">
            {items.filter((i) => i.done).length} / {items.length} · {Math.round(pct)} %
          </p>
        </div>
        <IconButton label="Supprimer le plan" onClick={() => trashPlan.mutate(plan.id)}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
      <div className="mt-3">
        <ProgressBar value={pct} color={color} label={`Progression ${plan.title}`} />
      </div>
      <ul className="mt-3 flex flex-col">
        {items.map((it) => (
          <li key={it.id} className="group flex items-center gap-3 rounded-lg py-1.5">
            <Checkbox checked={it.done} color={color} label={it.label} onChange={(done) => update.mutate({ id: it.id, patch: { done } })} />
            <span className={it.done ? 'flex-1 text-muted line-through' : 'flex-1'}>{it.label}</span>
            <IconButton label={`Retirer ${it.label}`} className="size-8 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => trashItem.mutate(it.id)}>
              <X className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ajouter une étape…" aria-label="Nouvelle étape" className="py-2" />
        <Button type="submit" variant="secondary" size="md" disabled={!label.trim()} aria-label="Ajouter">
          <Plus className="size-4" />
        </Button>
      </form>
    </Card>
  )
}

export function PlansPanel({ subject }: { subject: Subject }) {
  const { data: plans = [] } = usePlans()
  const { data: items = [] } = usePlanItems()
  const insertPlan = useInsert<StudyPlan>('study_plans')
  const insertItems = useInsert<PlanItem>('plan_items')
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(subject.color)
  const [steps, setSteps] = useState('')
  const mine = plans.filter((p) => p.subject_id === subject.id)

  async function create() {
    const [plan] = await insertPlan.mutateAsync({ subject_id: subject.id, title: title.trim(), color })
    const lines = steps
      .split('\n')
      .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean)
    if (lines.length) await insertItems.mutateAsync(lines.map((label, position) => ({ plan_id: plan.id, label, position })))
    setOpen(false)
    setTitle('')
    setSteps('')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
          Nouveau plan
        </Button>
      </div>
      {!mine.length ? (
        <EmptyState icon={<ListChecks className="size-8" />} title="Aucun plan de révision">
          Découpe tes révisions en étapes à cocher : chapitres à relire, exercices, annales…
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {mine.map((p) => (
            <PlanCard key={p.id} plan={p} subject={subject} items={items.filter((i) => i.plan_id === p.id)} />
          ))}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouveau plan de révision"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={create} disabled={!title.trim()} loading={insertPlan.isPending || insertItems.isPending}>
              Créer
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Titre" id="ptitle">
            <Input id="ptitle" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Partiel de décembre" />
          </Field>
          <Field label="Couleur">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <Field label="Étapes (une par ligne)" id="psteps">
            <Textarea id="psteps" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={'Relire chapitre 1\nFaire les exercices du TD 2\nAnnale 2024'} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
