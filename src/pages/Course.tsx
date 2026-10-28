import { Download, ListChecks, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { GenerateCardsModal } from '@/components/Generate'
import { Button, Card, EmptyState, IconButton, Spinner, SubjectChip } from '@/components/ui'
import { fmt } from '@/lib/dates'
import { useCourses, useSubjectMap, useTrash } from '@/lib/data'
import { BUCKET, supabase } from '@/lib/supabase'

export default function CoursePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: courses, isLoading } = useCourses()
  const subjects = useSubjectMap()
  const trash = useTrash('courses')
  const [gen, setGen] = useState(false)

  if (isLoading) return <Spinner />
  const course = courses?.find((c) => c.id === id)
  if (!course) return <EmptyState title="Cours introuvable" />
  const subject = subjects.get(course.subject_id)

  async function download() {
    if (!course?.file_path) return
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(course.file_path, 60)
    if (data) window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {subject && (
            <Link to={`/matieres/${subject.id}`}>
              <SubjectChip name={subject.name} color={subject.color} />
            </Link>
          )}
          <h1 className="mt-1 text-2xl font-bold">{course.title}</h1>
          <p className="text-sm text-muted">Ajouté le {fmt(course.created_at, 'd MMMM yyyy')}</p>
        </div>
        {course.file_path && (
          <IconButton label="Télécharger le fichier original" onClick={download}>
            <Download className="size-5" />
          </IconButton>
        )}
        <IconButton
          label="Supprimer le cours"
          onClick={() => {
            trash.mutate(course.id)
            navigate(subject ? `/matieres/${subject.id}` : '/matieres')
          }}
        >
          <Trash2 className="size-5" />
        </IconButton>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link to={`/qcm/nouveau?matiere=${course.subject_id}&cours=${course.id}`}>
          <Button icon={<ListChecks className="size-4" />}>Générer un QCM</Button>
        </Link>
        <Button variant="secondary" icon={<Sparkles className="size-4" />} onClick={() => setGen(true)}>
          Générer des flash cards
        </Button>
      </div>
      <Card>
        <div className="whitespace-pre-wrap break-words leading-relaxed">{course.content || <span className="text-muted">Aucun texte.</span>}</div>
      </Card>
      <GenerateCardsModal open={gen} onClose={() => setGen(false)} subjectId={course.subject_id} initialCourseIds={[course.id]} />
    </>
  )
}
