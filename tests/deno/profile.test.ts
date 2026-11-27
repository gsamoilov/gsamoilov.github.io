// Run: deno test tests/deno/ — profile stats, friends and prices against canned Steam / CheapShark responses
import { assertEquals } from 'jsr:@std/assert@1';
import { friendsNow, mapLimit, prices, profileStats } from '../../supabase/functions/steam/profile.ts';

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
let calls: string[] = [];
function stubFetch(routes: [RegExp, number, unknown][]) {
  calls = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const r = routes.find(([re]) => re.test(url));
    if (!r) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(r[2]), { status: r[1] });
  }) as typeof fetch;
}

Deno.test('mapLimit keeps order and limits concurrency', async () => {
  let live = 0, peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 5));
    live--;
    return n * 2;
  });
  assertEquals(out, [2, 4, 6, 8, 10, 12, 14]);
  assertEquals(peak <= 3, true);
});

const schema = (ids: string[]) => ({ game: { availableGameStats: { achievements: ids.map((id) => ({ name: id, displayName: id.toUpperCase(), hidden: 0, icon: `${id}.jpg` })) } } });

Deno.test('profileStats: totals, average completion, perfect games, rarest first', async () => {
  stubFetch([
    [/GetOwnedGames/, 200, { response: { game_count: 3, games: [
      { appid: 10, name: 'Ten', playtime_forever: 600, has_community_visible_stats: true },
      { appid: 20, name: 'Twenty', playtime_forever: 60, has_community_visible_stats: true },
      { appid: 30, name: 'Never played', playtime_forever: 0, has_community_visible_stats: true },
    ] } }],
    [/GetSchemaForGame.*appid=10/, 200, schema(['a', 'b', 'c', 'd'])],
    [/GetSchemaForGame.*appid=20/, 200, schema(['x', 'y'])],
    [/GetGlobalAchievementPercentages.*gameid=10/, 200, { achievementpercentages: { achievements: [{ name: 'a', percent: 50 }, { name: 'b', percent: 1.5 }] } }],
    [/GetGlobalAchievementPercentages.*gameid=20/, 200, { achievementpercentages: { achievements: [{ name: 'x', percent: 0.4 }, { name: 'y', percent: 30 }] } }],
    [/GetPlayerAchievements.*appid=10/, 200, { playerstats: { success: true, achievements: [{ apiname: 'a', achieved: 1, unlocktime: 1 }, { apiname: 'b', achieved: 1, unlocktime: 2 }] } }],
    [/GetPlayerAchievements.*appid=20/, 200, { playerstats: { success: true, achievements: [{ apiname: 'x', achieved: 1, unlocktime: 3 }, { apiname: 'y', achieved: 1, unlocktime: 4 }] } }],
  ]);
  const s = await profileStats(fakeDb(), '76561197960287930');
  if (s.state !== 'ok') throw new Error('expected ok');
  assertEquals([s.totalMinutes, s.gamesOwned, s.gamesPlayed, s.sampledGames], [660, 3, 2, 2]);
  assertEquals([s.avgCompletion, s.achievementsEarned, s.perfectGames], [75, 4, 1]); // (50% + 100%) / 2
  assertEquals(s.rarest.map((r) => [r.game, r.name, r.percent]), [['Twenty', 'X', 0.4], ['Ten', 'B', 1.5], ['Twenty', 'Y', 30], ['Ten', 'A', 50]]);
  assertEquals(s.topGames[0], { appid: 10, name: 'Ten', minutes: 600 });
});

Deno.test('profileStats: private game details', async () => {
  stubFetch([[/GetOwnedGames/, 200, { response: {} }]]);
  assertEquals(await profileStats(fakeDb(), '76561197960287930'), { state: 'private' });
});

Deno.test('friendsNow: private friend list', async () => {
  stubFetch([[/GetFriendList/, 401, {}]]);
  assertEquals(await friendsNow(fakeDb(), '76561197960287930'), { state: 'private' });
});

Deno.test('friendsNow: in-game friends, filtered by game, private ones counted', async () => {
  stubFetch([
    [/GetFriendList/, 200, { friendslist: { friends: [{ steamid: '1' }, { steamid: '2' }, { steamid: '3' }, { steamid: '4' }] } }],
    [/GetPlayerSummaries/, 200, { response: { players: [
      { steamid: '1', personaname: 'Ann', avatarfull: 'a', profileurl: 'u1', communityvisibilitystate: 3, personastate: 1, gameid: '105600', gameextrainfo: 'Terraria' },
      { steamid: '2', personaname: 'Bob', avatarfull: 'b', profileurl: 'u2', communityvisibilitystate: 3, personastate: 1, gameid: '570', gameextrainfo: 'Dota 2' },
      { steamid: '3', personaname: 'Cat', avatarfull: 'c', profileurl: 'u3', communityvisibilitystate: 3, personastate: 0 },
      { steamid: '4', personaname: 'Dan', avatarfull: 'd', profileurl: 'u4', communityvisibilitystate: 1 },
    ] } }],
  ]);
  const db = fakeDb();
  const all = await friendsNow(db, '76561197960287930');
  if (all.state !== 'ok') throw new Error('expected ok');
  assertEquals([all.total, all.privateCount, all.online, all.inGame.map((f) => f.name)], [4, 1, 2, ['Bob', 'Ann']]);
  const terraria = await friendsNow(db, '76561197960287930', 105600);
  assertEquals(terraria.state === 'ok' && terraria.inGame.map((f) => f.name), ['Ann']);
});

Deno.test('prices: best deal, Steam price, lowest ever; untracked games come back empty', async () => {
  stubFetch([
    [/cheapshark.*\/stores/, 200, [{ storeID: '1', storeName: 'Steam' }, { storeID: '7', storeName: 'GOG' }]],
    [/cheapshark.*steamAppID=413150/, 200, [{ gameID: '123', steamAppID: '413150', external: 'Stardew Valley' }]],
    [/cheapshark.*steamAppID=999/, 200, []],
    [/cheapshark.*games\?id=123/, 200, {
      info: { title: 'Stardew Valley' },
      cheapestPriceEver: { price: '8.99', date: 1700000000 },
      deals: [
        { storeID: '1', dealID: 'S', price: '14.99', retailPrice: '14.99', savings: '0.000' },
        { storeID: '7', dealID: 'G/1', price: '11.24', retailPrice: '14.99', savings: '25.016' },
      ],
    }],
  ]);
  const [sv, none] = await prices(fakeDb(), [413150, 999]);
  assertEquals(sv.best, { store: 'GOG', price: 11.24, retail: 14.99, savings: 25, url: 'https://www.cheapshark.com/redirect?dealID=G%2F1' });
  assertEquals(sv.steam, { price: 14.99, retail: 14.99, savings: 0 });
  assertEquals(sv.lowestEver, { price: 8.99, date: 1700000000 });
  assertEquals([none.appid, none.best, none.lowestEver], [999, null, null]);
});
