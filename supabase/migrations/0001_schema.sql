-- =====================================================================
-- Études — schéma complet V1
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run.
-- Le script est idempotent pour les extensions et le bucket, pas pour les tables :
-- sur une base vide uniquement.
-- =====================================================================

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Espaces
-- ---------------------------------------------------------------------
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

-- Toutes les tables suivantes portent space_id + user_id.
-- La clé étrangère composite (space_id, user_id) -> spaces(id, user_id)
-- garantit qu'une ligne ne peut appartenir qu'à un espace de son propriétaire.

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#4F9BD9' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  keywords text[] not null default '{}',
  exam_date date,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, space_id),
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  title text not null,
  content text not null default '',
  file_path text,
  file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid,
  title text not null,
  description text not null default '',
  due_at timestamptz not null,
  estimated_minutes int check (estimated_minutes is null or estimated_minutes > 0),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, space_id),
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade
);

-- Créneaux de travail proposés par la planification et validés par l'utilisateur
create table public.work_blocks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  assignment_id uuid not null,
  day date not null,
  minutes int not null check (minutes > 0),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (assignment_id, space_id) references public.assignments(id, space_id) on delete cascade
);

create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  title text not null,
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, space_id),
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null,
  label text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (plan_id, space_id) references public.study_plans(id, space_id) on delete cascade
);

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  front text not null,
  back text not null,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  interval_days int not null default 0,
  ease numeric(4, 2) not null default 2.5,
  repetitions int not null default 0,
  lapses int not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, space_id),
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade
);

create table public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  flashcard_id uuid not null,
  grade smallint not null check (grade between 0 and 3),
  interval_days int not null,
  ease numeric(4, 2) not null,
  duration_ms int,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (flashcard_id, space_id) references public.flashcards(id, space_id) on delete cascade
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  title text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  qtype text not null check (qtype in ('mcq', 'truefalse')),
  question_count int not null check (question_count between 5 and 50),
  source_course_ids uuid[] not null default '{}',
  status text not null default 'generating' check (status in ('generating', 'ready', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, space_id),
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quiz_id uuid not null,
  position int not null,
  question text not null,
  choices jsonb not null,
  correct_index int not null,
  explanation text not null default '',
  notion text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, space_id),
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (quiz_id, space_id) references public.quizzes(id, space_id) on delete cascade
);

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  quiz_id uuid,
  kind text not null default 'quiz' check (kind in ('quiz', 'errors')),
  question_ids uuid[] not null,
  current_index int not null default 0,
  -- Réponses en cours : [{question_id, chosen_index, time_ms}]. Aucune correction ici.
  progress jsonb not null default '[]',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score int,
  total int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, space_id),
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade,
  foreign key (quiz_id, space_id) references public.quizzes(id, space_id) on delete cascade
);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null,
  question_id uuid not null,
  chosen_index int,
  is_correct boolean not null,
  time_ms int,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (session_id, space_id) references public.quiz_sessions(id, space_id) on delete cascade,
  foreign key (question_id, space_id) references public.quiz_questions(id, space_id) on delete cascade
);

-- Session « Erreurs » : une ligne par question ratée, retirée après 2 réussites d'affilée
create table public.error_items (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  question_id uuid not null unique,
  success_streak int not null default 0,
  miss_count int not null default 1,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade,
  foreign key (question_id, space_id) references public.quiz_questions(id, space_id) on delete cascade
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid,
  title text not null default 'Sans titre',
  content jsonb not null default '{"type":"doc","content":[]}',
  content_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, space_id),
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade
);

create table public.note_versions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id uuid not null,
  title text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (note_id, space_id) references public.notes(id, space_id) on delete cascade
);

-- Fichiers stockés dans Storage (bucket « files », chemin <user_id>/<space_id>/...)
create table public.files (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null unique,
  name text not null,
  mime text not null default 'application/octet-stream',
  size bigint not null default 0,
  note_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (note_id, space_id) references public.notes(id, space_id) on delete cascade
);

-- Abonnement à un calendrier Outlook publié (lien ICS, gratuit, lecture seule)
create table public.calendar_links (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null default 'Outlook',
  url text not null check (url ~ '^(https|webcal)://'),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade
);

