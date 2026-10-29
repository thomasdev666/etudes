import { Timer } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSpace } from '@/context/space'
import { startQuizSession } from '@/lib/quiz'
import type { Quiz } from '@/lib/types'
import { Button, cx, ErrorBox, Modal } from './ui'

// Temps par question proposés (secondes)
const PACES = [
  { sec: 45, label: 'Rapide' },
  { sec: 60, label: 'Examen' },
  { sec: 90, label: 'Confortable' },
  { sec: 120, label: 'Large' },
]
const minutes = (sec: number) => `${Math.ceil(sec / 60)} min`

export function QuizExamButton({ quiz }: { quiz: Quiz }) {
  const { spaceId } = useSpace()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pace, setPace] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const total = Math.ceil((quiz.question_count * pace) / 60) * 60

  return (
    <>
      <Button variant="secondary" icon={<Timer className="size-4" />} onClick={() => setOpen(true)}>
        Mode examen
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Mode examen"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              icon={<Timer className="size-4" />}
              loading={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  navigate(`/qcm/session/${await startQuizSession(spaceId, quiz, { timeLimitSec: total })}`)
                } catch (e) {
                  setError(e)
                  setBusy(false)
                }
              }}
            >
              Commencer ({minutes(total)})
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {quiz.question_count} questions, un chrono pour l’ensemble. Tu peux passer une question et y revenir ; à la fin du temps, ta copie est rendue automatiquement. La correction
            s’affiche à la fin, comme d’habitude.
          </p>
          <div>
            <p className="mb-2 text-sm font-medium">Temps par question</p>
            <div className="flex flex-wrap gap-1.5">
              {PACES.map((p) => (
                <button
                  key={p.sec}
                  type="button"
                  aria-pressed={pace === p.sec}
                  onClick={() => setPace(p.sec)}
                  className={cx('rounded-full border px-3 py-1 text-sm font-medium', pace === p.sec ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-muted hover:bg-surface-2')}
                >
                  {p.label} · {p.sec < 60 ? `${p.sec} s` : `${p.sec / 60} min`}
                </button>
              ))}
            </div>
          </div>
          <p className="font-display text-2xl font-bold">{minutes(total)} au total</p>
          <ErrorBox error={error} />
        </div>
      </Modal>
    </>
  )
}
