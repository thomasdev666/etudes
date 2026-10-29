// Mise en page commune de tous les emails d'Études.
// Tables et styles en ligne : compatible avec Gmail, Outlook, Apple Mail et les téléphones.
// Utilisé par les rappels (Brevo) et, via les fichiers de supabase/email-templates, par les emails d'authentification.

export type EmailBlock = {
  heading: string
  paragraphs?: string[] // texte déjà échappé (HTML autorisé)
  list?: string[] // éléments déjà échappés
  code?: string // code à saisir, affiché en grand
  button?: { label: string; url: string }
  footnote?: string
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

const C = {
  bg: '#f4ecdc',
  card: '#faf5ea',
  line: '#e0d3b8',
  ink: '#2b2118',
  muted: '#66563f',
  accent: '#b9472c',
}
const FONT = 'Arial,Helvetica,sans-serif'

// Lien de bouton : URL insérée telle quelle (les modèles Supabase y mettent {{ .ConfirmationURL }})
function button(label: string, url: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 10px;"><tr><td style="border-radius:12px;background:${C.accent};">
<a href="${url}" style="display:inline-block;padding:14px 24px;font:bold 15px ${FONT};color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>
</td></tr></table>
<p style="margin:0;font:12px/1.5 ${FONT};color:${C.muted};">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br><span style="word-break:break-all;">${url}</span></p>`
}

export function emailLayout(preheader: string, b: EmailBlock): string {
  const paragraphs = (b.paragraphs ?? []).map((p) => `<p style="margin:0 0 12px;font:15px/1.6 ${FONT};color:${C.ink};">${p}</p>`).join('\n')
  const list = b.list?.length
    ? `<ul style="margin:6px 0 14px;padding:0;list-style:none;">${b.list
        .map((li) => `<li style="margin:0 0 10px;padding:10px 14px;background:${C.bg};border-left:4px solid ${C.accent};border-radius:8px;font:14px/1.5 ${FONT};color:${C.ink};">${li}</li>`)
        .join('')}</ul>`
    : ''
  const code = b.code
    ? `<div style="margin:18px 0;padding:16px;background:${C.bg};border:1px dashed ${C.accent};border-radius:12px;text-align:center;font:bold 30px/1 ${FONT};letter-spacing:8px;color:${C.ink};">${b.code}</div>
<p style="margin:0 0 12px;font:13px/1.5 ${FONT};color:${C.muted};">Saisis ce code dans l’appli. Il n’est valable qu’un temps limité et ne peut servir qu’une fois.</p>`
    : ''
  const btn = b.button ? button(b.button.label, b.button.url) : ''
  const foot = b.footnote ? `<p style="margin:16px 0 0;font:13px/1.5 ${FONT};color:${C.muted};">${b.footnote}</p>` : ''

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(b.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
<tr><td align="center" style="padding:32px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 18px;font:bold 28px ${FONT};color:${C.ink};">Études<span style="color:${C.accent};">.</span></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:18px;padding:28px 26px 24px;">
<h1 style="margin:0 0 14px;font:bold 22px/1.3 ${FONT};color:${C.ink};">${b.heading}</h1>
${paragraphs}
${list}
${code}
${btn}
${foot}
</td></tr>
<tr><td style="padding:18px 6px 0;font:12px/1.6 ${FONT};color:${C.muted};">
Études · Organise tes cours, révise mieux, réussis tes examens.<br>
Tu reçois cet email parce que tu as un compte Études.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`
}
