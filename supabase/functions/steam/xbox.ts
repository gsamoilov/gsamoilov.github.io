/**
 * Xbox via OpenXBL (https://xbl.io) with the site owner's personal API key (Supabase secret OPENXBL_API_KEY).
 * Users link a gamertag; what we can read depends on their Xbox privacy settings.
 * The free key allows 150 requests/hour, so every call is cached and counted.
 */
import type { adminClient } from '../_shared/clients.ts';
import { cached } from '../_shared/steamApi.ts';
import { HOUR, HttpError, MIN } from './logic.ts';
import { linkedAccount, makeLinkCode, type ConsoleAchievement, type ConsoleGame, type ConsoleLibrary } from './psn.ts';

type Db = ReturnType<typeof adminClient>;
const BASE = 'https://xbl.io/api/v2';
export const XBL_HOURLY_BUDGET = 140; // OpenXBL free tier: 150/hour; keep a margin

async function spendBudget(db: Db) {
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const key = `xbl:count:${hour}`;
  const { data } = await db.from('steam_cache').select('payload').eq('key', key).maybeSingle();
  const used = Number(data?.payload?.n ?? 0);
  if (used >= XBL_HOURLY_BUDGET) throw new HttpError(429, 'Xbox data is busy right now. Showing what we saved last time.');
  await db.from('steam_cache').upsert({ key, payload: { n: used + 1 }, fetched_at: new Date().toISOString(), expires_at: new Date(Date.now() + 2 * 3600e3).toISOString() });
}

async function xbl(db: Db, path: string): Promise<any> {
  const key = Deno.env.get('OPENXBL_API_KEY');
  if (!key) throw new HttpError(503, 'Xbox isn’t set up on this site yet.');
  await spendBudget(db);
  const res = await fetch(`${BASE}${path}`, { headers: { 'X-Authorization': key, Accept: 'application/json', 'Accept-Language': 'en-US' } });
  if (res.status === 429) throw new HttpError(429, 'Xbox data is busy right now. Try again later.');
  if (res.status === 401 || res.status === 403) throw new HttpError(403, 'xbox-forbidden');
  if (!res.ok) throw new Error(`openxbl ${res.status}`);
  return res.json();
}

const setting = (user: any, id: string) => String((user?.settings ?? []).find((s: any) => s.id === id)?.value ?? '');

async function profileByXuid(db: Db, xuid: string) {
  const r = await xbl(db, `/account/${encodeURIComponent(xuid)}`);
  const u = r?.profileUsers?.[0];
  if (!u) throw new HttpError(404, 'Xbox profile not found.');
  return { xuid: String(u.id ?? xuid), gamertag: setting(u, 'Gamertag') || setting(u, 'ModernGamertag'), bio: setting(u, 'Bio'), avatar: setting(u, 'GameDisplayPicRaw') };
}

