-- =====================================================================
-- Regulya — mise à jour 16 : assistant IA (document de révision sur demande).
-- Relançable sans danger.
-- =====================================================================
alter table public.ai_jobs drop constraint if exists ai_jobs_kind_check;
alter table public.ai_jobs add constraint ai_jobs_kind_check
  check (kind in ('quiz', 'flashcards', 'course_images', 'mindmap', 'sheet', 'transcription', 'exam', 'assistant'));
