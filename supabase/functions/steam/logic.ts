/** Steam data logic for the `steam` Edge Function (see index.ts). Exported for tests. */
import type { adminClient } from '../_shared/clients.ts';
import { cached, steamKey } from '../_shared/steamApi.ts';
import { WIKI_HOSTS } from '../_shared/wikiHosts.ts';

const MIN = 60;
const HOUR = 3600;
const UA = 'samoilov.org gaming companion (+https://samoilov.org)';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const appidOf = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 1e9) throw new HttpError(400, 'bad appid');
  return n;
};

async function getJson(url: string | URL, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init?.headers ?? {}) } });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body };
}

const api = (path: string, params: Record<string, string | number>, withKey = false) => {
  const u = new URL(`https://api.steampowered.com/${path}`);
  if (withKey) u.searchParams.set('key', steamKey());
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u;
};

// ---------- public ----------

export async function game(db: ReturnType<typeof adminClient>, appid: number) {
  const details = await cached(db, `appdetails:${appid}`, 24 * HOUR, async () => {
    const { status, body } = await getJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=us`);
    if (status !== 200) throw new Error(`appdetails ${status}`);
    const entry = body?.[appid];
    if (!entry?.success) return null;
    const d = entry.data;
    return {
      appid,
      name: d.name as string,
      type: d.type as string,
      shortDescription: (d.short_description as string) ?? '',
      headerImage: (d.header_image as string) ?? '',
      background: (d.background_raw as string) || (d.background as string) || '',
      developers: (d.developers as string[]) ?? [],
      releaseDate: (d.release_date?.date as string) ?? '',
      achievementsTotal: (d.achievements?.total as number) ?? 0,
      isFree: !!d.is_free,
    };
  });
  if (!details) throw new HttpError(404, 'Not a Steam game (or not available in the store).');

  let players: number | null = null;
  try {
    players = await cached(db, `players:${appid}`, 5 * MIN, async () => {
      const { status, body } = await getJson(api('ISteamUserStats/GetNumberOfCurrentPlayers/v1/', { appid }));
      if (status !== 200 || body?.response?.result !== 1) throw new Error(`players ${status}`);
      return body.response.player_count as number;
    });
  } catch {
    /* player count is optional */
  }
  return { ...details, players };
}

export async function news(db: ReturnType<typeof adminClient>, appid: number) {
  return cached(db, `news:${appid}`, 30 * MIN, async () => {
    const { status, body } = await getJson(
      api('ISteamNews/GetNewsForApp/v2/', { appid, count: 8, feeds: 'steam_community_announcements' }),
    );
    if (status !== 200) throw new Error(`news ${status}`);
    return ((body?.appnews?.newsitems ?? []) as any[]).map((n) => ({
      id: String(n.gid),
      title: String(n.title ?? ''),
      url: String(n.url ?? ''),
      date: Number(n.date ?? 0),
      author: n.author ? String(n.author) : undefined,
      contents: String(n.contents ?? ''),
      feed: String(n.feedlabel ?? ''),
      tags: (n.tags ?? []) as string[],
    }));
  });
}

export async function search(db: ReturnType<typeof adminClient>, term: string) {
  const t = term.trim().slice(0, 80);
  if (t.length < 2) return [];
  return cached(db, `search:${t.toLowerCase()}`, HOUR, async () => {
    const u = new URL('https://store.steampowered.com/api/storesearch/');
    u.searchParams.set('term', t);
    u.searchParams.set('l', 'english');
    u.searchParams.set('cc', 'US');
    const { status, body } = await getJson(u);
    if (status !== 200) throw new Error(`search ${status}`);
    return ((body?.items ?? []) as any[])
      .filter((i) => i.type === 'app')
      .slice(0, 12)
      .map((i) => ({ appid: Number(i.id), name: String(i.name) }));
  });
}

const WIKI_ACTIONS = new Set(['parse', 'query', 'opensearch']);
export async function wiki(db: ReturnType<typeof adminClient>, apiUrl: string, params: Record<string, string>) {
  let u: URL;
  try {
    u = new URL(apiUrl);
  } catch {
    throw new HttpError(400, 'bad wiki url');
  }
  if (u.protocol !== 'https:' || !WIKI_HOSTS.has(u.host) || !u.pathname.endsWith('/api.php')) {
    throw new HttpError(403, 'wiki not on the allow-list');
  }
  if (!params || typeof params !== 'object' || !WIKI_ACTIONS.has(params.action)) throw new HttpError(400, 'unsupported wiki action');
  u.search = '';
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v.length < 500) u.searchParams.set(k, v);
  }
  u.searchParams.set('format', 'json');
  u.searchParams.set('formatversion', '2');
  u.searchParams.delete('origin');
  return cached(db, `wiki:${u}`, HOUR, async () => {
    const { status, body } = await getJson(u);
    if (status !== 200 || body === null) throw new HttpError(502, `wiki responded ${status}`);
    return body;
  });
}

// ---------- signed-in ----------

export async function steamidFor(db: ReturnType<typeof adminClient>, req: Request): Promise<string> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in to see this.');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Sign in to see this.');
  const { data: prof } = await db.from('profiles').select('steamid').eq('id', data.user.id).maybeSingle();
  if (!prof?.steamid) throw new HttpError(401, 'No Steam account linked.');
  return prof.steamid;
}

export async function me(db: ReturnType<typeof adminClient>, steamid: string, appid: number) {
  // playtime (empty response = private "Game details" or game not owned)
  const owned = await cached(db, `owned:${steamid}:${appid}`, 10 * MIN, async () => {
    const { status, body } = await getJson(
      api('IPlayerService/GetOwnedGames/v1/', { steamid, include_played_free_games: 1, 'appids_filter[0]': appid }, true),
    );
    if (status !== 200) throw new Error(`owned ${status}`);
    const r = body?.response ?? {};
    const g = (r.games ?? []).find((x: any) => x.appid === appid);
    return { visible: 'game_count' in r, owned: !!g, playtimeMinutes: g ? Number(g.playtime_forever ?? 0) : 0 };
  });

  const schema = await cached(db, `schema:${appid}`, 24 * HOUR, async () => {
    const { status, body } = await getJson(api('ISteamUserStats/GetSchemaForGame/v2/', { appid, l: 'english' }, true));
    if (status !== 200) throw new Error(`schema ${status}`);
    return ((body?.game?.availableGameStats?.achievements ?? []) as any[]).map((a) => ({
      id: String(a.name),
      name: String(a.displayName ?? a.name),
      description: String(a.description ?? ''),
      icon: String(a.icon ?? ''),
      hidden: a.hidden === 1,
    }));
  });

  const global = await cached(db, `globalach:${appid}`, 24 * HOUR, async () => {
    const { status, body } = await getJson(api('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: appid }));
    if (status !== 200) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const a of body?.achievementpercentages?.achievements ?? []) out[a.name] = Number(a.percent);
    return out;
  });

  type PlayerAch = { state: 'ok'; unlocked: Record<string, number> } | { state: 'private' } | { state: 'nostats' };
  const player: PlayerAch = schema.length
    ? await cached(db, `playerach:${steamid}:${appid}`, 5 * MIN, async () => {
        const { status, body } = await getJson(api('ISteamUserStats/GetPlayerAchievements/v1/', { steamid, appid }, true));
        const ps = body?.playerstats;
        if (ps?.success) {
          const unlocked: Record<string, number> = {};
          for (const a of ps.achievements ?? []) if (a.achieved === 1) unlocked[a.apiname] = Number(a.unlocktime ?? 0);
          return { state: 'ok', unlocked } as PlayerAch;
        }
        const err = String(ps?.error ?? '');
        if (/not public/i.test(err) || status === 403) return { state: 'private' } as PlayerAch;
        if (/no stats/i.test(err) || status === 400) return { state: 'nostats' } as PlayerAch;
        throw new Error(`playerach ${status} ${err}`);
      })
    : { state: 'nostats' };

  const achievements = schema.map((a) => ({
    ...a,
    achieved: player.state === 'ok' && a.id in player.unlocked,
    unlockedAt: player.state === 'ok' ? player.unlocked[a.id] : undefined,
    globalPercent: global[a.id],
  }));
  const earned = achievements.filter((a) => a.achieved).length;

  return {
    profileVisible: owned.visible && player.state !== 'private',
    owned: owned.owned,
    playtimeMinutes: owned.playtimeMinutes,
    achievementsState: player.state,
    achievementsTotal: achievements.length,
    achievementsEarned: earned,
    achievements,
  };
}

