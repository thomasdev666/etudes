-- =====================================================================
-- Regulya — mise à jour 21 : file d'attente (une génération à la fois),
-- limites de session sur 5 heures, verrou des quotas et limite de rythme
-- pour GIRAFA. Relançable sans danger.
-- =====================================================================

-- 1. Limites de session : nombre maximum sur une fenêtre glissante de 5 heures
insert into public.plan_limits (plan, kind, weekly) values
  ('free', 'session_gen', 4), ('welcome', 'session_gen', 6), ('premium', 'session_gen', 12),
  ('free', 'session_chat', 15), ('welcome', 'session_chat', 25), ('premium', 'session_chat', 60)
on conflict (plan, kind) do update set weekly = excluded.weekly;

-- Les limites de session ne sont pas des limites hebdomadaires : on les masque du tableau d'usage
create or replace function public.usage_summary()
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
     and l.kind not in ('session_gen', 'session_chat')
   order by l.kind
$$;

-- Les types de génération partagent une même limite de session ; GIRAFA a la sienne
create or replace function public.is_premium_user(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions s
                  where s.user_id = p_user and s.plan = 'premium'
                    and (s.current_period_end is null or s.current_period_end > now()))
$$;
revoke execute on function public.is_premium_user(uuid) from anon, authenticated, public;

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
    raise exception 'Cette fonction est réservée à l’offre Premium. Tu peux l’essayer gratuitement pendant 7 jours.' using errcode = 'P0001';
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
revoke execute on function public.consume_quota(text, integer) from anon, public;
grant execute on function public.consume_quota(text, integer) to authenticated;

-- Où en est l'étudiant dans sa session de 5 heures (pour l'affichage « bientôt la limite »)
create or replace function public.session_status()
returns table (kind text, used integer, max integer, reset_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select 'gen'::text,
         coalesce((select sum(e.amount)::int from public.usage_events e
                    where e.user_id = auth.uid()
                      and e.kind in ('quiz', 'cards', 'mindmap', 'sheet', 'images', 'exam_section', 'exam_full')
                      and e.created_at > now() - interval '5 hours'), 0),
         (select l.weekly from public.plan_limits l where l.plan = public.effective_plan() and l.kind = 'session_gen'),
         (select min(e.created_at) + interval '5 hours' from public.usage_events e
           where e.user_id = auth.uid()
             and e.kind in ('quiz', 'cards', 'mindmap', 'sheet', 'images', 'exam_section', 'exam_full')
             and e.created_at > now() - interval '5 hours')
  union all
  select 'chat'::text,
         coalesce((select sum(e.amount)::int from public.usage_events e
                    where e.user_id = auth.uid() and e.kind = 'chat' and e.created_at > now() - interval '5 hours'), 0),
         (select l.weekly from public.plan_limits l where l.plan = public.effective_plan() and l.kind = 'session_chat'),
         (select min(e.created_at) + interval '5 hours' from public.usage_events e
           where e.user_id = auth.uid() and e.kind = 'chat' and e.created_at > now() - interval '5 hours')
$$;
revoke execute on function public.session_status() from anon, public;
grant execute on function public.session_status() to authenticated;

-- 2. File d'attente : une seule génération IA à la fois. La transcription et la lecture des images
-- d'un cours ont leur propre voie : la fiche qui les attend ne doit jamais bloquer la file.
-- Une génération « en cours » sans nouvelle depuis 6 minutes est considérée bloquée
-- (la fonction serveur envoie un signal toutes les 8 secondes environ).
create or replace function public.start_ai_job(p_job uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  j public.ai_jobs%rowtype;
  head_id uuid;
  start_result jsonb := jsonb_build_object('progress', 0.03, 'phase', 'Lecture du contenu…');
begin
  if auth.uid() is null then return false; end if;
  -- Les décisions de la file sont prises une par une
  perform pg_advisory_xact_lock(hashtext('ai_queue'));

  update public.ai_jobs set status = 'error', error = 'La génération a été interrompue (trop longue). Relance-la.'
   where status = 'running' and kind not in ('transcription', 'course_images') and updated_at < now() - interval '6 minutes';
  update public.ai_jobs set status = 'error', error = 'Génération restée trop longtemps en file d’attente. Relance-la.'
   where status = 'pending' and kind not in ('transcription', 'course_images') and created_at < now() - interval '70 minutes';

  select * into j from public.ai_jobs where id = p_job;
  if not found or j.user_id <> auth.uid() or j.status <> 'pending' or j.deleted_at is not null then return false; end if;

  if j.kind in ('transcription', 'course_images') then
    update public.ai_jobs set status = 'running', result = start_result where id = p_job;
    return true;
  end if;

  if exists (select 1 from public.ai_jobs where status = 'running' and kind not in ('transcription', 'course_images')) then return false; end if;

  -- Premium d'abord, puis par ordre d'arrivée
  select q.id into head_id from public.ai_jobs q
   where q.status = 'pending' and q.kind not in ('transcription', 'course_images') and q.deleted_at is null
   order by (case when public.is_premium_user(q.user_id) then 0 else 1 end), q.created_at, q.id
   limit 1;
  if head_id is distinct from p_job then return false; end if;

  update public.ai_jobs set status = 'running', result = start_result where id = p_job;
  return true;
end $$;
revoke execute on function public.start_ai_job(uuid) from anon, public;
grant execute on function public.start_ai_job(uuid) to authenticated;

-- Position d'une tâche dans la file (pour l'affichage) : rang, et si une génération tourne déjà
create or replace function public.ai_queue_position(p_job uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with ordered as (
    select q.id,
           row_number() over (order by (case when public.is_premium_user(q.user_id) then 0 else 1 end), q.created_at, q.id) as rn
      from public.ai_jobs q
     where q.status = 'pending' and q.kind not in ('transcription', 'course_images') and q.deleted_at is null
  )
  select jsonb_build_object(
           'position', (select o.rn from ordered o where o.id = p_job),
           'busy', exists (select 1 from public.ai_jobs r where r.status = 'running' and r.kind not in ('transcription', 'course_images')))
   where exists (select 1 from public.ai_jobs j where j.id = p_job and j.user_id = auth.uid())
$$;
revoke execute on function public.ai_queue_position(uuid) from anon, public;
grant execute on function public.ai_queue_position(uuid) to authenticated;
