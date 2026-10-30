-- =====================================================================
-- Regulya — mise à jour 14 : essai Premium de 7 jours, première semaine
-- plus généreuse, date de recharge des quotas, transcription Premium 5 h,
-- signalement des questions de QCM. Relançable sans danger.
-- =====================================================================

-- Essai et paiement : nouvelles sources d'abonnement
alter table public.subscriptions drop constraint if exists subscriptions_source_check;
alter table public.subscriptions add constraint subscriptions_source_check
  check (source in ('none', 'code', 'stripe', 'trial'));
alter table public.subscriptions add column if not exists trial_started_at timestamptz;
alter table public.subscriptions add column if not exists billing_period text
  check (billing_period in ('monthly', 'semester', 'annual'));

-- Première semaine après l'inscription : plus de générations pour prendre l'habitude
insert into public.plan_limits (plan, kind, weekly) values
  ('welcome', 'quiz', 10),
  ('welcome', 'cards', 10),
  ('welcome', 'mindmap', 5),
  ('welcome', 'sheet', 5),
  ('welcome', 'images', 5),
  ('welcome', 'exam_section', 3),
  ('welcome', 'exam_full', 0),
  ('welcome', 'transcription', 0),
  ('premium', 'transcription', 300)   -- 5 h d'audio par semaine
on conflict (plan, kind) do update set weekly = excluded.weekly;

-- Grille de quotas qui s'applique vraiment (premium, première semaine ou gratuit)
create or replace function public.effective_plan()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when public.current_plan() = 'premium' then 'premium'
    when (select created_at from auth.users where id = auth.uid()) > now() - interval '7 days' then 'welcome'
    else 'free' end
$$;

-- Détails de l'offre pour l'affichage
create or replace function public.plan_details()
returns table (plan text, source text, period_end timestamptz, welcome_until timestamptz, trial_available boolean, billing_period text)
language sql stable security definer set search_path = '' as $$
  select public.current_plan(),
         coalesce(s.source, 'none'),
         s.current_period_end,
         case when public.effective_plan() = 'welcome'
              then (select created_at from auth.users where id = auth.uid()) + interval '7 days' end,
         s.trial_started_at is null and public.current_plan() = 'free',
         s.billing_period
    from (select 1) d
    left join public.subscriptions s on s.user_id = auth.uid()
$$;

-- Usages de la semaine glissante, avec la date où une place se libère
drop function if exists public.usage_summary();
create function public.usage_summary()
returns table (kind text, used integer, max integer, next_free_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.kind,
         coalesce((select sum(e.amount)::int from public.usage_events e
                    where e.user_id = auth.uid() and e.kind = l.kind and e.created_at > now() - interval '7 days'), 0),
         l.weekly,
         (select min(e.created_at) + interval '7 days' from public.usage_events e
           where e.user_id = auth.uid() and e.kind = l.kind and e.created_at > now() - interval '7 days')
    from public.plan_limits l
   where l.plan = public.effective_plan()
   order by l.kind
$$;

create or replace function public.consume_quota(p_kind text, p_amount integer default 1)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_plan text := public.effective_plan();
  max_allowed integer;
  used_now integer;
  next_free timestamptz;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour continuer.'; end if;
  select weekly into max_allowed from public.plan_limits where plan = v_plan and kind = p_kind;
  if max_allowed is null then raise exception 'Cette fonction n’est pas reconnue.'; end if;
  if max_allowed = 0 then
    raise exception 'Cette fonction est réservée à l’offre Premium. Tu peux l’essayer gratuitement pendant 7 jours.' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount), 0), min(created_at) + interval '7 days' into used_now, next_free
    from public.usage_events
   where user_id = auth.uid() and kind = p_kind and created_at > now() - interval '7 days';
  if used_now + p_amount > max_allowed then
    raise exception 'Limite de la semaine atteinte (%/%). Une place se libère le %, ou passe en Premium.',
      used_now, max_allowed, to_char(next_free at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI') using errcode = 'P0001';
  end if;
  insert into public.usage_events (user_id, kind, amount) values (auth.uid(), p_kind, p_amount);
end $$;

-- Essai Premium de 7 jours, une seule fois par compte, sans carte bancaire
create or replace function public.start_trial()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  until timestamptz := now() + interval '7 days';
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour commencer l’essai.'; end if;
  if public.current_plan() = 'premium' then raise exception 'Tu as déjà Premium.'; end if;
  if exists (select 1 from public.subscriptions where user_id = auth.uid() and trial_started_at is not null) then
    raise exception 'Tu as déjà profité de l’essai gratuit.';
  end if;
  insert into public.subscriptions (user_id, plan, source, current_period_end, trial_started_at, updated_at)
  values (auth.uid(), 'premium', 'trial', until, now(), now())
  on conflict (user_id) do update set plan = 'premium', source = 'trial', current_period_end = until,
    trial_started_at = now(), updated_at = now();
  return until;
end $$;

revoke execute on function public.effective_plan() from anon, public;
revoke execute on function public.plan_details() from anon, public;
revoke execute on function public.usage_summary() from anon, public;
revoke execute on function public.start_trial() from anon, public;
grant execute on function public.effective_plan() to authenticated;
grant execute on function public.plan_details() to authenticated;
grant execute on function public.usage_summary() to authenticated;
grant execute on function public.start_trial() to authenticated;

-- Signalement d'une question de QCM fausse ou ambiguë
create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  reason text not null check (reason in ('wrong_answer', 'ambiguous', 'off_topic', 'too_easy', 'other')),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, question_id)
);
alter table public.question_reports enable row level security;
drop policy if exists "question_reports_own" on public.question_reports;
create policy "question_reports_own" on public.question_reports for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Extrait du cours qui justifie la bonne réponse
alter table public.quiz_questions add column if not exists source_excerpt text;

-- La correction renvoie aussi l'extrait du cours (toujours invisible avant la fin de la session)
create or replace function public.get_quiz_correction(p_session_id uuid)
returns jsonb language sql security definer set search_path = '' stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'question_id', qq.id,
      'question', qq.question,
      'choices', qq.choices,
      'correct_index', qq.correct_index,
      'chosen_index', a.chosen_index,
      'is_correct', a.is_correct,
      'explanation', qq.explanation,
      'notion', qq.notion,
      'source_excerpt', qq.source_excerpt,
      'time_ms', a.time_ms
    ) order by u.ord), '[]')
  from public.quiz_sessions s
  cross join lateral unnest(s.question_ids) with ordinality as u(qid, ord)
  join public.quiz_questions qq on qq.id = u.qid
  left join public.quiz_answers a on a.session_id = s.id and a.question_id = qq.id
  where s.id = p_session_id and s.user_id = auth.uid() and s.finished_at is not null;
$$;
