// Fiche « mes erreurs » après un QCM : les notions acquises sont citées en une ligne,
// les notions ratées sont réexpliquées en détail et illustrées. Consigne envoyée à l'assistant.
import type { Correction } from './types'

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function mistakesInstruction(quizTitle: string, corrections: Correction[]) {
  const ok = [...new Set(corrections.filter((c) => c.is_correct).map((c) => c.notion).filter(Boolean))]
  const missed = corrections.filter((c) => !c.is_correct)
  const lines = missed.map((c) => {
    const mine = c.chosen_index === null ? 'pas de réponse' : clip(c.choices[c.chosen_index] ?? '', 200)
    return `- Notion : ${c.notion || '—'}\n  Question : ${clip(c.question, 400)}\n  Ma réponse : ${mine}\n  Bonne réponse : ${clip(c.choices[c.correct_index] ?? '', 200)}`
  })
  return [
    `Fais-moi une fiche de révision ludique et encourageante, ciblée sur mes erreurs au QCM « ${quizTitle} ».`,
    ok.length
      ? `1. Une section courte « ✅ Ce que tu maîtrises » : une ligne par notion, sans réexpliquer. Notions réussies : ${ok.join(', ')}.`
      : '1. Pas de section sur les acquis : toutes les questions sont à revoir.',
    '2. Le cœur de la fiche : une section par notion ratée (regroupe les questions sur la même notion). Pour chacune : réexplique simplement la notion à partir du cours, illustre-la (schéma en étapes, carte ou tableau comparatif), donne un exemple concret, puis un encadré « attention » qui montre le piège dans lequel je suis tombé(e) et comment l’éviter.',
    '3. Termine par une section « 🎯 Mini-défi » : 3 questions rapides sur les notions ratées, avec les réponses à la fin.',
    '',
    'Mes erreurs :',
    ...lines,
  ].join('\n')
}
