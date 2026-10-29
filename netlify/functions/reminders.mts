// Tâche planifiée quotidienne : rappels d'échéances par email (J-3 et J-1 par défaut).
// Envoi par SMTP (Brevo). Nécessite SUPABASE_SECRET_KEY, BREVO_SMTP_LOGIN, BREVO_SMTP_KEY et MAIL_FROM.
import type { Config } from '@netlify/functions'
import nodemailer from 'nodemailer'
import { pickReminders, reminderEmail, type DueItem } from '../shared/reminders'
import { adminClient } from '../shared/supabase'

export default async () => {
  const db = adminClient()
  const { BREVO_SMTP_LOGIN: login, BREVO_SMTP_KEY: key, MAIL_FROM: from } = process.env
  if (!db || !login || !key || !from) {
    console.log('Rappels ignorés : SUPABASE_SECRET_KEY, BREVO_SMTP_LOGIN, BREVO_SMTP_KEY ou MAIL_FROM manquant')
    return
  }
  const now = new Date()
  const until = new Date(now.getTime() + 8 * 86_400_000)

  const { data: rows, error } = await db
    .from('assignments')
    .select('id, user_id, title, due_at, space_id, subjects(name), spaces!inner(name, deleted_at)')
    .neq('status', 'done')
    .is('deleted_at', null)
    .is('spaces.deleted_at', null)
    .gte('due_at', now.toISOString())
    .lte('due_at', until.toISOString())
  if (error) throw error
  if (!rows.length) return

  type Row = { id: string; user_id: string; title: string; due_at: string; subjects: { name: string } | null; spaces: { name: string } }
  const items: DueItem[] = (rows as unknown as Row[]).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    due_at: r.due_at,
    subject: r.subjects?.name ?? null,
    space: r.spaces.name,
  }))
  const users = [...new Set(items.map((i) => i.user_id))]
  const [{ data: settings }, { data: sent }, { data: leaving }] = await Promise.all([
    db.from('user_settings').select('user_id, notify_email, notify_days').in('user_id', users),
    db.from('notification_log').select('assignment_id, days_before').in('assignment_id', items.map((i) => i.id)),
    db.from('account_deletions').select('user_id').in('user_id', users),
  ])
  const picks = pickReminders(
    items.filter((i) => !(leaving ?? []).some((l) => l.user_id === i.user_id)),
    new Map((settings ?? []).map((s) => [s.user_id, s])),
    new Set((sent ?? []).map((s) => `${s.assignment_id}|${s.days_before}`)),
    now,
  )

  const mailer = nodemailer.createTransport({ host: 'smtp-relay.brevo.com', port: 587, secure: false, auth: { user: login, pass: key } })
  const appUrl = process.env.URL ?? 'https://jadecaruana.fr'
  for (const [userId, list] of picks) {
    try {
      const { data: u } = await db.auth.admin.getUserById(userId)
      const to = u.user?.email
      if (!to) continue
      await mailer.sendMail({ from, to, ...reminderEmail(list, appUrl) })
      await db.from('notification_log').upsert(
        list.map((p) => ({ assignment_id: p.id, days_before: p.days, user_id: userId })),
        { onConflict: 'assignment_id,days_before', ignoreDuplicates: true },
      )
    } catch (e) {
      // Un envoi raté n'empêche pas les autres
      console.error('Rappel non envoyé', userId, e instanceof Error ? e.message : e)
    }
  }
}

// Tous les jours à 6 h UTC (7 h ou 8 h à Paris)
export const config: Config = { schedule: '0 6 * * *' }
