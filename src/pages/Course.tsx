import { Download, FileText, ImageIcon, ListChecks, Network, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { GenerateCardsModal, GenerateMindmapModal, useGenerateSheet } from '@/components/Generate'
import { GeneratingBar } from '@/components/Mindmaps'
import { useJobs } from '@/context/jobs'
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
  const [mind, setMind] = useState(false)
  const { find } = useJobs()
  const generateSheet = useGenerateSheet()
  const [sheetBusy, setSheetBusy] = useState(false)

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
        <Button variant="secondary" icon={<Network className="size-4" />} onClick={() => setMind(true)}>
          Générer une carte mentale
        </Button>
        <Button
          variant="secondary"
          icon={<FileText className="size-4" />}
          loading={sheetBusy}
          onClick={async () => {
            setSheetBusy(true)
            try {
              await generateSheet({ subjectId: course.subject_id, title: course.title, courseIds: [course.id] })
            } finally {
              setSheetBusy(false)
            }
          }}
        >
          Fiche de révision
        </Button>
      </div>
      {course.status === 'processing' && (
        <Card className="mb-4 flex items-start gap-3 bg-accent-soft">
          <ImageIcon className="mt-0.5 size-5 text-accent-ink" aria-hidden />
          <div className="flex-1">
            <p className="font-medium">L’IA lit les images du cours (formules, schémas)…</p>
            <p className="text-sm text-muted">Tu peux déjà générer, mais attends la fin pour des QCM et cartes plus complets.</p>
            <GeneratingBar job={find((j) => j.params.course_id === course.id)} />
          </div>
        </Card>
      )}
      {course.status === 'error' && (
        <p className="mb-4 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">Les images n’ont pas pu être lues (service IA indisponible). Le texte du cours reste utilisable.</p>
      )}
      <Card>
        <div className="whitespace-pre-wrap break-words leading-relaxed">{course.content.replace(/\[\[image:\d+\]\]/g, '⏳ [image en cours de lecture]') || <span className="text-muted">Aucun texte.</span>}</div>
      </Card>
      <GenerateMindmapModal open={mind} onClose={() => setMind(false)} subjectId={course.subject_id} initialCourseIds={[course.id]} />
      <GenerateCardsModal open={gen} onClose={() => setGen(false)} subjectId={course.subject_id} initialCourseIds={[course.id]} />
    </>
  )
}
