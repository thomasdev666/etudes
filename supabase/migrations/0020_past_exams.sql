-- =====================================================================
-- Regulya — mise à jour 20 : anciens partiels par matière. L'IA s'en sert
-- comme modèles (format, difficulté, type de questions) pour les QCM et
-- les documents de GIRAFA. Relançable sans danger.
-- =====================================================================

create table if not exists public.past_exams (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  title text not null,
  -- année ou session, texte libre (« 2024 », « Rattrapage 2023 »)
  session text not null default '',
  -- texte extrait du sujet (et du corrigé s'il est dans le même document)
  content text not null default '',
  file_path text,
  file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade
);

alter table public.past_exams enable row level security;
drop policy if exists "past_exams_own" on public.past_exams;
create policy "past_exams_own" on public.past_exams for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists past_exams_updated_at on public.past_exams;
create trigger past_exams_updated_at before update on public.past_exams
  for each row execute function public.set_updated_at();
create index if not exists past_exams_space_idx on public.past_exams (space_id);
create index if not exists past_exams_subject_idx on public.past_exams (subject_id);
-- Fichier d'origine supprimé de Storage quand le partiel est purgé
drop trigger if exists past_exams_garbage on public.past_exams;
create trigger past_exams_garbage after delete on public.past_exams
  for each row execute function public.queue_storage_garbage();

-- Corbeille en cascade : les partiels suivent leur matière
create or replace function public.cascade_subject_trash()
returns trigger language plpgsql set search_path = '' as $$
declare t text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes','note_outputs','recordings','resources','work_blocks','past_exams'] loop
      execute format('update public.%I set deleted_at = $1 where subject_id = $2 and deleted_at is null', t)
        using new.deleted_at, new.id;
    end loop;
  elsif old.deleted_at is not null and new.deleted_at is null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes','note_outputs','recordings','resources','work_blocks','past_exams'] loop
      execute format('update public.%I set deleted_at = null where subject_id = $1 and deleted_at = $2', t)
        using new.id, old.deleted_at;
    end loop;
  end if;
  return new;
end $$;

-- Purge quotidienne : les partiels à la corbeille depuis plus de 30 jours aussi
create or replace function public.purge_expired()
returns void language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  foreach t in array array[
    'quiz_answers','flashcard_reviews','plan_items','work_blocks','error_items','note_versions',
    'files','quiz_sessions','quiz_questions','note_outputs','recordings','resources','past_exams','courses','assignments','study_plans',
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
