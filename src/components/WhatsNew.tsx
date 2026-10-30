import { Calculator, Layers, ListChecks, Smartphone, Target, Workflow } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Mascot } from './AssistantWidget'
import { LanguageSwitch } from './LanguageSwitch'
import { Button, Modal } from './ui'

// Nouveautés de la mise à jour JadeBot, montrées une fois aux comptes existants
type Item = { icon: ReactNode; title: string; text: string; action?: { label: string; to: string }; language?: boolean }

const ITEMS: Item[] = [
  {
    icon: <Mascot className="size-8" />,
    title: 'Voici JadeBot, ton assistant',
    text: 'Le petit bonhomme en bas à droite, sur toutes les pages. Dis-lui ce qu’il te faut (« les formules d’analyse financière », « les définitions du chapitre 3 »…) : il te pose quelques questions simples, puis prépare le document à partir de tes cours.',
    action: { label: 'Découvrir JadeBot', to: '/assistant' },
  },
  {
    icon: <Target className="size-5" />,
    title: 'Une fiche sur tes erreurs',
    text: 'À la fin d’un QCM, crée en un clic une fiche rien que pour ce que tu as raté : réexpliqué avec des schémas, des exemples et les pièges à éviter, puis un mini-défi.',
  },
  {
    icon: <Workflow className="size-5" />,
    title: 'Des fiches beaucoup plus visuelles',
    text: 'Schémas en étapes, cycles, cartes autour d’une notion, tableaux comparatifs et encadrés colorés : moins de texte, plus de repères.',
  },
  {
    icon: <ListChecks className="size-5" />,
    title: 'Des QCM plus pertinents',
    text: 'Plus de questions sur l’organisation du cours : les QCM portent sur le fond, en priorité sur les mots en gras de tes PowerPoint et PDF.',
  },
  {
    icon: <Calculator className="size-5" />,
    title: 'Les formules s’affichent enfin',
    text: 'Dans les questions, les réponses et la correction, les formules sont écrites proprement, seules ou avec une phrase.',
  },
  {
    icon: <Layers className="size-5" />,
    title: 'Une seule barre de chargement',
    text: 'Plusieurs générations en même temps ? Une barre regroupée, le détail si tu veux, et chaque tâche terminée se ferme toute seule.',
  },
  {
    icon: <Smartphone className="size-5" />,
    title: 'Plus confortable sur téléphone',
    text: 'Les textes ne sont plus écrasés à côté des boutons, sur toutes les pages.',
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
