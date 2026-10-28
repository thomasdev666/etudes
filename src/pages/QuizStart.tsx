import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorBox, Spinner } from '@/components/ui'
import { useSpace } from '@/context/space'
import { startQuizSession } from '@/lib/quiz'
import { must, supabase } from '@/lib/supabase'
import type { Quiz } from '@/lib/types'

// Lien « Commencer » : crée une session pour ce QCM puis l'ouvre
export default function QuizStart() {
  const { id = '' } = useParams()
  const { spaceId } = useSpace()
  const navigate = useNavigate()
  const [error, setError] = useState<unknown>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        const quiz = must(await supabase.from('quizzes').select('*').eq('id', id).single()) as Quiz
        if (quiz.status !== 'ready') throw new Error(quiz.status === 'error' ? `La génération a échoué : ${quiz.error}` : 'Ce QCM est encore en cours de génération.')
        navigate(`/qcm/session/${await startQuizSession(spaceId, quiz)}`, { replace: true })
      } catch (e) {
        setError(e)
      }
    })()
  }, [id, spaceId, navigate])

  return error ? (
    <div className="mx-auto max-w-md p-6">
      <ErrorBox error={error} />
    </div>
  ) : (
    <Spinner label="Préparation du QCM" />
  )
}
