-- Phase 3: "Playing" marks and private "Where I left off" notes.
-- Both are strictly per-user: RLS lets a signed-in user see and change only their own rows.

create table public.playing (
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  platform   text not null default 'steam' check (platform in ('steam', 'psn', 'xbox')),
  game_id    text not null check (length(game_id) between 1 and 64),
  game_name  text not null default '' check (length(game_name) <= 200),
  added_at   timestamptz not null default now(),
  primary key (user_id, platform, game_id)
);
alter table public.playing enable row level security;

create policy "playing: read own"   on public.playing for select to authenticated using (user_id = (select auth.uid()));
create policy "playing: add own"    on public.playing for insert to authenticated with check (user_id = (select auth.uid()));
create policy "playing: remove own" on public.playing for delete to authenticated using (user_id = (select auth.uid()));

create table public.notes (
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  platform   text not null default 'steam' check (platform in ('steam', 'psn', 'xbox')),
  game_id    text not null check (length(game_id) between 1 and 64),
  body       text not null default '' check (length(body) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, platform, game_id)
);
alter table public.notes enable row level security;

create policy "notes: read own"   on public.notes for select to authenticated using (user_id = (select auth.uid()));
create policy "notes: add own"    on public.notes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "notes: edit own"   on public.notes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notes: delete own" on public.notes for delete to authenticated using (user_id = (select auth.uid()));

-- Explicit privileges (newer projects grant nothing by default).
revoke all on table public.playing, public.notes from anon;
grant select, insert, delete on table public.playing to authenticated;
grant select, insert, update, delete on table public.notes to authenticated;
grant select, insert, update, delete on table public.playing, public.notes to service_role;
