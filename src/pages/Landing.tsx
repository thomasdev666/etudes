import { BarChart3, BellRing, BookOpen, CalendarDays, Check, ChevronDown, GraduationCap, Layers, Mic, NotebookPen, ShieldCheck, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { Logo } from '@/components/Logo'
import { PlanChoice } from '@/components/PlanChoice'
import { Button, cx } from '@/components/ui'
import { ESSAI_JOURS } from '@/config/offers'
import { SITE } from '@/config/site'
import { isEn } from '@/i18n/lang'

// Page de présentation publique : ce que fait l'appli, en quoi elle diffère des IA gratuites, les offres.

function Section({ id, eyebrow, title, intro, children }: { id?: string; eyebrow?: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto w-full max-w-5xl scroll-mt-20 px-5 py-10 sm:px-6 sm:py-20">
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink">{eyebrow}</p>}
      <h2 className="max-w-2xl text-balance font-display text-3xl font-bold sm:text-4xl">{title}</h2>
      {intro && <p className="mt-3 max-w-2xl text-lg text-muted">{intro}</p>}
      <div className="mt-7 sm:mt-10">{children}</div>
    </section>
  )
}

// Aperçu de l'écran d'accueil de l'appli, dessiné en HTML (aucune donnée réelle)
function AppPreview() {
  const en = isEn()
  const subjects = [
    { name: en ? 'Corporate finance' : 'Finance d’entreprise', color: '#F26B4F', pct: 72 },
    { name: 'Marketing', color: '#4F9BD9', pct: 45 },
    { name: en ? 'Business law' : 'Droit des affaires', color: '#5CB58A', pct: 88 },
  ]
  return (
    <div aria-hidden className="relative mx-auto mb-6 w-full max-w-md select-none">
      <div className="rounded-[28px] border border-border bg-surface p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Aujourd’hui</p>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-accent-soft p-4">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-white">
            <Layers className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">14 flash cards à revoir</p>
            <p className="text-sm text-muted">Environ 6 minutes</p>
          </div>
          <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-white">Réviser</span>
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Prochaines échéances</p>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          <li className="flex justify-between gap-3 rounded-xl border border-border px-3 py-2">
            <span className="truncate">Cas pratique · Finance</span>
            <span className="shrink-0 font-semibold text-accent-ink">J-2</span>
          </li>
          <li className="flex justify-between gap-3 rounded-xl border border-border px-3 py-2">
            <span className="truncate">Partiel · Marketing</span>
            <span className="shrink-0 font-semibold">J-9</span>
          </li>
        </ul>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Avancement des révisions</p>
        <ul className="mt-2 flex flex-col gap-2.5">
          {subjects.map((s) => (
            <li key={s.name} className="text-sm">
              <div className="mb-1 flex justify-between">
                <span>{s.name}</span>
                <span className="text-muted">{s.pct} %</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2">
                <div className="h-2 rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute -bottom-10 -left-8 hidden rotate-[-4deg] rounded-2xl border border-border bg-surface px-4 py-3 shadow-card sm:block">
        <p className="text-xs text-muted">QCM · Finance</p>
        <p className="font-display text-2xl font-bold text-success">17 / 20</p>
      </div>
      <div className="absolute -right-3 -top-5 hidden rotate-[3deg] rounded-2xl border border-border bg-surface px-4 py-3 shadow-card sm:block">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="size-4 text-accent-ink" /> Série : 12 jours
        </p>
      </div>
    </div>
  )
}

const STEPS = [
  { icon: Upload, title: 'Importe ton cours', text: 'PDF, PowerPoint, notes, ou enregistrement du cours en amphi. Regulya lit tout, formules et schémas compris.' },
  { icon: Layers, title: 'Révise ce qui est prêt', text: 'QCM, flash cards, fiches et cartes mentales créés à partir de ton cours, pas d’internet. Les corrections renvoient à l’extrait du cours.' },
  { icon: CalendarDays, title: 'Laisse-toi guider', text: 'Regulya répartit tes révisions jusqu’aux partiels, te repropose chaque carte juste avant que tu l’oublies et te relance au bon moment.' },
]

const FEATURES = [
  { icon: CalendarDays, title: 'Agenda et planification', text: 'Devoirs, emploi du temps (Outlook, Google Agenda, Hyperplanning) et planning de révisions calé sur tes créneaux libres.' },
  { icon: Layers, title: 'Flash cards et QCM', text: 'Répétition espacée, session « erreurs » qui revient jusqu’à ce que tu réussisses, import depuis Anki et Quizlet.' },
  { icon: NotebookPen, title: 'Notes, fiches, cartes mentales', text: 'Éditeur complet avec formules et tableaux, export PDF et Word, fiches générées sans toucher à ta note.' },
  { icon: Mic, title: 'Transcription des cours', text: 'Enregistre en classe (avec l’accord de l’enseignant) ou importe un audio : tu obtiens le texte, rangé dans la bonne matière.' },
  { icon: GraduationCap, title: 'TAGE MAGE et TOEIC', text: 'Entraînements au format de l’épreuve, section par section ou en examen blanc chronométré.' },
  { icon: BarChart3, title: 'Progression', text: 'Taux de réussite par matière et par notion, temps de travail, et les notions à retravailler en priorité.' },
]

type Cell = boolean | 'partial'
const COMPARE: { row: string; us: Cell; ai: Cell; cards: Cell }[] = [
  { row: 'QCM et fiches créés à partir de ton cours', us: true, ai: true, cards: false },
  { row: 'Révisions planifiées jusqu’à l’examen', us: true, ai: false, cards: false },
  { row: 'Répétition espacée des flash cards', us: true, ai: false, cards: true },
  { row: 'Tes erreurs reviennent jusqu’à ce que tu les maîtrises', us: true, ai: false, cards: 'partial' },
  { row: 'Rappels de devoirs et de révisions', us: true, ai: false, cards: 'partial' },
  { row: 'Cours, notes, agenda et révisions au même endroit', us: true, ai: false, cards: false },
]

function Mark({ v }: { v: Cell }) {
  if (v === 'partial') return <span className="text-sm text-muted">En partie</span>
  return v ? <Check className="mx-auto size-5 text-success" strokeWidth={3} aria-label="Oui" /> : <X className="mx-auto size-5 text-muted" aria-label="Non" />
}

const FAQ = [
  { q: 'C’est vraiment gratuit ?', a: `Oui. L’offre gratuite n’a pas de limite de durée : agenda, notes, flash cards et planification sont inclus, avec quelques générations par l’IA chaque semaine (10 la première semaine). Premium s’essaie ${ESSAI_JOURS} jours sans carte bancaire, puis tu repasses en gratuit automatiquement si tu ne t’abonnes pas.` },
  { q: 'L’IA peut-elle se tromper ?', a: 'Oui, comme toute IA. Chaque question est créée à partir de ton cours, et sa correction cite l’extrait qui justifie la réponse, pour que tu puisses vérifier. Si une question est fausse, tu la signales en un clic.' },
  { q: 'Que deviennent mes cours et mes enregistrements ?', a: 'Ils restent dans ton espace, visibles par toi seul. Ils sont envoyés à l’IA uniquement quand tu lances une génération. L’audio est supprimé après la transcription, sauf si tu choisis de le garder. Rien n’est vendu, aucune publicité, aucun traceur.' },
  { q: 'Ça marche sur iPhone et Android ?', a: 'Oui. Regulya s’ouvre dans le navigateur et s’installe sur l’écran d’accueil comme une appli (Partager → « Sur l’écran d’accueil » sur iPhone). Les notifications fonctionnent une fois l’appli installée.' },
  { q: 'Mon école n’utilise pas Outlook.', a: 'Tu peux relier n’importe quel agenda qui propose un lien iCal (Google Agenda, Hyperplanning, Celcat…), ou importer le PDF de ton emploi du temps.' },
  { q: 'Je peux arrêter quand je veux ?', a: 'Oui, depuis Mon abonnement, en deux clics. Premium reste actif jusqu’à la fin de la période payée, puis tu repasses en gratuit sans perdre tes données.' },
]

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <ul className="flex max-w-3xl flex-col gap-3">
      {FAQ.map((f, i) => (
        <li key={f.q} className="rounded-2xl border border-border bg-surface">
          <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left font-semibold">
            {f.q}
            <ChevronDown className={cx('size-5 shrink-0 text-muted motion-safe:transition-transform', open === i && 'rotate-180')} aria-hidden />
          </button>
          {open === i && <p className="px-5 pb-5 text-muted">{f.a}</p>}
        </li>
      ))}
    </ul>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const signup = () => navigate('/connexion?mode=signup')
  const heroCta = useRef<HTMLDivElement>(null)
  const [showSticky, setShowSticky] = useState(false)
  useEffect(() => {
    const el = heroCta.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting && e.boundingClientRect.top < 0))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/90 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          <Link to="/" aria-label="Regulya" className="shrink-0">
            <Logo withBaseline={false} className="h-7 w-auto text-text sm:h-8" />
          </Link>
          <nav className="ml-auto hidden items-center gap-5 text-sm text-muted md:flex" aria-label="Sections">
            <a href="#comment" className="hover:text-text">Comment ça marche</a>
            <a href="#comparaison" className="hover:text-text">Pourquoi Regulya</a>
            <a href="#offres" className="hover:text-text">Offres</a>
            <a href="#questions" className="hover:text-text">Questions</a>
          </nav>
          <LanguageSwitch className="ml-auto shrink-0 md:ml-2" />
          <Link to="/connexion" className="shrink-0 whitespace-nowrap rounded-xl border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2 sm:border-transparent">
            Se connecter
          </Link>
          <div className="hidden sm:block">
            <Button size="sm" onClick={signup}>
              Créer un compte
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 pb-4 pt-8 sm:pb-14 sm:gap-12 sm:px-6 sm:pt-12 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div>
            <p className="mb-4 inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-ink sm:text-sm">Pour les étudiants d’écoles de commerce et d’université</p>
            <h1 className="text-balance font-display text-[2rem] font-bold leading-[1.12] tracking-tight sm:text-5xl sm:leading-[1.1]">Tes cours deviennent un plan de révision qui tient jusqu’aux partiels.</h1>
            <p className="mt-4 max-w-xl text-base text-muted sm:mt-5 sm:text-lg">
              Importe tes PDF et tes PowerPoint : Regulya prépare tes QCM et tes flash cards, répartit tes révisions dans ta semaine et te dit chaque jour quoi revoir.
            </p>
            <div ref={heroCta} className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
              <Button size="lg" onClick={signup} className="w-full sm:w-auto">
                Commencer gratuitement
              </Button>
              <a href="#comment" className="inline-flex items-center justify-center rounded-2xl px-5 py-2.5 font-medium text-accent-ink hover:bg-surface-2 sm:border sm:border-border sm:py-3 sm:text-text">
                Voir comment ça marche ↓
              </a>
            </div>
            <ul className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted sm:justify-start">
              <li>✓ Gratuit, sans carte bancaire</li>
              <li>✓ {ESSAI_JOURS} jours de Premium offerts</li>
              <li>✓ Installable sur téléphone</li>
            </ul>
          </div>
          <AppPreview />
        </section>

        <Section id="comment" eyebrow="Comment ça marche" title="Trois étapes, et tu révises déjà" intro="Pas besoin de tout configurer : importe un premier cours, le reste suit.">
          <ol className="grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-6">
                <span className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold text-muted">Étape {i + 1}</span>
                </span>
                <h3 className="font-display text-xl font-bold">{s.title}</h3>
                <p className="text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="comparaison" eyebrow="Pourquoi Regulya" title="ChatGPT fait des QCM. Il ne te fait pas réviser." intro="Une IA généraliste répond quand tu lui demandes. Regulya organise ton travail jusqu’à l’examen, et ne te lâche pas entre-temps.">
          {/* Téléphone : une carte par fonction, les trois réponses côte à côte */}
          <ul className="flex flex-col gap-3 sm:hidden">
            {COMPARE.map((c) => (
              <li key={c.row} className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-medium">{c.row}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  {(
                    [
                      ['Regulya', c.us, true],
                      ['ChatGPT, NotebookLM', c.ai, false],
                      ['Anki, Quizlet', c.cards, false],
                    ] as const
                  ).map(([name, v, ours]) => (
                    <div key={name} className={cx('flex flex-col items-center gap-1.5 rounded-xl px-1 py-2', ours ? 'bg-accent-soft' : 'bg-surface-2')}>
                      <dt className={cx('flex min-h-[2.5em] items-center leading-tight', ours ? 'font-display font-bold text-accent-ink' : 'text-muted')}>{name}</dt>
                      <dd className="flex h-5 items-center">
                        <Mark v={v} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-3xl border border-border bg-surface sm:block">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-border text-sm">
                  <th className="p-4 font-medium text-muted" scope="col">
                    <span className="sr-only">Fonction</span>
                  </th>
                  <th className="p-4 text-center font-display font-bold text-accent-ink" scope="col">Regulya</th>
                  <th className="p-4 text-center font-medium text-muted" scope="col">IA généraliste (ChatGPT, NotebookLM…)</th>
                  <th className="p-4 text-center font-medium text-muted" scope="col">Anki, Quizlet</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((c) => (
                  <tr key={c.row} className="border-b border-border last:border-0">
                    <th scope="row" className="p-4 font-medium">{c.row}</th>
                    <td className="bg-accent-soft/50 p-4 text-center"><Mark v={c.us} /></td>
                    <td className="p-4 text-center"><Mark v={c.ai} /></td>
                    <td className="p-4 text-center"><Mark v={c.cards} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section eyebrow="Tout ce qu’il faut" title="Un seul endroit pour toute ton année">
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex flex-col gap-2 rounded-3xl border border-border bg-surface p-6">
                <f.icon className="size-6 text-accent-ink" aria-hidden />
                <h3 className="font-display text-lg font-bold">{f.title}</h3>
                <p className="text-muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="offres" eyebrow="Offres" title="Gratuit pour t’organiser, Premium pour les partiels" intro={`Commence gratuitement. Essaie Premium ${ESSAI_JOURS} jours sans carte bancaire quand tu en as besoin.`}>
          <PlanChoice
            publicMode
            freeAction={
              <Button className="w-full" variant="secondary" onClick={signup}>
                Créer un compte gratuit
              </Button>
            }
            onSignup={signup}
          />
        </Section>

        <Section eyebrow="Tes données" title="Tes cours restent à toi">
          <ul className="grid gap-4 md:grid-cols-3">
            {[
              ['Visibles par toi seul', 'Chaque contenu est lié à ton compte et protégé côté serveur. Un lien de partage n’existe que si tu le crées.'],
              ['Rien sans ton action', 'Un cours n’est envoyé à l’IA que quand tu lances une génération. L’audio est supprimé après la transcription.'],
              ['Ni pub, ni traceurs', 'Aucune publicité, aucune revente, aucun outil de mesure d’audience tiers. Export complet et suppression du compte à tout moment.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3 rounded-3xl border border-border bg-surface p-6">
                <ShieldCheck className="size-6 shrink-0 text-success" aria-hidden />
                <div>
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-1 text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">
            Le détail est dans la <Link to="/confidentialite" className="text-accent-ink underline">politique de confidentialité</Link>.
          </p>
        </Section>

        <Section id="questions" eyebrow="Questions" title="Les questions qu’on nous pose">
          <Faq />
        </Section>

        <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          <div className="flex flex-col items-start gap-5 rounded-[32px] bg-accent p-8 text-white sm:p-12">
            <BookOpen className="size-8" aria-hidden />
            <h2 className="max-w-xl text-balance font-display text-3xl font-bold">Ton prochain partiel commence maintenant.</h2>
            <p className="max-w-xl text-white/85">Importe un cours ce soir, révise cinq minutes demain matin. Regulya s’occupe du reste.</p>
            <button type="button" onClick={signup} className="rounded-2xl bg-white px-6 py-3 font-semibold text-accent-ink hover:bg-white/90">
              Commencer gratuitement
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:px-6">
          <Logo withBaseline={false} className="h-6 w-auto text-text" />
          <p>
            Une question ? <span className="select-all text-text">{SITE.contact}</span> · réponse sous 48 h
          </p>
          <nav className="flex flex-wrap gap-4 sm:ml-auto" aria-label="Informations légales">
            <Link to="/cgu" className="hover:underline">CGU</Link>
            <Link to="/confidentialite" className="hover:underline">Confidentialité</Link>
            <Link to="/mentions-legales" className="hover:underline">Mentions légales</Link>
          </nav>
        </div>
      </footer>

      {/* Sur téléphone, le bouton reste visible une fois celui du haut sorti de l'écran */}
      <div
        className={cx(
          'fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-200 sm:hidden',
          showSticky ? 'translate-y-0' : 'pointer-events-none translate-y-full',
        )}
        aria-hidden={!showSticky}
      >
        <Button className="w-full" onClick={signup}>
          Commencer gratuitement
        </Button>
      </div>
      <div className="h-20 sm:hidden" />
    </div>
  )
}