/** Step 1: find the gamertag and hand out a code to put in the Xbox bio. */
export async function xboxLinkStart(db: Db, userId: string, gamertag: string) {
  const tag = gamertag.trim();
  if (!/^[A-Za-z0-9 #]{1,16}$/.test(tag)) throw new HttpError(400, 'That doesn’t look like a gamertag.');
  const r = await xbl(db, `/search/${encodeURIComponent(tag)}`);
  const people: any[] = r?.people ?? r?.content?.people ?? [];
  const hit = people.find((p) => String(p.gamertag ?? p.modernGamertag ?? '').toLowerCase() === tag.toLowerCase()) ?? people[0];
  if (!hit?.xuid) throw new HttpError(404, `Couldn’t find an Xbox gamertag “${tag}”.`);
  const code = makeLinkCode();
  await db.from('link_challenges').upsert({
    user_id: userId, platform: 'xbox', account_id: String(hit.xuid), handle: String(hit.gamertag ?? tag), avatar_url: String(hit.displayPicRaw ?? ''), code, created_at: new Date().toISOString(),
  });
  return { code, handle: String(hit.gamertag ?? tag), avatar: String(hit.displayPicRaw ?? '') };
}

/** Step 2: the code must be in the Xbox bio. */
export async function xboxLinkVerify(db: Db, userId: string) {
  const { data: ch } = await db.from('link_challenges').select('*').eq('user_id', userId).eq('platform', 'xbox').maybeSingle();
  if (!ch || Date.now() - new Date(ch.created_at).getTime() > 30 * MIN * 1000) throw new HttpError(400, 'That code expired. Start again to get a new one.');
  const p = await profileByXuid(db, ch.account_id);
  if (!p.bio.toUpperCase().includes(ch.code)) {
    throw new HttpError(400, `Didn’t find ${ch.code} in the bio of ${ch.handle} yet. It can take a minute to update after you save it.`);
  }
  await db.from('linked_accounts').delete().eq('platform', 'xbox').eq('account_id', ch.account_id);
  const { error } = await db.from('linked_accounts').upsert({
    user_id: userId, platform: 'xbox', account_id: ch.account_id, handle: p.gamertag || ch.handle, avatar_url: p.avatar || ch.avatar_url, linked_at: new Date().toISOString(),
  });
  if (error) throw new HttpError(500, 'Couldn’t save the link.');
  await db.from('link_challenges').delete().eq('user_id', userId).eq('platform', 'xbox');
  return { linked: true, handle: p.gamertag || ch.handle };
}

const deviceName = (devices: string[] = []) =>
  devices.includes('XboxSeries') ? 'Xbox Series' : devices.includes('XboxOne') ? 'Xbox One' : devices.includes('Xbox360') ? 'Xbox 360' : devices.includes('PC') ? 'PC (Xbox)' : 'Xbox';

/** Achievement progress per game (Xbox doesn't share hours through this API). Cached 2 h to save the budget. */
export async function xboxLibrary(db: Db, userId: string): Promise<ConsoleLibrary> {
  const link = await linkedAccount(db, userId, 'xbox');
  if (!link) return { state: 'unlinked' };
  try {
    return await cached(db, `xboxlib:${link.account_id}`, 2 * HOUR, async () => {
      const r = await xbl(db, `/achievements/player/${encodeURIComponent(link.account_id)}`);
      const titles: any[] = r?.titles ?? [];
      const games: ConsoleGame[] = titles
        .filter((t) => t?.name)
        .map((t) => ({
          name: String(t.name),
          image: String(t.displayImage ?? ''),
          platform: deviceName(t.devices),
          minutes: null,
          lastPlayed: t.titleHistory?.lastTimePlayed ?? null,
          trophies: t.achievement
            ? { earned: Number(t.achievement.currentAchievements ?? 0), total: Number(t.achievement.totalAchievements ?? 0), progress: Number(t.achievement.progressPercentage ?? 0) }
            : null,
          trophyRef: t.titleId ? { id: String(t.titleId), service: 'xbox' } : null,
        }));
      return { state: 'ok', handle: link.handle, totalMinutes: 0, games } as ConsoleLibrary;
    });
  } catch (e) {
    if (e instanceof HttpError && e.message === 'xbox-forbidden') return { state: 'private', handle: link.handle };
    throw e;
  }
}

/** Achievements for one Xbox title. */
export async function xboxAchievements(db: Db, userId: string, titleId: string): Promise<ConsoleAchievement[]> {
  const link = await linkedAccount(db, userId, 'xbox');
  if (!link) throw new HttpError(400, 'Link your Xbox account first.');
  if (!/^\d{1,12}$/.test(titleId)) throw new HttpError(400, 'bad title id');
  return cached(db, `xboxach:${link.account_id}:${titleId}`, HOUR, async () => {
    const r = await xbl(db, `/achievements/player/${encodeURIComponent(link.account_id)}/${titleId}`);
    return ((r?.achievements ?? []) as any[]).map((a) => ({
      id: String(a.id),
      name: String(a.name ?? ''),
      description: String(a.description || a.lockedDescription || ''),
      icon: String(a.mediaAssets?.[0]?.url ?? ''),
      hidden: !!a.isSecret,
      achieved: a.progressState === 'Achieved',
      globalPercent: a.rarity?.currentPercentage !== undefined ? Number(a.rarity.currentPercentage) : undefined,
    }));
  });
}
