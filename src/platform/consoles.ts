/** PlayStation / Xbox: linked accounts, libraries and trophies (all through the `steam` Edge Function). */
import { useEffect, useState } from 'preact/hooks';
import { callSteam } from './steamClient';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { normName } from '../../supabase/functions/_shared/names';

export type ConsolePlatform = 'psn' | 'xbox';
export const PLATFORM_LABEL: Record<ConsolePlatform, string> = { psn: 'PlayStation', xbox: 'Xbox' };

export interface ConsoleGame {
  name: string;
  image: string;
  platform: string;
  minutes: number | null;
  lastPlayed: string | null;
  trophies: { earned: number; total: number; progress: number } | null;
  trophyRef: { id: string; service: string } | null;
}
export type ConsoleLibrary =
  | { state: 'unlinked' }
  | { state: 'private'; handle: string }
  | { state: 'ok'; handle: string; totalMinutes: number; games: ConsoleGame[] };
export interface ConsoleAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  hidden: boolean;
  achieved: boolean;
  globalPercent?: number;
  kind?: string;
}
export interface LinkedAccount {
  platform: ConsolePlatform;
  handle: string;
  avatar_url: string;
  linked_at: string;
}

export const linkStart = (platform: ConsolePlatform, handle: string) =>
  callSteam<{ code: string; handle: string; avatar: string }>('link-start', { platform, handle });
export const linkVerify = (platform: ConsolePlatform) => callSteam<{ linked: boolean; handle: string }>('link-verify', { platform });

const libMemo = new Map<string, Promise<ConsoleLibrary>>();
export function getConsoleLibrary(platform: ConsolePlatform, userId: string, fresh = false): Promise<ConsoleLibrary> {
  const k = `${platform}:${userId}`;
  if (fresh) libMemo.delete(k);
  let p = libMemo.get(k);
  if (!p) {
    p = callSteam<ConsoleLibrary>('console-library', { platform });
    libMemo.set(k, p);
    p.catch(() => libMemo.delete(k));
  }
  return p;
}
export const getConsoleAchievements = (platform: ConsolePlatform, ref: { id: string; service: string }) =>
  callSteam<ConsoleAchievement[]>('console-achievements', { platform, ref: ref.id, service: ref.service });

/** The library entry for a game name, if the user has played it on that console. */
export function findConsoleGame(lib: ConsoleLibrary, gameName: string): ConsoleGame | null {
  if (lib.state !== 'ok') return null;
  const want = normName(gameName);
  if (!want) return null;
  return lib.games.find((g) => normName(g.name) === want) ?? null;
}

// ---- linked accounts (RLS: read / unlink own) ----
type State = { status: 'idle' | 'loading' | 'ok'; accounts: LinkedAccount[]; userId: string | null };
let state: State = { status: 'idle', accounts: [], userId: null };
const listeners = new Set<(s: State) => void>();
const emit = (s: Partial<State>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l(state));
};
export async function reloadLinked(userId: string) {
  if (!supabase) return;
  emit({ status: 'loading', userId });
  const { data } = await supabase.from('linked_accounts').select('platform, handle, avatar_url, linked_at');
  if (state.userId === userId) emit({ status: 'ok', accounts: (data ?? []) as LinkedAccount[] });
}
export async function unlink(userId: string, platform: ConsolePlatform) {
  if (!supabase) return;
  await supabase.from('linked_accounts').delete().eq('platform', platform);
  libMemo.delete(`${platform}:${userId}`);
  await reloadLinked(userId);
}
export function useLinked() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [s, set] = useState(state);
  useEffect(() => {
    listeners.add(set);
    return () => void listeners.delete(set);
  }, []);
  useEffect(() => {
    if (!userId) emit({ status: 'idle', accounts: [], userId: null });
    else if (state.userId !== userId || state.status === 'idle') void reloadLinked(userId);
  }, [userId]);
  return { ...s, get: (p: ConsolePlatform) => s.accounts.find((a) => a.platform === p) ?? null };
}
