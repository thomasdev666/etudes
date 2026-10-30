// Création d'un document par l'assistant : une note vide, puis la tâche IA qui la remplit.
// Utilisé par la page Assistant et par l'assistant flottant.
import { useJobs } from '@/context/jobs'
import { useSpace } from '@/context/space'
import { estimateSeconds } from './ai'
import { useInvalidate } from './data'
import { must, supabase } from './supabase'

export type AssistantRequest = { subjectId: string | null; courseIds: string[]; noteIds: string[]; instruction: string; title?: string }

export function useCreateAssistantDoc() {
  const { spaceId } = useSpace()
  const { start } = useJobs()
  const invalidate = useInvalidate()
  return async (r: AssistantRequest) => {
    const ask = r.instruction.trim()
    const short = r.title ?? (ask.length > 60 ? ask.slice(0, 57) + '…' : ask)
    const note = must(
      await supabase
        .from('notes')
        .insert({
          space_id: spaceId,
          subject_id: r.subjectId,
          title: r.title ?? `GIRAFA — ${short}`,
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'GIRAFA prépare ce document…' }] }] },
        })
        .select('id')
        .single(),
    ) as { id: string }
    const jobId = await start(
      'assistant',
      { note_id: note.id, course_ids: r.courseIds, note_ids: r.noteIds, instruction: ask },
      { label: r.title ?? `GIRAFA : « ${short} »`, estimateSec: estimateSeconds('assistant', r.courseIds.length + r.noteIds.length), link: `/notes/${note.id}`, linkLabel: 'Ouvrir' },
    )
    await invalidate('notes')
    return { noteId: note.id, jobId }
  }
}
