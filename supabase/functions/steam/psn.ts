/**
 * PlayStation via the unofficial psn-api (MIT). The site reads PSN with ONE token (Supabase secret PSN_NPSSO,
 * from a dedicated PlayStation account). Users link their own PSN name; what we can read depends on
 * their PlayStation privacy settings (Trophies / Games visible to "Anyone").
 */
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  exchangeRefreshTokenForAuthTokens,
  getProfileFromUserName,
  getTitleTrophies,
  getUserPlayedGames,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
} from 'npm:psn-api@2.18.1';
import type { adminClient } from '../_shared/clients.ts';
import { cached } from '../_shared/steamApi.ts';
import { normName } from '../_shared/names.ts';
export { normName };
import { HOUR, HttpError, MIN } from './logic.ts';

type Db = ReturnType<typeof adminClient>;

// ---------------------------------------------------------------- auth (one site-wide token)

interface PsnAuthState {
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
}
const AUTH_KEY = 'psn:auth';

async function saveAuth(db: Db, t: { accessToken: string; expiresIn: number; refreshToken: string; refreshTokenExpiresIn: number }) {
  const now = Date.now();
  const state: PsnAuthState = {
    accessToken: t.accessToken,
    accessExpiresAt: now + t.expiresIn * 1000,
    refreshToken: t.refreshToken,
    refreshExpiresAt: now + t.refreshTokenExpiresIn * 1000,
  };
  await db.from('steam_cache').upsert({ key: AUTH_KEY, payload: state, fetched_at: new Date().toISOString(), expires_at: new Date(state.refreshExpiresAt).toISOString() });
  return state;
}

export async function psnAuth(db: Db): Promise<PsnAuthState> {
  const { data } = await db.from('steam_cache').select('payload').eq('key', AUTH_KEY).maybeSingle();
  const s = data?.payload as PsnAuthState | undefined;
  const now = Date.now();
  if (s && s.accessExpiresAt - now > 60_000) return s;
  if (s && s.refreshExpiresAt - now > 60_000) {
    try {
      return await saveAuth(db, await exchangeRefreshTokenForAuthTokens(s.refreshToken));
    } catch {
      /* fall back to the NPSSO token */
    }
  }
  const npsso = Deno.env.get('PSN_NPSSO');
  if (!npsso) throw new HttpError(503, 'PlayStation isn’t set up on this site yet.');
  try {
    const code = await exchangeNpssoForAccessCode(npsso);
    return await saveAuth(db, await exchangeAccessCodeForAuthTokens(code));
  } catch {
    throw new HttpError(503, 'The site’s PlayStation connection has expired. The site owner needs to renew it.');
  }
}

const authz = async (db: Db) => ({ accessToken: (await psnAuth(db)).accessToken });

/** For the daily job: days until the PSN connection needs a new NPSSO (null = not set up / broken). */
export async function psnDaysLeft(db: Db): Promise<number | null> {
  try {
    const s = await psnAuth(db);
    return Math.floor((s.refreshExpiresAt - Date.now()) / 86400e3);
  } catch {
    return null;
  }
}

const privacyError = (e: unknown) => /privacy|not permitted|forbidden|2240526|access (control|denied)/i.test(String((e as Error)?.message ?? e));
/** Some psn-api calls return `{ error }` instead of throwing. */
const unwrap = (r: any) => {
  if (r?.error) throw new HttpError(privacyError(r.error.message) ? 403 : 502, privacyError(r.error.message) ? 'PlayStation privacy settings hide these trophies.' : 'PlayStation didn’t answer. Try again later.');
  return r;
};

