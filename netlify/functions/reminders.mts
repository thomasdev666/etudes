// Tâche planifiée quotidienne : rappels d'échéances (email et notification) et cartes du jour.
// Email : SMTP Brevo (BREVO_SMTP_LOGIN, BREVO_SMTP_KEY, MAIL_FROM). Notifications : clés VAPID.
// Nécessite toujours SUPABASE_SECRET_KEY.
import type { Config } from '@netlify/functions'
import nodemailer from 'nodemailer'
import { pushReady, pushToUser } from '../shared/push'
import { cardsPush, pickReminders, reminderEmail, reminderPush, type DueItem } from '../shared/reminders'
import { adminClient } from '../shared/supabase'

type Settings = { user_id: string; notify_email: boolean; notify_days: number[]; notify_cards?: boolean }

export default async () => {
  const db = adminClient()
  if (!db) {
    console.log('Rappels ignorés : SUPABASE_SECRET_KEY manquante')
    return
  }
  const { BREVO_SMTP_LOGIN: login, BREVO_SMTP_KEY: key, MAIL_FROM: from } = process.env
  const mailer = login && key && from ? nodemailer.createTransport({ host: 'smtp-relay.brevo.com', port: 587, secure: false, auth: { user: login, pass: key } }) : null
  const push = pushReady()
  if (!mailer && !push) {
    console.log('Rappels ignorés : ni email (Brevo) ni notifications (VAPID) configurés')
    return
  }
  const now = new Date()
  const appUrl = process.env.URL ?? 'https://jadecaruana.fr'
  const { data: leaving } = await db.from('account_deletions').select('user_id')
  const gone = new Set((leaving ?? []).map((l) => l.user_id))

  // --- Échéances
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

  type Row = { id: string; user_id: string; title: string; due_at: string; subjects: { name: string } | null; spaces: { name: string } }
  const items: DueItem[] = (rows as unknown as Row[])
    .filter((r) => !gone.has(r.user_id))
    .map((r) => ({ id: r.id, user_id: r.user_id, title: r.title, due_at: r.due_at, subject: r.subjects?.name ?? null, space: r.spaces.name }))
  const users = [...new Set(items.map((i) => i.user_id))]
  const [{ data: settings }, { data: sent }] = await Promise.all([
    users.length ? db.from('user_settings').select('user_id, notify_email, notify_days').in('user_id', users) : Promise.resolve({ data: [] as Settings[] }),
    items.length ? db.from('notification_log').select('assignment_id, days_before').in('assignment_id', items.map((i) => i.id)) : Promise.resolve({ data: [] }),
  ])
  const byUser = new Map(((settings ?? []) as Settings[]).map((s) => [s.user_id, s]))
  const already = new Set(((sent ?? []) as { assignment_id: string; days_before: number }[]).map((s) => `${s.assignment_id}|${s.days_before}`))
  // Les notifications suivent les mêmes délais, même si l'email est coupé
  const forPush = pickReminders(items, new Map([...byUser].map(([u, s]) => [u, { ...s, notify_email: true }])), already, now)
  const forEmail = pickReminders(items, byUser, already, now)

  for (const [userId, list] of forPush) {
    let delivered = false
    try {
      const emailList = forEmail.get(userId)
      if (mailer && emailList) {
        const { data: u } = await db.auth.admin.getUserById(userId)
        if (u.user?.email) {
          await mailer.sendMail({ from, to: u.user.email, ...reminderEmail(emailList, appUrl) })
          delivered = true
        }
      }
      if (push && (await pushToUser(db, userId, reminderPush(list))) > 0) delivered = true
      if (delivered)
        await db.from('notification_log').upsert(
          list.map((p) => ({ assignment_id: p.id, days_before: p.days, user_id: userId })),
          { onConflict: 'assignment_id,days_before', ignoreDuplicates: true },
        )
    } catch (e) {
      // Un envoi raté n'empêche pas les autres
      console.error('Rappel non envoyé', userId, e instanceof Error ? e.message : e)
    }
  }

  // --- Cartes du jour (notification seulement)
  if (!push) return
  const { data: subs } = await db.from('push_subscriptions').select('user_id')
  const pushUsers = [...new Set((subs ?? []).map((s) => s.user_id as string))].filter((u) => !gone.has(u))
  if (!pushUsers.length) return
  const { data: prefs } = await db.from('user_settings').select('user_id, notify_cards').in('user_id', pushUsers)
  const off = new Set((prefs ?? []).filter((p) => p.notify_cards === false).map((p) => p.user_id))
  for (const userId of pushUsers.filter((u) => !off.has(u))) {
    const { count } = await db
      .from('flashcards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null)
      .lte('due_at', now.toISOString())
    if (count && count > 0) await pushToUser(db, userId, cardsPush(count)).catch((e) => console.error('Cartes du jour', userId, e))
  }
}

// Tous les jours à 6 h UTC (7 h ou 8 h à Paris)
export const config: Config = { schedule: '0 6 * * *' }
