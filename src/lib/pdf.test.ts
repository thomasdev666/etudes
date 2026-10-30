import { describe, expect, it, vi } from 'vitest'

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, OPS: {} }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }))

const { pageText } = await import('./pdf')

const it_ = (str: string, fontName = 'r', hasEOL = false) => ({ str, fontName, hasEOL })

describe('pageText', () => {
  it('entoure le gras de ** **', () => {
    const items = [it_('La'), it_('valeur actuelle nette', 'b'), it_('mesure la création de valeur', 'r', true), it_('Suite du cours sans gras ici.')]
    expect(pageText(items, (f) => f === 'b')).toBe('La **valeur actuelle nette** mesure la création de valeur\nSuite du cours sans gras ici.')
  })
  it('ferme le gras en fin de ligne', () => {
    const items = [it_('Terme', 'b', true), it_('suite normale assez longue pour que le gras reste minoritaire')]
    expect(pageText(items, (f) => f === 'b')).toBe('**Terme**\nsuite normale assez longue pour que le gras reste minoritaire')
  })
  it('ne marque rien si presque tout est en gras', () => {
    const items = [it_('Titre en gras', 'b'), it_('x')]
    expect(pageText(items, (f) => f === 'b')).toBe('Titre en gras x')
  })
})
