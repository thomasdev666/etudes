-- =====================================================================
-- Regulya — mise à jour 19 : partage d'un QCM par lien (en plus des notes,
-- cartes mentales et flash cards). Relançable sans danger.
-- =====================================================================

alter table public.shares drop constraint if exists shares_kind_check;
alter table public.shares add constraint shares_kind_check check (kind in ('note', 'mindmap', 'deck', 'quiz'));

-- Lecture publique d'un partage : uniquement le contenu, seulement si le lien est actif,
-- si l'élément appartient bien à l'auteur du lien et n'est pas à la corbeille.
-- Un QCM partagé se fait en ligne : la correction n'est affichée qu'à la fin, par la page.
create or replace function public.get_share(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.shares;
  result jsonb;
begin
  select * into s from public.shares where token = p_token and revoked_at is null;
  if not found then return null; end if;
  if s.kind = 'note' then
    select jsonb_build_object('title', n.title, 'content', n.content, 'updated_at', n.updated_at, 'subject', sj.name)
      into result
      from public.notes n left join public.subjects sj on sj.id = n.subject_id
     where n.id = s.target_id and n.user_id = s.user_id and n.deleted_at is null;
  elsif s.kind = 'mindmap' then
    select jsonb_build_object('title', o.title, 'content', o.content, 'updated_at', o.updated_at, 'subject', sj.name)
      into result
      from public.note_outputs o left join public.subjects sj on sj.id = o.subject_id
     where o.id = s.target_id and o.user_id = s.user_id and o.deleted_at is null and o.kind = 'mindmap' and o.status = 'ready';
  elsif s.kind = 'quiz' then
    select jsonb_build_object('title', qz.title, 'subject', sj.name, 'updated_at', qz.updated_at,
             'questions', coalesce((select jsonb_agg(jsonb_build_object('question', qq.question, 'choices', qq.choices,
                                                                        'correct_index', qq.correct_index, 'explanation', qq.explanation,
                                                                        'notion', qq.notion) order by qq.position)
                                      from public.quiz_questions qq
                                     where qq.quiz_id = qz.id and qq.user_id = s.user_id and qq.deleted_at is null), '[]'))
      into result
      from public.quizzes qz left join public.subjects sj on sj.id = qz.subject_id
     where qz.id = s.target_id and qz.user_id = s.user_id and qz.deleted_at is null and qz.status = 'ready';
  else
    select jsonb_build_object('title', sj.name, 'subject', sj.name, 'updated_at', sj.updated_at,
             'cards', coalesce((select jsonb_agg(jsonb_build_object('front', f.front, 'back', f.back) order by f.created_at)
                                  from public.flashcards f
                                 where f.subject_id = sj.id and f.user_id = s.user_id and f.deleted_at is null), '[]'))
      into result
      from public.subjects sj
     where sj.id = s.target_id and sj.user_id = s.user_id and sj.deleted_at is null;
  end if;
  if result is null then return null; end if;
  update public.shares set views = views + 1 where id = s.id;
  return result || jsonb_build_object('kind', s.kind);
end $$;
revoke execute on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;
