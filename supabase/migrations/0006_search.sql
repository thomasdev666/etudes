-- =====================================================================
-- Études — mise à jour 6 : recherche globale (cours, notes, fiches,
-- cartes mentales, QCM, flash cards), sans tenir compte des accents.
-- La fonction s'exécute avec les droits de l'utilisateur : la RLS
-- s'applique, chacun ne cherche que dans ses propres données.
-- Relançable sans danger.
-- =====================================================================

create extension if not exists unaccent with schema extensions;

create or replace function public.search_space(p_space uuid, p_query text)
returns table (kind text, id uuid, subject_id uuid, title text, snippet text, updated_at timestamptz)
language sql stable security invoker set search_path = public, extensions
as $$
  with q as (select lower(extensions.unaccent(trim(p_query))) as t),
  docs as (
    select 'course'::text as kind, c.id, c.subject_id, c.title, c.content as body, c.updated_at
      from public.courses c where c.space_id = p_space and c.deleted_at is null
    union all
    select 'note', n.id, n.subject_id, n.title, n.content_text, n.updated_at
      from public.notes n where n.space_id = p_space and n.deleted_at is null
    union all
    -- cartes mentales : seuls les textes des nœuds (pas les noms des champs JSON)
    select o.kind, o.id, o.subject_id, o.title,
           coalesce((select string_agg(v #>> '{}', ' · ')
                       from jsonb_path_query(o.content, 'strict $.** ? (@.type() == "string")') v), ''),
           o.updated_at
      from public.note_outputs o where o.space_id = p_space and o.deleted_at is null and o.status = 'ready'
    union all
    select 'quiz', z.id, z.subject_id, z.title,
           coalesce((select string_agg(qq.question, ' · ' order by qq.position)
                       from public.quiz_questions qq where qq.quiz_id = z.id and qq.deleted_at is null), ''),
           z.updated_at
      from public.quizzes z where z.space_id = p_space and z.deleted_at is null and z.status = 'ready'
    union all
    select 'flashcard', f.id, f.subject_id, f.front, f.back, f.updated_at
      from public.flashcards f where f.space_id = p_space and f.deleted_at is null
  ),
  hits as (
    select d.*,
           strpos(lower(extensions.unaccent(d.title)), q.t) as tpos,
           strpos(lower(extensions.unaccent(coalesce(d.body, ''))), q.t) as bpos
      from docs d, q
     where length(q.t) >= 2
  )
  select h.kind, h.id, h.subject_id, h.title,
         case when h.bpos > 0 then substr(h.body, greatest(1, h.bpos - 80), 240) else left(coalesce(h.body, ''), 160) end,
         h.updated_at
    from hits h
   where h.tpos > 0 or h.bpos > 0
   order by (h.tpos > 0) desc, h.updated_at desc
   limit 80
$$;

revoke execute on function public.search_space(uuid, text) from anon, public;
grant execute on function public.search_space(uuid, text) to authenticated;
