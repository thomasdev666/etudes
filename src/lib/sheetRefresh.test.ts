import { describe, expect, it } from 'vitest'
import { oldSheetSource } from './sheetRefresh'

const course = { id: 'c1', title: 'Séance 3 — BFR', subject_id: 's1' }
const old = { id: 'n1', title: 'Fiche — Séance 3 — BFR', subject_id: 's1', content: { type: 'doc', content: [{ type: 'bulletList' }] } }

describe('oldSheetSource', () => {
  it('retrouve le cours d’une ancienne fiche', () => {
    expect(oldSheetSource(old, [course], [])).toEqual({ title: 'Séance 3 — BFR', courseIds: ['c1'], noteIds: [] })
  })
  it('ignore une fiche déjà visuelle, une note ordinaire ou une source introuvable', () => {
    expect(oldSheetSource({ ...old, content: { content: [{ type: 'diagram' }] } }, [course], [])).toBeNull()
    expect(oldSheetSource({ ...old, title: 'Mes notes' }, [course], [])).toBeNull()
    expect(oldSheetSource(old, [{ ...course, title: 'Autre' }], [])).toBeNull()
    expect(oldSheetSource(old, [{ ...course, subject_id: 's2' }], [])).toBeNull()
  })
})
