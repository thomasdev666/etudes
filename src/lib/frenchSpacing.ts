// Typographie française : « mot : » ne passe jamais à la ligne avant le « : » (idem ; ! ? » % et après «).
// Les espaces normaux deviennent insécables ; les formules et le code ne sont pas touchés.
import type { JSONContent } from '@tiptap/core'

export const fixFrenchSpacing = (t: string) => t.replace(/ ([:;!?»%])/g, '\u00a0$1').replace(/« /g, '«\u00a0')

export function frenchSpacingDoc(node: JSONContent): JSONContent {
  if (node.type === 'codeBlock') return node
  if (node.type === 'text' && node.text && !node.marks?.some((m) => m.type === 'code')) {
    const text = fixFrenchSpacing(node.text)
    return text === node.text ? node : { ...node, text }
  }
  if (!node.content) return node
  return { ...node, content: node.content.map(frenchSpacingDoc) }
}
