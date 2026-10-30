import { describe, expect, it } from 'vitest'
import { noteToText } from './noteText'

describe('noteToText', () => {
  it('garde le gras, les titres, les listes et les formules', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Rentabilité' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Le ' }, { type: 'text', text: 'ROE ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'vaut ' }, { type: 'inlineMath', attrs: { latex: '\\frac{RN}{CP}' } }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'point' }] }] }] },
      ],
    }
    expect(noteToText(doc)).toBe('## Rentabilité\nLe **ROE** vaut $\\frac{RN}{CP}$\n- point')
  })
  it('accepte un contenu vide', () => {
    expect(noteToText(null)).toBe('')
  })
})
