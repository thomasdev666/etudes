import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './context/auth'
import { ToastProvider } from './context/toast'
import './index.css'
import { clearOfflineCache, flushReviews, persistOptions } from './lib/offline'
import { supabase } from './lib/supabase'
import { applyTheme } from './lib/theme'

// Vérifie les nouvelles versions au retour dans l'appli et toutes les heures :
// une appli installée reste souvent ouverte en arrière-plan et ne se recharge pas
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => reg.update().catch(() => {})
    setInterval(check, 60 * 60_000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  },
})
applyTheme()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme())

const queryClient = new QueryClient({
  // gcTime long : les données restent disponibles hors ligne après un rechargement
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 7 * 24 * 3600_000, retry: 1, refetchOnWindowFocus: true } },
})

// Révisions faites hors ligne : envoyées au retour du réseau. Cache effacé à la déconnexion.
window.addEventListener('online', async () => {
  if (await flushReviews()) await queryClient.invalidateQueries({ queryKey: ['flashcards'] })
})
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    queryClient.clear()
    clearOfflineCache()
  }
  if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') flushReviews()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
)
