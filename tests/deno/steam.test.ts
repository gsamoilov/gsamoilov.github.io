// Run: deno test tests/deno/  (checks the steam Edge Function logic against canned Steam responses)
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { game, HttpError, me, news, wiki } from '../../supabase/functions/steam/logic.ts';

Deno.env.set('STEAM_API_KEY', 'TESTKEY');

/** Minimal stand-in for the Supabase client: an in-memory steam_cache. */
function fakeDb() {
  const cache = new Map<string, any>();
  const from = (_t: string) => {
    let key = '';
    const q: any = {
      select: () => q,
      eq: (_c: string, v: string) => ((key = v), q),
      maybeSingle: async () => ({ data: cache.get(key) ?? null }),
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
    return new Response(typeof r[2] === 'string' ? r[2] : JSON.stringify(r[2]), { status: r[1] });
  }) as typeof fetch;
}

const SCHEMA = {
  game: {
    availableGameStats: {
      achievements: [
        { name: 'ACH_EASY', displayName: 'First Steps', description: 'Start the game', hidden: 0, icon: 'e.jpg' },
        { name: 'ACH_BOSS', displayName: 'Secret Ending', hidden: 1, icon: 'b.jpg' },
        { name: 'ACH_DONE', displayName: 'Done', description: 'Finish', hidden: 0, icon: 'd.jpg' },
      ],
    },
  },
};
const GLOBAL = { achievementpercentages: { achievements: [{ name: 'ACH_EASY', percent: '91.5' }, { name: 'ACH_BOSS', percent: 3.2 }] } };

Deno.test('game: details + player count, then served from cache', async () => {
  stubFetch([
    [/appdetails/, 200, { 570: { success: true, data: { name: 'Dota 2', type: 'game', header_image: 'h.jpg', achievements: { total: 0 } } } }],
    [/GetNumberOfCurrentPlayers/, 200, { response: { player_count: 654321, result: 1 } }],
  ]);
  const db = fakeDb();
  const g = await game(db, 570);
  assertEquals([g.name, g.players], ['Dota 2', 654321]);
  await game(db, 570);
  assertEquals(calls.length, 2, 'second call must come from cache');
});

Deno.test('game: unknown app -> 404', async () => {
  stubFetch([[/appdetails/, 200, { 1: { success: false } }]]);
  await assertRejects(() => game(fakeDb(), 1), HttpError, 'Not a Steam game');
});

Deno.test('news: maps announcements', async () => {
  stubFetch([[/GetNewsForApp/, 200, { appnews: { newsitems: [{ gid: 9, title: 'Patch 1.1', url: 'u', date: 1, contents: '[h1]Hi[/h1]', feedlabel: 'Community Announcements', tags: ['patchnotes'] }] } }]]);
  const n = await news(fakeDb(), 570);
  assertEquals(n[0].title, 'Patch 1.1');
  assertEquals(n[0].tags, ['patchnotes']);
});

Deno.test('me: public profile -> playtime, earned/missed, hidden flag, global %', async () => {
  stubFetch([
    [/GetOwnedGames/, 200, { response: { game_count: 1, games: [{ appid: 10, playtime_forever: 125 }] } }],
    [/GetSchemaForGame/, 200, SCHEMA],
    [/GetGlobalAchievementPercentages/, 200, GLOBAL],
    [/GetPlayerAchievements/, 200, { playerstats: { success: true, achievements: [{ apiname: 'ACH_EASY', achieved: 1, unlocktime: 100 }, { apiname: 'ACH_BOSS', achieved: 0 }, { apiname: 'ACH_DONE', achieved: 0 }] } }],
  ]);
  const r = await me(fakeDb(), '76561197960287930', 10);
  assertEquals([r.profileVisible, r.owned, r.playtimeMinutes], [true, true, 125]);
  assertEquals([r.achievementsEarned, r.achievementsTotal], [1, 3]);
  const boss = r.achievements.find((a) => a.id === 'ACH_BOSS')!;
  assertEquals([boss.hidden, boss.achieved, boss.globalPercent], [true, false, 3.2]);
  assertEquals(r.achievements.find((a) => a.id === 'ACH_EASY')!.globalPercent, 91.5);
  // the key is only ever sent to api.steampowered.com
  for (const c of calls.filter((c) => c.includes('TESTKEY'))) assertEquals(new URL(c).host, 'api.steampowered.com');
});

Deno.test('me: private profile is reported, not thrown', async () => {
  stubFetch([
    [/GetOwnedGames/, 200, { response: {} }],
    [/GetSchemaForGame/, 200, SCHEMA],
    [/GetGlobalAchievementPercentages/, 200, GLOBAL],
    [/GetPlayerAchievements/, 403, { playerstats: { error: 'Profile is not public', success: false } }],
  ]);
  const r = await me(fakeDb(), '76561197960287930', 10);
  assertEquals([r.profileVisible, r.achievementsState, r.achievementsEarned], [false, 'private', 0]);
});

Deno.test('me: game without achievements', async () => {
  stubFetch([
    [/GetOwnedGames/, 200, { response: { game_count: 1, games: [{ appid: 10, playtime_forever: 5 }] } }],
    [/GetSchemaForGame/, 200, { game: {} }],
    [/GetGlobalAchievementPercentages/, 200, {}],
  ]);
  const r = await me(fakeDb(), '76561197960287930', 10);
  assertEquals([r.achievementsState, r.achievementsTotal], ['nostats', 0]);
});

Deno.test('wiki proxy: only allow-listed wiki api.php hosts and read actions', async () => {
  stubFetch([[/terraria\.wiki\.gg\/api\.php/, 200, { parse: { title: 'Zenith' } }]]);
  const r = await wiki(fakeDb(), 'https://terraria.wiki.gg/api.php', { action: 'parse', page: 'Zenith' });
  assertEquals(r.parse.title, 'Zenith');
  assertEquals(new URL(calls[0]).searchParams.get('format'), 'json');
  await assertRejects(() => wiki(fakeDb(), 'https://evil.example/api.php', { action: 'parse' }), HttpError, 'allow-list');
  await assertRejects(() => wiki(fakeDb(), 'https://terraria.wiki.gg/index.php', { action: 'parse' }), HttpError, 'allow-list');
  await assertRejects(() => wiki(fakeDb(), 'https://terraria.wiki.gg/api.php', { action: 'edit' }), HttpError, 'unsupported');
});
