import { useEffect, useState } from 'react'
import { Tour, type TourStep } from '@/components/Tour'
import { useOnboarding, type TourId } from './onboarding'

export const TOURS: Record<TourId, TourStep[]> = {
  main: [
    {
      title: 'Bienvenue dans Regulya ✨',
      body: 'Un petit tour de deux minutes pour découvrir comment tout fonctionne. Tu pourras le revoir à tout moment dans Paramètres.',
    },
    {
      target: 'today',
      title: 'Ta priorité du jour',
      body: 'Les flash cards à revoir aujourd’hui et ta dernière session en cours. Quelques minutes par jour suffisent : la répétition espacée te repropose chaque carte juste avant que tu l’oublies.',
    },
    {
      target: 'deadlines',
      title: 'Tes échéances',
      body: 'Les 5 devoirs les plus proches avec leur compte à rebours. Le bouton « Devoir » en ajoute un en deux secondes. Chaque matin, un email te rappelle ceux qui arrivent (réglable dans Paramètres).',
    },
    {
      target: 'nav-agenda',
      title: 'Agenda et planification',
      body: 'Tes cours (importés depuis le PDF du planning de l’école) et tes devoirs, en vue jour, semaine, mois ou liste. Le bouton « Planifier » répartit tout ton travail et tes révisions d’examen dans tes créneaux libres : tu valides avant que rien ne soit enregistré.',
    },
    {
      target: 'nav-matieres',
      title: 'Matières',
      body: 'Importe tes PowerPoint et PDF, ou enregistre le cours en classe : la transcription devient un cours. À partir d’un cours, l’IA crée des QCM, des flash cards, des cartes mentales et des fiches de révision. Range aussi tes liens et documents dans « Ressources ».',
    },
    {
      target: 'nav-reviser',
      title: 'Réviser',
      body: 'Tout ce qui est à revoir, matière par matière : cartes du jour, erreurs de QCM (elles reviennent jusqu’à deux réussites d’affilée) et nouveaux QCM, à faire librement ou en mode examen chronométré.',
    },
    {
      target: 'nav-exams',
      title: 'TAGE MAGE et TOEIC',
      body: 'Des entraînements au format de l’épreuve, section par section ou en examen blanc chronométré. Sur téléphone, tu les trouves en haut de la page Réviser.',
    },
    {
      target: 'nav-notes',
      title: 'Notes',
      body: 'Prends tes notes : titres, tableaux, formules, images. Export en PDF ou Word, et génération de QCM, flash cards, carte mentale ou fiche de révision depuis une note.',
    },
    {
      target: 'nav-search',
      title: 'Rechercher',
      body: 'Retrouve un mot dans tous tes cours, transcriptions, notes, QCM, flash cards et ressources. Raccourci sur ordinateur : Ctrl + K.',
    },
    {
      target: 'nav-stats',
      title: 'Statistiques',
      body: 'Ta série de jours, ton taux de réussite, le temps passé à travailler (mesuré automatiquement, en pause après 10 minutes sans action) et les notions à retravailler en priorité.',
    },
    {
      target: 'space',
      title: 'Tes espaces',
      body: 'Un espace par école (TBS, puis Hull). Change d’espace ici : les données de chacun restent séparées.',
    },
    {
      target: 'nav-settings',
      title: 'Paramètres',
      body: 'Thème, emploi du temps, disponibilités pour la planification, rappels par email, enregistrements, export complet de tes données… et cette présentation.',
    },
    {
      title: 'Regulya sur ton écran d’accueil 📱',
      body: (
        <>
          <p>Installe l’appli sur ton téléphone pour l’ouvrir en un geste, comme une vraie appli.</p>
          <p className="mt-2 font-semibold">Sur iPhone (Safari) :</p>
          <ol className="ml-5 list-decimal">
            <li>Touche le bouton Partager (le carré avec une flèche vers le haut).</li>
            <li>Choisis « Sur l’écran d’accueil ».</li>
            <li>Touche « Ajouter ».</li>
          </ol>
          <p className="mt-2 font-semibold">Sur Android (Chrome) :</p>
          <p>Menu ⋮, puis « Installer l’application ».</p>
        </>
      ),
    },
    {
      title: 'À toi de jouer !',
      body: 'Commence par importer un cours dans une de tes matières. Chaque écran a sa petite présentation la première fois que tu l’ouvres.',
    },
  ],
  // Pour les comptes qui avaient déjà vu la présentation : les nouveautés seulement
  news: [
    {
      title: 'Du nouveau dans Regulya 🎉',
      body: 'Plusieurs fonctionnalités sont arrivées. Petit tour rapide ; chaque nouvel écran aura aussi sa présentation la première fois que tu l’ouvres.',
    },
    {
      target: 'nav-agenda',
      title: 'Planifier ton travail',
      body: 'Dans l’Agenda, « Planifier » répartit tes devoirs et des séances de révision avant chaque examen, dans tes créneaux libres (hors cours). Rien n’est enregistré sans ta validation.',
    },
    {
      target: 'nav-matieres',
      title: 'Enregistrer un cours',
      body: 'Dans une matière, « Enregistrer » capte le cours au micro et la transcription devient un cours (QCM, fiches…). Nouvel onglet « Ressources » pour tes liens, vidéos et documents.',
    },
    {
      target: 'nav-exams',
      title: 'TAGE MAGE et TOEIC',
      body: 'Entraînements au format de l’épreuve et examens blancs chronométrés. Sur téléphone : en haut de la page Réviser. Les QCM de tes cours ont aussi un « Mode examen ».',
    },
    {
      target: 'nav-search',
      title: 'Recherche globale',
      body: 'Un mot suffit pour retrouver un cours, une note, une flash card ou une ressource (Ctrl + K sur ordinateur).',
    },
    {
      target: 'nav-stats',
      title: 'Statistiques',
      body: 'Temps de travail par jour, réussite par matière, notions à retravailler : ta progression d’un coup d’œil.',
    },
    {
      target: 'nav-settings',
      title: 'Rappels et disponibilités',
      body: 'Dans Paramètres : rappels d’échéances par email (J-3 et la veille par défaut) et tes horaires de travail pour la planification.',
    },
  ],
  subject: [
    {
      target: 'subject-tabs',
      title: 'Tout est rangé ici',
      body: 'Chaque onglet regroupe un type de contenu de la matière : cours, notes, QCM, flash cards, cartes mentales, ressources, erreurs à retravailler et plans de révision.',
    },
    {
      target: 'import-course',
      title: 'Importe tes cours',
      body: 'PowerPoint ou PDF : le texte est lu sur ton appareil, et l’IA transcrit les formules, schémas et tableaux en image. Coche « fiche de révision » pour obtenir aussi une synthèse.',
    },
    {
      target: 'record-course',
      title: 'Ou enregistre le cours',
      body: '« Enregistrer » capte le cours au micro (le voyant rouge reste visible partout), « Fichier audio » transcrit un enregistrement existant. La transcription devient un cours de la matière.',
    },
    {
      title: 'Puis génère tes outils',
      body: 'Ouvre un cours et choisis « Générer un QCM », « des flash cards », « une carte mentale » ou « Fiche de révision ». La génération continue en arrière-plan : une barre de progression te suit partout.',
    },
  ],
  quizzes: [
    {
      target: 'quiz-new',
      title: 'Crée un QCM',
      body: 'Choisis un ou plusieurs cours ou notes, le nombre de questions, la difficulté et le type (4 choix ou vrai / faux). Les réponses ne s’affichent qu’à la fin.',
    },
    {
      target: 'quiz-exam',
      title: 'Mode examen',
      body: 'Un chrono pour tout le QCM, comme le jour J : tu peux passer une question et y revenir, et ta copie est rendue automatiquement à la fin du temps.',
    },
  ],
  course: [
    {
      target: 'course-generate',
      title: 'Révise ce cours',
      body: 'QCM, flash cards, carte mentale ou fiche de révision (plan, définitions, formules, pièges à éviter) : tout est créé à partir de ce cours, qui n’est jamais modifié.',
    },
    {
      target: 'course-copy',
      title: 'Copier le texte',
      body: 'Copie tout le contenu du cours ou de la transcription, pour le coller dans un autre outil (traduction, par exemple).',
    },
  ],
  resources: [
    {
      target: 'res-add',
      title: 'Ta bibliothèque',
      body: 'Ajoute des vidéos (miniature YouTube), des articles ou des documents. Le texte des PDF est lu pour que tu les retrouves dans la recherche, même par leur contenu.',
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
  planner: [
    {
      target: 'plan-avail',
      title: 'Tes disponibilités',
      body: 'Combien de temps tu veux travailler chaque jour, et à quelle heure. Les heures de cours de ton emploi du temps sont retirées automatiquement.',
    },
    {
      target: 'plan-tasks',
      title: 'Ce qui est à planifier',
      body: 'Tes devoirs non terminés et des révisions avant chaque examen des 4 prochaines semaines. Ajuste la durée prévue, ou décoche ce que tu ne veux pas planifier.',
    },
    {
      target: 'plan-proposal',
      title: 'La proposition',
      body: 'Le plus urgent passe en premier, et les séances sont espacées jusqu’à l’échéance, avec une heure précise dans tes créneaux libres. Si le temps manque, une alerte te le dit.',
    },
    {
      target: 'plan-validate',
      title: 'Tu as le dernier mot',
      body: 'Rien n’est enregistré tant que tu ne valides pas. Les séances apparaissent ensuite dans l’agenda et sur l’accueil ; coche-les quand elles sont faites.',
    },
  ],
  exams: [
    {
      target: 'exam-full',
      title: 'Examen blanc',
      body: 'L’épreuve complète, chronométrée section par section, comme le jour J. Les questions sont originales, préparées par l’IA en quelques minutes la première fois.',
    },
    {
      target: 'exam-sections',
      title: 'Ou une section à la fois',
      body: 'Entraîne-toi sur ce qui te pose problème : choisis le nombre de questions et le chrono. Au TAGE MAGE, une erreur coûte un point : dans le doute, ne réponds pas.',
    },
    {
      target: 'exam-history',
      title: 'Tes résultats',
      body: 'Score par section, correction détaillée et filtre « mes erreurs ». Une question vue ne revient jamais dans une nouvelle épreuve.',
    },
  ],
  stats: [
    {
      target: 'stats-tiles',
      title: 'L’essentiel',
      body: 'Ta série de jours de révision, ton taux de réussite aux QCM, ton temps de travail et les cartes révisées cette semaine.',
    },
    {
      target: 'stats-daily',
      title: 'Ton temps de travail',
      body: 'Mesuré pendant que tu travailles dans l’appli (QCM, cartes, notes, cours, entraînements). Le chronomètre se met en pause après 10 minutes sans action.',
    },
    {
      target: 'stats-notions',
      title: 'À retravailler en priorité',
      body: 'Les notions où tu te trompes le plus souvent. « Revoir » lance une session sur tes erreurs de la matière.',
    },
  ],
  search: [
    {
      target: 'search-input',
      title: 'Cherche un mot',
      body: 'Dans tous tes cours, transcriptions, notes, fiches, cartes mentales, QCM, flash cards et ressources. Les accents et les majuscules ne comptent pas.',
    },
    {
      target: 'search-filters',
      title: 'Affine',
      body: 'Filtre par type de contenu ou par matière. Les mots trouvés sont surlignés ; touche un résultat pour l’ouvrir.',
    },
  ],
}

// Affiche une présentation la première fois qu'un écran est ouvert
// also : présentations marquées comme vues en même temps (ex. les nouveautés, déjà incluses)
export function useFirstTimeTour(id: TourId, ready = true, also: TourId[] = []) {
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
        ob.markTour(id, ...also)
      }}
    />
  ) : null
}
