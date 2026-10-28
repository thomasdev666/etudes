import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/context/auth'
import { useSpace } from '@/context/space'
import {
  useAssignments,
  useCalendarLinks,
  useCourses,
  useNoteOutputs,
  useNotesList,
  usePlans,
  useQuizzes,
  useSubjects,
} from './data'
import { supabase } from './supabase'

export type StepId =
  | 'espace'
  | 'matieres'
  | 'agenda'
  | 'examens'
  | 'cours'
  | 'qcm'
  | 'cartes'
  | 'mentale'
  | 'notes'
  | 'devoir'
  | 'plan'
  | 'installer'

export type Step = {
  id: StepId
  title: string
  why: string
  setup: boolean // étape de configuration, à faire avant de commencer
  optional: boolean // peut être faite « plus tard »
  done: boolean
}

type Progress = { confirmed?: Partial<Record<StepId, boolean>>; skipped?: Partial<Record<StepId, boolean>>; hidden?: boolean }

const STEPS: Omit<Step, 'done'>[] = [
  { id: 'espace', title: 'Ton espace', why: 'Un espace par école (TBS, puis Hull…). Les données de chaque espace restent séparées.', setup: true, optional: false },
  { id: 'matieres', title: 'Toutes tes matières', why: 'Chaque matière regroupe cours, notes, QCM, flash cards et cartes mentales, avec sa couleur.', setup: true, optional: false },
  { id: 'agenda', title: 'Ton agenda Outlook', why: 'Tes cours apparaissent dans l’agenda avec la couleur de leur matière, et la planification tient compte de tes journées chargées.', setup: true, optional: true },
  { id: 'examens', title: 'Tes dates d’examen', why: 'Un compte à rebours par matière, et les révisions des examens proches passent en premier.', setup: true, optional: true },
  { id: 'cours', title: 'Importer un cours', why: 'PowerPoint ou PDF : le texte, les formules et les schémas sont lus pour créer tes outils de révision.', setup: false, optional: false },
  { id: 'qcm', title: 'Générer un QCM', why: 'Des questions comme à l’examen, corrigées à la fin avec les explications. Les erreurs reviennent jusqu’à ce que tu les maîtrises.', setup: false, optional: false },
  { id: 'cartes', title: 'Réviser des flash cards', why: 'La répétition espacée te repropose chaque carte juste avant que tu l’oublies : c’est la méthode la plus efficace pour retenir.', setup: false, optional: false },
  { id: 'mentale', title: 'Créer une carte mentale', why: 'Une vue d’ensemble structurée d’un chapitre, que tu peux compléter à ta façon.', setup: false, optional: false },
  { id: 'notes', title: 'Prendre une note', why: 'Titres, tableaux, formules, images : tout est rangé par matière et exportable en PDF ou Word.', setup: false, optional: false },
  { id: 'devoir', title: 'Ajouter un devoir', why: 'Échéances avec compte à rebours, et découpage automatique du travail en séances (que tu valides).', setup: false, optional: false },
  { id: 'plan', title: 'Faire un plan de révision', why: 'Une checklist par matière (chapitres, TD, annales) avec ta progression en pourcentage.', setup: false, optional: true },
  { id: 'installer', title: 'Installer l’appli', why: 'Ajoute le site à ton écran d’accueil pour l’ouvrir comme une application.', setup: false, optional: true },
]

export function useOnboarding() {
  const userId = useUserId()
  const { spaceId } = useSpace()
  const qc = useQueryClient()
  const settings = useQuery({
    queryKey: ['user_settings', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_settings').select('onboarding').maybeSingle()
      if (error) throw error
      return (data?.onboarding ?? {}) as Progress
    },
    retry: false,
  })
  const reviews = useQuery({
    queryKey: ['flashcard_reviews', spaceId, 'count'],
    queryFn: async () => (await supabase.from('flashcard_reviews').select('id', { count: 'exact', head: true }).eq('space_id', spaceId)).count ?? 0,
  })
  const subjects = useSubjects()
  const links = useCalendarLinks()
  const courses = useCourses()
  const quizzes = useQuizzes()
  const maps = useNoteOutputs()
  const notes = useNotesList()
  const assignments = useAssignments()
  const plans = usePlans()

  const p = settings.data ?? {}
  const ok = (id: StepId) => !!p.confirmed?.[id] || !!p.skipped?.[id]
  const n = (x: { data?: unknown[] }) => x.data?.length ?? 0

  const doneBy: Record<StepId, boolean> = {
    espace: true,
    matieres: n(subjects) > 0 && ok('matieres'),
    agenda: n(links) > 0 || ok('agenda'),
    examens: (subjects.data ?? []).some((s) => s.exam_date) || ok('examens'),
    cours: n(courses) > 0 || ok('cours'),
    qcm: n(quizzes) > 0 || ok('qcm'),
    cartes: (reviews.data ?? 0) > 0 || ok('cartes'),
    mentale: n(maps) > 0 || ok('mentale'),
    notes: n(notes) > 0 || ok('notes'),
    devoir: n(assignments) > 0 || ok('devoir'),
    plan: n(plans) > 0 || ok('plan'),
    installer: ok('installer') || matchMedia('(display-mode: standalone)').matches,
  }
  const steps: Step[] = STEPS.map((s) => ({ ...s, done: doneBy[s.id] }))
  const done = steps.filter((s) => s.done).length
  const loading = settings.isLoading || subjects.isLoading || links.isLoading

  async function save(next: Progress) {
    qc.setQueryData(['user_settings', userId], next)
    await supabase.from('user_settings').upsert({ user_id: userId, onboarding: next })
  }

  return {
    steps,
    current: steps.find((s) => !s.done) ?? null,
    percent: Math.round((done / steps.length) * 100),
    // Si la table n'existe pas encore (migration non lancée), on ne bloque rien
    available: !settings.isError,
    loading,
    setupDone: settings.isError || steps.filter((s) => s.setup).every((s) => s.done),
    allDone: done === steps.length,
    hidden: !!p.hidden,
    confirm: (id: StepId) => save({ ...p, confirmed: { ...p.confirmed, [id]: true } }),
    skip: (id: StepId) => save({ ...p, skipped: { ...p.skipped, [id]: true } }),
    setHidden: (hidden: boolean) => save({ ...p, hidden }),
  }
}
