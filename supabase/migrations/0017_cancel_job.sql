-- Annuler une génération lancée par erreur : la tâche passe en erreur « Annulé », et le quota
-- consommé par cette tâche est rendu. Seulement pour ses propres tâches, encore en cours.
create or replace function public.cancel_ai_job(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.ai_jobs%rowtype;
  q text;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour continuer.'; end if;
  select * into j from public.ai_jobs where id = p_job and user_id = auth.uid() for update;
  if not found then raise exception 'Génération introuvable.'; end if;
  if j.status not in ('pending', 'running') then raise exception 'Cette génération est déjà terminée.'; end if;
  if j.kind not in ('quiz', 'flashcards', 'mindmap', 'sheet', 'assistant') then
    raise exception 'Cette génération ne peut pas être annulée.';
  end if;

  update public.ai_jobs set status = 'error', error = 'Annulé', updated_at = now() where id = p_job;

  -- Le quota n'est consommé qu'au démarrage côté serveur : on rend le dernier usage pris depuis
  q := case j.kind when 'quiz' then 'quiz' when 'flashcards' then 'cards' when 'mindmap' then 'mindmap' else 'sheet' end;
  delete from public.usage_events
   where id = (
     select id from public.usage_events
      where user_id = auth.uid() and kind = q and created_at >= j.created_at
      order by created_at desc limit 1
   );
end $$;

revoke all on function public.cancel_ai_job(uuid) from public, anon;
grant execute on function public.cancel_ai_job(uuid) to authenticated;
