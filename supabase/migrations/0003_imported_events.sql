-- =====================================================================
-- Études — mise à jour 3 : cours importés depuis un PDF de l'emploi du temps
-- (Outlook → Imprimer → agenda détaillé → Fichier PDF). Relançable sans danger.
-- =====================================================================

create table if not exists public.imported_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  location text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (space_id, user_id) references public.spaces(id, user_id) on delete cascade
);

alter table public.imported_events enable row level security;
drop policy if exists "imported_events_own" on public.imported_events;
create policy "imported_events_own" on public.imported_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists imported_events_updated_at on public.imported_events;
create trigger imported_events_updated_at before update on public.imported_events
  for each row execute function public.set_updated_at();
create index if not exists imported_events_space_idx on public.imported_events (space_id, start_at);
create index if not exists imported_events_user_idx on public.imported_events (user_id);
