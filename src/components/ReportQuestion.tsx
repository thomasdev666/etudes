import { Flag } from 'lucide-react'
import { useState } from 'react'
import { Button, cx } from '@/components/ui'
import { supabase } from '@/lib/supabase'

// Signalement d'une question de QCM fausse ou ambiguë
const REASONS = [
  ['wrong_answer', 'La bonne réponse est fausse'],
  ['ambiguous', 'Question ambiguë'],
  ['off_topic', 'Hors du cours'],
  ['too_easy', 'Trop facile'],
  ['other', 'Autre'],
] as const

export function ReportQuestion({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>('wrong_answer')
  const [comment, setComment] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')

  if (state === 'sent') return <p className="mt-3 text-xs text-success">Merci, la question est signalée. Elle ne te sera plus proposée dans les erreurs.</p>

  async function send() {
    setState('busy')
    const { error } = await supabase.from('question_reports').upsert({ question_id: questionId, reason, comment: comment.trim() || null }, { onConflict: 'user_id,question_id' })
    // Une question signalée comme fausse ne doit pas te pénaliser dans la session « Erreurs »
    if (!error && (reason === 'wrong_answer' || reason === 'ambiguous'))
      await supabase.from('error_items').update({ resolved_at: new Date().toISOString() }).eq('question_id', questionId)
    setState(error ? 'error' : 'sent')
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-text hover:underline">
        <Flag className="size-3.5" aria-hidden /> Signaler cette question
      </button>
    )

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
      <p className="text-sm font-medium">Quel est le problème ?</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Problème">
        {REASONS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={reason === k}
            onClick={() => setReason(k)}
            className={cx('rounded-full border px-3 py-1 text-xs font-medium', reason === k ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-muted')}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Précise si tu veux (facultatif)"
        aria-label="Précision"
        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" loading={state === 'busy'} onClick={send}>
          Envoyer
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
      {state === 'error' && <p className="text-xs text-danger">Le signalement n’a pas pu être envoyé. Réessaie dans un instant.</p>}
    </div>
  )
}
