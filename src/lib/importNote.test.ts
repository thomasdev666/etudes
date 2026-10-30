import { describe, expect, it } from 'vitest'
import { mathToHtml, titleFromFile } from './importNote'

describe('import de notes', () => {
  it('nettoie les noms de fichiers Notion', () => {
    expect(titleFromFile('Finance d entreprise 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md')).toBe('Finance d entreprise')
    expect(titleFromFile('cours_marketing-S1.docx')).toBe('cours marketing S1')
  })

  it('convertit les formules', () => {
    expect(mathToHtml('La VAN vaut $\\sum F_t$ ici')).toBe('La VAN vaut <span data-type="inline-math" data-latex="\\sum F_t"></span> ici')
    expect(mathToHtml('$$a<b$$')).toContain('<div data-type="block-math" data-latex="a&lt;b"></div>')
    expect(mathToHtml('Prix : 5 $ et 10 $')).toBe('Prix : 5 $ et 10 $')
  })
})
