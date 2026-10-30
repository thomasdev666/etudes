import katex from 'katex'
import { useMemo } from 'react'

// Texte avec formules $...$ rendues par KaTeX (le reste est échappé).
// Comme en Markdown, une formule ne commence ni ne finit par une espace : « 12 $ et 15 $ » reste du texte.
const MATH = /(\$(?=\S)[^$\n]*?\S\$(?!\d)|\$[^\s$]\$)/g

export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    return text
      .split(MATH)
      .map((part, i) =>
        i % 2 === 1
          ? katex.renderToString(part.slice(1, -1), { throwOnError: false })
          : esc(part),
      )
      .join('')
  }, [text])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
