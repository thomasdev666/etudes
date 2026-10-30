import { Loader2, X } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { readableOn, tint } from '@/lib/colors'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover shadow-card',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-2',
  ghost: 'text-text hover:bg-surface-2',
  danger: 'border border-border bg-surface text-danger hover:bg-danger-soft',
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
  const sizes = { sm: 'h-9 px-3 text-sm gap-1.5', md: 'h-11 px-4 gap-2', lg: 'h-13 px-6 text-lg gap-2' }
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-2xl font-medium transition-[background,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-text', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card sm:p-5', className)} {...rest}>
      {children}
    </div>
  )
}

export function Field({ label, hint, children, id }: { label: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-text placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(inputClass, className)} {...rest} />
})

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputClass, 'min-h-24', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputClass, 'appearance-auto', className)} {...rest}>
      {children}
    </select>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'm-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/40 sm:m-auto sm:rounded-3xl',
        wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
      )}
    >
      {open && (
        <div className="anim-pop flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <IconButton label="Fermer" onClick={onClose}>
              <X className="size-5" />
            </IconButton>
          </div>
          <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

export function ProgressBar({ value, color, label }: { value: number; color?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: color ?? 'var(--accent)' }}
      />
    </div>
  )
}

export function Spinner({ label = 'Chargement' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-display font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
      {action}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
      {msg}
    </div>
  )
}

export function SubjectDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cx('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ background: color }} />
}

export function SubjectChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: tint(color, 0.16) }}
    >
      <SubjectDot color={color} />
      <span className="truncate" translate="no">{name}</span>
    </span>
  )
}

export function SubjectBlock({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  return (
    <div className={className} style={{ background: color, color: readableOn(color) }}>
      {children}
    </div>
  )
}

export function Badge({ tone = 'muted', children }: { tone?: 'muted' | 'accent' | 'success' | 'danger' | 'warning'; children: ReactNode }) {
  const tones = {
    muted: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent-ink',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
    warning: 'bg-warning-soft text-warning',
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1 text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: string; count?: number }[]
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors',
            value === it.value ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
          )}
        >
          {it.label}
          {it.count !== undefined && it.count > 0 && (
            <span className="rounded-full bg-accent-soft px-1.5 text-xs text-accent-ink">{it.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

export function Checkbox({ checked, onChange, label, color }: { checked: boolean; onChange: (v: boolean) => void; label: string; color?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex size-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-200',
        checked ? 'scale-100 border-transparent' : 'border-border hover:border-accent',
      )}
      style={checked ? { background: color ?? 'var(--accent)' } : undefined}
    >
      {checked && (
        <svg viewBox="0 0 16 16" className="anim-pop size-3.5" fill="none" stroke={color ? readableOn(color) : '#fff'} strokeWidth={2.5} aria-hidden>
          <path d="M3 8.5l3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
