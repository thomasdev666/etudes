-- =====================================================================
-- Études — mise à jour 10 : planification automatique avancée.
-- Séances de révision avant les examens (sans devoir), heure de début
-- des séances, disponibilités par jour de la semaine. Relançable sans danger.
-- =====================================================================

-- Une séance peut être liée à un devoir, ou être une révision d'examen d'une matière
alter table public.work_blocks alter column assignment_id drop not null;
alter table public.work_blocks add column if not exists kind text not null default 'assignment';
alter table public.work_blocks add column if not exists subject_id uuid;
alter table public.work_blocks add column if not exists start_time time;
alter table public.work_blocks add column if not exists title text;
do $$ begin
  alter table public.work_blocks add constraint work_blocks_kind_check check (kind in ('assignment', 'revision'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.work_blocks add constraint work_blocks_target_check
    check ((kind = 'assignment' and assignment_id is not null) or (kind = 'revision' and subject_id is not null));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.work_blocks add constraint work_blocks_subject_fk
    foreign key (subject_id, space_id) references public.subjects(id, space_id) on delete cascade;
exception when duplicate_object then null; end $$;
create index if not exists work_blocks_day_idx on public.work_blocks (space_id, day) where deleted_at is null;

-- Temps de révision visé avant l'examen de chaque matière (minutes)
alter table public.subjects add column if not exists revision_minutes integer;

-- Disponibilités : par jour de la semaine, temps de travail et plage horaire
alter table public.user_settings add column if not exists availability jsonb;

-- Corbeille en cascade et purge : enregistrements et ressources suivent leur matière
create or replace function public.cascade_subject_trash()
returns trigger language plpgsql set search_path = '' as $$
declare t text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes','note_outputs','recordings','resources','work_blocks'] loop
      execute format('update public.%I set deleted_at = $1 where subject_id = $2 and deleted_at is null', t)
        using new.deleted_at, new.id;
    end loop;
  elsif old.deleted_at is not null and new.deleted_at is null then
    foreach t in array array['courses','assignments','study_plans','flashcards','quizzes','notes','note_outputs','recordings','resources','work_blocks'] loop
      execute format('update public.%I set deleted_at = null where subject_id = $1 and deleted_at = $2', t)
        using new.id, old.deleted_at;
    end loop;
  end if;
  return new;
end $$;
