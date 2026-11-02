// Messages d'erreur lisibles : une coupure réseau donne « Failed to fetch » (Chrome),
// « Load failed » (Safari) ou « NetworkError… » (Firefox), incompréhensibles pour un étudiant.
const NETWORK = /failed to fetch|load failed|networkerror|network request failed|fetch failed/i

export const NETWORK_MESSAGE =
  'Connexion au serveur impossible. Vérifie ta connexion internet. Sur le wifi d’une école, le réseau peut bloquer Regulya : essaie en 4G ou avec le partage de connexion de ton téléphone.'

export function errorMessage(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error)
  return NETWORK.test(msg) ? NETWORK_MESSAGE : msg
}
