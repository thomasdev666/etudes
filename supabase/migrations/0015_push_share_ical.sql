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