-- Tâches IA (génération QCM / flash cards) traitées par une fonction serveur
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('quiz', 'flashcards')),
  params jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade
);

-- Demandes de suppression de compte (effacement effectif après 30 jours)
create table public.account_deletions (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

-- Chemins Storage à effacer après une purge (traités par la fonction « cleanup »)
create table public.storage_garbage (
  path text primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS, triggers updated_at et index sur toutes les tables à espace
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'spaces','subjects','courses','assignments','work_blocks','study_plans','plan_items',
    'flashcards','flashcard_reviews','quizzes','quiz_questions','quiz_sessions','quiz_answers',
    'error_items','notes','note_versions','files','calendar_links','ai_jobs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s_own" on public.%1$I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format(
      'create trigger %1$s_updated_at before update on public.%1$I
         for each row execute function public.set_updated_at()', t);
    if t <> 'spaces' then
      execute format('create index %1$s_space_idx on public.%1$I (space_id)', t);
    end if;
    execute format('create index %1$s_user_idx on public.%1$I (user_id)', t);
  end loop;
end $$;

alter table public.account_deletions enable row level security;
create policy "account_deletions_own" on public.account_deletions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- storage_garbage : RLS activée et aucune politique = aucun accès client.
-- Seul le rôle service (fonction cleanup) y accède.
alter table public.storage_garbage enable row level security;
create policy "storage_garbage_no_client" on public.storage_garbage for all to authenticated
  using (false) with check (false);

create index flashcards_due_idx on public.flashcards (space_id, due_at) where deleted_at is null;
create index assignments_due_idx on public.assignments (space_id, due_at) where deleted_at is null;
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);
create index error_items_subject_idx on public.error_items (subject_id) where resolved_at is null;

-- ---------------------------------------------------------------------
-- Réponses de QCM invisibles côté client
-- Le client ne peut pas lire correct_index ni explanation : seule la fonction
-- finish_quiz_session les renvoie, une fois la session terminée.
-- ---------------------------------------------------------------------
revoke select, update on public.quiz_questions from anon, authenticated;
grant select (id, space_id, user_id, quiz_id, position, question, choices, notion,
              created_at, updated_at, deleted_at)
  on public.quiz_questions to authenticated;
grant update (deleted_at) on public.quiz_questions to authenticated;

create or replace function public.finish_quiz_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.quiz_sessions;
  q record;
  ans jsonb;
  chosen int;
  ok boolean;
  n_ok int := 0;
  n int := 0;
  result jsonb := '[]';
begin
  select * into s from public.quiz_sessions
    where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'Session introuvable'; end if;
  if s.finished_at is not null then
    return public.get_quiz_correction(p_session_id);
  end if;

  for q in
    select qq.*, ord from unnest(s.question_ids) with ordinality as u(qid, ord)
    join public.quiz_questions qq on qq.id = u.qid and qq.user_id = auth.uid()
    order by ord
  loop
    n := n + 1;
    ans := null;
    select e.value into ans from jsonb_array_elements(s.progress) e
      where e.value->>'question_id' = q.id::text limit 1;
    chosen := nullif(ans->>'chosen_index', '')::int;
    ok := chosen is not null and chosen = q.correct_index;
    if ok then n_ok := n_ok + 1; end if;

    insert into public.quiz_answers (space_id, user_id, session_id, question_id, chosen_index, is_correct, time_ms)
      values (s.space_id, s.user_id, s.id, q.id, chosen, ok, nullif(ans->>'time_ms', '')::int);

    if not ok then
      insert into public.error_items (space_id, user_id, subject_id, question_id)
        values (s.space_id, s.user_id, s.subject_id, q.id)
      on conflict (question_id) do update
        set success_streak = 0, resolved_at = null,
            miss_count = public.error_items.miss_count + 1;
    else
      update public.error_items
        set success_streak = success_streak + 1,
            resolved_at = case when success_streak + 1 >= 2 then now() else null end
        where question_id = q.id and resolved_at is null;
    end if;
  end loop;

  update public.quiz_sessions
    set finished_at = now(), score = n_ok, total = n, current_index = n
    where id = s.id;

  return public.get_quiz_correction(p_session_id);
end $$;

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
      'time_ms', a.time_ms
    ) order by u.ord), '[]')
  from public.quiz_sessions s
  cross join lateral unnest(s.question_ids) with ordinality as u(qid, ord)
  join public.quiz_questions qq on qq.id = u.qid
  left join public.quiz_answers a on a.session_id = s.id and a.question_id = qq.id
  where s.id = p_session_id and s.user_id = auth.uid() and s.finished_at is not null;
