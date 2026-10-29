-- =====================================================================
-- Études — mise à jour 8 : bibliothèque de ressources (liens, vidéos,
-- documents) et rappels d'échéances par email. Relançable sans danger.
-- =====================================================================

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  kind text not null check (kind in ('link', 'video', 'file')),
  title text not null,
  description text not null default '',
  url text,
  file_path text,
  file_name text,
  mime text,
  size bigint,
  -- texte extrait des PDF, pour la recherche
  content_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade
);

alter table public.resources enable row level security;
drop policy if exists "resources_own" on public.resources;
create policy "resources_own" on public.resources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists resources_updated_at on public.resources;
create trigger resources_updated_at before update on public.resources
  for each row execute function public.set_updated_at();
create index if not exists resources_space_idx on public.resources (space_id);
create index if not exists resources_user_idx on public.resources (user_id);
-- Fichier supprimé de Storage quand la ressource est purgée
drop trigger if exists resources_garbage on public.resources;
create trigger resources_garbage after delete on public.resources
  for each row execute function public.queue_storage_garbage();

-- Rappels par email : activés par défaut, à J-3 et J-1
alter table public.user_settings add column if not exists notify_email boolean not null default true;
alter table public.user_settings add column if not exists notify_days integer[] not null default '{3,1}';

-- Rappels déjà envoyés (jamais deux fois le même). Accès réservé au serveur.
create table if not exists public.notification_log (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  days_before integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (assignment_id, days_before)
);
alter table public.notification_log enable row level security;
drop policy if exists "notification_log_no_client" on public.notification_log;
create policy "notification_log_no_client" on public.notification_log for all to authenticated
  using (false) with check (false);

-- La recherche globale couvre aussi les ressources
create extension if not exists unaccent with schema extensions;

create or replace function public.search_space(p_space uuid, p_query text)
returns table (kind text, id uuid, subject_id uuid, title text, snippet text, updated_at timestamptz)
language sql stable security invoker set search_path = public, extensions
as $$
  with q as (select lower(extensions.unaccent(trim(p_query))) as t),
  docs as (
    select 'course'::text as kind, c.id, c.subject_id, c.title, c.content as body, c.updated_at
      from public.courses c where c.space_id = p_space and c.deleted_at is null
    union all
    select 'note', n.id, n.subject_id, n.title, n.content_text, n.updated_at
      from public.notes n where n.space_id = p_space and n.deleted_at is null
    union all
    -- cartes mentales : seuls les textes des nœuds (pas les noms des champs JSON)
    select o.kind, o.id, o.subject_id, o.title,
           coalesce((select string_agg(v #>> '{}', ' · ')
                       from jsonb_path_query(o.content, 'strict $.** ? (@.type() == "string")') v), ''),
           o.updated_at
      from public.note_outputs o where o.space_id = p_space and o.deleted_at is null and o.status = 'ready'
    union all
    select 'quiz', z.id, z.subject_id, z.title,
           coalesce((select string_agg(qq.question, ' · ' order by qq.position)
                       from public.quiz_questions qq where qq.quiz_id = z.id and qq.deleted_at is null), ''),
           z.updated_at
      from public.quizzes z where z.space_id = p_space and z.deleted_at is null and z.status = 'ready'
    union all
    select 'flashcard', f.id, f.subject_id, f.front, f.back, f.updated_at
      from public.flashcards f where f.space_id = p_space and f.deleted_at is null
    union all
    -- ressources : titre, description, lien et texte extrait des PDF
    select 'resource', r.id, r.subject_id, r.title,
           concat_ws(' · ', nullif(r.description, ''), nullif(r.content_text, ''), r.url), r.updated_at
      from public.resources r where r.space_id = p_space and r.deleted_at is null
  ),
  hits as (
    select d.*,
           strpos(lower(extensions.unaccent(d.title)), q.t) as tpos,
           strpos(lower(extensions.unaccent(coalesce(d.body, ''))), q.t) as bpos
      from docs d, q
     where length(q.t) >= 2
  )
  select h.kind, h.id, h.subject_id, h.title,
         case when h.bpos > 0 then substr(h.body, greatest(1, h.bpos - 80), 240) else left(coalesce(h.body, ''), 160) end,
         h.updated_at
    from hits h
   where h.tpos > 0 or h.bpos > 0
   order by (h.tpos > 0) desc, h.updated_at desc
   limit 80
$$;

revoke execute on function public.search_space(uuid, text) from anon, public;
grant execute on function public.search_space(uuid, text) to authenticated;

-- Corbeille en cascade et purge : enregistrements et ressources suivent leur matière
create or replace function public.cascade_subject_trash()
returns trigger language plpgsql set search_path = '' as $$
declare t text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes','note_outputs','recordings','resources'] loop
      execute format('update public.%I set deleted_at = $1 where subject_id = $2 and deleted_at is null', t)
        using new.deleted_at, new.id;
    end loop;
  elsif old.deleted_at is not null and new.deleted_at is null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes','note_outputs','recordings','resources'] loop
      execute format('update public.%I set deleted_at = null where subject_id = $1 and deleted_at = $2', t)
        using new.id, old.deleted_at;
    end loop;
  end if;
  return new;
end $$;

create or replace function public.purge_expired()
returns void language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  foreach t in array array[
    'quiz_answers','flashcard_reviews','plan_items','work_blocks','error_items','note_versions',
    'files','quiz_sessions','quiz_questions','note_outputs','recordings','resources','courses','assignments','study_plans',
    'flashcards','quizzes','notes','calendar_links','ai_jobs','subjects','spaces'
  ] loop
    execute format('delete from public.%I where deleted_at < now() - interval ''30 days''', t);
  end loop;

  delete from auth.users
    where id in (select user_id from public.account_deletions
                 where requested_at < now() - interval '30 days');

  delete from public.ai_jobs where created_at < now() - interval '7 days';
end $$;

revoke execute on function public.purge_expired() from anon, authenticated, public;
