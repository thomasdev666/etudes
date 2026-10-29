-- =====================================================================
-- Études — mise à jour 11 : mode examen chronométré pour les QCM, et
-- temps de travail mesuré (chronomètre de session, arrêt après 10 minutes
-- d'inactivité). Relançable sans danger.
-- =====================================================================

-- Mode examen : durée totale autorisée pour la session (secondes)
alter table public.quiz_sessions add column if not exists time_limit_sec integer;

-- Sessions de travail : temps réellement actif, par activité et par matière
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid,
  activity text not null check (activity in ('quiz', 'cards', 'exam', 'note', 'course', 'other')),
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now(),
  active_seconds integer not null default 0 check (active_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade,
  foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade
);

alter table public.study_sessions enable row level security;
drop policy if exists "study_sessions_own" on public.study_sessions;
create policy "study_sessions_own" on public.study_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists study_sessions_updated_at on public.study_sessions;
create trigger study_sessions_updated_at before update on public.study_sessions
  for each row execute function public.set_updated_at();
create index if not exists study_sessions_space_idx on public.study_sessions (space_id, started_at);
create index if not exists study_sessions_user_idx on public.study_sessions (user_id);
