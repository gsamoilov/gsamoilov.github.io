/** Steam data logic for the `steam` Edge Function (see index.ts). Exported for tests. */
import type { adminClient } from '../_shared/clients.ts';
import { cached, steamKey } from '../_shared/steamApi.ts';
import { WIKI_HOSTS } from '../_shared/wikiHosts.ts';

export const MIN = 60;
export const HOUR = 3600;
export const UA = 'samoilov.org gaming companion (+https://samoilov.org)';

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

export async function getJson(url: string | URL, init?: RequestInit): Promise<{ status: number; body: any }> {
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

export const api = (path: string, params: Record<string, string | number>, withKey = false) => {
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

/** The signed-in user's id from the Authorization header. */
export async function userIdFor(db: ReturnType<typeof adminClient>, req: Request): Promise<string> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in to see this.');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Sign in to see this.');
  return data.user.id;
}

export async function steamidFor(db: ReturnType<typeof adminClient>, req: Request): Promise<string> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in to see this.');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Sign in to see this.');
  const { data: prof } = await db.from('profiles').select('steamid').eq('id', data.user.id).maybeSingle();
  if (!prof?.steamid) throw new HttpError(401, 'No Steam account linked.');
  return prof.steamid;
}

export interface SchemaAch {
  id: string;
  name: string;
  description: string;
  icon: string;
  hidden: boolean;
}

