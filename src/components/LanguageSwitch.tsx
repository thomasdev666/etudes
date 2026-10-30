import { getLang, setLang, type Lang } from '@/i18n/lang'
import { cx } from './ui'

// Sélecteur Français / English. Les libellés restent dans leur propre langue.
export function LanguageSwitch({ className }: { className?: string }) {
  const lang = getLang()
  const opts: [Lang, string, string][] = [
    ['fr', 'FR', 'Français'],
    ['en', 'EN', 'English'],
  ]
  return (
    <div role="group" aria-label="Langue / Language" translate="no" className={cx('inline-flex rounded-xl border border-border p-0.5 text-xs font-semibold', className)}>
      {opts.map(([l, short, full]) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          title={full}
          onClick={() => lang !== l && setLang(l)}
          className={cx('rounded-lg px-2 py-1', lang === l ? 'bg-accent text-white' : 'text-muted hover:bg-surface-2')}
        >
          {short}
        </button>
      ))}
    </div>
  )
}
