/** Phase 5: profile stats, friends in-game, and prices (CheapShark). Used by the `steam` Edge Function. */
import type { adminClient } from '../_shared/clients.ts';
import { cached, getPlayerSummaries } from '../_shared/steamApi.ts';
import { api, getJson, HOUR, loadGlobalPercents, loadSchema, MIN, UA } from './logic.ts';

type Db = ReturnType<typeof adminClient>;

/** Runs `f` over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await f(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------- stats

export const STATS_SAMPLE = 30;

export interface RareAchievement {
  appid: number;
  game: string;
  name: string;
  description: string;
  icon: string;
  percent: number;
  unlockedAt: number;
}

export type ProfileStats =
  | { state: 'private' }
  | {
      state: 'ok';
      generatedAt: string;
      totalMinutes: number;
      gamesOwned: number;
      gamesPlayed: number;
      sampledGames: number;
      avgCompletion: number | null; // % across sampled games where you have at least one achievement
      achievementsEarned: number;
      perfectGames: number;
      rarest: RareAchievement[];
      topGames: { appid: number; name: string; minutes: number }[];
    };

async function computeStats(db: Db, steamid: string): Promise<ProfileStats> {
  const { status, body } = await getJson(
    api('IPlayerService/GetOwnedGames/v1/', { steamid, include_appinfo: 1, include_played_free_games: 1 }, true),
  );
  if (status !== 200) throw new Error(`owned ${status}`);
  const r = body?.response ?? {};
  if (!('game_count' in r)) return { state: 'private' };
  const games = ((r.games ?? []) as any[]).map((g) => ({
    appid: Number(g.appid),
    name: String(g.name ?? ''),
    minutes: Number(g.playtime_forever ?? 0),
    hasStats: !!g.has_community_visible_stats,
  }));
  const played = games.filter((g) => g.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const sample = played.filter((g) => g.hasStats).slice(0, STATS_SAMPLE);

  const perGame = await mapLimit(sample, 6, async (g) => {
    try {
      const [schema, global, unlocked] = await Promise.all([
        loadSchema(db, g.appid),
        loadGlobalPercents(db, g.appid),
        cached(db, `statach:${steamid}:${g.appid}`, 12 * HOUR, async () => {
          const res = await getJson(api('ISteamUserStats/GetPlayerAchievements/v1/', { steamid, appid: g.appid }, true));
          const out: Record<string, number> = {};
          for (const a of res.body?.playerstats?.achievements ?? []) if (a.achieved === 1) out[a.apiname] = Number(a.unlocktime ?? 0);
          return out;
        }),
      ]);
      return { g, schema, global, unlocked };
    } catch {
      return null; // one failing game shouldn't break the card
    }
  });

  let earnedTotal = 0;
  let perfect = 0;
  const completions: number[] = [];
  const rare: RareAchievement[] = [];
  for (const x of perGame) {
    if (!x || !x.schema.length) continue;
    const earned = x.schema.filter((a) => a.id in x.unlocked);
    earnedTotal += earned.length;
    if (earned.length) completions.push(earned.length / x.schema.length);
    if (earned.length === x.schema.length) perfect++;
    for (const a of earned) {
      const pct = x.global[a.id];
      if (pct === undefined || !Number.isFinite(pct)) continue;
      rare.push({ appid: x.g.appid, game: x.g.name, name: a.name, description: a.description, icon: a.icon, percent: pct, unlockedAt: x.unlocked[a.id] });
    }
  }
  rare.sort((a, b) => a.percent - b.percent);

  return {
    state: 'ok',
    generatedAt: new Date().toISOString(),
    totalMinutes: games.reduce((n, g) => n + g.minutes, 0),
    gamesOwned: games.length,
    gamesPlayed: played.length,
    sampledGames: sample.length,
    avgCompletion: completions.length ? Math.round((completions.reduce((a, b) => a + b, 0) / completions.length) * 1000) / 10 : null,
    achievementsEarned: earnedTotal,
    perfectGames: perfect,
    rarest: rare.slice(0, 5),
    topGames: played.slice(0, 5).map(({ appid, name, minutes }) => ({ appid, name, minutes })),
  };
}

/** Cached 6 h. `refresh` recomputes if the cached copy is older than 10 minutes. */
export async function profileStats(db: Db, steamid: string, refresh = false): Promise<ProfileStats> {
  const key = `profilestats:${steamid}`;
  if (refresh) {
    const { data } = await db.from('steam_cache').select('fetched_at').eq('key', key).maybeSingle();
    if (!data || Date.now() - new Date(data.fetched_at).getTime() > 10 * MIN * 1000) {
      await db.from('steam_cache').delete().eq('key', key);
    }
  }
  return cached(db, key, 6 * HOUR, () => computeStats(db, steamid));
}

// ---------------------------------------------------------------- friends

export interface FriendInGame {
  steamid: string;
  name: string;
  avatar: string;
  profileUrl: string;
  appid: number;
  game: string;
}

export type FriendsNow =
  | { state: 'private' }
  | { state: 'ok'; total: number; privateCount: number; online: number; inGame: FriendInGame[] };

