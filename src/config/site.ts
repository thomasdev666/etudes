// Informations de l'éditeur et du site, à compléter avant l'ouverture au public.
// Tout ce qui apparaît dans les mentions légales, les CGU et les emails vient d'ici.
export const SITE = {
  name: 'Regulya',
  owner: 'Jade Caruana, micro-entrepreneure',
  publisher: 'Jade Caruana',
  // À remplacer par contact@regulya.fr une fois le domaine acheté
  contact: 'veloceofficiel@gmail.com',
  address: '[adresse postale à compléter]',
  siret: '[numéro SIRET à compléter]',
  // Région de l'instance Supabase (Project Settings → General → Region)
  dataRegion: 'Union européenne (à confirmer dans Supabase)',
}

// Champs encore à compléter : affichés comme avertissement dans l'appli de l'éditeur
export const missingLegal = () => [SITE.address, SITE.siret].filter((v) => v.startsWith('['))
