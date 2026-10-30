import { SITE } from '@/config/site'
import { cx } from './ui'

// « Site réalisé par … » en bas des pages publiques et des paramètres
export function MadeBy({ className }: { className?: string }) {
  const { name, url } = SITE.madeBy
  return (
    <span className={cx('text-xs text-muted', className)}>
      Site réalisé par{' '}
      <a href={url} target="_blank" rel="noopener" className="font-medium text-text underline-offset-2 hover:underline" translate="no">
        {name}
      </a>
    </span>
  )
}
