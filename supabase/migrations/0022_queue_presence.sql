-- =====================================================================
-- Regulya — mise à jour 22 : file d'attente plus juste et plus économe.
-- - Seuls les étudiants dont l'appli est ouverte comptent dans la file : une génération
--   lancée puis abandonnée (onglet fermé) ne bloque plus les autres ; elle reprend sa place
--   quand l'étudiant revient.
-- - L'appli réserve son tour directement dans la base : la fonction serveur n'est appelée
--   qu'une fois, au moment de démarrer.
-- - Vérification du quota avant d'entrer dans la file (pas d'attente pour rien).
-- Relançable sans danger.
-- =====================================================================

create index if not exists ai_jobs_queue_idx on public.ai_jobs (status, created_at) where status in ('pending', 'running');

-- Vérifie la limite de la semaine et la limite de session, sans rien consommer
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
    raise exception 'Cette fonction est réservée à l’offre Premium. Tu peux l’essayer gratuitement pendant 7 jours.' using errcode = 'P0001';
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
revoke execute on function public.check_quota(text, integer) from anon, public;
grant execute on function public.check_quota(text, integer) to authenticated;

-- Réserve le tour d'une génération. Appelée toutes les quelques secondes par l'appli tant que
-- la tâche attend : chaque appel signale que l'étudiant est toujours là.
-- En cas de succès, la tâche passe « en cours » avec la marque claimed : la fonction serveur
-- la prend en charge une seule fois.
create or replace function public.start_ai_job(p_job uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  j public.ai_jobs%rowtype;
  head_id uuid;
  start_result constant jsonb := jsonb_build_object('progress', 0.03, 'phase', 'Démarrage…', 'claimed', true);
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('ai_queue'));

  -- Génération sans signe de vie depuis 14 minutes : la fonction serveur s'arrête à 13, elle est perdue
  update public.ai_jobs set status = 'error', error = 'La génération a été interrompue (trop longue). Relance-la.'
   where status = 'running' and kind not in ('transcription', 'course_images') and updated_at < now() - interval '14 minutes';
  -- Tour réservé mais jamais pris en charge (onglet fermé juste après) : la tâche retourne dans la file
  update public.ai_jobs set status = 'pending', result = null
   where status = 'running' and result->>'claimed' = 'true' and updated_at < now() - interval '2 minutes';
  update public.ai_jobs set status = 'error', error = 'Génération restée trop longtemps en file d’attente. Relance-la.'
   where status = 'pending' and kind not in ('transcription', 'course_images') and created_at < now() - interval '70 minutes';

  select * into j from public.ai_jobs where id = p_job;
  if not found or j.user_id <> auth.uid() or j.status <> 'pending' or j.deleted_at is not null then return false; end if;

  -- L'étudiant est là
  update public.ai_jobs set updated_at = now() where id = p_job;

  if j.kind in ('transcription', 'course_images') then
    update public.ai_jobs set status = 'running', result = start_result where id = p_job;
    return true;
  end if;

  if exists (select 1 from public.ai_jobs where status = 'running' and kind not in ('transcription', 'course_images')) then return false; end if;

  -- Premium d'abord, puis par ordre d'arrivée, parmi les étudiants présents (signe de vie depuis 90 s (un onglet en arrière-plan est ralenti par le navigateur))
  select q.id into head_id from public.ai_jobs q
   where q.status = 'pending' and q.kind not in ('transcription', 'course_images') and q.deleted_at is null
     and (q.id = p_job or q.updated_at > now() - interval '90 seconds')
   order by (case when public.is_premium_user(q.user_id) then 0 else 1 end), q.created_at, q.id
   limit 1;
  if head_id is distinct from p_job then return false; end if;

  update public.ai_jobs set status = 'running', result = start_result where id = p_job;
  return true;
end $$;
revoke execute on function public.start_ai_job(uuid) from anon, public;
grant execute on function public.start_ai_job(uuid) to authenticated;

-- Rang dans la file, parmi les étudiants présents
create or replace function public.ai_queue_position(p_job uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with ordered as (
    select q.id,
           row_number() over (order by (case when public.is_premium_user(q.user_id) then 0 else 1 end), q.created_at, q.id) as rn
      from public.ai_jobs q
     where q.status = 'pending' and q.kind not in ('transcription', 'course_images') and q.deleted_at is null
       and (q.id = p_job or q.updated_at > now() - interval '90 seconds')
  )
  select jsonb_build_object(
           'position', (select o.rn from ordered o where o.id = p_job),
           'busy', exists (select 1 from public.ai_jobs r where r.status = 'running' and r.kind not in ('transcription', 'course_images')))
   where exists (select 1 from public.ai_jobs j where j.id = p_job and j.user_id = auth.uid())
$$;
revoke execute on function public.ai_queue_position(uuid) from anon, public;
grant execute on function public.ai_queue_position(uuid) to authenticated;
