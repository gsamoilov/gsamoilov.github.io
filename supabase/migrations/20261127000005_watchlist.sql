-- Phase 5: games a user watches for price drops. Private per user (RLS).
create table public.watchlist (
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  platform   text not null default 'steam' check (platform in ('steam', 'psn', 'xbox')),
  game_id    text not null check (length(game_id) between 1 and 64),
  game_name  text not null default '' check (length(game_name) <= 200),
  added_at   timestamptz not null default now(),
  primary key (user_id, platform, game_id)
);
alter table public.watchlist enable row level security;

create policy "watchlist: read own"   on public.watchlist for select to authenticated using (user_id = (select auth.uid()));
create policy "watchlist: add own"    on public.watchlist for insert to authenticated with check (user_id = (select auth.uid()));
create policy "watchlist: remove own" on public.watchlist for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.watchlist from anon;
grant select, insert, delete on table public.watchlist to authenticated;
grant select, insert, update, delete on table public.watchlist to service_role;
