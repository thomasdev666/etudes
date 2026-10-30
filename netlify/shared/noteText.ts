// Texte d'une note (format de l'éditeur) pour l'IA : titres en « # », gras entre ** **,
// formules en $…$. Le gras signale ce que l'étudiant juge important.
type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string }[]; content?: Node[] }


function inline(n: Node): string {
  if (n.type === 'text') {
    const t = n.text ?? ''
    return n.marks?.some((m) => m.type === 'bold') && t.trim() ? `**${t.trim()}**${/\s$/.test(t) ? ' ' : ''}` : t
  }
  if (n.type === 'inlineMath') return `$${String(n.attrs?.latex ?? '')}$`
  if (n.type === 'hardBreak') return '\n'
  return (n.content ?? []).map(inline).join('')
}

export function noteToText(doc: unknown): string {
  const lines: string[] = []
  const walk = (n: Node) => {
    if (n.type === 'heading') lines.push(`${'#'.repeat(Number(n.attrs?.level ?? 2))} ${inline(n).replace(/\*\*/g, '')}`)
    else if (n.type === 'paragraph') lines.push(inline(n))
    else if (n.type === 'blockMath') lines.push(`$$${String(n.attrs?.latex ?? '')}$$`)
    else if (n.type === 'tableRow') lines.push((n.content ?? []).map((c) => inline(c).trim()).join(' | '))
    else if (n.type === 'listItem') {
      const [first, ...rest] = n.content ?? []
      lines.push(`- ${first ? inline(first) : ''}`)
      rest.forEach(walk)
    } else (n.content ?? []).forEach(walk)
  }
  walk((doc ?? {}) as Node)
  return lines.filter((l) => l.trim()).join('\n')
}
