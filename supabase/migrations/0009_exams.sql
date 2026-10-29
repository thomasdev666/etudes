-- =====================================================================
-- Études — mise à jour 9 : entraînements TAGE MAGE et TOEIC.
-- Banque de questions générées par l'IA (jamais de sujets officiels),
-- sessions chronométrées par section. Comme pour les QCM, le client ne
-- peut lire ni la bonne réponse ni l'explication avant la fin.
-- Relançable sans danger.
-- =====================================================================

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exam text not null check (exam in ('tage', 'toeic')),
  section text not null,
  -- questions qui partagent un même texte ou enregistrement
  passage_id uuid,
  passage text not null default '',
  question text not null,
  choices text[] not null,
  correct_index integer not null,
  explanation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, space_id),
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade
);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exam text not null check (exam in ('tage', 'toeic')),
  mode text not null check (mode in ('section', 'full')),
  timed boolean not null default true,
  -- [{ key, question_ids: [], started_at, finished_at }]
  sections jsonb not null default '[]',
  current_section integer not null default 0,
  -- { question_id: index choisi } ; une question absente = sans réponse
  answers jsonb not null default '{}',
  status text not null default 'preparing' check (status in ('preparing', 'ready', 'in_progress', 'finished', 'error')),
  error text,
  -- par section : { key, right, wrong, blank, total, points }
  result jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['exam_questions', 'exam_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_own" on public.%I', t, t);
    execute format('create policy "%s_own" on public.%I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format('drop trigger if exists %s_updated_at on public.%I', t, t);
    execute format('create trigger %s_updated_at before update on public.%I
      for each row execute function public.set_updated_at()', t, t);
    execute format('create index if not exists %s_space_idx on public.%I (space_id)', t, t);
    execute format('create index if not exists %s_user_idx on public.%I (user_id)', t, t);
  end loop;
end $$;
create index if not exists exam_questions_bank_idx on public.exam_questions (space_id, exam, section) where deleted_at is null;

-- Bonne réponse et explication invisibles côté client
revoke select, update on public.exam_questions from anon, authenticated;
grant select (id, space_id, user_id, exam, section, passage_id, passage, question, choices, created_at, updated_at, deleted_at)
  on public.exam_questions to authenticated;
grant update (deleted_at) on public.exam_questions to authenticated;

-- Fin de l'épreuve : enregistre les réponses et calcule le score de chaque section
create or replace function public.finish_exam_session(p_session uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.exam_sessions;
  sec jsonb;
  res jsonb := '[]';
  r int; w int; b int; n int;
  pr int; pw int; pb int;
begin
  select * into s from public.exam_sessions where id = p_session and user_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'Session introuvable'; end if;
  if s.status = 'finished' then return s.result; end if;
  -- barème : TAGE MAGE +4 / −1 / 0, TOEIC 1 point par bonne réponse
  if s.exam = 'tage' then pr := 4; pw := -1; pb := 0; else pr := 1; pw := 0; pb := 0; end if;

  for sec in select * from jsonb_array_elements(s.sections) loop
    select count(*) filter (where (p_answers ->> q.id::text)::int = q.correct_index),
           count(*) filter (where p_answers ? q.id::text and (p_answers ->> q.id::text)::int <> q.correct_index),
           count(*) filter (where not (p_answers ? q.id::text)),
           count(*)
      into r, w, b, n
      from public.exam_questions q
     where q.id in (select (jsonb_array_elements_text(sec -> 'question_ids'))::uuid)
       and q.user_id = auth.uid();
    res := res || jsonb_build_object('key', sec ->> 'key', 'right', r, 'wrong', w, 'blank', b, 'total', n,
                                     'points', r * pr + w * pw + b * pb);
  end loop;

  update public.exam_sessions
     set answers = coalesce(p_answers, '{}'), result = res, status = 'finished', finished_at = now()
   where id = p_session;
  return res;
end $$;

-- Correction : seulement pour une session terminée, et seulement ses questions
create or replace function public.get_exam_correction(p_session uuid)
returns table (question_id uuid, correct_index int, explanation text)
language sql stable security definer set search_path = '' as $$
  select q.id, q.correct_index, q.explanation
    from public.exam_sessions s
    cross join lateral jsonb_array_elements(s.sections) sec
    cross join lateral jsonb_array_elements_text(sec -> 'question_ids') qid
    join public.exam_questions q on q.id = qid::uuid and q.user_id = s.user_id
   where s.id = p_session and s.user_id = auth.uid() and s.status = 'finished'
$$;

revoke execute on function public.finish_exam_session(uuid, jsonb) from anon, public;
revoke execute on function public.get_exam_correction(uuid) from anon, public;
grant execute on function public.finish_exam_session(uuid, jsonb) to authenticated;
grant execute on function public.get_exam_correction(uuid) to authenticated;

-- Nouvelle tâche IA : préparation d'une épreuve (génération des questions manquantes)
alter table public.ai_jobs drop constraint if exists ai_jobs_kind_check;
alter table public.ai_jobs add constraint ai_jobs_kind_check
  check (kind in ('quiz', 'flashcards', 'course_images', 'mindmap', 'sheet', 'transcription', 'exam'));
