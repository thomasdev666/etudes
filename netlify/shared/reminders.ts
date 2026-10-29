// Rappels d'échéances par email : choix des devoirs à rappeler et contenu du message
const TZ = 'Europe/Paris'

// Jour calendaire à Paris, au format AAAA-MM-JJ
export const parisDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })

// Nombre de jours calendaires (heure de Paris) entre aujourd'hui et l'échéance
export function daysUntil(due: Date, now: Date) {
  const a = parisDay(now)
  const b = parisDay(due)
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000)
}

export type DueItem = { id: string; user_id: string; title: string; due_at: string; subject: string | null; space: string }
export type Pick = DueItem & { days: number }

// Devoirs à rappeler aujourd'hui, par utilisateur (sans ceux déjà rappelés à ce délai)
export function pickReminders(
  items: DueItem[],
  settings: Map<string, { notify_email: boolean; notify_days: number[] }>,
  sent: Set<string>,
  now: Date,
): Map<string, Pick[]> {
  const out = new Map<string, Pick[]>()
  for (const it of items) {
    const s = settings.get(it.user_id) ?? { notify_email: true, notify_days: [3, 1] }
    if (!s.notify_email) continue
    const days = daysUntil(new Date(it.due_at), now)
    if (!s.notify_days.includes(days) || sent.has(`${it.id}|${days}`)) continue
    out.set(it.user_id, [...(out.get(it.user_id) ?? []), { ...it, days }])
  }
  for (const list of out.values()) list.sort((a, b) => a.due_at.localeCompare(b.due_at))
  return out
}

const when = (days: number) => (days === 0 ? 'aujourd’hui' : days === 1 ? 'demain' : `dans ${days} jours`)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const hour = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export function reminderEmail(list: Pick[], appUrl: string) {
  const soonest = list[0]
  const subject =
    list.length === 1 ? `À rendre ${when(soonest.days)} : ${soonest.title}` : `${list.length} devoirs à rendre bientôt (le premier ${when(soonest.days)})`
  const text = [
    'Bonjour,',
    '',
    'Petit rappel de tes prochaines échéances :',
    ...list.map((p) => `• ${p.title}${p.subject ? ` (${p.subject})` : ''} — ${when(p.days)}, ${hour(p.due_at)}`),
    '',
    `Ouvrir mon agenda : ${appUrl}/agenda`,
    '',
    'Tu peux régler ou couper ces rappels dans Paramètres → Rappels par email.',
  ].join('\n')
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f4ecdc;font-family:Arial,Helvetica,sans-serif;color:#2b2118">
<div style="max-width:520px;margin:0 auto;padding:24px">
<p style="font-size:22px;font-weight:bold;margin:0 0 16px">Études<span style="color:#b9472c">.</span></p>
<div style="background:#faf5ea;border:1px solid #e0d3b8;border-radius:16px;padding:20px">
<p style="margin:0 0 12px">Petit rappel de tes prochaines échéances :</p>
${list
  .map(
    (p) => `<div style="border-left:4px solid #b9472c;padding:6px 12px;margin:10px 0">
<div style="font-weight:bold">${esc(p.title)}</div>
<div style="color:#66563f;font-size:14px">${p.subject ? `${esc(p.subject)} · ` : ''}${when(p.days)}, ${esc(hour(p.due_at))}</div></div>`,
  )
  .join('')}
<p style="margin:18px 0 0"><a href="${appUrl}/agenda" style="display:inline-block;background:#b9472c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:12px;font-weight:bold">Ouvrir mon agenda</a></p>
</div>
<p style="color:#66563f;font-size:12px;margin-top:16px">Tu peux régler ou couper ces rappels dans Paramètres → Rappels par email.</p>
</div></body></html>`
  return { subject, text, html }
}
