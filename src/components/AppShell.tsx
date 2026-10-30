import { AssistantWidget } from '@/components/AssistantWidget'
import { Logo } from '@/components/Logo'
import { BarChart3, BookOpen, GraduationCap, Brain, CalendarDays, ChevronDown, Home, NotebookPen, Search, Settings, Sparkles, Trash2 } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useSpace } from '@/context/space'
import { useGirafaHidden } from '@/lib/assistantPref'
import { cx, Spinner } from './ui'

const NAV = [
  { to: '/', label: 'Accueil', icon: Home, end: true, tour: 'nav-accueil' },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays, tour: 'nav-agenda' },
  { to: '/reviser', label: 'Réviser', icon: Brain, tour: 'nav-reviser' },
  { to: '/matieres', label: 'Matières', icon: BookOpen, tour: 'nav-matieres' },
  { to: '/notes', label: 'Notes', icon: NotebookPen, tour: 'nav-notes' },
]

function SpaceSwitcher() {
  const { spaces, space, setSpaceId } = useSpace()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const active = spaces.filter((s) => !s.archived_at)
  const box = useRef<HTMLDivElement>(null)
  // Fermer le menu au clic à côté ou avec Échap
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={box} className="relative" data-tour="space">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent font-display text-sm font-bold text-white">
          {space?.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">Espace</span>
          <span className="block truncate font-semibold" translate="no">{space?.name}</span>
        </span>
        <ChevronDown className="size-4 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="anim-pop absolute left-0 right-0 z-30 mt-1 rounded-2xl border border-border bg-surface p-1 shadow-lg">
          {active.map((s) => (
            <button
              key={s.id}
              role="menuitemradio"
              aria-checked={s.id === space?.id}
              type="button"
              onClick={() => {
                setOpen(false)
                if (s.id !== space?.id) {
                  setSpaceId(s.id)
                  navigate('/')
                }
              }}
              className={cx('block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2', s.id === space?.id && 'font-semibold text-accent-ink')}
            >
              {s.name}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              navigate('/parametres#espaces')
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-surface-2"
          >
            Gérer les espaces…
          </button>
        </div>
      )}
    </div>
  )
}

// Ctrl+K (ou ⌘K), ou « / » hors d'un champ de saisie : ouvre la recherche
function useSearchShortcut() {
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault()
        navigate('/recherche')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
}

export function AppShell() {
  useSearchShortcut()
  const girafaHidden = useGirafaHidden()
  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-2">
        Aller au contenu
      </a>

      {/* Menu latéral (ordinateur) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 border-r border-border bg-surface px-3 py-4 lg:flex">
        <div className="px-2 text-text">
          <Logo withBaseline={false} className="h-9 w-auto" />
        </div>
        <SpaceSwitcher />
        <Link
          to="/recherche"
          data-tour="nav-search"
          className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-muted hover:border-accent"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1">Rechercher</span>
          <kbd className="rounded-md border border-border px-1.5 text-[11px]">Ctrl K</kbd>
        </Link>
        <nav aria-label="Navigation principale" className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end, tour }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-tour={tour}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors',
                  isActive ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-surface-2 hover:text-text',
                )
              }
            >
              <Icon className="size-5" strokeWidth={2.2} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <NavLink to="/assistant" data-tour="nav-assistant" className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', isActive ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2')}>
            <Sparkles className="size-4" aria-hidden /> <span translate="no">GIRAFA</span>
          </NavLink>
          <NavLink to="/entrainements" data-tour="nav-exams" className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', isActive ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2')}>
            <GraduationCap className="size-4" aria-hidden /> TAGE MAGE · TOEIC
          </NavLink>
          <NavLink to="/statistiques" data-tour="nav-stats" className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', isActive ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2')}>
            <BarChart3 className="size-4" aria-hidden /> Statistiques
          </NavLink>
          <NavLink to="/corbeille" className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', isActive ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2')}>
            <Trash2 className="size-4" aria-hidden /> Corbeille
          </NavLink>
          <NavLink to="/parametres" data-tour="nav-settings" className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', isActive ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2')}>
            <Settings className="size-4" aria-hidden /> Paramètres
          </NavLink>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* En-tête mobile */}
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-bg/90 px-3 py-2 backdrop-blur lg:hidden" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
          <div className="min-w-0 flex-1">
            <SpaceSwitcher />
          </div>
          {girafaHidden && (
            <NavLink to="/assistant" aria-label="GIRAFA" className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
              <Sparkles className="size-5" aria-hidden />
            </NavLink>
          )}
          <NavLink to="/recherche" aria-label="Rechercher" data-tour="nav-search" className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
            <Search className="size-5" aria-hidden />
          </NavLink>
          <NavLink to="/statistiques" aria-label="Statistiques" data-tour="nav-stats" className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
            <BarChart3 className="size-5" aria-hidden />
          </NavLink>
          <NavLink to="/parametres" aria-label="Paramètres" data-tour="nav-settings" className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
            <Settings className="size-5" aria-hidden />
          </NavLink>
        </header>

        <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-44 pt-5 sm:px-6 lg:pb-24 lg:pt-8">
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <AssistantWidget />

      {/* Barre inférieure (mobile), utilisable au pouce */}
      <nav aria-label="Navigation principale" className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end, tour }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-tour={tour}
              className={({ isActive }) =>
                cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-accent-ink' : 'text-muted')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-accent-soft')}>
                    <Icon className="size-5" strokeWidth={2.2} aria-hidden />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
