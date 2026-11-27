import { supabase } from '../lib/supabase';

/** Calls the `steam` Edge Function. All Steam traffic goes through it (key + caching live there). */
export async function callSteam<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Backend not configured.');
  const { data, error } = await supabase.functions.invoke('steam', { body: { action, ...args } });
  if (error) {
    let msg = 'Something went wrong talking to Steam.';
    try {
      msg = (await error.context.json()).error ?? msg;
    } catch {
      /* keep generic */
    }
    throw new Error(msg);
  }
  return data as T;
}

export interface SteamGame {
  appid: number;
  name: string;
  type: string;
  shortDescription: string;
  headerImage: string;
  background: string;
  developers: string[];
  releaseDate: string;
  achievementsTotal: number;
  isFree: boolean;
  players: number | null;
}

export interface SteamNewsItem {
  id: string;
  title: string;
  url: string;
  date: number;
  author?: string;
  contents: string;
  feed: string;
  tags: string[];
}

export interface MyAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  hidden: boolean;
  achieved: boolean;
  unlockedAt?: number;
  globalPercent?: number;
}

export interface MyGameStats {
  profileVisible: boolean;
  owned: boolean;
  /** played through Steam Families (not in your own library) */
  familyOrBorrowed: boolean;
  playtimeMinutes: number;
  playtimeKnown: boolean;
  /** owned = your library, recent = Steam's 2-week list, remembered = last number we saved */
  playtimeSource?: 'owned' | 'recent' | 'remembered' | 'none';
  playtimeSeenAt?: string;
  achievementsState: 'ok' | 'private' | 'nostats' | 'unavailable';
  diagnostics?: Record<string, unknown>;
  achievementsTotal: number;
  achievementsEarned: number;
  achievements: MyAchievement[];
}

/** A search result from any platform. `appid` is set when the game is on Steam. */
export interface SearchHit {
  igdbId: number | null;
  appid: number | null;
  name: string;
  cover: string;
  year: number | null;
  platforms: string[];
}
export interface IgdbGame extends SearchHit {
  summary: string;
  genres: string[];
  developers: string[];
  websites: { url: string; type: number | null }[];
}
export interface ChartEntry {
  rank: number;
  appid: number;
  name: string;
  peak: number;
  lastWeekRank: number | null;
  change: number | null;
}

// small in-memory cache so switching tabs/pages doesn't refetch
const memo = new Map<string, Promise<unknown>>();
function once<T>(key: string, f: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = f();
    memo.set(key, p);
    p.catch(() => memo.delete(key));
  }
  return p;
}

export const getGame = (appid: number) => once(`game:${appid}`, () => callSteam<SteamGame>('game', { appid }));
export const getNews = (appid: number) => once(`news:${appid}`, () => callSteam<SteamNewsItem[]>('news', { appid }));
export const getMyStats = (appid: number, userId: string) =>
  once(`me:${userId}:${appid}`, () => callSteam<MyGameStats>('me', { appid }));
export const searchGames = (term: string) => once(`search:${term.toLowerCase()}`, () => callSteam<SearchHit[]>('search', { term }));

export interface RecentGame {
  appid: number;
  name: string;
  minutes: number;
  minutes2Weeks: number;
}
export const getRecent = (userId: string) => once(`recent:${userId}`, () => callSteam<RecentGame[]>('recent'));

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
      avgCompletion: number | null;
      achievementsEarned: number;
      perfectGames: number;
      rarest: RareAchievement[];
      topGames: { appid: number; name: string; minutes: number }[];
    };
export interface FriendInGame {
  steamid: string;
  name: string;
  avatar: string;
  profileUrl: string;
  appid: number;
  game: string;
}
export type FriendsNow = { state: 'private' } | { state: 'ok'; total: number; privateCount: number; online: number; inGame: FriendInGame[] };
export interface PriceInfo {
  appid: number;
  title: string;
  best: { store: string; price: number; retail: number; savings: number; url: string } | null;
  steam: { price: number; retail: number; savings: number } | null;
  lowestEver: { price: number; date: number } | null;
}

export const getProfileStats = (userId: string, refresh = false) => {
  if (refresh) memo.delete(`profile:${userId}`);
  return once(`profile:${userId}`, () => callSteam<ProfileStats>('profile', refresh ? { refresh: true } : {}));
};
export const getFriendsNow = (userId: string, appid?: number) =>
  once(`friends:${userId}:${appid ?? 'all'}`, () => callSteam<FriendsNow>('friends', appid ? { appid } : {}));
export const getPrices = (appids: number[]) =>
  once(`prices:${[...appids].sort().join(',')}`, () => callSteam<PriceInfo[]>('prices', { appids }));

export const getIgdbGame = (id: number) => once(`igdb:${id}`, () => callSteam<IgdbGame>('igdb', { id }));
export const getCharts = (kind: 'popular' | 'trending') => once(`charts:${kind}`, () => callSteam<ChartEntry[]>('charts', { kind }));
/** Where a search hit's page lives: the full Steam page when it's on Steam, else the all-platforms page. */
export const hitHref = (h: { appid: number | null; igdbId: number | null }) => (h.appid ? `/game/${h.appid}` : `/g/${h.igdbId}`);
