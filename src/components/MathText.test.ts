import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MathText } from './MathText'

const html = (text: string) => renderToStaticMarkup(createElement(MathText, { text }))

describe('MathText', () => {
  it('rend les formules', () => {
    expect(html('Le ROE vaut $\\frac{a}{b}$ ici')).toContain('katex')
    expect(html('$x$')).toContain('katex')
  })
  it('laisse les montants en dollars', () => {
    expect(html('Il coûte 12 $ et 15 $')).not.toContain('katex')
    expect(html('From $5 to $10')).not.toContain('katex')
  })
})
