// Pertinence par mots-clés, sans service externe : utilisé par GIRAFA (côté serveur) pour trouver
// les passages de cours qui répondent à une question, et (des deux côtés) pour proposer les
// matières concernées par une demande. Accents, majuscules et pluriels sont ignorés.

const STOP = new Set(
  (
    'les des une que qui quoi dans pour par sur avec sans est sont etre ete fait faire fais moi toi nous vous ils elles leur leurs ' +
    'cette ces cet mon mes ton tes son ses mais donc car pas plus tres tout tous toute toutes comme quel quelle quels quelles ' +
    'comment pourquoi quand combien entre aussi bien peux peut veux veut voudrais faut alors cela ceci celui celle dont ' +
    'liste complete complet fiche fiches resume cours chapitre notion notions explique expliquer donne donner question questions ' +
    'the and for with what how why does this that are from'
  ).split(' '),
)

export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Racine courte : « financière », « financier », « finance » se retrouvent
const stem = (w: string) => (w.length > 6 ? w.slice(0, 6) : w.replace(/s$/, ''))

export function terms(text: string): string[] {
  const words = fold(text).match(/[a-z0-9]{3,}/g) ?? []
  return [...new Set(words.filter((w) => !STOP.has(w)).map(stem))]
}

function countHits(haystack: string, keys: string[]) {
  const words = fold(haystack).match(/[a-z0-9]{3,}/g) ?? []
  const counts = new Map<string, number>()
  for (const w of words) {
    const s = stem(w)
    if (keys.includes(s)) counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  return counts
}

export type Doc = { id: string; title: string; subject_id: string | null; text: string }

// Découpe en passages d'environ `size` caractères, sur les fins de paragraphe
export function chunks(text: string, size = 1200): string[] {
  const out: string[] = []
  let cur = ''
  for (const para of text.split(/\n{1,}/)) {
    if (cur && cur.length + para.length > size) {
      out.push(cur)
      cur = ''
    }
    cur += (cur ? '\n' : '') + para
    while (cur.length > size * 1.6) {
      out.push(cur.slice(0, size))
      cur = cur.slice(size)
    }
  }
  if (cur.trim()) out.push(cur)
  return out
}

// Passages les plus pertinents pour la question, dans la limite de `maxChars`
export function pickPassages(question: string, docs: Doc[], maxChars = 24_000) {
  const keys = terms(question)
  if (!keys.length) return { text: '', titles: [] as string[] }
  const scored: { doc: Doc; text: string; score: number }[] = []
  for (const doc of docs) {
    const titleHits = countHits(doc.title, keys).size
    for (const c of chunks(doc.text)) {
      const hits = countHits(c, keys)
      if (!hits.size && !titleHits) continue
      // Plusieurs mots différents de la question comptent plus que la répétition d'un seul
      const score = hits.size * 3 + [...hits.values()].reduce((a, b) => a + Math.min(b, 4), 0) + titleHits * 2
      if (hits.size) scored.push({ doc, text: c, score })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  const parts: string[] = []
  const titles = new Set<string>()
  let used = 0
  for (const s of scored) {
    if (used + s.text.length > maxChars) continue
    parts.push(`### ${s.doc.title}\n${s.text}`)
    titles.add(s.doc.title)
    used += s.text.length
  }
  return { text: parts.join('\n\n'), titles: [...titles] }
}

// Matières concernées par une demande : nom de la matière, titres et contenus de ses cours
export function rankSubjects(request: string, subjects: { id: string; name: string; keywords?: string[] | null }[], docs: Doc[]) {
  const keys = terms(request)
  if (!keys.length) return []
  const scores = subjects.map((s) => {
    let score = countHits(`${s.name} ${(s.keywords ?? []).join(' ')}`, keys).size * 10
    for (const d of docs.filter((x) => x.subject_id === s.id)) {
      score += countHits(d.title, keys).size * 3
      score += Math.min(countHits(d.text.slice(0, 20_000), keys).size, 3)
    }
    return { id: s.id, score }
  })
  const best = Math.max(0, ...scores.map((s) => s.score))
  // Seulement les matières vraiment concernées (au moins un tiers du meilleur score)
  return scores
    .filter((s) => s.score > 0 && s.score >= best / 3)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.id)
}

// ---------------------------------------------------------------- GIRAFA : hors sujet

// Mots du travail d'étudiant (français et anglais). Volontairement sans mots trop généraux
// (« comment », « pourquoi », « note »…) : ils ouvriraient la porte à toutes les conversations.
const STUDY_WORDS =
  /(cours|r[ée]vis|examen|partiel|devoir|exercice|qcm|quiz|fiche|flash ?card|carte mentale|formule|d[ée]finition|d[ée]finir|chapitre|notion|concept|th[ée]orie|mod[èe]le|m[ée]thode|calcul|ratio|bilan|sujet|corrig|dissertation|r[ée]dig|expos[ée]|oral|\btd\b|\btp\b|bibliographi|auteur|apprendre|comprendre|expliqu|c.est quoi|qu.est.ce que|qu.est.ce qu|r[ée]sum|synth[èe]se|m[ée]mo|mati[èe]re|bachelor|mba|management|finance|compta|[ée]conom|marketing|gestion|strat[ée]gie|droit|statistique|excel|anglais|english|course|exam|study|homework|assignment|lecture|chapter|formula|theory|revis|summary|essay|mock|what is|explain|define|difference entre|diff[ée]rence entre)/i

// Bonjour, merci, petite conversation : une réponse aimable, sans IA
const GREETING = /^\s*(salut|bonjour|bonsoir|hello|hey|coucou|yo|merci|thanks|ça va|ca va|hi)\b/i
// Stress avant un examen : réponse rassurante, qui ramène au plan de travail
const STRESS = /(stress|angoiss|panique|paniqu|flipp|peur|pas pr[êe]t|pas prete|j.ai peur|rat[ée] mon|galère)/i

export type OffTopicReply = { text: string }

// Vrai si la question concerne les études de l'étudiant : mots du travail, matière, ou passage trouvé dans ses cours
export function isStudyQuestion(question: string, subjects: { id: string; name: string; keywords?: string[] | null }[], docs: Doc[], passagesFound: boolean) {
  if (STUDY_WORDS.test(question) || STRESS.test(question)) return true
  if (passagesFound) return true
  return rankSubjects(question, subjects, docs).length > 0
}

// Réponse automatique hors sujet : elle ne consomme ni la clé IA ni le quota
export function offTopicReply(question: string): OffTopicReply {
  if (GREETING.test(question)) return { text: 'Salut 🦒 ! Pose-moi une question sur tes cours, tes devoirs ou tes révisions, ou demande-moi une fiche ou un QCM.' }
  if (STRESS.test(question)) return { text: 'Respire 🦒 Un examen se prépare pas à pas. Dis-moi la matière et la date, et on fait un plan ensemble.' }
  return { text: 'Je reste sur tes études 🦒 : tes cours, tes devoirs et tes révisions, c’est là que je peux vraiment t’aider. Pose-moi une question sur une matière, ou demande une fiche ou un QCM.' }
}
