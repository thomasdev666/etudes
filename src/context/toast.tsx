import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; message: string; action?: { label: string; run: () => void }; tone?: 'default' | 'error' }
const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((all) => [...all.slice(-2), { ...t, id }])
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 6000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:top-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`anim-pop pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-lg ${
              t.tone === 'error' ? 'bg-danger text-white dark:text-black' : 'bg-text text-bg'
            }`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => {
                  t.action!.run()
                  setToasts((all) => all.filter((x) => x.id !== t.id))
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
