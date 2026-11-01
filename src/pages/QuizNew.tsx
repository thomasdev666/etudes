import { GraduationCap, PenLine, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SourcePicker, useGenerateQuiz } from '@/components/Generate'
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select, Tabs } from '@/components/ui'
import { useCourses, useNotesList, useSubjects } from '@/lib/data'
import { usePastExams } from '@/lib/pastExams'
import { QueueNotice, SessionMeter } from '@/components/SessionMeter'
import type { Quiz } from '@/lib/types'

export default function QuizNewPage() {
  const [params] = useSearchParams()
  const { data: subjects = [] } = useSubjects()
  const { data: courses = [] } = useCourses()
  const { data: notes = [] } = useNotesList()
  const [subjectId, setSubjectId] = useState(params.get('matiere') ?? '')
  const [courseIds, setCourseIds] = useState<string[]>(params.get('cours') ? [params.get('cours')!] : [])
  const [noteIds, setNoteIds] = useState<string[]>(params.get('note') ? [params.get('note')!] : [])
  const [count, setCount] = useState(15)
  // Depuis « QCM type partiel » : niveau examen et anciens partiels comme modèles
  const examMode = params.get('partiel') === '1'
  const [difficulty, setDifficulty] = useState<Quiz['difficulty']>(examMode ? 'hard' : 'medium')
  const { data: pastExams } = usePastExams()
  const [useExams, setUseExams] = useState(true)
  const [qtype, setQtype] = useState<Quiz['qtype']>('mcq')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const generate = useGenerateQuiz()
  const navigate = useNavigate()
  const lock = useRef(false)

  const sid = subjectId || subjects[0]?.id || ''
  const exams = (pastExams ?? []).filter((e) => e.subject_id === sid)
  const defaultTitle = () => {
    const first = courses.find((c) => c.id === courseIds[0]) ?? notes.find((n) => n.id === noteIds[0])
    if (examMode && exams.length && useExams) return first ? `QCM type partiel — ${first.title}` : 'QCM type partiel'
    return first ? `QCM — ${first.title}` : `QCM du ${new Date().toLocaleDateString('fr')}`
  }

  async function go() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(null)
    try {
      await generate({ subjectId: sid, title: title.trim() || defaultTitle(), courseIds, noteIds, count, difficulty, qtype, useExams: exams.length ? useExams : undefined })
      navigate(`/matieres/${sid}?onglet=qcm`)
    } catch (e) {
      setError(e)
      setBusy(false)
      lock.current = false
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Nouveau QCM" subtitle="Généré par l’IA à partir de tes cours. Les réponses ne s’affichent qu’à la fin." />
      <Card className="flex flex-col gap-5">
        <Field label="Matière" id="qsubj">
          <Select
            id="qsubj"
            value={sid}
            onChange={(e) => {
              setSubjectId(e.target.value)
              setCourseIds([])
              setNoteIds([])
            }}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {sid && <SourcePicker subjectId={sid} courseIds={courseIds} noteIds={noteIds} onChange={(c, n) => (setCourseIds(c), setNoteIds(n))} />}
        {pastExams !== null &&
          (exams.length ? (
            <label className="flex items-start gap-3 rounded-2xl bg-accent-soft p-3 text-sm">
              <input type="checkbox" checked={useExams} onChange={(e) => setUseExams(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
              <span>
                <span className="flex items-center gap-1.5 font-medium">
                  <GraduationCap className="size-4" aria-hidden />
                  {`S’inspirer de mes anciens partiels (${exams.length})`}
                </span>
                <span className="text-muted">Même format, même niveau, notions qui tombent souvent. Les questions ne sont jamais recopiées.</span>
              </span>
            </label>
          ) : (
            sid && (
              <p className="flex items-start gap-2 rounded-2xl border border-dashed border-border px-3 py-2.5 text-sm text-muted">
                <GraduationCap className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Tu as d’anciens partiels de cette matière ?{' '}
                  <Link to={`/matieres/${sid}?onglet=partiels`} className="font-medium text-accent-ink hover:underline">
                    Ajoute-les
                  </Link>{' '}
                  pour des QCM au plus près de l’examen.
                </span>
              </p>
            )
          ))}
        <Field label={`Nombre de questions : ${count}`} id="qcount">
          <input id="qcount" type="range" min={5} max={50} step={5} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Difficulté</span>
          <Tabs
            label="Difficulté"
            value={difficulty}
            onChange={setDifficulty}
            items={[
              { value: 'easy', label: 'Facile' },
              { value: 'medium', label: 'Moyen' },
              { value: 'hard', label: 'Difficile' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Type</span>
          <Tabs
            label="Type de questions"
            value={qtype}
            onChange={setQtype}
            items={[
              { value: 'mcq', label: 'QCM à 4 choix' },
              { value: 'truefalse', label: 'Vrai ou faux' },
            ]}
          />
          <div className="mt-1 flex items-start gap-2.5 rounded-2xl border border-dashed border-border px-3 py-2.5 text-sm">
            <PenLine className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                Questions ouvertes <Badge tone="muted">Bientôt</Badge>
              </p>
              <p className="mt-0.5 text-muted">Tu rédiges ta réponse avec tes mots, l’IA la corrige et te dit ce qui manque.</p>
            </div>
          </div>
        </div>
        <Field label="Titre (optionnel)" id="qtitle">
          <Input id="qtitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle()} />
        </Field>
        <ErrorBox error={error} />
        <p className="text-sm text-muted">La génération continue en arrière-plan (environ 1 à 3 minutes) : tu peux naviguer, une barre de progression reste visible.</p>
        <QueueNotice />
        <SessionMeter kind="gen" />
        <Button size="lg" icon={<Sparkles className="size-5" />} loading={busy} disabled={!sid || (!courseIds.length && !noteIds.length)} onClick={go}>
          Générer le QCM
        </Button>
      </Card>
    </div>
  )
}
