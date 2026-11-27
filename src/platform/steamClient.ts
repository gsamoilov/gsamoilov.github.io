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
  achievementsState: 'ok' | 'private' | 'nostats' | 'unavailable';
  diagnostics?: Record<string, unknown>;
  achievementsTotal: number;
  achievementsEarned: number;
  achievements: MyAchievement[];
}

export interface SearchHit {
  appid: number;
  name: string;
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
