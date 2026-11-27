// Run: deno test tests/deno/ — PlayStation (psn-api) and Xbox (OpenXBL) logic against canned responses
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { isoDurationMinutes, normName, psnLibrary, psnLinkStart, psnLinkVerify } from '../../supabase/functions/steam/psn.ts';
import { xboxLibrary, xboxLinkStart, xboxLinkVerify, XBL_HOURLY_BUDGET } from '../../supabase/functions/steam/xbox.ts';
import { HttpError } from '../../supabase/functions/steam/logic.ts';

const UID = 'user-1';

/** In-memory tables: steam_cache, linked_accounts, link_challenges. */
function fakeDb() {
  const tables: Record<string, any[]> = { steam_cache: [], linked_accounts: [], link_challenges: [] };
  const pk: Record<string, string[]> = { steam_cache: ['key'], linked_accounts: ['user_id', 'platform'], link_challenges: ['user_id', 'platform'] };
  const from = (t: string) => {
    const filters: [string, unknown][] = [];
    const match = (r: any) => filters.every(([c, v]) => r[c] === v);
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push([c, v]), q),
      maybeSingle: async () => ({ data: tables[t].find(match) ?? null }),
      delete: () => {
        const d: any = { eq: (c: string, v: unknown) => (filters.push([c, v]), d), then: (res: any) => { tables[t] = tables[t].filter((r) => !match(r)); res({ error: null }); } };
        return d;
      },
      upsert: async (row: any) => {
        const same = (r: any) => pk[t].every((k) => r[k] === row[k]);
        tables[t] = [...tables[t].filter((r) => !same(r)), row];
        return { error: null };
      },
    };
    return q;
  };
  return { from, tables } as any;
}
let calls: string[] = [];
function stubFetch(routes: [RegExp, number, unknown][]) {
  calls = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    const r = routes.find(([re]) => re.test(url));
    if (!r) return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 });
    return new Response(JSON.stringify(r[2]), { status: r[1], headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}
const seedPsnAuth = (db: any) =>
  db.tables.steam_cache.push({ key: 'psn:auth', payload: { accessToken: 'AT', accessExpiresAt: Date.now() + 3600e3, refreshToken: 'RT', refreshExpiresAt: Date.now() + 50 * 86400e3 }, expires_at: new Date(Date.now() + 50 * 86400e3).toISOString() });

Deno.test('isoDurationMinutes', () => {
  assertEquals(isoDurationMinutes('PT228H56M33S'), 228 * 60 + 56);
  assertEquals(isoDurationMinutes('PT45M'), 45);
  assertEquals(isoDurationMinutes('P1DT2H'), 1560);
  assertEquals(isoDurationMinutes('garbage'), 0);
});

Deno.test('normName matches PSN titles to store names', () => {
  assertEquals(normName('Marvel’s Spider-Man 2 PS5'), normName("Marvel's Spider-Man 2"));
  assertEquals(normName('ELDEN RING™'), normName('Elden Ring'));
});

Deno.test('PSN link: code must appear in About me', async () => {
  const db = fakeDb();
  seedPsnAuth(db);
  let aboutMe = 'hello';
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (/profile2/.test(url)) return new Response(JSON.stringify({ profile: { onlineId: 'GregPS', accountId: '9001', avatarUrls: [{ avatarUrl: 'a.png' }], aboutMe } }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const start = await psnLinkStart(db, UID, 'GregPS');
  assertEquals(/^SAMO-[A-Z2-9]{6}$/.test(start.code), true);
  await assertRejects(() => psnLinkVerify(db, UID), HttpError, 'Didn’t find');
  aboutMe = `gamer ${start.code.toLowerCase()} :)`;
  assertEquals(await psnLinkVerify(db, UID), { linked: true, handle: 'GregPS' });
  assertEquals(db.tables.linked_accounts[0], { ...db.tables.linked_accounts[0], user_id: UID, platform: 'psn', account_id: '9001', handle: 'GregPS' });
  assertEquals(db.tables.link_challenges.length, 0);
});

Deno.test('PSN link: rejects silly names before calling Sony', async () => {
  await assertRejects(() => psnLinkStart(fakeDb(), UID, 'no spaces allowed!'), HttpError, 'PSN Online ID');
});

Deno.test('PSN library: hours from played games, trophies merged by name, trophy-only titles kept', async () => {
  const db = fakeDb();
  seedPsnAuth(db);
  db.tables.linked_accounts.push({ user_id: UID, platform: 'psn', account_id: '9001', handle: 'GregPS' });
  stubFetch([
    [/gamelist\/v2\/users\/9001\/titles/, 200, { titles: [
      { titleId: 'PPSA1', name: 'ELDEN RING', localizedName: 'ELDEN RING', imageUrl: 'er.png', category: 'ps5_native_game', playDuration: 'PT120H30M', lastPlayedDateTime: '2026-11-20T10:00:00Z' },
      { titleId: 'CUSA2', name: 'Bloodborne', localizedName: 'Bloodborne', imageUrl: 'bb.png', category: 'ps4_game', playDuration: 'PT55H', lastPlayedDateTime: '2026-10-01T10:00:00Z' },
    ] }],
    [/trophy\/v1\/users\/9001\/trophyTitles/, 200, { trophyTitles: [
      { npCommunicationId: 'NPWR22810_00', npServiceName: 'trophy2', trophyTitleName: 'ELDEN RING', trophyTitlePlatform: 'PS5', progress: 64, definedTrophies: { bronze: 30, silver: 8, gold: 3, platinum: 1 }, earnedTrophies: { bronze: 20, silver: 5, gold: 1, platinum: 0 }, lastUpdatedDateTime: '2026-11-20T10:00:00Z' },
      { npCommunicationId: 'NPWR00001_00', npServiceName: 'trophy', trophyTitleName: 'Demon’s Souls (PS3)', trophyTitlePlatform: 'PS3', progress: 10, definedTrophies: { bronze: 10 }, earnedTrophies: { bronze: 1 }, lastUpdatedDateTime: '2012-01-01T00:00:00Z' },
    ] }],
  ]);
  const lib = await psnLibrary(db, UID);
  if (lib.state !== 'ok') throw new Error('expected ok');
  assertEquals(lib.totalMinutes, 120 * 60 + 30 + 55 * 60);
  assertEquals(lib.games.map((g) => [g.name, g.platform, g.minutes, g.trophies?.earned, g.trophies?.total]), [
    ['ELDEN RING', 'PS5', 7230, 26, 42],
    ['Bloodborne', 'PS4', 3300, undefined, undefined],
    ['Demon’s Souls (PS3)', 'PS3', null, 1, 10],
  ]);
});

Deno.test('PSN library: unlinked and fully private', async () => {
  assertEquals(await psnLibrary(fakeDb(), UID), { state: 'unlinked' });
  const db = fakeDb();
  seedPsnAuth(db);
  db.tables.linked_accounts.push({ user_id: UID, platform: 'psn', account_id: '9001', handle: 'GregPS' });
  stubFetch([[/m\.np\.playstation\.com/, 403, { error: { message: 'Not permitted by access control' } }]]);
  assertEquals(await psnLibrary(db, UID), { state: 'private', handle: 'GregPS' });
});

Deno.test('Xbox link + library via OpenXBL, with the API key header', async () => {
  Deno.env.set('OPENXBL_API_KEY', 'xbl-key');
  const db = fakeDb();
  let bio = '';
  const seen: Headers[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push(new Headers(init?.headers));
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.endsWith('/search/Greg%20X')) return ok({ people: [{ xuid: '2533', gamertag: 'Greg X', displayPicRaw: 'x.png' }] });
    if (url.endsWith('/account/2533')) return ok({ profileUsers: [{ id: '2533', settings: [{ id: 'Gamertag', value: 'Greg X' }, { id: 'Bio', value: bio }] }] });
    if (url.endsWith('/achievements/player/2533')) return ok({ titles: [{ titleId: '1234', name: 'Halo Infinite', displayImage: 'h.png', devices: ['XboxSeries', 'PC'], achievement: { currentAchievements: 30, totalAchievements: 119, progressPercentage: 25 }, titleHistory: { lastTimePlayed: '2026-11-25T00:00:00Z' } }] });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const s = await xboxLinkStart(db, UID, 'Greg X');
  await assertRejects(() => xboxLinkVerify(db, UID), HttpError, 'Didn’t find');
  bio = `hi ${s.code}`;
  assertEquals((await xboxLinkVerify(db, UID)).handle, 'Greg X');
  const lib = await xboxLibrary(db, UID);
  if (lib.state !== 'ok') throw new Error('expected ok');
  assertEquals(lib.games.map((g) => [g.name, g.platform, g.minutes, g.trophies?.earned, g.trophies?.total]), [['Halo Infinite', 'Xbox Series', null, 30, 119]]);
  assertEquals(seen.every((h) => h.get('X-Authorization') === 'xbl-key'), true);
  Deno.env.delete('OPENXBL_API_KEY');
});

Deno.test('Xbox: hourly budget stops calls before OpenXBL’s limit', async () => {
  Deno.env.set('OPENXBL_API_KEY', 'xbl-key');
  const db = fakeDb();
  const hour = new Date().toISOString().slice(0, 13);
  db.tables.steam_cache.push({ key: `xbl:count:${hour}`, payload: { n: XBL_HOURLY_BUDGET } });
  stubFetch([[/xbl\.io/, 200, { people: [] }]]);
  await assertRejects(() => xboxLinkStart(db, UID, 'Anyone'), HttpError, 'busy');
  assertEquals(calls.length, 0);
  Deno.env.delete('OPENXBL_API_KEY');
});
