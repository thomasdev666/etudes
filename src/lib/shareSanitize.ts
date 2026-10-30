// Nettoyage d'un document de note avant affichage public : pas d'images ni de pièces
// jointes (stockage privé), et seulement des liens http(s).
import type { JSONContent } from '@tiptap/core'

export function sanitizeDoc(node: JSONContent): JSONContent | null {
  if (node.type === 'image') return null
  const out: JSONContent = { ...node }
  if (node.marks)
    out.marks = node.marks.filter((m) => m.type !== 'link' || /^https?:\/\//i.test(String(m.attrs?.href ?? '')))
  if (node.content) out.content = node.content.map(sanitizeDoc).filter((n): n is JSONContent => !!n)
  return out
}
