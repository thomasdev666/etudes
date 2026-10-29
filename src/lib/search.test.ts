import { describe, expect, it } from 'vitest'
import { highlight } from './search'

describe('surlignage de la recherche', () => {
  it('trouve le terme sans tenir compte des accents ni des majuscules', () => {
    expect(highlight('Méthode d’Évaluation', 'evaluation')).toEqual([
      { text: 'Méthode d’', hit: false },
      { text: 'Évaluation', hit: true },
    ])
  })
  it('surligne chaque occurrence', () => {
    expect(highlight('VAN et van', 'van').filter((p) => p.hit)).toHaveLength(2)
  })
  it('ignore une recherche trop courte', () => {
    expect(highlight('abc', 'a')).toEqual([{ text: 'abc', hit: false }])
  })
})
