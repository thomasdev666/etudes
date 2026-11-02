-- =====================================================================
-- Regulya — mise à jour 26 : Premium sans file d'attente, 5 générations à la fois.
-- - Premium : la génération démarre tout de suite (jusqu'à 5 générations Premium en même temps).
-- - Gratuit : jusqu'à 5 générations gratuites en même temps, puis file d'attente par ordre d'arrivée
--   (les générations Premium ne prennent pas leurs places).
-- Relançable sans danger.
-- =====================================================================

create or replace function public.start_ai_job(p_job uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  j public.ai_jobs%rowtype;
  premium boolean;
  free_running integer;
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

  premium := public.is_premium_user(j.user_id);

  if premium then
    -- Premium : pas de file, seulement une limite de 5 générations Premium simultanées
    if (select count(*) from public.ai_jobs r
         where r.status = 'running' and r.kind not in ('transcription', 'course_images')
           and public.is_premium_user(r.user_id)) >= 5 then
      return false;
    end if;
    update public.ai_jobs set status = 'running', result = start_result where id = p_job;
    return true;
  end if;

  -- Gratuit : jusqu'à 5 générations gratuites en même temps ; au-delà, par ordre d'arrivée
  -- parmi les étudiants présents (seuls les premiers de la file prennent les places libres)
  free_running := (select count(*) from public.ai_jobs r
                    where r.status = 'running' and r.kind not in ('transcription', 'course_images')
                      and not public.is_premium_user(r.user_id));
  if free_running >= 5 then return false; end if;
  if not exists (
    select 1 from (
      select q.id from public.ai_jobs q
       where q.status = 'pending' and q.kind not in ('transcription', 'course_images') and q.deleted_at is null
         and not public.is_premium_user(q.user_id)
         and (q.id = p_job or q.updated_at > now() - interval '90 seconds')
       order by q.created_at, q.id
       limit (5 - free_running)
    ) first_ones where first_ones.id = p_job
  ) then
    return false;
  end if;

  update public.ai_jobs set status = 'running', result = start_result where id = p_job;
  return true;
end $$;
revoke execute on function public.start_ai_job(uuid) from anon, public;
grant execute on function public.start_ai_job(uuid) to authenticated;

-- Rang dans la file des comptes gratuits, et générations gratuites en cours (un compte Premium n'a pas de file)
create or replace function public.ai_queue_position(p_job uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with ordered as (
    select q.id, row_number() over (order by q.created_at, q.id) as rn
      from public.ai_jobs q
     where q.status = 'pending' and q.kind not in ('transcription', 'course_images') and q.deleted_at is null
       and not public.is_premium_user(q.user_id)
       and (q.id = p_job or q.updated_at > now() - interval '90 seconds')
  )
  select jsonb_build_object(
           'position', (select o.rn from ordered o where o.id = p_job),
           'busy', exists (select 1 from public.ai_jobs r
                            where r.status = 'running' and r.kind not in ('transcription', 'course_images')
                              and not public.is_premium_user(r.user_id)),
           'running', (select count(*) from public.ai_jobs r
                        where r.status = 'running' and r.kind not in ('transcription', 'course_images')
                          and not public.is_premium_user(r.user_id)))
   where exists (select 1 from public.ai_jobs j where j.id = p_job and j.user_id = auth.uid())
$$;
revoke execute on function public.ai_queue_position(uuid) from anon, public;
grant execute on function public.ai_queue_position(uuid) to authenticated;
