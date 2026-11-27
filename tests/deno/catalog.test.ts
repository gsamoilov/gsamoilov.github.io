// Run: deno test tests/deno/ — IGDB search and Steam charts against canned responses
import { assertEquals } from 'jsr:@std/assert@1';
import { popular, searchGames, trending, trendingFrom } from '../../supabase/functions/steam/catalog.ts';

Deno.env.set('STEAM_API_KEY', 'TESTKEY');

function fakeDb() {
  const cache = new Map<string, any>();
  const from = (_t: string) => {
    let key = '';
    const q: any = {
      select: () => q,
      eq: (_c: string, v: string) => ((key = v), q),
      maybeSingle: async () => ({ data: cache.get(key) ?? null }),
      delete: () => ({ eq: async (_c: string, v: string) => (cache.delete(v), { error: null }) }),
      upsert: async (row: any) => (cache.set(row.key, row), { error: null }),
    };
    return q;
  };
  return { from, cache } as any;
}
let calls: { url: string; body?: string }[] = [];
function stubFetch(routes: [RegExp, number, unknown][]) {
  calls = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? String(init.body) : undefined });
    const r = routes.find(([re]) => re.test(url));
    if (!r) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(r[2]), { status: r[1] });
  }) as typeof fetch;
}

const CHART = { response: { ranks: [
  { rank: 1, appid: 730, last_week_rank: 1, peak_in_game: 1500000 },
  { rank: 2, appid: 570, last_week_rank: 3, peak_in_game: 700000 },
  { rank: 3, appid: 999, last_week_rank: -1, peak_in_game: 300000 },
  { rank: 4, appid: 105600, last_week_rank: 20, peak_in_game: 90000 },
  { rank: 5, appid: 413150, last_week_rank: 2, peak_in_game: 80000 },
] } };
const NAMES = { response: { store_items: [{ appid: 730, name: 'Counter-Strike 2' }, { appid: 570, name: 'Dota 2' }, { appid: 105600, name: 'Terraria' }, { appid: 413150, name: 'Stardew Valley' }] } };

Deno.test('popular: chart order with names; missing names filled from appdetails', async () => {
  stubFetch([
    [/GetMostPlayedGames/, 200, CHART],
    [/IStoreBrowseService\/GetItems/, 200, NAMES],
    [/appdetails\?appids=999/, 200, { 999: { success: true, data: { name: 'Brand New Game' } } }],
  ]);
  const p = await popular(fakeDb());
  assertEquals(p.map((e) => [e.rank, e.name, e.change]), [[1, 'Counter-Strike 2', 0], [2, 'Dota 2', 1], [3, 'Brand New Game', null], [4, 'Terraria', 16], [5, 'Stardew Valley', -3]]);
});

Deno.test('trending: climbers and new entries only, biggest movers first', async () => {
  stubFetch([[/GetMostPlayedGames/, 200, CHART], [/IStoreBrowseService\/GetItems/, 200, NAMES], [/appdetails/, 200, {}]]);
  const t = await trending(fakeDb());
  // new entry at rank 3 scores 98, Terraria climbed 16, Dota climbed 1; CS2 (no change) and Stardew (fell) excluded
  assertEquals(t.map((e) => e.appid), [999, 105600, 570]);
});

Deno.test('trendingFrom ties broken by rank', () => {
  const e = (rank: number, change: number | null) => ({ rank, appid: rank, name: '', peak: 0, lastWeekRank: null, change });
  assertEquals(trendingFrom([e(10, 5), e(4, 5), e(50, -2)]).map((x) => x.rank), [4, 10]);
});

Deno.test('search: IGDB results with Steam appid when the game is on Steam', async () => {
  Deno.env.set('IGDB_CLIENT_ID', 'cid');
  Deno.env.set('IGDB_CLIENT_SECRET', 'secret');
  stubFetch([
    [/id\.twitch\.tv\/oauth2\/token/, 200, { access_token: 'tok', expires_in: 5000000 }],
    [/api\.igdb\.com\/v4\/games/, 200, [
      { id: 1, name: 'Bloodborne', first_release_date: 1427155200, cover: { image_id: 'abc' }, platforms: [{ abbreviation: 'PS4' }] },
      { id: 2, name: 'Hollow Knight', first_release_date: 1488499200, cover: { image_id: 'hk' }, platforms: [{ abbreviation: 'PC' }, { abbreviation: 'Switch' }],
        external_games: [{ uid: '367520', external_game_source: 1 }, { uid: 'xyz', external_game_source: 5 }] },
    ]],
  ]);
  const db = fakeDb();
  const r = await searchGames(db, 'souls "quote');
  assertEquals(r.map((x) => [x.igdbId, x.appid, x.name, x.year, x.platforms]), [[1, null, 'Bloodborne', 2015, ['PS4']], [2, 367520, 'Hollow Knight', 2017, ['PC', 'Switch']]]);
  assertEquals(r[0].cover, 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg');
  const igdbCall = calls.find((c) => c.url.includes('api.igdb.com'))!;
  assertEquals(igdbCall.body?.startsWith('search "souls  quote";'), true); // quotes can't break out of the query
  // second search reuses the cached Twitch token
  await searchGames(db, 'another');
  assertEquals(calls.filter((c) => c.url.includes('twitch')).length, 1);
  Deno.env.delete('IGDB_CLIENT_ID');
  Deno.env.delete('IGDB_CLIENT_SECRET');
});

Deno.test('search: falls back to Steam store search without IGDB keys', async () => {
  stubFetch([[/storesearch/, 200, { items: [{ id: 413150, name: 'Stardew Valley', type: 'app' }] }]]);
  const r = await searchGames(fakeDb(), 'stardew');
  assertEquals(r, [{ igdbId: null, appid: 413150, name: 'Stardew Valley', cover: '', year: null, platforms: ['PC'] }]);
});