$$;

-- Pour l'export complet uniquement
create or replace function public.export_quiz_questions()
returns setof public.quiz_questions language sql security definer set search_path = '' stable as $$
  select * from public.quiz_questions where user_id = auth.uid();
$$;

revoke execute on function public.finish_quiz_session(uuid) from anon, public;
revoke execute on function public.get_quiz_correction(uuid) from anon, public;
revoke execute on function public.export_quiz_questions() from anon, public;
grant execute on function public.finish_quiz_session(uuid) to authenticated;
grant execute on function public.get_quiz_correction(uuid) to authenticated;
grant execute on function public.export_quiz_questions() to authenticated;

-- ---------------------------------------------------------------------
-- Corbeille : supprimer une matière met aussi ses contenus à la corbeille,
-- et la restaurer restaure ce qui a été supprimé en même temps qu'elle.
-- ---------------------------------------------------------------------
create or replace function public.cascade_subject_trash()
returns trigger language plpgsql set search_path = '' as $$
declare t text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes'] loop
      execute format('update public.%I set deleted_at = $1 where subject_id = $2 and deleted_at is null', t)
        using new.deleted_at, new.id;
    end loop;
  elsif old.deleted_at is not null and new.deleted_at is null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes'] loop
      execute format('update public.%I set deleted_at = null where subject_id = $1 and deleted_at = $2', t)
        using new.id, old.deleted_at;
    end loop;
  end if;
  return new;
end $$;

create trigger subjects_trash_cascade after update of deleted_at on public.subjects
  for each row execute function public.cascade_subject_trash();

-- ---------------------------------------------------------------------
-- Versions des notes : une copie au plus toutes les 10 minutes d'édition
-- ---------------------------------------------------------------------
create or replace function public.snapshot_note_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.content is distinct from new.content and not exists (
    select 1 from public.note_versions
    where note_id = old.id and created_at > now() - interval '10 minutes'
  ) then
    insert into public.note_versions (space_id, user_id, note_id, title, content)
      values (old.space_id, old.user_id, old.id, old.title, old.content);
  end if;
  return new;
end $$;

create trigger notes_versioning before update of content on public.notes
  for each row execute function public.snapshot_note_version();

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('files', 'files', false)
  on conflict (id) do nothing;

create policy "files_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Quand une ligne qui référence un fichier disparaît, le fichier part à la benne
create or replace function public.queue_storage_garbage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p text;
begin
  p := coalesce(to_jsonb(old)->>'path', to_jsonb(old)->>'file_path');
  if p is not null then
    insert into public.storage_garbage (path) values (p) on conflict do nothing;
  end if;
  return old;
end $$;

create trigger files_garbage after delete on public.files
  for each row execute function public.queue_storage_garbage();
create trigger courses_garbage after delete on public.courses
  for each row execute function public.queue_storage_garbage();

-- ---------------------------------------------------------------------
-- Purge quotidienne : corbeille > 30 jours et comptes supprimés > 30 jours
-- ---------------------------------------------------------------------
create or replace function public.purge_expired()
returns void language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  foreach t in array array[
    'quiz_answers','flashcard_reviews','plan_items','work_blocks','error_items','note_versions',
    'files','quiz_sessions','quiz_questions','courses','assignments','study_plans','flashcards',
    'quizzes','notes','calendar_links','ai_jobs','subjects','spaces'
  ] loop
    execute format('delete from public.%I where deleted_at < now() - interval ''30 days''', t);
  end loop;

  delete from auth.users
    where id in (select user_id from public.account_deletions
                 where requested_at < now() - interval '30 days');

  -- Tâches IA terminées : inutile de les garder
  delete from public.ai_jobs where created_at < now() - interval '7 days';
end $$;

revoke execute on function public.purge_expired() from anon, authenticated, public;

select cron.schedule('etudes-purge', '17 3 * * *', 'select public.purge_expired()');
