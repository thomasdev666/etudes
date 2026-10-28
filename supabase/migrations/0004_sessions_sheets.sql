-- =====================================================================
-- Études — mise à jour 4 : type et numéro de séance des cours importés,
-- fiches de révision générées par l'IA. Relançable sans danger.
-- =====================================================================

alter table public.imported_events add column if not exists kind text not null default '';
alter table public.imported_events add column if not exists session integer;

alter table public.ai_jobs drop constraint if exists ai_jobs_kind_check;
alter table public.ai_jobs add constraint ai_jobs_kind_check
  check (kind in ('quiz', 'flashcards', 'course_images', 'mindmap', 'sheet'));
