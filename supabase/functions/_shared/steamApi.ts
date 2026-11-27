import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Steam Web API calls with a Postgres-backed cache. The key comes from Supabase secrets only. */
export function steamKey(): string {
  const k = Deno.env.get('STEAM_API_KEY');
  if (!k) throw new Error('STEAM_API_KEY secret is not set');
  return k;
}

export async function cached<T>(
  db: SupabaseClient,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const { data } = await db.from('steam_cache').select('payload, expires_at').eq('key', key).maybeSingle();
  if (data && new Date(data.expires_at).getTime() > Date.now()) return data.payload as T;

  try {
    const fresh = await fetcher();
    await db.from('steam_cache').upsert({
      key,
      payload: fresh,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    });
    return fresh;
  } catch (err) {
    if (data) return data.payload as T; // Steam down or rate-limited: serve the stale copy
    throw err;
  }
}

export interface PlayerSummary {
  steamid: string;
  personaname: string;
  avatarfull: string;
  profileurl: string;
  communityvisibilitystate: number;
}

export async function getPlayerSummaries(steamids: string[]): Promise<PlayerSummary[]> {
  const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
  url.searchParams.set('key', steamKey());
  url.searchParams.set('steamids', steamids.join(','));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GetPlayerSummaries ${res.status}`);
  const body = await res.json();
  return body?.response?.players ?? [];
}
