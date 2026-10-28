import { describe, expect, it } from 'vitest'
import { matchSubject } from './calendar'
import type { Subject } from './types'

const subject = (name: string, keywords: string[] = []) => ({ id: name, name, keywords }) as unknown as Subject

describe('emploi du temps', () => {
  it('associe un cours à la matière par nom ou mot-clé', () => {
    const subjects = [subject('Marketing'), subject('Finance', ['FIN301'])]
    expect(matchSubject('FIN301 - Corporate Finance', subjects)?.name).toBe('Finance')
    expect(matchSubject('Marketing digital', subjects)?.name).toBe('Marketing')
    expect(matchSubject('Anglais', subjects)).toBeNull()
  })
})
