-- Database for SP Net Worth Tracker sync. Already applied to the project in .env.
-- Run this once in the SQL editor if you ever point the app at a different Supabase project.

create table public.net_worth_portfolios (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

comment on table public.net_worth_portfolios is 'One row per user: the full SP Net Worth Tracker portfolio. revision increases by 1 on every save and guards against two devices overwriting each other.';

alter table public.net_worth_portfolios enable row level security;

revoke all on public.net_worth_portfolios from anon;
grant select, insert, update, delete on public.net_worth_portfolios to authenticated;

create policy "Users read their own portfolio" on public.net_worth_portfolios
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own portfolio" on public.net_worth_portfolios
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own portfolio" on public.net_worth_portfolios
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own portfolio" on public.net_worth_portfolios
  for delete to authenticated using ((select auth.uid()) = user_id);
