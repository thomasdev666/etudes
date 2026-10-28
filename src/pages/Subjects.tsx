import { BookOpen, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SubjectForm } from '@/components/SubjectForm'
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, Spinner } from '@/components/ui'
import { countdown } from '@/lib/dates'
import { useCourses, useErrorItems, useFlashcards, useNotesList, useSubjects } from '@/lib/data'
import { MASTERED_DAYS } from '@/lib/sm2'

export default function SubjectsPage() {
  const { data: subjects, isLoading } = useSubjects()
  const { data: cards = [] } = useFlashcards()
  const { data: courses = [] } = useCourses()
  const { data: notes = [] } = useNotesList()
  const { data: errors = [] } = useErrorItems()
  const [open, setOpen] = useState(false)

  if (isLoading) return <Spinner />

  return (
    <>
      <PageHeader
        title="Matières"
        subtitle="Chaque matière regroupe ses cours, notes, QCM, cartes et plans."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
            Nouvelle matière
          </Button>
        }
      />
      {!subjects?.length ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title="Aucune matière"
          action={<Button onClick={() => setOpen(true)}>Créer ma première matière</Button>}
        >
          Commence par créer tes matières du semestre, avec une couleur pour chacune.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => {
            const sc = cards.filter((c) => c.subject_id === s.id)
            const due = sc.filter((c) => new Date(c.due_at) <= new Date()).length
            const mastered = sc.filter((c) => c.interval_days >= MASTERED_DAYS).length
            const errs = errors.filter((e) => e.subject_id === s.id && !e.resolved_at).length
            const exam = s.exam_date ? countdown(s.exam_date + 'T08:00:00') : null
            return (
              <Link key={s.id} to={`/matieres/${s.id}`} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-lg font-semibold">{s.name}</h2>
                      <p className="text-sm text-muted">
                        {courses.filter((c) => c.subject_id === s.id).length} cours · {notes.filter((n) => n.subject_id === s.id).length} notes ·{' '}
                        {sc.length} cartes
                      </p>
                    </div>
                    {exam && <Badge tone={exam.tone === 'muted' ? 'accent' : exam.tone}>Examen {exam.label}</Badge>}
                  </div>
                  {sc.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-muted">
                        <span>Cartes maîtrisées</span>
                        <span>{Math.round((mastered / sc.length) * 100)} %</span>
                      </div>
                      <ProgressBar value={(mastered / sc.length) * 100} color={s.color} label={`Maîtrise ${s.name}`} />
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {due > 0 && <Badge tone="accent">{due} cartes à revoir</Badge>}
                    {errs > 0 && <Badge tone="danger">{errs} erreurs à retravailler</Badge>}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
      <SubjectForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}
