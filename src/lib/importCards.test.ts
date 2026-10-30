import { describe, expect, it } from 'vitest'
import { cleanField, parseCards } from './importCards'

describe('import de flash cards', () => {
  it('lit un export Quizlet (tabulation, une carte par ligne)', () => {
    expect(parseCards('BFR\tBesoin en fonds de roulement\nVAN\tValeur actuelle nette\n')).toEqual([
      { front: 'BFR', back: 'Besoin en fonds de roulement' },
      { front: 'VAN', back: 'Valeur actuelle nette' },
    ])
  })

  it('lit un export Anki avec en-têtes et HTML', () => {
    const raw = '#separator:tab\n#html:true\nQu&#39;est-ce que le WACC ?\tCoût moyen<br>pondéré du <b>capital</b>\ttag1\n'
    expect(parseCards(raw)).toEqual([{ front: "Qu'est-ce que le WACC ?", back: 'Coût moyen\npondéré du capital' }])
  })

  it('lit un CSV avec guillemets et virgules dans les champs', () => {
    expect(parseCards('"Marge, brute","CA - coût d\'achat ""des"" ventes"\nROI,Rentabilité\n')).toEqual([
      { front: 'Marge, brute', back: 'CA - coût d\'achat "des" ventes' },
      { front: 'ROI', back: 'Rentabilité' },
    ])
  })

  it('reconnaît le point-virgule et peut inverser recto et verso', () => {
    expect(parseCards('A;1\nB;2', { swap: true })).toEqual([
      { front: '1', back: 'A' },
      { front: '2', back: 'B' },
    ])
  })

  it('ignore les lignes vides ou incomplètes', () => {
    expect(parseCards('\n\nseul\n\tvide\nok\tbien\n')).toEqual([{ front: 'ok', back: 'bien' }])
  })

  it('nettoie les sons Anki', () => {
    expect(cleanField('Bonjour [sound:a.mp3]')).toBe('Bonjour')
  })
})
