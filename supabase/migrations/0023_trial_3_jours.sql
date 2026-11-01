-- =====================================================================
-- Regulya — mise à jour 23 : essai Premium de 3 jours (au lieu de 7).
-- La « semaine de bienvenue » des quotas reste à 7 jours.
-- Relançable sans danger.
-- =====================================================================

create or replace function public.start_trial()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  until timestamptz := now() + interval '3 days';
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

create or replace function public.consume_quota(p_kind text, p_amount integer default 1)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_plan text := public.effective_plan();
  max_allowed integer;
  used_now integer;
  next_free timestamptz;
  win_kind text;
  win_members text[];
  win_max integer;
  win_used integer;
  win_reset timestamptz;
  last_chat timestamptz;
  gen_kinds constant text[] := array['quiz', 'cards', 'mindmap', 'sheet', 'images', 'exam_section', 'exam_full'];
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour continuer.'; end if;
  -- Une seule vérification à la fois par étudiant : deux clics rapides ne dépassent plus la limite
  perform pg_advisory_xact_lock(hashtext('quota:' || auth.uid()::text));

  select weekly into max_allowed from public.plan_limits where plan = v_plan and kind = p_kind;
  if max_allowed is null then raise exception 'Cette fonction n’est pas reconnue.'; end if;
  if max_allowed = 0 then
    raise exception 'Cette fonction est réservée à l’offre Premium. Tu peux l’essayer gratuitement pendant 3 jours.' using errcode = 'P0001';
  end if;

  -- 1. Limite de la semaine
  select coalesce(sum(amount), 0), min(created_at) + interval '7 days' into used_now, next_free
    from public.usage_events
   where user_id = auth.uid() and kind = p_kind and created_at > now() - interval '7 days';
  if used_now + p_amount > max_allowed then
    raise exception 'Limite de la semaine atteinte (%/%). Une place se libère le %, ou passe en Premium.',
      used_now, max_allowed, to_char(next_free at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI') using errcode = 'P0001';
  end if;

  -- 2. Limite de session (5 heures glissantes), comme dans les assistants IA
  if p_kind = 'chat' then
    win_kind := 'session_chat';
    win_members := array['chat'];
  elsif p_kind = any(gen_kinds) then
    win_kind := 'session_gen';
    win_members := gen_kinds;
  end if;
  if win_kind is not null then
    select weekly into win_max from public.plan_limits where plan = v_plan and kind = win_kind;
    select coalesce(sum(amount), 0), min(created_at) + interval '5 hours' into win_used, win_reset
      from public.usage_events
     where user_id = auth.uid() and kind = any(win_members) and created_at > now() - interval '5 hours';
    if win_max is not null and win_used + p_amount > win_max then
      raise exception 'Limite de session atteinte (%/%). Elle se réinitialise vers %. Tu peux attendre, ou passer en Premium pour aller plus vite.',
        win_used, win_max, to_char(win_reset at time zone 'Europe/Paris', 'HH24"h"MI') using errcode = 'P0001';
    end if;
  end if;

  -- 3. GIRAFA : une question toutes les 5 secondes, pour éviter le spam
  if p_kind = 'chat' then
    select max(created_at) into last_chat from public.usage_events where user_id = auth.uid() and kind = 'chat';
    if last_chat is not null and last_chat > now() - interval '5 seconds' then
      raise exception 'Doucement 🦒 : une question toutes les 5 secondes, pour que tout le monde ait sa place.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.usage_events (user_id, kind, amount) values (auth.uid(), p_kind, p_amount);
end $$;

create or replace function public.check_quota(p_kind text, p_amount integer default 1)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_plan text := public.effective_plan();
  max_allowed integer;
  used_now integer;
  next_free timestamptz;
  win_max integer;
  win_used integer;
  win_reset timestamptz;
  gen_kinds constant text[] := array['quiz', 'cards', 'mindmap', 'sheet', 'images', 'exam_section', 'exam_full'];
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour continuer.'; end if;
  select weekly into max_allowed from public.plan_limits where plan = v_plan and kind = p_kind;
  if max_allowed is null then return; end if;
  if max_allowed = 0 then
    raise exception 'Cette fonction est réservée à l’offre Premium. Tu peux l’essayer gratuitement pendant 3 jours.' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount), 0), min(created_at) + interval '7 days' into used_now, next_free
    from public.usage_events
   where user_id = auth.uid() and kind = p_kind and created_at > now() - interval '7 days';
  if used_now + p_amount > max_allowed then
    raise exception 'Limite de la semaine atteinte (%/%). Une place se libère le %, ou passe en Premium.',
      used_now, max_allowed, to_char(next_free at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI') using errcode = 'P0001';
  end if;
  if p_kind = any(gen_kinds) then
    select weekly into win_max from public.plan_limits where plan = v_plan and kind = 'session_gen';
    select coalesce(sum(amount), 0), min(created_at) + interval '5 hours' into win_used, win_reset
      from public.usage_events
     where user_id = auth.uid() and kind = any(gen_kinds) and created_at > now() - interval '5 hours';
    if win_max is not null and win_used + p_amount > win_max then
      raise exception 'Limite de session atteinte (%/%). Elle se réinitialise vers %. Tu peux attendre, ou passer en Premium pour aller plus vite.',
        win_used, win_max, to_char(win_reset at time zone 'Europe/Paris', 'HH24"h"MI') using errcode = 'P0001';
    end if;
  end if;
end $$;
