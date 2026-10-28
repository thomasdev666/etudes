-- =====================================================================
-- Études — mise à jour 2 : cartes mentales, images des cours (PPTX/PDF),
-- guide de démarrage. À exécuter une fois dans Supabase (SQL Editor > Run).
-- Le script peut être relancé sans danger.
-- =====================================================================

-- Cours : statut pendant la lecture des images par l'IA
alter table public.courses add column if not exists status text not null default 'ready';
do $$ begin
  alter table public.courses add constraint courses_status_check check (status in ('processing', 'ready', 'error'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.courses add constraint courses_id_space_key unique (id, space_id);
exception when duplicate_table or duplicate_object then null; end $$;

-- Fichiers rattachés à un cours (images extraites des diapositives)
alter table public.files add column if not exists course_id uuid;
do $$ begin
  alter table public.files add constraint files_course_fk
    foreign key (course_id, space_id) references public.courses(id, space_id) on delete cascade;
exception when duplicate_object then null; end $$;

-- QCM : on garde aussi les notes sources, pour pouvoir relancer une génération
alter table public.quizzes add column if not exists source_note_ids uuid[] not null default '{}';

-- Nouveaux types de tâches IA
alter table public.ai_jobs drop constraint if exists ai_jobs_kind_check;
alter table public.ai_jobs add constraint ai_jobs_kind_check
  check (kind in ('quiz', 'flashcards', 'course_images', 'mindmap'));

-- Fiches et cartes mentales : entités séparées, la note d'origine n'est jamais modifiée
create table if not exists public.note_outputs (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  kind text not null default 'mindmap' check (kind in ('mindmap', 'sheet')),
  title text not null,
  content jsonb not null default '{}',
  source_note_ids uuid[] not null default '{}',
  source_course_ids uuid[] not null default '{}',
  -- date de la dernière modification des sources au moment de la génération
  sources_updated_at timestamptz,
  status text not null default 'generating' check (status in ('generating', 'ready', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade
);

alter table public.note_outputs enable row level security;
drop policy if exists "note_outputs_own" on public.note_outputs;
create policy "note_outputs_own" on public.note_outputs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists note_outputs_updated_at on public.note_outputs;
create trigger note_outputs_updated_at before update on public.note_outputs
  for each row execute function public.set_updated_at();
create index if not exists note_outputs_space_idx on public.note_outputs (space_id);
create index if not exists note_outputs_user_idx on public.note_outputs (user_id);

-- Préférences et progression du guide de démarrage
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  onboarding jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "user_settings_own" on public.user_settings;
create policy "user_settings_own" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists user_settings_updated_at on public.user_settings;
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- La corbeille en cascade inclut désormais les cartes mentales
create or replace function public.cascade_subject_trash()
returns trigger language plpgsql set search_path = '' as $$
declare t text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes','note_outputs'] loop
      execute format('update public.%I set deleted_at = $1 where subject_id = $2 and deleted_at is null', t)
        using new.deleted_at, new.id;
    end loop;
  elsif old.deleted_at is not null and new.deleted_at is null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes','note_outputs'] loop
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
    'files','quiz_sessions','quiz_questions','note_outputs','courses','assignments','study_plans',
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
