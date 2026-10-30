import { Brain, FileUp, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { relativeDay } from '@/lib/dates'
import { useFlashcards, useInsert, useTrash, useUpdate } from '@/lib/data'
import { MASTERED_DAYS } from '@/lib/sm2'
import type { Flashcard, Subject } from '@/lib/types'
import { GenerateCardsModal } from './Generate'
import { ImportCardsModal } from './ImportCards'
import { ShareButton } from './ShareButton'
import { Badge, Button, Card, EmptyState, Field, IconButton, Modal, Textarea } from './ui'

export function CardForm({ open, onClose, subjectId, card }: { open: boolean; onClose: () => void; subjectId: string; card?: Flashcard }) {
  const insert = useInsert<Flashcard>('flashcards')
  const update = useUpdate<Flashcard>('flashcards')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [again, setAgain] = useState(false)

  useEffect(() => {
    if (open) {
      setFront(card?.front ?? '')
      setBack(card?.back ?? '')
    }
  }, [open, card])

  async function save(keepOpen: boolean) {
    if (card) await update.mutateAsync({ id: card.id, patch: { front, back } })
    else await insert.mutateAsync({ subject_id: subjectId, front: front.trim(), back: back.trim() })
    if (keepOpen) {
      setFront('')
      setBack('')
      setAgain(true)
    } else onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={card ? 'Modifier la carte' : 'Nouvelle carte'}
      footer={
        <>
          {!card && (
            <Button variant="secondary" disabled={!front.trim() || !back.trim()} onClick={() => save(true)}>
              Enregistrer et continuer
            </Button>
          )}
          <Button disabled={!front.trim() || !back.trim()} loading={insert.isPending || update.isPending} onClick={() => save(false)}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {again && !card && <p className="text-sm text-success">Carte ajoutée ✓</p>}
        <Field label="Recto (question)" id="cfront">
          <Textarea id="cfront" autoFocus value={front} onChange={(e) => setFront(e.target.value)} placeholder="Qu’est-ce que le WACC ?" />
        </Field>
        <Field label="Verso (réponse)" id="cback">
          <Textarea id="cback" value={back} onChange={(e) => setBack(e.target.value)} placeholder="Coût moyen pondéré du capital…" />
        </Field>
      </div>
    </Modal>
  )
}

export function CardsPanel({ subject }: { subject: Subject }) {
  const { data: all = [] } = useFlashcards()
  const trash = useTrash('flashcards')
  const [form, setForm] = useState<{ open: boolean; card?: Flashcard }>({ open: false })
  const [gen, setGen] = useState(false)
  const [imp, setImp] = useState(false)
  const cards = all.filter((c) => c.subject_id === subject.id)
  const due = cards.filter((c) => new Date(c.due_at) <= new Date()).length

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-bold">{due}</p>
          <p className="text-sm text-muted">carte{due > 1 ? 's' : ''} à réviser maintenant</p>
        </div>
        <Button variant="secondary" icon={<Sparkles className="size-4" />} onClick={() => setGen(true)}>
          Générer avec l’IA
        </Button>
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setForm({ open: true })}>
          Ajouter
        </Button>
        <Button variant="secondary" icon={<FileUp className="size-4" />} onClick={() => setImp(true)}>
          Importer
        </Button>
        {cards.length > 0 && <ShareButton kind="deck" targetId={subject.id} size="md" />}
        {due > 0 && (
          <Link to={`/reviser/cartes?matiere=${subject.id}`}>
            <Button icon={<Brain className="size-4" />}>Réviser</Button>
          </Link>
        )}
      </Card>

      {!cards.length ? (
        <EmptyState icon={<Brain className="size-8" />} title="Aucune flash card">
          Crée des cartes à la main, génère-les depuis un cours, ou importe-les depuis Anki ou Quizlet. Elles reviendront au bon moment grâce à la répétition espacée.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
          {cards.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.front}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted">{c.back}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {c.interval_days >= MASTERED_DAYS ? (
                    <Badge tone="success">Maîtrisée</Badge>
                  ) : new Date(c.due_at) <= new Date() ? (
                    <Badge tone="accent">À revoir</Badge>
                  ) : (
                    <Badge>Prochaine : {relativeDay(c.due_at)}</Badge>
                  )}
                  {c.source === 'ai' && <Badge>IA</Badge>}
                  {c.source === 'import' && <Badge>Importée</Badge>}
                </div>
              </div>
              <IconButton label="Modifier" onClick={() => setForm({ open: true, card: c })}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label="Supprimer" onClick={() => trash.mutate(c.id)}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <CardForm open={form.open} card={form.card} subjectId={subject.id} onClose={() => setForm({ open: false })} />
      <GenerateCardsModal open={gen} onClose={() => setGen(false)} subjectId={subject.id} />
      <ImportCardsModal open={imp} onClose={() => setImp(false)} subjectId={subject.id} />
    </div>
  )
}
