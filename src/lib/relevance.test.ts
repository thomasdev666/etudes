import { describe, expect, it } from 'vitest'
import { chunks, pickPassages, rankSubjects, terms, type Doc } from './relevance'

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

describe('GIRAFA : questions hors sujet', () => {
  const subjects = [{ id: 's1', name: 'Finance d’entreprise', keywords: ['BFR'] }]
  const docs: Doc[] = [{ id: 'c1', title: 'Chapitre 3 — Valorisation', subject_id: 's1', text: 'La valorisation par les flux actualisés, le WACC et le coût du capital.' }]
  it('laisse passer les questions d’études, même sans passage trouvé', async () => {
    const { isStudyQuestion } = await import('./relevance')
    expect(isStudyQuestion('c’est quoi le WACC ?', subjects, docs, false)).toBe(true)
    expect(isStudyQuestion('fais-moi une fiche sur le marketing mix', subjects, docs, false)).toBe(true)
    expect(isStudyQuestion('je stresse pour mon partiel demain', subjects, docs, false)).toBe(true)
    expect(isStudyQuestion('explique la valorisation', subjects, docs, true)).toBe(true)
  })
  it('refuse le bavardage personnel et les messages sans rapport', async () => {
    const { isStudyQuestion } = await import('./relevance')
    expect(isStudyQuestion('raconte-moi ma soirée d’hier avec mes potes', subjects, docs, false)).toBe(false)
    expect(isStudyQuestion('tu es nul', subjects, docs, false)).toBe(false)
    expect(isStudyQuestion('quel temps fait-il à Paris ce week-end', subjects, docs, false)).toBe(false)
  })
  it('répond sans IA : salutations, stress, hors sujet', async () => {
    const { offTopicReply } = await import('./relevance')
    expect(offTopicReply('salut !').text).toMatch(/^Salut/)
    expect(offTopicReply('je suis trop stressé').text).toMatch(/^Respire/)
    expect(offTopicReply('raconte ma soirée').text).toMatch(/Je reste sur tes études/)
  })
})
