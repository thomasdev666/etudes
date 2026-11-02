// Message affiché quand une génération attend son tour : pourquoi, et comment aller plus vite.
export const QUEUE_NOTICE =
  'Regulya est encore en version de test : le nombre de générations en même temps est limité, pour que tout le monde ait sa place. ' +
  'Pour ne jamais attendre et m’aider à faire grandir le projet, passe en Premium à 2,99 €/mois.'

// Temps d'attente estimé : 5 générations tournent en parallèle, chacune dure environ une minute
export const PARALLEL = 5
export function queueEta(position: number, busy: boolean) {
  if (!busy) return 'bientôt'
  return `environ ${Math.max(1, Math.ceil(position / PARALLEL))} min`
}
