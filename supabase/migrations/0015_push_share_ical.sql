-- =====================================================================
-- Regulya — mise à jour 15 : notifications sur le téléphone, partage par
-- lien, agendas iCal. Relançable sans danger.
-- =====================================================================

-- Appareils abonnés aux notifications (un par navigateur ou téléphone)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_own" on public.push_subscriptions;
create policy "push_own" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Réglage : notification quotidienne des cartes à revoir
alter table public.user_settings add column if not exists notify_cards boolean not null default true;

-- Enregistre l'appareil pour l'utilisateur connecté (un navigateur partagé passe au dernier compte connecté)
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour activer les notifications.'; end if;
  if p_endpoint not like 'https://%' then raise exception 'Adresse de notification invalide.'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end $$;
revoke execute on function public.save_push_subscription(text, text, text) from anon, public;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Flash cards importées (Anki, Quizlet, CSV)
alter table public.flashcards drop constraint if exists flashcards_source_check;
alter table public.flashcards add constraint flashcards_source_check check (source in ('manual', 'ai', 'import'));

-- Partage par lien en lecture seule : une note (ou fiche), une carte mentale, un paquet de flash cards
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space_id uuid not null,
  kind text not null check (kind in ('note', 'mindmap', 'deck')),
  target_id uuid not null,
  views integer not null default 0,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade
);
alter table public.shares enable row level security;
drop policy if exists "shares_own" on public.shares;
create policy "shares_own" on public.shares for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.shares from authenticated;
grant update (revoked_at) on public.shares to authenticated;
create index if not exists shares_target_idx on public.shares (user_id, kind, target_id);

-- Lecture publique d'un partage : uniquement le contenu, seulement si le lien est actif,
-- si l'élément appartient bien à l'auteur du lien et n'est pas à la corbeille.
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
