import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/context/auth'
import { supabase } from './supabase'

export type Plan = 'free' | 'premium'

// Libellés des usages, pour l'affichage
export const KIND_LABEL: Record<string, string> = {
  quiz: 'QCM générés',
  cards: 'Flash cards générées',
  mindmap: 'Cartes mentales',
  sheet: 'Fiches de révision',
  images: 'Cours avec lecture des images',
  exam_section: 'Sections d’entraînement TAGE MAGE / TOEIC',
  exam_full: 'Examens blancs complets',
  transcription: 'Minutes de transcription d’audio',
}

export function usePlan() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['plan', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('current_plan')
      if (error) return 'free' as Plan
      return data as Plan
    },
    staleTime: 60_000,
  })
}

export function useUsage() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['usage', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('usage_summary')
      if (error) throw error
      return data as { kind: string; used: number; max: number }[]
    },
    staleTime: 30_000,
  })
}

// Saisie d'un code d'accès : renvoie la date de fin (null = sans limite)
export function useRedeemCode() {
  const userId = useUserId()
  const qc = useQueryClient()
  return async (code: string) => {
    const { data, error } = await supabase.rpc('redeem_code', { p_code: code })
    if (error) throw new Error(error.message)
    await qc.invalidateQueries({ queryKey: ['plan', userId] })
    await qc.invalidateQueries({ queryKey: ['usage', userId] })
    return data as string | null
  }
}
