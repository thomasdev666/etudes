import { describe, expect, it } from 'vitest'
import { chunks, pickPassages, rankSubjects, terms } from './relevance'

const docs = [
  { id: 'c1', title: 'Analyse financière — Séance 2', subject_id: 'fin', text: 'Le fonds de roulement est l’excédent des ressources stables sur les emplois stables.\nLe BFR mesure le besoin de financement du cycle d’exploitation.' },
  { id: 'c2', title: 'Persona', subject_id: 'mkt', text: 'Le persona est une représentation fictive du client cible.' },
  { id: 'c3', title: 'Leadership', subject_id: 'eng', text: 'Leadership styles: transformational and transactional.' },
]
const subjects = [
  { id: 'fin', name: 'Analyse financière' },
  { id: 'mkt', name: 'Marketing' },
  { id: 'eng', name: 'Business English' },
]

describe('pertinence', () => {
  it('ignore accents, pluriels et mots vides', () => {
    expect(terms('Qu’est-ce que le fonds de roulement ?')).toEqual(['fond', 'roulem'])
  })
  it('trouve le passage qui répond à la question', () => {
    const r = pickPassages('c’est quoi le fonds de roulement', docs)
    expect(r.titles).toEqual(['Analyse financière — Séance 2'])
    expect(r.text).toContain('excédent des ressources stables')
  })
  it('ne renvoie rien si les cours n’en parlent pas', () => {
    expect(pickPassages('théorème de Pythagore', docs).titles).toEqual([])
  })
  it('propose seulement les matières concernées', () => {
    expect(rankSubjects('une liste complète des formules en analyse financière', subjects, docs)).toEqual(['fin'])
    expect(rankSubjects('fiche sur le persona', subjects, docs)).toEqual(['mkt'])
    expect(rankSubjects('une fiche de révision', subjects, docs)).toEqual([])
  })
  it('découpe un long texte en passages', () => {
    expect(chunks('a'.repeat(3000)).length).toBeGreaterThan(1)
  })
})