// ---------------------------------------------------------------- linking

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'SAMO-' + [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/** Step 1: look up the PSN name and hand out a code to put in "About me". */
export async function psnLinkStart(db: Db, userId: string, onlineId: string) {
  const name = onlineId.trim();
  if (!/^[A-Za-z0-9_-]{3,16}$/.test(name)) throw new HttpError(400, 'That doesn’t look like a PSN Online ID.');
  let profile: any;
  try {
    profile = (await getProfileFromUserName(await authz(db), name)).profile;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(404, `Couldn’t find a PlayStation account called “${name}”.`);
  }
  const code = makeLinkCode();
  const avatar = String(profile.avatarUrls?.at(-1)?.avatarUrl ?? profile.avatarUrls?.[0]?.avatarUrl ?? '');
  await db.from('link_challenges').upsert({
    user_id: userId, platform: 'psn', account_id: String(profile.accountId), handle: String(profile.onlineId), avatar_url: avatar, code, created_at: new Date().toISOString(),
  });
  return { code, handle: String(profile.onlineId), avatar };
}

/** Step 2: the code must now be in their About me. Then the account is linked (and moved off any other user). */
export async function psnLinkVerify(db: Db, userId: string) {
  const { data: ch } = await db.from('link_challenges').select('*').eq('user_id', userId).eq('platform', 'psn').maybeSingle();
  if (!ch || Date.now() - new Date(ch.created_at).getTime() > 30 * MIN * 1000) {
    throw new HttpError(400, 'That code expired. Start again to get a new one.');
  }
  let aboutMe = '';
  try {
    aboutMe = String((await getProfileFromUserName(await authz(db), ch.handle)).profile.aboutMe ?? '');
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, 'PlayStation didn’t answer. Try again in a moment.');
  }
  if (!aboutMe.toUpperCase().includes(ch.code)) {
    throw new HttpError(400, `Didn’t find ${ch.code} in the About me of ${ch.handle} yet. It can take a minute to update after you save it.`);
  }
  await db.from('linked_accounts').delete().eq('platform', 'psn').eq('account_id', ch.account_id); // proven owner wins
  const { error } = await db.from('linked_accounts').upsert({
    user_id: userId, platform: 'psn', account_id: ch.account_id, handle: ch.handle, avatar_url: ch.avatar_url, linked_at: new Date().toISOString(),
  });
  if (error) throw new HttpError(500, 'Couldn’t save the link.');
  await db.from('link_challenges').delete().eq('user_id', userId).eq('platform', 'psn');
  return { linked: true, handle: ch.handle };
}

export async function linkedAccount(db: Db, userId: string, platform: 'psn' | 'xbox') {
  const { data } = await db.from('linked_accounts').select('account_id, handle').eq('user_id', userId).eq('platform', platform).maybeSingle();
  return data as { account_id: string; handle: string } | null;
}

// ---------------------------------------------------------------- library

/** "PT228H56M33S" -> minutes */
export function isoDurationMinutes(d: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(d ?? '');
  if (!m) return 0;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Math.floor(Number(m[4] ?? 0) / 60);
}

export interface ConsoleGame {
  name: string;
  image: string;
  platform: string; // PS4 / PS5 / PS3 / Vita / Xbox …
  minutes: number | null; // null = console doesn't report hours for this one
  lastPlayed: string | null;
  trophies: { earned: number; total: number; progress: number } | null;
  /** id needed to load the trophy list */
  trophyRef: { id: string; service: string } | null;
}

export type ConsoleLibrary =
  | { state: 'unlinked' }
  | { state: 'private'; handle: string }
  | { state: 'ok'; handle: string; totalMinutes: number; games: ConsoleGame[] };

const sumCounts = (c: any) => Number(c?.bronze ?? 0) + Number(c?.silver ?? 0) + Number(c?.gold ?? 0) + Number(c?.platinum ?? 0);

