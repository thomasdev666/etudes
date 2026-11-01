// Message affiché quand une génération attend son tour : pourquoi, et comment aller plus vite.
export const QUEUE_NOTICE =
  'Regulya est encore en version de test : une seule génération tourne à la fois, pour que tout le monde ait sa place. ' +
  'Pour aller plus vite et m’aider à faire grandir le projet, passe en Premium à 2,99 €/mois.'

// Temps d'attente estimé : environ une minute par génération qui précède
export function queueEta(position: number, busy: boolean) {
  const ahead = Math.max(0, position - 1) + (busy ? 1 : 0)
  if (ahead === 0) return 'bientôt'
  return `environ ${ahead} min`
}
