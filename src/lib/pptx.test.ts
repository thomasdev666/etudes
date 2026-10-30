import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import { paragraphText } from './pptx'

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const para = (runs: [string, boolean][]) =>
  new DOMParser().parseFromString(
    `<a:p xmlns:a="${A}">${runs.map(([t, b]) => `<a:r><a:rPr${b ? ' b="1"' : ''}/><a:t xml:space="preserve">${t}</a:t></a:r>`).join('')}</a:p>`,
    'application/xml',
  ).documentElement as unknown as Element

describe('paragraphText', () => {
  it('marque les mots en gras', () => {
    expect(paragraphText(para([['Le ', false], ['BFR ', true], ['augmente', false]]))).toBe('Le **BFR** augmente')
  })
  it('laisse un titre entièrement en gras sans marque', () => {
    expect(paragraphText(para([['Chapitre 1', true]]))).toBe('Chapitre 1')
  })
})
