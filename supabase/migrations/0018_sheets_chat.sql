-- =====================================================================
-- Regulya — mise à jour 18 : espace « Fiches de révision » séparé des notes,
-- et conversation avec GIRAFA (questions/réponses). Relançable sans danger.
-- =====================================================================

-- Une fiche de révision reste une note (éditable, exportable), mais rangée à part
alter table public.notes add column if not exists kind text not null default 'note';
alter table public.notes drop constraint if exists notes_kind_check;
alter table public.notes add constraint notes_kind_check check (kind in ('note', 'sheet'));
create index if not exists notes_space_kind_idx on public.notes (space_id, kind);

-- Les fiches déjà générées (reconnues à leur titre) passent dans le nouvel espace
update public.notes set kind = 'sheet'
 where kind = 'note'
   and (title like 'Fiche — %' or title like 'Fiche erreurs — %' or title like 'GIRAFA — %'
        or title like 'JadeBot — %' or title like 'Assistant — %');

-- Conversation : une question à GIRAFA est une tâche « chat »
alter table public.ai_jobs drop constraint if exists ai_jobs_kind_check;
alter table public.ai_jobs add constraint ai_jobs_kind_check
  check (kind in ('quiz', 'flashcards', 'course_images', 'mindmap', 'sheet', 'transcription', 'exam', 'assistant', 'chat'));

-- Quota de questions par semaine, pour chaque offre
insert into public.plan_limits (plan, kind, weekly)
select distinct plan, 'chat', case when plan = 'premium' then 300 when plan = 'welcome' then 60 else 40 end
  from public.plan_limits
on conflict (plan, kind) do nothing;
