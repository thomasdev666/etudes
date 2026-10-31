// Partage par lien en lecture seule (notes et fiches, cartes mentales, paquets de flash cards, QCM)
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSpace } from '@/context/space'
import { must, supabase } from './supabase'

export type ShareKind = 'note' | 'mindmap' | 'deck' | 'quiz'
export type Share = { id: string; token: string; views: number; created_at: string }

export const shareUrl = (token: string) => `${window.location.origin}/partage/${token}`

export function useShare(kind: ShareKind, targetId: string) {
  const { spaceId } = useSpace()
  const qc = useQueryClient()
  const key = ['shares', kind, targetId]
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('shares').select('id, token, views, created_at').eq('kind', kind).eq('target_id', targetId).is('revoked_at', null).maybeSingle()
      if (error) throw error
      return data as Share | null
    },
  })
  const create = async () => {
    const res = await supabase.from('shares').insert({ space_id: spaceId, kind, target_id: targetId }).select('id, token, views, created_at').single()
    if (res.error && /shares_kind_check/.test(res.error.message)) throw new Error('Le partage des QCM demande la mise à jour 0019_share_quiz.sql dans Supabase.')
    const row = must(res) as Share
    qc.setQueryData(key, row)
    return row
  }
  const revoke = async () => {
    if (!query.data) return
    must(await supabase.from('shares').update({ revoked_at: new Date().toISOString() }).eq('id', query.data.id))
    qc.setQueryData(key, null)
  }
  return { share: query.data ?? null, loading: query.isLoading, error: query.error, create, revoke }
}

export type SharedContent = {
  kind: ShareKind
  title: string
  subject: string | null
  updated_at: string
  content?: unknown
  cards?: { front: string; back: string }[]
  questions?: SharedQuestion[]
}

export type SharedQuestion = { question: string; choices: string[]; correct_index: number; explanation: string; notion: string }

export async function fetchShare(token: string) {
  const { data, error } = await supabase.rpc('get_share', { p_token: token })
  if (error) throw new Error('Ce lien est indisponible pour le moment.')
  return data as SharedContent | null
}
