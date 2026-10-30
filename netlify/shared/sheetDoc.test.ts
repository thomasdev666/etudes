import { describe, expect, it } from 'vitest'
import { inline, sheetToDoc } from './sheetDoc'

describe('fiche de révision → note', () => {
  it('garde la ponctuation sur la même ligne que le mot (espace insécable), sauf dans les formules', () => {
    const out = inline('**BFR** : besoin ; voir $a : b$ !')
    expect(out[1].text).toBe('\u00a0: besoin\u00a0; voir ')
    expect(out[2]).toEqual({ type: 'inlineMath', attrs: { latex: 'a : b' } })
    expect(out[3].text).toBe('\u00a0!')
  })
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

describe('illustrations des fiches', () => {
  it('schéma en étapes, encadré et tableau', async () => {
    const { visualToNodes } = await import('./sheetDoc')
    expect(visualToNodes({ kind: 'etapes', title: 'Calcul du BFR', items: ['Stocks', '**+ Créances**', '− Dettes'] }).nodes[0]).toEqual({
      type: 'diagram',
      attrs: { kind: 'flow', title: 'Calcul du BFR', items: ['Stocks', '+ Créances', '− Dettes'] },
    })
    const callout = visualToNodes({ kind: 'exemple', title: 'Carrefour', items: ['Le BFR est négatif.'] }).nodes[0]
    expect(callout.type).toBe('callout')
    expect(callout.attrs?.tone).toBe('example')
    expect(callout.content?.[0].content?.[0].text).toBe('Exemple\u00a0: Carrefour')
    const { nodes } = visualToNodes({ kind: 'tableau', title: 'Comparaison', items: ['Notion | Définition', 'BFR | Besoin', 'FR'] })
    const table = nodes.find((n) => n.type === 'table')!
    expect(table.content).toHaveLength(3)
    expect(table.content![0].content![0].type).toBe('tableHeader')
    expect(table.content![2].content).toHaveLength(2)
  })
  it('ajoute les illustrations et l’emoji dans la fiche', () => {
    const { doc } = sheetToDoc({
      intro: '',
      sections: [{ heading: 'Cycle', emoji: '🔄', points: [], visuals: [{ kind: 'cycle', title: 'Exploitation', items: ['Achat', 'Production', 'Vente'] }] }],
      definitions: [],
      formulas: [],
      pitfalls: [],
      checklist: [],
    })
    expect(doc.content![0].content![0].text).toBe('🔄 Cycle')
    expect(doc.content![1].type).toBe('diagram')
  })
})

describe('définitions mises en valeur', () => {
  it('chaque définition devient un encadré avec le terme en titre', () => {
    const { doc } = sheetToDoc({ intro: '', sections: [], definitions: [{ term: 'BFR', definition: 'Besoin de financement du cycle d’exploitation.' }], formulas: [], pitfalls: [], checklist: [] })
    const box = doc.content!.find((n) => n.type === 'callout')!
    expect(box.attrs?.tone).toBe('definition')
    expect(box.content![0].content![0]).toEqual({ type: 'text', text: 'BFR', marks: [{ type: 'bold' }] })
  })
})
