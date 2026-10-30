import { describe, expect, it } from 'vitest'
import { pageCuts } from './pdfExport'

describe('pageCuts', () => {
  it('coupe à la dernière frontière qui tient dans la page', () => {
    expect(pageCuts([100, 300, 520, 700, 950], 1000, 600)).toEqual([520])
  })
  it('coupe net seulement s’il n’y a aucune frontière utilisable', () => {
    expect(pageCuts([], 1300, 600)).toEqual([600, 1200])
  })
  it('ignore une frontière trop près du haut de page', () => {
    expect(pageCuts([50, 1000], 1100, 600)).toEqual([600])
  })
})