/** A game's achievement list (names, icons, hidden flag). Cached a day. */
export function loadSchema(db: ReturnType<typeof adminClient>, appid: number): Promise<SchemaAch[]> {
  return cached(db, `schema:${appid}`, 24 * HOUR, async () => {
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
}

/** % of all players who have each achievement. Cached a day. */
export function loadGlobalPercents(db: ReturnType<typeof adminClient>, appid: number): Promise<Record<string, number>> {
  return cached(db, `globalach:${appid}`, 24 * HOUR, async () => {
    const { status, body } = await getJson(api('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: appid }));
    if (status !== 200) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const a of body?.achievementpercentages?.achievements ?? []) out[a.name] = Number(a.percent);
    return out;
  });
}

/** Parses Steam Community's achievements XML (fallback when the Web API refuses, e.g. Family Library games). */
export function parseCommunityAchievementsXml(xml: string): Record<string, number> | null {
  if (!/<playerstats>/i.test(xml) || /<error>/i.test(xml)) return null;
  const unlocked: Record<string, number> = {};
  for (const m of xml.matchAll(/<achievement\s+closed="1"[^>]*>([\s\S]*?)<\/achievement>/gi)) {
    const api = /<apiname>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/apiname>/i.exec(m[1])?.[1]?.trim();
    const ts = Number(/<unlockTimestamp>\s*(\d+)\s*<\/unlockTimestamp>/i.exec(m[1])?.[1] ?? 0);
    if (api) unlocked[api.toLowerCase()] = ts;
  }
  return unlocked;
}

type PlayerAch =
  | { state: 'ok'; unlocked: Record<string, number>; source: 'api' | 'community' }
  | { state: 'private' }
  | { state: 'nostats' }
  | { state: 'unavailable' };

export interface RecentGame {
  appid: number;
  name: string;
  minutes: number;
  minutes2Weeks: number;
}

/** Steam's "recently played" list (last 2 weeks; includes Family Library games). */
export async function fetchRecentlyPlayed(steamid: string): Promise<RecentGame[]> {
  const { status, body } = await getJson(api('IPlayerService/GetRecentlyPlayedGames/v1/', { steamid, count: 0 }, true));
  if (status !== 200) throw new Error(`recent ${status}`);
  return ((body?.response?.games ?? []) as any[])
    .map((g) => ({
      appid: Number(g.appid),
      name: String(g.name ?? ''),
      minutes: Number(g.playtime_forever ?? 0),
      minutes2Weeks: Number(g.playtime_2weeks ?? 0),
    }))
    .filter((g) => g.appid > 0 && Number.isFinite(g.minutes));
}

/** Saves playtimes so we still know them after a game drops off the 2-week list. */
export async function rememberPlaytime(db: ReturnType<typeof adminClient>, steamid: string, games: RecentGame[]) {
  if (!games.length) return;
  const now = new Date().toISOString();
  const { error } = await db
    .from('known_playtime')
    .upsert(games.map((g) => ({ steamid, appid: g.appid, minutes: g.minutes, seen_at: now })));
  if (error) console.warn('rememberPlaytime failed', error.message);
}

export async function me(db: ReturnType<typeof adminClient>, steamid: string, appid: number) {
  const diag: Record<string, unknown> = {};

  // 1. Playtime from the owned-games list. An empty response means "Game details" are private.
  //    Family Library (borrowed) games are NOT in this list.
  const owned = await cached(db, `owned2:${steamid}:${appid}`, 10 * MIN, async () => {
    const { status, body } = await getJson(
      api('IPlayerService/GetOwnedGames/v1/', { steamid, include_played_free_games: 1, include_free_sub: 1, 'appids_filter[0]': appid }, true),
    );
    if (status !== 200) throw new Error(`owned ${status}`);
    const r = body?.response ?? {};
    const g = (r.games ?? []).find((x: any) => x.appid === appid);
    return { visible: 'game_count' in r, owned: !!g, playtimeMinutes: g ? Number(g.playtime_forever ?? 0) : 0 };
  });
  diag.gameDetailsPublic = owned.visible;
  diag.inOwnedGames = owned.owned;

  // 2. Not owned: borrowed games show up in "recently played" (last 2 weeks) with their total playtime.
  //    Every time we see that list we save it, so older family games keep their last known hours.
  let playtimeMinutes = owned.playtimeMinutes;
  let playtimeSource: 'owned' | 'recent' | 'remembered' | 'none' = owned.owned ? 'owned' : 'none';
  let playtimeSeenAt: string | undefined;
  if (!owned.owned && owned.visible) {
    const recent = await cached(db, `recent:${steamid}`, 10 * MIN, async () => {
      const games = await fetchRecentlyPlayed(steamid);
      await rememberPlaytime(db, steamid, games);
      return games;
    }).catch(() => [] as RecentGame[]);
    const g = recent.find((x) => x.appid === appid);
    diag.recentlyPlayedCount = recent.length;
    diag.inRecentlyPlayed = !!g;
    if (g) {
      playtimeMinutes = g.minutes;
      playtimeSource = 'recent';
    } else {
      const { data: known } = await db
        .from('known_playtime')
        .select('minutes, seen_at')
        .eq('steamid', steamid)
        .eq('appid', appid)
        .maybeSingle();
      if (known) {
        playtimeMinutes = Number(known.minutes);
        playtimeSource = 'remembered';
        playtimeSeenAt = String(known.seen_at);
      }
    }
  }
  diag.playtimeSource = playtimeSource;

  const schema = await loadSchema(db, appid);
  diag.schemaAchievements = schema.length;

  const global = await loadGlobalPercents(db, appid);

  // 3. Achievements: Web API first; if it refuses while the profile is public, try the Community XML page.
  let player: PlayerAch = { state: 'nostats' };
  if (schema.length) {
    player = await cached(db, `playerach2:${steamid}:${appid}`, 5 * MIN, async () => {
      const { status, body } = await getJson(api('ISteamUserStats/GetPlayerAchievements/v1/', { steamid, appid }, true));
      const ps = body?.playerstats;
      diag.apiStatus = status;
      if (ps?.success) {
        const unlocked: Record<string, number> = {};
        for (const a of ps.achievements ?? []) if (a.achieved === 1) unlocked[String(a.apiname).toLowerCase()] = Number(a.unlocktime ?? 0);
        return { state: 'ok', unlocked, source: 'api' } as PlayerAch;
      }
      diag.apiError = String(ps?.error ?? body?.error ?? '').slice(0, 200);
      console.warn('GetPlayerAchievements refused', { appid, status, error: diag.apiError, gameDetailsPublic: owned.visible });

      // Only call it "private" when the owned-games list confirms the profile hides game details.
      if (!owned.visible) return { state: 'private' } as PlayerAch;

      const xmlRes = await fetch(`https://steamcommunity.com/profiles/${steamid}/stats/${appid}/achievements/?xml=1&l=english`, {
        headers: { 'User-Agent': UA },
      }).catch(() => null);
      diag.communityStatus = xmlRes?.status ?? 'failed';
      if (xmlRes?.ok) {
        const parsed = parseCommunityAchievementsXml(await xmlRes.text());
        if (parsed) return { state: 'ok', unlocked: parsed, source: 'community' } as PlayerAch;
      }
      return { state: 'unavailable' } as PlayerAch;
    });
  }
  diag.achievementsSource = player.state === 'ok' ? player.source : player.state;
  if (schema.length && !('apiStatus' in diag)) diag.achievementsFromCache = true;

  const achievements = schema.map((a) => {
    const key = a.id.toLowerCase();
    return {
      ...a,
      achieved: player.state === 'ok' && key in player.unlocked,
      unlockedAt: player.state === 'ok' ? player.unlocked[key] : undefined,
      globalPercent: global[a.id],
    };
  });
  const earned = achievements.filter((a) => a.achieved).length;
  // Steam answers achievement requests even for games you never owned (all locked), so that alone proves nothing.
  // Only call it a Family Library game if there's real evidence you played it: recent playtime or unlocked achievements.
  const playedWithoutOwning = owned.visible && !owned.owned && (playtimeSource === 'recent' || earned > 0);
  diag.playedWithoutOwning = playedWithoutOwning;

  return {
    profileVisible: owned.visible,
    owned: owned.owned,
    familyOrBorrowed: playedWithoutOwning,
    playtimeMinutes,
    playtimeKnown: playtimeSource !== 'none',
    playtimeSource,
    playtimeSeenAt,
    achievementsState: player.state,
    achievementsTotal: achievements.length,
    achievementsEarned: earned,
    achievements,
    diagnostics: diag,
  };
}

/** Signed-in user's recently played games (last 2 weeks, most played first). Also saves their playtimes. */
export async function recent(db: ReturnType<typeof adminClient>, steamid: string) {
  const games = await cached(db, `recent:${steamid}`, 10 * MIN, async () => {
    const g = await fetchRecentlyPlayed(steamid);
    await rememberPlaytime(db, steamid, g);
    return g;
  });
  return [...games].sort((a, b) => b.minutes2Weeks - a.minutes2Weeks);
}
