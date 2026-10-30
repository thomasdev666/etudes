import { BellRing, CalendarSync, FileUp, Flag, Gift, Languages, Mic, Share2, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LanguageSwitch } from './LanguageSwitch'
import { Button, Modal } from './ui'

// Nouveautés de la mise à jour de novembre 2026, montrées une fois aux comptes existants
type Item = { icon: ReactNode; title: string; text: string; action?: { label: string; to: string }; language?: boolean }

const ITEMS: Item[] = [
  {
    icon: <Gift className="size-5" />,
    title: 'Essaie Premium 7 jours, gratuitement',
    text: 'Sans carte bancaire : transcription de tes cours, examens blancs complets et 30 générations par semaine. Les prix baissent aussi : 2,99 € par mois, ou 14,99 € le semestre.',
    action: { label: 'Voir les offres', to: '/abonnement' },
  },
  {
    icon: <BellRing className="size-5" />,
    title: 'Des notifications sur ton téléphone',
    text: 'Un rappel le matin pour tes devoirs qui arrivent et tes flash cards à revoir. Sur iPhone, ajoute d’abord Regulya à ton écran d’accueil.',
    action: { label: 'Activer', to: '/parametres' },
  },
  {
    icon: <CalendarSync className="size-5" />,
    title: 'Relie ton agenda en un lien',
    text: 'Google Agenda, Hyperplanning, Celcat ou Outlook : colle le lien iCal, tes cours s’affichent et se mettent à jour chaque nuit.',
    action: { label: 'Relier mon agenda', to: '/parametres#calendrier' },
  },
  {
    icon: <FileUp className="size-5" />,
    title: 'Importe ce que tu as déjà',
    text: 'Tes flash cards Anki ou Quizlet (bouton « Importer » dans les flash cards d’une matière), et tes notes Notion, Word ou texte (page Notes).',
    action: { label: 'Mes notes', to: '/notes' },
  },
  {
    icon: <Share2 className="size-5" />,
    title: 'Partage avec ta promo',
    text: 'Un lien en lecture seule pour une fiche, une carte mentale ou un paquet de flash cards. Tes amis l’ouvrent sans compte, et tu le désactives quand tu veux.',
  },
  {
    icon: <Flag className="size-5" />,
    title: 'Des corrections que tu peux vérifier',
    text: 'Chaque question de QCM cite maintenant l’extrait du cours qui justifie la réponse. Une question fausse ? Signale-la en un clic, elle ne comptera pas dans tes erreurs.',
  },
  {
    icon: <Mic className="size-5" />,
    title: 'Transcription plus généreuse',
    text: '5 h par semaine en Premium, et les gros fichiers audio ou vidéo (jusqu’à 1 Go) sont convertis directement sur ton appareil.',
  },
  {
    icon: <WifiOff className="size-5" />,
    title: 'Révise même sans réseau',
    text: 'Dans le train ou en amphi sans wifi, tes données restent consultables et tes réponses aux flash cards sont envoyées au retour du réseau.',
  },
  {
    icon: <Languages className="size-5" />,
    title: 'Regulya en anglais',
    text: 'Pour les cours en anglais ou tes amis en échange : toute l’interface existe maintenant en anglais. Tes contenus ne sont jamais traduits.',
    language: true,
  },
]

export function WhatsNew({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Quoi de neuf dans Regulya ✨"
      footer={
        <Button onClick={onClose} className="w-full sm:w-auto">
          C’est parti
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted">Une grosse mise à jour, construite à partir de vos retours. Voici ce qui change pour toi.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((it) => (
          <li key={it.title} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink" aria-hidden>
              {it.icon}
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold">{it.title}</h3>
              <p className="mt-1 text-sm text-muted">{it.text}</p>
              {it.action && (
                <Link to={it.action.to} onClick={onClose} className="mt-2 inline-block text-sm font-medium text-accent-ink hover:underline">
                  {it.action.label} →
                </Link>
              )}
              {it.language && <LanguageSwitch className="mt-2" />}
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
