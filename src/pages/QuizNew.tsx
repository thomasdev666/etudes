import { PenLine, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SourcePicker, useGenerateQuiz } from '@/components/Generate'
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select, Tabs } from '@/components/ui'
import { useCourses, useNotesList, useSubjects } from '@/lib/data'
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
  const [difficulty, setDifficulty] = useState<Quiz['difficulty']>('medium')
  const [qtype, setQtype] = useState<Quiz['qtype']>('mcq')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const generate = useGenerateQuiz()
  const navigate = useNavigate()
  const lock = useRef(false)

  const sid = subjectId || subjects[0]?.id || ''
  const defaultTitle = () => {
    const first = courses.find((c) => c.id === courseIds[0]) ?? notes.find((n) => n.id === noteIds[0])
    return first ? `QCM — ${first.title}` : `QCM du ${new Date().toLocaleDateString('fr')}`
  }

  async function go() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(null)
    try {
      await generate({ subjectId: sid, title: title.trim() || defaultTitle(), courseIds, noteIds, count, difficulty, qtype })
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
        <Button size="lg" icon={<Sparkles className="size-5" />} loading={busy} disabled={!sid || (!courseIds.length && !noteIds.length)} onClick={go}>
          Générer le QCM
        </Button>
      </Card>
    </div>
  )
}
