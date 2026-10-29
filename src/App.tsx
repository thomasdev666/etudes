import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RecorderBar } from './components/Recording'
import { RecorderProvider } from './context/recorder'
import { Spinner } from './components/ui'
import { useAuth } from './context/auth'
import { JobsProvider } from './context/jobs'
import { SpaceProvider, useSpace } from './context/space'
import { configMissing } from './lib/supabase'
import { AuthPage, UpdatePasswordPage } from './pages/Auth'
import { HomePage } from './pages/Home'
import { Onboarding } from './pages/Onboarding'

const AgendaPage = lazy(() => import('./pages/Agenda'))
const SearchPage = lazy(() => import('./pages/Search'))
const StatsPage = lazy(() => import('./pages/Stats'))
const ExamsPage = lazy(() => import('./pages/Exams'))
const PlannerPage = lazy(() => import('./pages/Planner'))
const ExamRunPage = lazy(() => import('./pages/ExamRun'))
const SubjectsPage = lazy(() => import('./pages/Subjects'))
const SubjectPage = lazy(() => import('./pages/Subject'))
const CoursePage = lazy(() => import('./pages/Course'))
const ReviewPage = lazy(() => import('./pages/Review'))
const FlashcardSession = lazy(() => import('./pages/FlashcardSession'))
const QuizNewPage = lazy(() => import('./pages/QuizNew'))
const QuizSessionPage = lazy(() => import('./pages/QuizSession'))
const NotesPage = lazy(() => import('./pages/Notes'))
const NoteEditorPage = lazy(() => import('./pages/NoteEditor'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const TrashPage = lazy(() => import('./pages/Trash'))
const MindmapPage = lazy(() => import('./pages/Mindmap'))
const QuizStart = lazy(() => import('./pages/QuizStart'))
const GuidePage = lazy(() => import('./pages/Guide'))

export default function App() {
  const { session, loading, recovery } = useAuth()

  if (configMissing) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold">Configuration manquante</h1>
        <p className="mt-2 text-muted">Renseigne VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.</p>
      </div>
    )
  }
  if (loading) return <Spinner />
  if (recovery) return <UpdatePasswordPage />
  if (!session) return <AuthPage />

  return (
    <SpaceProvider>
      <SpaceGate />
    </SpaceProvider>
  )
}

function SpaceGate() {
  const { space, loading } = useSpace()
  if (loading) return <Spinner />
  if (!space) return <Onboarding />

  return (
    <JobsProvider>
    <RecorderProvider>
    <Suspense fallback={<Spinner />}>
      <Routes>
        {/* Sessions de révision en mode focus, sans navigation */}
        <Route path="/reviser/cartes" element={<FlashcardSession />} />
        <Route path="/qcm/session/:id" element={<QuizSessionPage />} />
        <Route path="/entrainements/:id" element={<ExamRunPage />} />
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/matieres" element={<SubjectsPage />} />
          <Route path="/matieres/:id" element={<SubjectPage />} />
          <Route path="/cours/:id" element={<CoursePage />} />
          <Route path="/reviser" element={<ReviewPage />} />
          <Route path="/qcm/nouveau" element={<QuizNewPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/notes/:id" element={<NoteEditorPage />} />
          <Route path="/parametres" element={<SettingsPage />} />
          <Route path="/corbeille" element={<TrashPage />} />
          <Route path="/recherche" element={<SearchPage />} />
          <Route path="/statistiques" element={<StatsPage />} />
          <Route path="/entrainements" element={<ExamsPage />} />
          <Route path="/planification" element={<PlannerPage />} />
          <Route path="/cartes-mentales/:id" element={<MindmapPage />} />
          <Route path="/qcm/demarrer/:id" element={<QuizStart />} />
          <Route path="/bienvenue" element={<GuidePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
    {/* Voyant d'enregistrement visible partout, même en mode focus */}
    <RecorderBar />
    </RecorderProvider>
    </JobsProvider>
  )
}
