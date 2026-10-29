import { describe, expect, it } from 'vitest'
import { KIND_LABEL } from './plans'

describe('offres', () => {
  it('libelle chaque type d’usage limité', () => {
    for (const k of ['quiz', 'cards', 'mindmap', 'sheet', 'images', 'exam_section', 'exam_full', 'transcription']) expect(KIND_LABEL[k]).toBeTruthy()
  })
})
