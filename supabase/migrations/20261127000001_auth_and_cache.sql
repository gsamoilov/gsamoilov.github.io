-- Phase 2: Steam-linked profiles, OpenID replay protection, Steam API response cache.
-- Every table has Row Level Security enabled.

-- One row per signed-in user, keyed by SteamID64.
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  steamid       text not null unique check (steamid ~ '^7656119[0-9]{10}$'),
  persona_name  text not null default '',
  avatar_url    text not null default '',
  profile_url   text not null default '',
  -- Steam communityvisibilitystate: 3 = public; anything else = private/friends-only
  public_profile boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Users can read only their own profile. Writes happen only in the steam-auth
-- Edge Function (service role), so a user can never change their linked SteamID.
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

-- Steam OpenID nonces we've already accepted (stops replaying a captured login URL).
create table public.steam_auth_nonces (
  nonce      text primary key,
  created_at timestamptz not null default now()
);
alter table public.steam_auth_nonces enable row level security;
-- No policies: only the service role (Edge Functions) can touch it.

-- Cached Steam Web API responses, to stay well under Steam's rate limits.
create table public.steam_cache (
  key        text primary key,          -- e.g. 'players:570' or 'achievements:76561198...:570'
  payload    jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index steam_cache_expires_idx on public.steam_cache (expires_at);
alter table public.steam_cache enable row level security;
-- No policies: only the service role (Edge Functions) can touch it.
