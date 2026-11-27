-- Phase 6: PlayStation / Xbox accounts linked to a samoilov.org user.
-- Linking proves ownership (a code in the profile's About me / bio), so rows are written only by Edge Functions.
create table public.linked_accounts (
  user_id     uuid not null references auth.users (id) on delete cascade,
  platform    text not null check (platform in ('psn', 'xbox')),
  account_id  text not null check (length(account_id) between 1 and 64),   -- PSN accountId / Xbox XUID
  handle      text not null check (length(handle) between 1 and 64),       -- PSN online ID / gamertag
  avatar_url  text not null default '',
  linked_at   timestamptz not null default now(),
  primary key (user_id, platform),
  unique (platform, account_id)
);
alter table public.linked_accounts enable row level security;
create policy "linked: read own"   on public.linked_accounts for select to authenticated using (user_id = (select auth.uid()));
create policy "linked: unlink own" on public.linked_accounts for delete to authenticated using (user_id = (select auth.uid()));
revoke all on table public.linked_accounts from anon, authenticated;
grant select, delete on table public.linked_accounts to authenticated;
grant select, insert, update, delete on table public.linked_accounts to service_role;

-- Pending "put this code in your About me" checks. Server-only.
create table public.link_challenges (
  user_id     uuid not null references auth.users (id) on delete cascade,
  platform    text not null check (platform in ('psn', 'xbox')),
  account_id  text not null,
  handle      text not null,
  avatar_url  text not null default '',
  code        text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, platform)
);
alter table public.link_challenges enable row level security;
revoke all on table public.link_challenges from anon, authenticated;
grant select, insert, update, delete on table public.link_challenges to service_role;
