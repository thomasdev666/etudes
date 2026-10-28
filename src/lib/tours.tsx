import { useEffect, useState } from 'react'
import { Tour, type TourStep } from '@/components/Tour'
import { useOnboarding, type TourId } from './onboarding'

export const TOURS: Record<TourId, TourStep[]> = {
  main: [
    {
      title: 'Bienvenue dans Études ✨',
      body: 'Un petit tour d’une minute pour découvrir comment tout fonctionne. Tu pourras le revoir à tout moment dans Paramètres.',
    },
    {
      target: 'today',
      title: 'Ta priorité du jour',
      body: 'Les flash cards à revoir aujourd’hui et ta dernière session en cours. Quelques minutes par jour suffisent : la répétition espacée te repropose chaque carte juste avant que tu l’oublies.',
    },
    {
      target: 'deadlines',
      title: 'Tes échéances',
      body: 'Les 5 devoirs les plus proches avec leur compte à rebours. Le bouton « Devoir » en ajoute un en deux secondes.',
    },
    {
      target: 'nav-agenda',
      title: 'Agenda',
      body: 'Ton emploi du temps et tes devoirs, en vue jour, semaine, mois ou liste. Sur un devoir, « Planifier » propose un découpage en séances : tu acceptes, modifies ou refuses.',
    },
    {
      target: 'nav-matieres',
      title: 'Matières',
      body: 'Importe tes PowerPoint et PDF dans chaque matière (formules et schémas compris). À partir d’un cours, l’IA crée des QCM, des flash cards et des cartes mentales.',
    },
    {
      target: 'nav-reviser',
      title: 'Réviser',
      body: 'Tout ce qui est à revoir, matière par matière : cartes du jour, erreurs de QCM (elles reviennent jusqu’à deux réussites d’affilée) et nouveaux QCM. Les examens les plus proches passent en premier.',
    },
    {
      target: 'nav-notes',
      title: 'Notes',
      body: 'Prends tes notes : titres, tableaux, formules, images. Export en PDF ou Word, et génération de QCM, flash cards ou carte mentale depuis une note.',
    },
    {
      target: 'space',
      title: 'Tes espaces',
      body: 'Un espace par école (TBS, puis Hull). Change d’espace ici : les données de chacun restent séparées.',
    },
    {
      target: 'nav-settings',
      title: 'Paramètres',
      body: 'Thème (crème, clair ou sombre), calendriers, export complet de tes données, corbeille… et cette présentation.',
    },
    {
      title: 'À toi de jouer !',
      body: 'Commence par importer un cours dans une de tes matières. Les écrans plus riches (matière, carte mentale, note) ont leur petite présentation la première fois que tu les ouvres.',
    },
  ],
  subject: [
    {
      target: 'subject-tabs',
      title: 'Tout est rangé ici',
      body: 'Chaque onglet regroupe un type de contenu de la matière : cours, notes, QCM, flash cards, cartes mentales, erreurs à retravailler et plans de révision.',
    },
    {
      target: 'import-course',
      title: 'Importe tes cours',
      body: 'PowerPoint ou PDF : le texte est lu sur ton appareil, et l’IA transcrit les formules, schémas et tableaux en image.',
    },
    {
      title: 'Puis génère tes outils',
      body: 'Ouvre un cours et choisis « Générer un QCM », « des flash cards » ou « une carte mentale ». La génération continue en arrière-plan : une barre de progression te suit partout.',
    },
  ],
  mindmap: [
    {
      target: 'mm-canvas',
      title: 'Ta carte mentale',
      body: 'Le thème au centre, les grandes parties en couleur, puis les détails. Les petits boutons ronds replient ou déplient une branche.',
    },
    {
      target: 'mm-toolbar',
      title: 'Modifie-la à ta façon',
      body: 'Touche une idée pour la sélectionner : tu peux la renommer, ajouter un détail ou une formule ($…$), créer des sous-idées, la déplacer ou la supprimer. Raccourcis : Tab, Entrée, Suppr.',
    },
    {
      target: 'mm-view',
      title: 'Carte ou plan',
      body: '« Plan » affiche la même carte en liste : pratique sur téléphone. « Détails » montre ou cache les explications.',
    },
    {
      target: 'mm-export',
      title: 'Exporte-la',
      body: 'En image (PNG) ou en PDF, pour l’imprimer ou la revoir hors ligne. Ta note ou ton cours d’origine ne sont jamais modifiés.',
    },
  ],
  note: [
    {
      target: 'note-toolbar',
      title: 'Mise en forme',
      body: 'Titres, gras, listes, citations, formules (Σ), images et pièces jointes. Tout est enregistré automatiquement.',
    },
    {
      target: 'note-table',
      title: 'Tableaux',
      body: 'Survole la grille pour choisir le nombre de lignes et de colonnes, comme dans Word.',
    },
    {
      target: 'note-menu',
      title: 'Exporter et réviser',
      body: 'Exporte la note en PDF ou Word, retrouve ses versions précédentes, ou génère des flash cards, un QCM ou une carte mentale à partir d’elle.',
    },
  ],
}

// Affiche une présentation la première fois qu'un écran est ouvert
export function useFirstTimeTour(id: TourId, ready = true) {
  const ob = useOnboarding()
  const [open, setOpen] = useState(false)
  const seen = ob.tourSeen(id)
  useEffect(() => {
    if (ready && !seen) {
      const t = setTimeout(() => setOpen(true), 400)
      return () => clearTimeout(t)
    }
  }, [ready, seen])
  return open ? (
    <Tour
      steps={TOURS[id]}
      onClose={() => {
        setOpen(false)
        ob.markTour(id)
      }}
    />
  ) : null
}
