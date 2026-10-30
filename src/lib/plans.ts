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
  chat: 'Questions à GIRAFA',
}

export type Usage = { kind: string; used: number; max: number; next_free_at: string | null }
export type PlanDetails = {
  plan: Plan
  source: 'none' | 'code' | 'stripe' | 'trial'
  period_end: string | null
  welcome_until: string | null
  trial_available: boolean
  billing_period: 'monthly' | 'semester' | 'annual' | null
}

// Offre, source (code, essai, paiement), fin de période et disponibilité de l'essai
export function usePlanDetails() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['plan_details', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('plan_details')
      if (error) return null
      return ((data as PlanDetails[])[0] ?? null) as PlanDetails | null
    },
    staleTime: 60_000,
  })
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
      return data as Usage[]
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
    await refreshPlan(qc, userId)
    return data as string | null
  }
}

async function refreshPlan(qc: ReturnType<typeof useQueryClient>, userId: string | undefined) {
  for (const key of ['plan', 'plan_details', 'usage']) await qc.invalidateQueries({ queryKey: [key, userId] })
}

// Essai Premium de 7 jours : renvoie la date de fin
export function useStartTrial() {
  const userId = useUserId()
  const qc = useQueryClient()
  return async () => {
    const { data, error } = await supabase.rpc('start_trial')
    if (error) throw new Error(error.message)
    await refreshPlan(qc, userId)
    return data as string
  }
}
