-- Explicit table privileges. Newer Supabase projects no longer grant API roles access
-- to new tables automatically, so the Edge Functions' service_role got
-- "permission denied" (42501). Spell out exactly who may do what.
-- RLS policies still apply on top of these grants for anon/authenticated.

grant usage on schema public to service_role, authenticated, anon;

-- Server side (Edge Functions): full access to our tables.
grant select, insert, update, delete on table
  public.profiles, public.steam_auth_nonces, public.steam_cache
  to service_role;

-- Signed-in users: may read profiles (RLS limits it to their own row). No writes.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

-- Internal tables: invisible to browsers entirely.
revoke all on table public.steam_auth_nonces, public.steam_cache from anon, authenticated;
