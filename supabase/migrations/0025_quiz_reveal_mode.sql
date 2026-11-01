-- =====================================================================
-- Regulya — mise à jour 25 : au début d'un QCM, l'étudiant choisit
-- « correction à chaque question » ou « correction à la fin ».
-- Relançable sans danger.
-- =====================================================================

-- null : pas encore choisi ; 'end' : tout à la fin (comme avant) ; 'each' : après chaque réponse
alter table public.quiz_sessions add column if not exists reveal text;
alter table public.quiz_sessions drop constraint if exists quiz_sessions_reveal_check;
alter table public.quiz_sessions add constraint quiz_sessions_reveal_check check (reveal is null or reveal in ('end', 'each'));

-- Correction d'une seule question, seulement en mode « à chaque question », pour une session
-- en cours de l'étudiant et une question de cette session. Le mode examen reste corrigé à la fin.
create or replace function public.check_quiz_answer(p_session_id uuid, p_question_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.quiz_sessions;
  q public.quiz_questions;
begin
  select * into s from public.quiz_sessions where id = p_session_id and user_id = auth.uid();
  if not found then raise exception 'Session introuvable'; end if;
  if s.reveal is distinct from 'each' or s.time_limit_sec is not null then
    raise exception 'La correction de ce QCM s’affiche à la fin.';
  end if;
  if not (p_question_id = any(s.question_ids)) then raise exception 'Question introuvable'; end if;
  select * into q from public.quiz_questions where id = p_question_id and user_id = auth.uid();
  if not found then raise exception 'Question introuvable'; end if;
  return jsonb_build_object(
    'correct_index', q.correct_index,
    'explanation', q.explanation,
    'notion', q.notion,
    'source_excerpt', q.source_excerpt);
end $$;
revoke execute on function public.check_quiz_answer(uuid, uuid) from anon, public;
grant execute on function public.check_quiz_answer(uuid, uuid) to authenticated;