export async function psnLibrary(db: Db, userId: string): Promise<ConsoleLibrary> {
  const link = await linkedAccount(db, userId, 'psn');
  if (!link) return { state: 'unlinked' };
  return cached(db, `psnlib:${link.account_id}`, HOUR, async () => {
    const a = await authz(db);
    let played: any[] = [];
    let titles: any[] = [];
    let blocked = 0;
    try {
      played = (await getUserPlayedGames(a, link.account_id, { limit: 200, categories: 'ps4_game,ps5_native_game' } as any)).titles ?? [];
    } catch (e) {
      if (privacyError(e)) blocked++;
      else throw e;
    }
    try {
      const r: any = await getUserTitles(a, link.account_id, { limit: 800 });
      if (r?.error) throw new Error(String(r.error.message ?? r.error.code)); // this call returns errors instead of throwing
      titles = r.trophyTitles ?? [];
    } catch (e) {
      if (privacyError(e)) blocked++;
      else throw e;
    }
    if (blocked === 2) return { state: 'private', handle: link.handle } as ConsoleLibrary;

    const byName = new Map<string, ConsoleGame>();
    for (const t of played) {
      const g: ConsoleGame = {
        name: String(t.localizedName || t.name),
        image: String(t.localizedImageUrl || t.imageUrl || ''),
        platform: String(t.category ?? '').startsWith('ps5') ? 'PS5' : 'PS4',
        minutes: isoDurationMinutes(String(t.playDuration ?? '')),
        lastPlayed: t.lastPlayedDateTime ?? null,
        trophies: null,
        trophyRef: null,
      };
      byName.set(normName(g.name), g);
    }
    for (const t of titles) {
      const key = normName(String(t.trophyTitleName));
      const trophies = { earned: sumCounts(t.earnedTrophies), total: sumCounts(t.definedTrophies), progress: Number(t.progress ?? 0) };
      const ref = { id: String(t.npCommunicationId), service: String(t.npServiceName ?? 'trophy2') };
      const existing = byName.get(key);
      if (existing) {
        existing.trophies = trophies;
        existing.trophyRef = ref;
      } else {
        byName.set(key, {
          name: String(t.trophyTitleName),
          image: String(t.trophyTitleIconUrl ?? ''),
          platform: String(t.trophyTitlePlatform ?? '').split(',')[0],
          minutes: null,
          lastPlayed: t.lastUpdatedDateTime ?? null,
          trophies,
          trophyRef: ref,
        });
      }
    }
    const games = [...byName.values()].sort((x, y) => String(y.lastPlayed ?? '').localeCompare(String(x.lastPlayed ?? '')));
    return { state: 'ok', handle: link.handle, totalMinutes: games.reduce((n, g) => n + (g.minutes ?? 0), 0), games } as ConsoleLibrary;
  });
}

export interface ConsoleAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  hidden: boolean;
  achieved: boolean;
  globalPercent?: number;
  kind?: string; // bronze / silver / gold / platinum
}

/** Missed (and earned) trophies for one title. */
export async function psnTrophies(db: Db, userId: string, npCommunicationId: string, service: string): Promise<ConsoleAchievement[]> {
  const link = await linkedAccount(db, userId, 'psn');
  if (!link) throw new HttpError(400, 'Link your PlayStation account first.');
  if (!/^NPWR\d{5}_\d{2}$/.test(npCommunicationId)) throw new HttpError(400, 'bad trophy id');
  const npServiceName = service === 'trophy' ? 'trophy' : 'trophy2';
  const defs = await cached(db, `psntrophydefs:${npCommunicationId}`, 24 * HOUR, async () =>
    unwrap(await getTitleTrophies(await authz(db), npCommunicationId, 'all', { npServiceName } as any)).trophies ?? [],
  );
  const mine = await cached(db, `psntrophies:${link.account_id}:${npCommunicationId}`, 15 * MIN, async () =>
    unwrap(await getUserTrophiesEarnedForTitle(await authz(db), link.account_id, npCommunicationId, 'all', { npServiceName } as any)).trophies ?? [],
  );
  const earned = new Map(mine.map((t: any) => [t.trophyId, t]));
  return defs.map((d: any) => {
    const m: any = earned.get(d.trophyId);
    return {
      id: String(d.trophyId),
      name: String(d.trophyName ?? ''),
      description: String(d.trophyDetail ?? ''),
      icon: String(d.trophyIconUrl ?? ''),
      hidden: !!d.trophyHidden,
      achieved: !!m?.earned,
      globalPercent: m?.trophyEarnedRate !== undefined ? Number(m.trophyEarnedRate) : undefined,
      kind: String(d.trophyType ?? ''),
    };
  });
}
