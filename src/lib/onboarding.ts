import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/context/auth'
import { useImportedEvents } from './calendar'
import { useSubjects } from './data'
import { supabase } from './supabase'

// Configuration de départ (assistant), puis présentations en bulles au fil de l'appli
export type SetupStep = 'agenda' | 'matieres' | 'examens'
export type TourId = 'main' | 'subject' | 'mindmap' | 'note'

type Progress = {
  confirmed?: Partial<Record<string, boolean>>
  skipped?: Partial<Record<string, boolean>>
  tours?: Partial<Record<TourId, boolean>>
}

export const SETUP_ORDER: SetupStep[] = ['agenda', 'matieres', 'examens']

export function useOnboarding() {
  const userId = useUserId()
  const qc = useQueryClient()
  const settings = useQuery({
    queryKey: ['user_settings', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_settings').select('onboarding').maybeSingle()
      if (error) throw error
      return (data?.onboarding ?? {}) as Progress
    },
    retry: false,
    staleTime: Infinity,
  })
  const subjects = useSubjects()
  const imported = useImportedEvents()

  const p = settings.data ?? {}
  const ok = (id: string) => !!p.confirmed?.[id] || !!p.skipped?.[id]
  const done: Record<SetupStep, boolean> = {
    agenda: (imported.data?.length ?? 0) > 0 || ok('agenda'),
    matieres: (subjects.data?.length ?? 0) > 0 && ok('matieres'),
    examens: ok('examens'),
  }

  async function save(next: Progress) {
    qc.setQueryData(['user_settings', userId], next)
    await supabase.from('user_settings').upsert({ user_id: userId, onboarding: next })
  }

  return {
    done,
    // Si la table n'existe pas encore (migration non lancée), on ne bloque rien
    available: !settings.isError,
    loading: settings.isLoading || subjects.isLoading || imported.isLoading,
    setupDone: settings.isError || SETUP_ORDER.every((s) => done[s]),
    tourSeen: (id: TourId) => settings.isError || settings.isLoading || !!p.tours?.[id],
    confirm: (id: SetupStep) => save({ ...p, confirmed: { ...p.confirmed, [id]: true } }),
    skip: (id: SetupStep) => save({ ...p, skipped: { ...p.skipped, [id]: true } }),
    markTour: (id: TourId) => save({ ...p, tours: { ...p.tours, [id]: true } }),
    resetTours: () => save({ ...p, tours: {} }),
  }
}
