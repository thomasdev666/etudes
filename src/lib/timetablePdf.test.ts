import { describe, expect, it } from 'vitest'
import { parseTimetable } from './timetablePdf'

const SAMPLE = `octobre 2026
Planning de cours de FAUDOU Thomas (t.faudou)
Jeudi 01 octobre 2026
■ B2 FT - Budget & Analyse Financière
Jeu 01/10/2026 08:30 - 11:30
Emplacement : EENT (050pl) H134 (Cité de l'Entreprise > Entiore Bachelor)
B2 FT - Budget & Analyse Financière
> FT - Budget (Cours) 03
DAVRINCHE-HAMET Grégoire
■ B2 FT - Management des Ressources Humaines
Jeu 01/10/2026 13:00 - 16:00
Emplacement : EENT (049pl) K153 Caméra
Vendredi 02 octobre 2026
■ B2S3 - Espagnol
Ven 02/10/2026 08:15 - 10:15
Emplacement : EENT (030pl) K156 (Cité de l'Entreprise > Entiore Bachelor)
`

describe('planning PDF Outlook', () => {
  const ev = parseTimetable(SAMPLE)
  it('retrouve chaque cours avec son titre, son horaire et sa salle', () => {
    expect(ev).toHaveLength(3)
    expect(ev[0].title).toBe('B2 FT - Budget & Analyse Financière')
    expect(ev[0].start.getHours()).toBe(8)
    expect(ev[0].start.getMinutes()).toBe(30)
    expect(ev[0].end.getHours()).toBe(11)
    expect(ev[0].start.getDate()).toBe(1)
    expect(ev[0].start.getMonth()).toBe(9)
    expect(ev[0].location).toContain('H134')
  })
  it('garde la date de chaque cours', () => {
    expect(ev[2].title).toBe('B2S3 - Espagnol')
    expect(ev[2].start.getDate()).toBe(2)
    expect(ev[2].start.getHours()).toBe(8)
  })
})

describe('planning PDF : lignes fusionnées', () => {
  it('lit un cours dont la date est sur la même ligne que le titre', () => {
    const ev = parseTimetable('■ B2 FT - Achats Mer 14/10/2026 08:30 - 11:30 Emplacement : EENT H120')
    expect(ev).toHaveLength(1)
    expect(ev[0].title).toBe('B2 FT - Achats')
    expect(ev[0].location).toBe('EENT H120')
    expect(ev[0].start.getDate()).toBe(14)
  })
})

describe('planning PDF : glyphes privés de la police', () => {
  it('remplace le tiret illisible par un vrai tiret', () => {
    const ev = parseTimetable('B2 FT      Budget & Analyse Financière \nJeu 01/10/2026 08  30      11  30 \nEmplacement :   EENT   050pl) H134\n')
    expect(ev[0].title).toBe('B2 FT - Budget & Analyse Financière')
    expect(ev[0].end.getHours()).toBe(11)
    expect(ev[0].location).toBe('EENT 050pl) H134')
  })
})
