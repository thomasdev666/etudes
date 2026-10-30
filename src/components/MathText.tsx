import katex from 'katex'
import { useMemo } from 'react'

// Texte avec formules $...$ rendues par KaTeX (le reste est échappé).
// Comme en Markdown, une formule ne commence ni ne finit par une espace : « 12 $ et 15 $ » reste du texte.
const MATH = /(\$(?=\S)[^$\n]*?\S\$(?!\d)|\$[^\s$]\$)/g

export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    const parts = text.split(MATH)
    // La ponctuation qui suit une formule reste collée à elle (pas de « . » seul en début de ligne)
    return parts
      .map((part, i) => {
        if (i % 2 === 0) return esc(i > 0 ? part.replace(/^[.,;:!?)»]+/, '') : part)
        const punct = parts[i + 1]?.match(/^[.,;:!?)»]+/)?.[0] ?? ''
        const math = katex.renderToString(part.slice(1, -1), { throwOnError: false })
        return punct ? `<span style="white-space:nowrap">${math}${esc(punct)}</span>` : math
      })
      .join('')
  }, [text])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
