import { describe, expect, it } from 'vitest'
import { fixFrenchSpacing, frenchSpacingDoc } from './frenchSpacing'

describe('espaces insécables', () => {
  it('colle la ponctuation haute au mot précédent', () => {
    expect(fixFrenchSpacing('BFR : besoin ; « oui » ! 5 %')).toBe('BFR\u00a0: besoin\u00a0; «\u00a0oui\u00a0»\u00a0! 5\u00a0%')
  })
  it('ne touche ni au code ni aux formules', () => {
    const doc = { type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'a : b' }] }, { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: 'a : b' } }, { type: 'text', text: 'x : y' }] }] }
    const out = frenchSpacingDoc(doc)
    expect(out.content![0].content![0].text).toBe('a : b')
    expect(out.content![1].content![0].attrs!.latex).toBe('a : b')
    expect(out.content![1].content![1].text).toBe('x\u00a0: y')
  })
})
