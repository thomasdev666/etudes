import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SourcePicker, useGenerateQuiz } from '@/components/Generate'
import { Button, Card, ErrorBox, Field, Input, PageHeader, Select, Tabs } from '@/components/ui'
import { useCourses, useSubjects } from '@/lib/data'
import type { Quiz } from '@/lib/types'

export default function QuizNewPage() {
  const [params] = useSearchParams()
  const { data: subjects = [] } = useSubjects()
  const { data: courses = [] } = useCourses()
  const [subjectId, setSubjectId] = useState(params.get('matiere') ?? '')
  const [courseIds, setCourseIds] = useState<string[]>(params.get('cours') ? [params.get('cours')!] : [])
  const [noteIds, setNoteIds] = useState<string[]>([])
  const [count, setCount] = useState(15)
  const [difficulty, setDifficulty] = useState<Quiz['difficulty']>('medium')
  const [qtype, setQtype] = useState<Quiz['qtype']>('mcq')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const generate = useGenerateQuiz()

  const sid = subjectId || subjects[0]?.id || ''
  const defaultTitle = () => {
    const first = courses.find((c) => c.id === courseIds[0])
    return first ? `QCM — ${first.title}` : `QCM du ${new Date().toLocaleDateString('fr')}`
  }

  async function go() {
    setBusy(true)
    setError(null)
    try {
      await generate({ subjectId: sid, title: title.trim() || defaultTitle(), courseIds, noteIds, count, difficulty, qtype })
    } catch (e) {
      setError(e)
      setBusy(false)
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
        </div>
        <Field label="Titre (optionnel)" id="qtitle">
          <Input id="qtitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle()} />
        </Field>
        <ErrorBox error={error} />
        {busy && <p className="text-sm text-muted">Génération en cours… en général 15 à 60 secondes. Tu peux rester sur cette page.</p>}
        <Button size="lg" icon={<Sparkles className="size-5" />} loading={busy} disabled={!sid || (!courseIds.length && !noteIds.length)} onClick={go}>
          {busy ? 'Génération…' : 'Générer et commencer'}
        </Button>
      </Card>
    </div>
  )
}
