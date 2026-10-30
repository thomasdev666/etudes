import { describe, expect, it } from 'vitest'
import { compile, translateText } from './translate'

const c = compile({
  'Mes notes': 'My notes',
  'Réviser': 'Review',
  '{0} carte{1} à réviser': '{0} card{1} to review',
  'Importer dans {0}': 'Import into {0}',
  'Limite de la semaine atteinte ({0}/{1}).': 'Weekly limit reached ({0}/{1}).',
  'Étape {0} sur {1}': 'Step {0} of {1}',
})

describe('traduction de l’interface', () => {
  it('traduit un texte exact et garde les espaces', () => {
    expect(translateText(' Mes notes ', c)).toBe(' My notes ')
    expect(translateText('Mes  notes', c)).toBe('My notes')
  })
  it('traduit les textes avec valeurs insérées', () => {
    expect(translateText('3 cartes à réviser', c)).toBe('3 cards to review')
    expect(translateText('1 carte à réviser', c)).toBe('1 card to review')
    expect(translateText('Importer dans Finance', c)).toBe('Import into Finance')
    expect(translateText('Limite de la semaine atteinte (3/3).', c)).toBe('Weekly limit reached (3/3).')
  })
  it('laisse intacts les contenus inconnus', () => {
    expect(translateText('Le BFR est un besoin', c)).toBeNull()
    expect(translateText('42', c)).toBeNull()
  })
})
