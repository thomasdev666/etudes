import { describe, expect, it } from 'vitest'
import { inline, sheetToDoc } from './sheetDoc'

describe('fiche de révision → note', () => {
  it('gère le gras et les formules dans le texte', () => {
    expect(inline('La **VAN** vaut $\\sum F_t$ ici')).toEqual([
      { type: 'text', text: 'La ' },
      { type: 'text', text: 'VAN', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' vaut ' },
      { type: 'inlineMath', attrs: { latex: '\\sum F_t' } },
      { type: 'text', text: ' ici' },
    ])
  })
  it('construit un document avec sections, formules et liste à cocher', () => {
    const { doc, text } = sheetToDoc({
      intro: 'Intro',
      sections: [{ heading: 'Partie 1', points: ['A', 'B'], subsections: [{ heading: '1.1', points: ['C'] }] }],
      definitions: [{ term: 'BFR', definition: 'Besoin en fonds de roulement' }],
      formulas: [{ name: 'BFR', latex: '$Stocks + Créances - Dettes$', explanation: '' }],
      pitfalls: ['Confondre BFR et trésorerie'],
      checklist: ['Savoir calculer le BFR'],
    })
    const types = doc.content!.map((n) => n.type)
    expect(types).toContain('blockMath')
    expect(types.at(-1)).toBe('taskList')
    expect(doc.content!.find((n) => n.type === 'blockMath')!.attrs!.latex).toBe('Stocks + Créances - Dettes')
    expect(text).toContain('BFR : Besoin en fonds de roulement')
  })
})

describe('document de l’assistant', () => {
  it('convertit sections, points et formules en note éditable', async () => {
    const { customToDoc } = await import('./sheetDoc')
    const { doc, text } = customToDoc({
      title: 'Formules d’analyse financière',
      intro: 'Toutes les formules des chapitres 1 à 3.',
      sections: [{ heading: 'Rentabilité', points: ['Le **ROE** mesure la rentabilité des capitaux propres'], formulas: [{ name: 'ROE', latex: '$\\frac{RN}{CP}$', explanation: 'RN : résultat net, CP : capitaux propres' }] }],
    })
    const types = (doc.content ?? []).map((n) => n.type)
    expect(types).toEqual(['paragraph', 'heading', 'bulletList', 'paragraph', 'blockMath', 'paragraph'])
    expect((doc.content ?? [])[4].attrs?.latex).toBe('\\frac{RN}{CP}')
    expect(text).toContain('Le ROE mesure')
    expect(text).not.toContain('**')
  })
})
