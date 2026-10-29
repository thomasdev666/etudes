import { Link } from 'react-router-dom'

// Champs à compléter avant la mise en ligne publique : adresse, SIRET, hébergeurs
const OWNER = 'Jade Caruana, micro-entrepreneure'
const CONTACT = 'veloceofficiel@gmail.com'
const ADDRESS = '[adresse postale à compléter]'
const SIRET = '[numéro SIRET à compléter]'

type Doc = { title: string; updated: string; sections: { h: string; body: string[] }[] }

export const LEGAL: Record<string, Doc> = {
  '/cgu': {
    title: 'Conditions générales d’utilisation',
    updated: '29 octobre 2026',
    sections: [
      { h: '1. Objet', body: ['Études est une application web d’organisation et de révision destinée aux étudiants. Ces conditions encadrent son utilisation. En créant un compte, tu les acceptes.'] },
      { h: '2. Compte', body: ['Tu dois fournir une adresse email valide et garder ton mot de passe confidentiel. Tu es responsable de l’activité faite depuis ton compte. Un compte est réservé à une personne.'] },
      {
        h: '3. Offres et quotas',
        body: [
          'L’offre gratuite donne accès aux fonctions de base avec des quotas hebdomadaires (fenêtre glissante de 7 jours). L’offre Premium augmente ces quotas et ouvre les fonctions les plus gourmandes (transcription d’audio, examens blancs complets).',
          'Les quotas sont appliqués par le serveur. Un usage au-delà de la limite est refusé.',
          'Les prix affichés sont en euros, TTC. Le paiement de l’abonnement sera disponible prochainement ; les codes d’accès offerts ne sont pas payants.',
        ],
      },
      {
        h: '4. Contenus que tu importes',
        body: [
          'Tu gardes la propriété de tes cours, notes, enregistrements et documents. Tu certifies avoir le droit de les importer et de les utiliser à titre personnel.',
          'Pour les enregistrements de cours, tu dois avoir l’autorisation de l’établissement ou de l’enseignant. Les contenus ne sont jamais partagés avec d’autres utilisateurs.',
        ],
      },
      {
        h: '5. Contenus générés par l’IA',
        body: [
          'Les QCM, fiches, cartes mentales, transcriptions et questions d’entraînement sont générés par une intelligence artificielle. Ils peuvent contenir des erreurs : vérifie-les avant de t’y fier.',
          'Les questions d’entraînement TAGE MAGE et TOEIC sont originales. Elles ne reprennent aucun sujet officiel.',
        ],
      },
      { h: '6. Bon usage', body: ['Tu t’engages à ne pas contourner les quotas, ne pas automatiser l’usage de l’appli, ne pas tenter d’accéder aux données d’autrui et ne pas perturber le service. Un compte qui abuse peut être suspendu.'] },
      { h: '7. Disponibilité', body: ['Le service est fourni « en l’état ». Nous faisons de notre mieux pour qu’il soit disponible, sans garantie d’absence d’interruption. Les fonctions dépendant de services tiers (IA, email) peuvent être temporairement indisponibles.'] },
      { h: '8. Suppression du compte', body: ['Tu peux demander la suppression de ton compte depuis les Paramètres. Les données sont effacées définitivement 30 jours après la demande. Tu peux exporter tes données avant.'] },
      { h: '9. Responsabilité', body: ['Études ne remplace pas ton travail personnel ni les cours de ton établissement. Nous ne sommes pas responsables des résultats d’examen.'] },
      { h: '10. Droit applicable', body: ['Ces conditions sont régies par le droit français. En cas de litige, une solution amiable sera recherchée avant toute procédure.'] },
      { h: 'Contact', body: [`${OWNER} · ${CONTACT}`] },
    ],
  },
  '/mentions-legales': {
    title: 'Mentions légales',
    updated: '29 octobre 2026',
    sections: [
      { h: 'Éditeur', body: [`${OWNER}`, `Numéro SIRET : ${SIRET}`, `Adresse : ${ADDRESS}`, `Contact : ${CONTACT}`, 'Directeur de la publication : Jade Caruana'] },
      { h: 'Hébergement', body: ['Site : Netlify, Inc., 2325 3rd Street, San Francisco, CA, États-Unis.', 'Base de données et stockage : Supabase (instance hébergée dans l’Union européenne, à vérifier).'] },
      { h: 'Services tiers', body: ['Envoi d’emails : Brevo (SAS, France).', 'Intelligence artificielle : Google Gemini (Google Ireland Limited, UE).'] },
      { h: 'Propriété intellectuelle', body: ['L’application, son design et ses textes sont protégés. Les contenus importés par les utilisateurs leur appartiennent.'] },
    ],
  },
  '/confidentialite': {
    title: 'Politique de confidentialité',
    updated: '29 octobre 2026',
    sections: [
      { h: 'Qui traite tes données', body: [`${OWNER} (${SIRET}), responsable de traitement. Contact : ${CONTACT}.`] },
      {
        h: 'Données collectées',
        body: [
          'Compte : adresse email et mot de passe (chiffré, jamais lisible).',
          'Contenus que tu crées : matières, cours, notes, ressources, QCM, fiches, cartes mentales, enregistrements audio et transcriptions, épreuves d’entraînement.',
          'Usage : temps de travail, réponses aux QCM et aux flash cards, quotas utilisés, préférences (thème, rappels, disponibilités).',
          'Emploi du temps : si tu importes le PDF de ton planning, seuls les titres, horaires et salles sont enregistrés.',
        ],
      },
      { h: 'Finalités et bases légales', body: ['Fournir le service (exécution du contrat), envoyer les rappels et emails de connexion (exécution du contrat), mesurer l’usage pour les quotas et la progression (intérêt légitime), et respecter nos obligations légales.'] },
      {
        h: 'Sous-traitants',
        body: [
          'Supabase : base de données, authentification et stockage.',
          'Netlify : hébergement du site et des fonctions serveur.',
          'Google Gemini : génération de contenus par IA. Les textes et images envoyés ne servent pas à entraîner les modèles lorsque l’offre payante ou le compte API le prévoit ; à vérifier selon l’offre utilisée.',
          'Brevo : envoi des emails.',
        ],
      },
      { h: 'Enregistrements audio', body: ['Tu choisis de supprimer l’audio après transcription (par défaut) ou de le garder. Tu peux l’écouter, le supprimer, ou demander sa suppression à tout moment. Les enregistrements ne sont jamais diffusés à d’autres personnes.'] },
      { h: 'Durée de conservation', body: ['Tes données sont conservées tant que ton compte existe. À la suppression, elles sont effacées définitivement 30 jours après la demande. Les journaux techniques sont conservés au plus 12 mois.'] },
      { h: 'Tes droits', body: [`Tu peux accéder à tes données, les rectifier, les exporter (archive ZIP depuis les Paramètres), les supprimer, t’opposer à un traitement ou retirer ton consentement. Écris à ${CONTACT}. Tu peux aussi saisir la CNIL (cnil.fr).`] },
      { h: 'Sécurité', body: ['Connexion chiffrée (HTTPS), données chiffrées au repos, accès limité à tes seules données (sécurité au niveau des lignes), réponses aux QCM invisibles avant la fin de la session.'] },
      { h: 'Cookies', body: ['Études n’utilise pas de cookies publicitaires ni de traceurs de tiers. Seul le stockage local du navigateur est utilisé, pour garder ta session et tes préférences.'] },
    ],
  },
}

export default function LegalPage({ path }: { path: string }) {
  const doc = LEGAL[path]
  if (!doc) return null
  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link to="/" className="text-sm text-accent-ink hover:underline">
        ← Retour à Études
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{doc.title}</h1>
      <p className="mb-6 text-sm text-muted">Dernière mise à jour : {doc.updated}</p>
      <div className="flex flex-col gap-5 leading-relaxed">
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2 className="mb-1.5 text-lg font-semibold">{s.h}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mb-2 text-[15px]">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
      <nav className="mt-10 flex flex-wrap gap-4 border-t border-border pt-4 text-sm text-muted">
        <Link to="/cgu" className="hover:underline">CGU</Link>
        <Link to="/confidentialite" className="hover:underline">Confidentialité</Link>
        <Link to="/mentions-legales" className="hover:underline">Mentions légales</Link>
      </nav>
    </div>
  )
}
