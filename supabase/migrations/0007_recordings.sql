-- =====================================================================
-- Études — mise à jour 7 : enregistrement et transcription des cours.
-- L'audio est rangé dans « files » (rattaché à l'enregistrement) : sa
-- suppression suit le nettoyage habituel de Storage. La transcription
-- devient un cours de la matière (QCM, fiches, cartes mentales possibles)
-- et reste toujours conservée. Relançable sans danger.
-- =====================================================================

create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  -- cours créé à partir de la transcription
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  language text not null default 'auto' check (language in ('auto', 'fr', 'en')),
  duration_sec integer not null default 0,
  size_bytes bigint not null default 0,
  source text not null default 'micro' check (source in ('micro', 'import')),
  status text not null default 'uploading' check (status in ('uploading', 'transcribing', 'done', 'error')),
  audio_state text not null default 'stored' check (audio_state in ('stored', 'deleted')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, space_id),
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade
);

alter table public.recordings enable row level security;
drop policy if exists "recordings_own" on public.recordings;
create policy "recordings_own" on public.recordings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists recordings_updated_at on public.recordings;
create trigger recordings_updated_at before update on public.recordings
  for each row execute function public.set_updated_at();
create index if not exists recordings_space_idx on public.recordings (space_id);
create index if not exists recordings_user_idx on public.recordings (user_id);

-- Morceaux d'audio d'un enregistrement (un fichier par tranche de 15 minutes)
alter table public.files add column if not exists recording_id uuid;
alter table public.files add column if not exists part_index integer;
alter table public.files add column if not exists duration_sec integer;
do $$ begin
  alter table public.files add constraint files_recording_fk
    foreign key (recording_id, space_id) references public.recordings(id, space_id) on delete cascade;
exception when duplicate_object then null; end $$;

-- Réglage : que faire de l'audio après la transcription
alter table public.user_settings add column if not exists audio_after text not null default 'delete';
do $$ begin
  alter table public.user_settings add constraint user_settings_audio_after_check check (audio_after in ('delete', 'keep'));
exception when duplicate_object then null; end $$;

-- Nouvelle tâche IA
alter table public.ai_jobs drop constraint if exists ai_jobs_kind_check;
alter table public.ai_jobs add constraint ai_jobs_kind_check
  check (kind in ('quiz', 'flashcards', 'course_images', 'mindmap', 'sheet', 'transcription'));

-- Corbeille en cascade et purge : les enregistrements suivent leur matière
create or replace function public.cascade_subject_trash()
returns trigger language plpgsql set search_path = '' as $$
declare t text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes','note_outputs','recordings'] loop
      execute format('update public.%I set deleted_at = $1 where subject_id = $2 and deleted_at is null', t)
        using new.deleted_at, new.id;
    end loop;
  elsif old.deleted_at is not null and new.deleted_at is null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes','note_outputs','recordings'] loop
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
    'files','quiz_sessions','quiz_questions','note_outputs','recordings','courses','assignments','study_plans',
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
