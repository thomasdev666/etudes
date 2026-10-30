import { describe, expect, it } from 'vitest'
import { sanitizeDoc } from './shareSanitize'

describe('partage : nettoyage des notes', () => {
  it('retire images et liens dangereux, garde les liens web', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'storage://a.png' } },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'piège', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
            { type: 'text', text: 'fichier', marks: [{ type: 'link', attrs: { href: 'storage://x.pdf' } }, { type: 'bold' }] },
            { type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://exemple.fr' } }] },
          ],
        },
      ],
    }
    const out = sanitizeDoc(doc)!
    expect(out.content).toHaveLength(1)
    const [a, b, c] = out.content![0].content!
    expect(a.marks).toEqual([])
    expect(b.marks).toEqual([{ type: 'bold' }])
    expect(c.marks![0].attrs!.href).toBe('https://exemple.fr')
  })
})
