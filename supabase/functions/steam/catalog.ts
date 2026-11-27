/**
 * Phase 6: game search for every platform (IGDB) and Steam charts (Popular / Trending).
 * IGDB credentials come from Supabase secrets IGDB_CLIENT_ID / IGDB_CLIENT_SECRET (a Twitch app).
 * Without them, search falls back to Steam's store search.
 */
import type { adminClient } from '../_shared/clients.ts';
import { cached } from '../_shared/steamApi.ts';
import { mapLimit } from './profile.ts';
import { api, getJson, HOUR, search as steamSearch } from './logic.ts';

type Db = ReturnType<typeof adminClient>;
const STEAM_SOURCE = 1; // IGDB external game source id for Steam

// ---------------------------------------------------------------- IGDB

export const igdbConfigured = () => !!(Deno.env.get('IGDB_CLIENT_ID') && Deno.env.get('IGDB_CLIENT_SECRET'));

async function igdbToken(db: Db): Promise<string> {
  const id = Deno.env.get('IGDB_CLIENT_ID')!;
  const secret = Deno.env.get('IGDB_CLIENT_SECRET')!;
  const t = await cached(db, 'igdb:token', 30 * 24 * HOUR, async () => {
    const u = new URL('https://id.twitch.tv/oauth2/token');
    u.searchParams.set('client_id', id);
    u.searchParams.set('client_secret', secret);
    u.searchParams.set('grant_type', 'client_credentials');
    const res = await fetch(u, { method: 'POST' });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.access_token) throw new Error(`twitch token ${res.status}`);
    return { token: String(body.access_token), expiresAt: Date.now() + Number(body.expires_in ?? 0) * 1000 };
  });
  if (t.expiresAt - Date.now() < 24 * 3600e3) {
    // about to expire: drop it and fetch a fresh one
    await db.from('steam_cache').delete().eq('key', 'igdb:token');
    return igdbToken(db);
  }
  return t.token;
}

async function igdb(db: Db, endpoint: string, query: string): Promise<any[]> {
  const token = await igdbToken(db);
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: { 'Client-ID': Deno.env.get('IGDB_CLIENT_ID')!, Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: query,
  });
  if (res.status === 401) await db.from('steam_cache').delete().eq('key', 'igdb:token');
  if (!res.ok) throw new Error(`igdb ${res.status}`);
  return (await res.json()) as any[];
}

export const igdbCover = (imageId?: string, size = 't_cover_big') =>
  imageId ? `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg` : '';

function steamAppidOf(g: any): number | null {
  for (const e of g?.external_games ?? []) {
    const src = typeof e.external_game_source === 'object' ? e.external_game_source?.id : e.external_game_source;
    if ((src ?? e.category) === STEAM_SOURCE && /^\d+$/.test(String(e.uid ?? ''))) return Number(e.uid);
  }
  return null;
}

export interface SearchResult {
  igdbId: number | null;
  appid: number | null; // Steam appid when the game is on Steam
  name: string;
  cover: string;
  year: number | null;
  platforms: string[];
}

const GAME_FIELDS =
  'name,slug,first_release_date,cover.image_id,platforms.abbreviation,platforms.name,' +
  'external_games.uid,external_games.category,external_games.external_game_source,total_rating_count';

function toResult(g: any): SearchResult {
  return {
    igdbId: Number(g.id),
    appid: steamAppidOf(g),
    name: String(g.name ?? ''),
    cover: igdbCover(g.cover?.image_id),
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    platforms: ((g.platforms ?? []) as any[]).map((p) => String(p.abbreviation ?? p.name ?? '')).filter(Boolean),
  };
}

