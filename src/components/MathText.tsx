import katex from 'katex'
import { useMemo } from 'react'

// Texte avec formules $...$ rendues par KaTeX (le reste est échappé)
export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    return text
      .split(/(\$[^$]+\$)/g)
      .map((part) =>
        part.startsWith('$') && part.endsWith('$') && part.length > 2
          ? katex.renderToString(part.slice(1, -1), { throwOnError: false })
          : esc(part),
      )
      .join('')
  }, [text])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