/** Friends currently in a game (optionally only `appid`). Your friend list must be public. */
export async function friendsNow(db: Db, steamid: string, appid?: number): Promise<FriendsNow> {
  const list = await cached(db, `friendlist:${steamid}`, HOUR, async () => {
    const { status, body } = await getJson(api('ISteamUser/GetFriendList/v1/', { steamid, relationship: 'friend' }, true));
    if (status === 401 || status === 403) return { private: true, ids: [] as string[] };
    if (status !== 200) throw new Error(`friendlist ${status}`);
    return { private: false, ids: ((body?.friendslist?.friends ?? []) as any[]).map((f) => String(f.steamid)) };
  });
  if (list.private) return { state: 'private' };

  const summaries = await cached(db, `friendsum:${steamid}`, 2 * MIN, async () => {
    const chunks: string[][] = [];
    for (let i = 0; i < list.ids.length; i += 100) chunks.push(list.ids.slice(i, i + 100));
    const all = (await mapLimit(chunks, 3, (c) => getPlayerSummaries(c))).flat();
    return all.map((p) => ({
      steamid: p.steamid,
      name: p.personaname,
      avatar: p.avatarfull,
      profileUrl: p.profileurl,
      public: p.communityvisibilitystate === 3,
      online: (p.personastate ?? 0) > 0,
      appid: p.gameid ? Number(p.gameid) : null,
      game: p.gameextrainfo ?? '',
    }));
  });

  const inGame = summaries
    .filter((f) => f.appid && (!appid || f.appid === appid))
    .map((f) => ({ steamid: f.steamid, name: f.name, avatar: f.avatar, profileUrl: f.profileUrl, appid: f.appid!, game: f.game }))
    .sort((a, b) => a.game.localeCompare(b.game) || a.name.localeCompare(b.name));
  return {
    state: 'ok',
    total: list.ids.length,
    privateCount: summaries.filter((f) => !f.public).length,
    online: summaries.filter((f) => f.online).length,
    inGame,
  };
}

// ---------------------------------------------------------------- prices (CheapShark)

const CS = 'https://www.cheapshark.com/api/1.0';
const STEAM_STORE_ID = '1';

export interface PriceInfo {
  appid: number;
  title: string;
  best: { store: string; price: number; retail: number; savings: number; url: string } | null;
  steam: { price: number; retail: number; savings: number } | null;
  lowestEver: { price: number; date: number } | null;
}

async function csJson(path: string): Promise<any> {
  const { status, body } = await getJson(`${CS}${path}`, { headers: { 'User-Agent': UA } });
  if (status === 429) throw new Error('CheapShark rate limit');
  if (status !== 200) throw new Error(`cheapshark ${status}`);
  return body;
}

const storeNames = (db: Db) =>
  cached(db, 'cs:stores', 24 * HOUR, async () => {
    const out: Record<string, string> = {};
    for (const s of (await csJson('/stores')) ?? []) out[String(s.storeID)] = String(s.storeName);
    return out;
  });

/** Current deals for up to 25 Steam games, USD. Games CheapShark doesn't track come back with nulls. */
export async function prices(db: Db, appids: number[]): Promise<PriceInfo[]> {
  const ids = [...new Set(appids)].slice(0, 25);
  // Steam appid -> CheapShark gameID (rarely changes)
  const csIds = await mapLimit(ids, 4, (appid) =>
    cached(db, `cs:id:${appid}`, 7 * 24 * HOUR, async () => {
      const list = (await csJson(`/games?steamAppID=${appid}`)) as any[];
      const hit = (list ?? []).find((g) => String(g.steamAppID) === String(appid));
      return { id: hit ? String(hit.gameID) : null, title: hit ? String(hit.external ?? '') : '' };
    }).catch(() => ({ id: null, title: '' })),
  );
  const stores = await storeNames(db).catch(() => ({} as Record<string, string>));

  return mapLimit(ids, 4, async (appid) => {
    const ref = csIds[ids.indexOf(appid)];
    const empty: PriceInfo = { appid, title: ref.title, best: null, steam: null, lowestEver: null };
    if (!ref.id) return empty;
    try {
      const g = await cached(db, `cs:game:${ref.id}`, HOUR, () => csJson(`/games?id=${ref.id}`));
      const deals = ((g?.deals ?? []) as any[]).map((d) => ({
        storeID: String(d.storeID),
        dealID: String(d.dealID),
        price: Number(d.price),
        retail: Number(d.retailPrice),
        savings: Math.round(Number(d.savings)),
      }));
      const best = deals.sort((a, b) => a.price - b.price)[0];
      const steam = deals.find((d) => d.storeID === STEAM_STORE_ID);
      return {
        appid,
        title: String(g?.info?.title ?? ref.title),
        best: best
          ? {
              store: stores[best.storeID] ?? `Store ${best.storeID}`,
              price: best.price,
              retail: best.retail,
              savings: best.savings,
              url: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(best.dealID)}`,
            }
          : null,
        steam: steam ? { price: steam.price, retail: steam.retail, savings: steam.savings } : null,
        lowestEver: g?.cheapestPriceEver ? { price: Number(g.cheapestPriceEver.price), date: Number(g.cheapestPriceEver.date) } : null,
      };
    } catch {
      return empty;
    }
  });
}
