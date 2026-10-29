-- =====================================================================
-- Études — mise à jour 12 : offres (gratuit / Premium), codes d'accès,
-- quotas hebdomadaires appliqués côté serveur. Relançable sans danger.
-- Le paiement Stripe viendra plus tard : il écrira dans « subscriptions ».
-- =====================================================================

-- Abonnement de chaque utilisateur (une ligne au maximum)
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  source text not null default 'none' check (source in ('none', 'code', 'stripe')),
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions_read_own" on public.subscriptions;
create policy "subscriptions_read_own" on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.subscriptions from anon, authenticated;

-- Codes d'accès (créés par toi dans le SQL Editor, jamais lisibles par les utilisateurs)
create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  plan text not null default 'premium' check (plan in ('premium')),
  duration_days integer,           -- null = sans limite de durée
  max_uses integer,                -- null = sans limite d'utilisation
  uses integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.access_codes enable row level security;

create table if not exists public.code_redemptions (
  code_id uuid not null references public.access_codes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code_id, user_id)
);
alter table public.code_redemptions enable row level security;

-- Limites par offre : nombre d'usages par semaine glissante (0 = interdit)
create table if not exists public.plan_limits (
  plan text not null,
  kind text not null,
  weekly integer not null check (weekly >= 0),
  primary key (plan, kind)
);
alter table public.plan_limits enable row level security;
drop policy if exists "plan_limits_read" on public.plan_limits;
create policy "plan_limits_read" on public.plan_limits for select to authenticated using (true);

insert into public.plan_limits (plan, kind, weekly) values
  ('free', 'quiz', 3),
  ('free', 'cards', 3),
  ('free', 'mindmap', 3),
  ('free', 'sheet', 3),
  ('free', 'images', 3),
  ('free', 'exam_section', 1),
  ('free', 'exam_full', 0),
  ('free', 'transcription', 0),
  ('premium', 'quiz', 30),
  ('premium', 'cards', 30),
  ('premium', 'mindmap', 30),
  ('premium', 'sheet', 30),
  ('premium', 'images', 30),
  ('premium', 'exam_section', 20),
  ('premium', 'exam_full', 2),
  ('premium', 'transcription', 180)   -- minutes d'audio par semaine
on conflict (plan, kind) do update set weekly = excluded.weekly;

-- Usages enregistrés (une ligne par action lancée)
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  amount integer not null default 1 check (amount > 0),
  created_at timestamptz not null default now()
);
alter table public.usage_events enable row level security;
create index if not exists usage_events_user_idx on public.usage_events (user_id, kind, created_at);
drop policy if exists "usage_events_read_own" on public.usage_events;
create policy "usage_events_read_own" on public.usage_events for select to authenticated
  using (user_id = (select auth.uid()));

-- Offre actuelle de l'utilisateur connecté
create or replace function public.current_plan()
returns text language sql stable security definer set search_path = '' as $$
  select case when s.plan = 'premium' and (s.current_period_end is null or s.current_period_end > now())
              then 'premium' else 'free' end
    from (select 1) d
    left join public.subscriptions s on s.user_id = auth.uid()
$$;

-- Usages de la semaine glissante et limite, pour l'affichage
create or replace function public.usage_summary()
returns table (kind text, used integer, max integer)
language sql stable security definer set search_path = '' as $$
  select l.kind,
         coalesce((select sum(e.amount)::int from public.usage_events e
                    where e.user_id = auth.uid() and e.kind = l.kind and e.created_at > now() - interval '7 days'), 0),
         l.weekly
    from public.plan_limits l
   where l.plan = public.current_plan()
   order by l.kind
$$;

-- Consomme un usage si la limite le permet, sinon refuse avec un message clair
create or replace function public.consume_quota(p_kind text, p_amount integer default 1)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_plan text := public.current_plan();
  max_allowed integer;
  used_now integer;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour continuer.'; end if;
  select weekly into max_allowed from public.plan_limits where plan = v_plan and kind = p_kind;
  if max_allowed is null then raise exception 'Cette fonction n’est pas reconnue.'; end if;
  select coalesce(sum(amount), 0) into used_now from public.usage_events
   where user_id = auth.uid() and kind = p_kind and created_at > now() - interval '7 days';
  if max_allowed = 0 then
    raise exception 'Cette fonction est réservée à l’offre Premium.' using errcode = 'P0001';
  end if;
  if used_now + p_amount > max_allowed then
    raise exception 'Limite de la semaine atteinte (%/%). Elle se remet à zéro dans 7 jours, ou passe en Premium.', used_now, max_allowed using errcode = 'P0001';
  end if;
  insert into public.usage_events (user_id, kind, amount) values (auth.uid(), p_kind, p_amount);
end $$;

-- Saisie d'un code d'accès : Premium pendant la durée du code
create or replace function public.redeem_code(p_code text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  c public.access_codes;
  until timestamptz;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour utiliser un code.'; end if;
  select * into c from public.access_codes where upper(code) = upper(trim(p_code)) for update;
  if not found or not c.active then raise exception 'Ce code n’existe pas ou n’est plus valable.'; end if;
  if c.max_uses is not null and c.uses >= c.max_uses then raise exception 'Ce code a déjà été utilisé le nombre de fois prévu.'; end if;
  if exists (select 1 from public.code_redemptions where code_id = c.id and user_id = auth.uid()) then
    raise exception 'Tu as déjà utilisé ce code.';
  end if;
  until := case when c.duration_days is null then null else now() + make_interval(days => c.duration_days) end;
  insert into public.code_redemptions (code_id, user_id) values (c.id, auth.uid());
  update public.access_codes set uses = uses + 1 where id = c.id;
  insert into public.subscriptions (user_id, plan, source, current_period_end, updated_at)
  values (auth.uid(), c.plan, 'code', until, now())
  on conflict (user_id) do update set plan = excluded.plan, source = excluded.source,
    current_period_end = excluded.current_period_end, updated_at = now();
  return until;
end $$;

revoke execute on function public.current_plan() from anon, public;
revoke execute on function public.usage_summary() from anon, public;
revoke execute on function public.consume_quota(text, integer) from anon, public;
revoke execute on function public.redeem_code(text) from anon, public;
grant execute on function public.current_plan() to authenticated;
grant execute on function public.usage_summary() to authenticated;
grant execute on function public.consume_quota(text, integer) to authenticated;
grant execute on function public.redeem_code(text) to authenticated;

-- Ton code d'accès de test (sans limite de durée ni d'utilisation)
insert into public.access_codes (code, plan, duration_days, max_uses)
values ('Thomaslemeilleurcopaindumonde', 'premium', null, null)
on conflict (code) do nothing;

-- Mise à jour de la corbeille et de la purge : les usages suivent le compte
-- (les tables de quotas sont nettoyées avec le compte, via la cascade auth.users)

-- Aucun accès direct aux codes ni aux tentatives de code, même en lecture
revoke all on public.access_codes from anon, authenticated;
revoke all on public.code_redemptions from anon, authenticated;
