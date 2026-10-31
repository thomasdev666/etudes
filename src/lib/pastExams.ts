// Anciens partiels d'une matière : modèles de style pour les QCM et les documents de GIRAFA
import { useQuery } from '@tanstack/react-query'
import { useSpace } from '@/context/space'
import { must, supabase } from './supabase'

export type PastExam = {
  id: string
  space_id: string
  subject_id: string
  title: string
  session: string
  file_path: string | null
  file_name: string | null
  created_at: string
}

export const PAST_EXAMS_MIGRATION = 'Les anciens partiels demandent la mise à jour 0020_past_exams.sql dans Supabase.'
const missingTable = (message: string) => /past_exams/.test(message) && /(does not exist|schema cache|not find)/i.test(message)

// null : la mise à jour n'a pas encore été lancée (la table n'existe pas)
export function usePastExams() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: ['past_exams', spaceId],
    enabled: !!spaceId,
    queryFn: async () => {
      const res = await supabase
        .from('past_exams')
        .select('id, space_id, subject_id, title, session, file_path, file_name, created_at')
        .eq('space_id', spaceId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (res.error && missingTable(res.error.message)) return null
      return must(res) as PastExam[]
    },
  })
}

export async function pastExamContent(id: string) {
  const row = must(await supabase.from('past_exams').select('content').eq('id', id).single()) as { content: string }
  return row.content
}

// Texte d'un sujet : PDF, PowerPoint, Word ou texte. Les images ne sont pas lues (sujet = surtout du texte).
export async function extractExamText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const { extractPdf } = await import('./pdf')
    return (await extractPdf(file)).text.replace(/\[\[image:\d+\]\]/g, '').trim()
  }
  if (name.endsWith('.pptx')) {
    const { extractPptx } = await import('./pptx')
    return (await extractPptx(file)).text.replace(/\[\[image:\d+\]\]/g, '').trim()
  }
  if (name.endsWith('.docx')) {
    const { fileToNote } = await import('./importNote')
    return (await fileToNote(file)).content_text.trim()
  }
  if (name.endsWith('.ppt') || name.endsWith('.doc')) throw new Error('Ancien format Office : enregistre le fichier en .pptx / .docx, ou exporte-le en PDF.')
  return (await file.text()).trim()
}

// Un PDF scanné (photo des pages) ne contient presque pas de texte
export const looksScanned = (text: string) => text.replace(/\s+/g, '').length < 200