/** Search every platform via IGDB (main games, no editions/ports). Falls back to Steam store search. */
export async function searchGames(db: Db, term: string): Promise<SearchResult[]> {
  const t = term.trim().slice(0, 80);
  if (t.length < 2) return [];
  if (!igdbConfigured()) {
    const hits = await steamSearch(db, t);
    return hits.map((h) => ({ igdbId: null, appid: h.appid, name: h.name, cover: '', year: null, platforms: ['PC'] }));
  }
  return cached(db, `igdbsearch:${t.toLowerCase()}`, 6 * HOUR, async () => {
    const q = t.replace(/["\\]/g, ' ');
    const rows = await igdb(db, 'games', `search "${q}"; fields ${GAME_FIELDS}; where version_parent = null; limit 20;`);
    return rows.map(toResult);
  });
}

export interface IgdbGame extends SearchResult {
  summary: string;
  genres: string[];
  developers: string[];
  websites: { url: string; type: number | null }[];
}

/** One game's details by IGDB id. */
export async function igdbGame(db: Db, id: number): Promise<IgdbGame> {
  if (!igdbConfigured()) throw new Error('Game search is not set up yet (IGDB keys missing).');
  return cached(db, `igdbgame:${id}`, 24 * HOUR, async () => {
    const [g] = await igdb(
      db,
      'games',
      `fields ${GAME_FIELDS},summary,genres.name,involved_companies.developer,involved_companies.company.name,websites.url,websites.type,websites.category; where id = ${id};`,
    );
    if (!g) throw new Error('Game not found.');
    return {
      ...toResult(g),
      summary: String(g.summary ?? ''),
      genres: ((g.genres ?? []) as any[]).map((x) => String(x.name)),
      developers: ((g.involved_companies ?? []) as any[]).filter((c) => c.developer).map((c) => String(c.company?.name ?? '')).filter(Boolean),
      websites: ((g.websites ?? []) as any[]).map((w) => ({ url: String(w.url), type: Number(w.type ?? w.category ?? 0) || null })),
    };
  });
}

// ---------------------------------------------------------------- Steam charts

export interface ChartEntry {
  rank: number;
  appid: number;
  name: string;
  peak: number;
  lastWeekRank: number | null; // null = new on the chart this week
  change: number | null; // positive = climbed
}

async function appNames(db: Db, appids: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  // Store browse API: names for many apps in one call
  for (let i = 0; i < appids.length; i += 50) {
    const chunk = appids.slice(i, i + 50);
    try {
      const input = {
        ids: chunk.map((appid) => ({ appid })),
        context: { language: 'english', country_code: 'US' },
        data_request: { include_basic_info: false },
      };
      const { status, body } = await getJson(api('IStoreBrowseService/GetItems/v1/', { input_json: JSON.stringify(input) }, true));
      if (status === 200) for (const it of body?.response?.store_items ?? []) if (it?.appid && it?.name) out[Number(it.appid)] = String(it.name);
    } catch {
      /* fall through to per-app lookup */
    }
  }
  // anything still missing: cached appdetails (slow path, rarely needed)
  const missing = appids.filter((a) => !out[a]);
  await mapLimit(missing, 4, async (appid) => {
    const d = await cached(db, `appname:${appid}`, 7 * 24 * HOUR, async () => {
      const { body } = await getJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`);
      return { name: String(body?.[appid]?.data?.name ?? '') };
    }).catch(() => ({ name: '' }));
    if (d.name) out[appid] = d.name;
  });
  return out;
}

/** Steam's weekly most-played chart (top 100), with names. Cached 1 h. */
export async function steamChart(db: Db): Promise<ChartEntry[]> {
  return cached(db, 'chart:mostplayed', HOUR, async () => {
    const { status, body } = await getJson(api('ISteamChartsService/GetMostPlayedGames/v1/', {}, true));
    if (status !== 200) throw new Error(`charts ${status}`);
    const ranks = ((body?.response?.ranks ?? []) as any[]).map((r) => {
      const rank = Number(r.rank);
      const lw = Number(r.last_week_rank ?? -1);
      return {
        rank,
        appid: Number(r.appid),
        peak: Number(r.peak_in_game ?? 0),
        lastWeekRank: lw > 0 ? lw : null,
        change: lw > 0 ? lw - rank : null,
      };
    });
    const names = await appNames(db, ranks.map((r) => r.appid));
    return ranks.map((r) => ({ ...r, name: names[r.appid] ?? '' }));
  });
}

/** Popular = the chart as-is (most played this week). */
export async function popular(db: Db): Promise<ChartEntry[]> {
  return (await steamChart(db)).sort((a, b) => a.rank - b.rank);
}

/** Trending = new on the chart, or climbed since last week; biggest movers first. */
export function trendingFrom(chart: ChartEntry[]): ChartEntry[] {
  const score = (e: ChartEntry) => (e.change === null ? 101 - e.rank : e.change);
  return chart.filter((e) => e.change === null || e.change > 0).sort((a, b) => score(b) - score(a) || a.rank - b.rank);
}
export async function trending(db: Db): Promise<ChartEntry[]> {
  return trendingFrom(await steamChart(db));
}
