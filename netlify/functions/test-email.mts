// Envoie un email de test à l'utilisateur connecté (vérifie la configuration Brevo)
import nodemailer from 'nodemailer'
import { reminderEmail } from '../shared/reminders'
import { errorResponse, HttpError, userClient } from '../shared/supabase'

export default async (req: Request) => {
  try {
    const { db } = await userClient(req)
    const { BREVO_SMTP_LOGIN: login, BREVO_SMTP_KEY: key, MAIL_FROM: from } = process.env
    if (!login || !key || !from) throw new HttpError(503, 'Envoi d’emails non configuré : ajoute BREVO_SMTP_LOGIN, BREVO_SMTP_KEY et MAIL_FROM dans Netlify.')
    const { data } = await db.auth.getUser()
    const to = data.user?.email
    if (!to) throw new HttpError(400, 'Adresse email introuvable')
    const tomorrow = new Date(Date.now() + 86_400_000)
    tomorrow.setUTCHours(16, 0, 0, 0)
    const mail = reminderEmail([{ id: 'test', user_id: '', title: 'Exemple de devoir (email de test)', due_at: tomorrow.toISOString(), subject: null, space: '', days: 1 }], process.env.URL ?? 'https://jadecaruana.fr')
    const mailer = nodemailer.createTransport({ host: 'smtp-relay.brevo.com', port: 587, secure: false, auth: { user: login, pass: key } })
    await mailer.sendMail({ from, to, ...mail, subject: `Test — ${mail.subject}` })
    return Response.json({ to })
  } catch (e) {
    return errorResponse(e)
  }
}
