-- Last playtime we've seen for each (Steam account, game), taken from Steam's "recently played" list.
-- Steam only reports playtime for Family Library games for ~2 weeks after they were last played,
-- so we keep the last number we saw. Server-only: written and read by Edge Functions.
create table public.known_playtime (
  steamid  text not null check (steamid ~ '^7656119[0-9]{10}$'),
  appid    integer not null check (appid > 0),
  minutes  integer not null check (minutes >= 0),
  seen_at  timestamptz not null default now(),
  primary key (steamid, appid)
);
alter table public.known_playtime enable row level security;
-- No policies: browsers can't read or write it.
revoke all on table public.known_playtime from anon, authenticated;
grant select, insert, update, delete on table public.known_playtime to service_role;
