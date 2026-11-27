import { useEffect, useState } from 'preact/hooks';
import { supabase } from './supabase';
import { useAuth } from './auth';

/** Games the user marked as "Playing". One shared list so the toggle, home strip and Playing tab stay in sync. */
export type GamePlatform = 'steam' | 'psn' | 'xbox' | 'igdb';
export interface PlayingGame {
  platform: GamePlatform;
  game_id: string;
  game_name: string;
  cover_url?: string;
  added_at: string;
}
/** Identifies a game across platforms. Steam games use the appid; others the IGDB id. */
export interface GameKey {
  platform: GamePlatform;
  id: string;
  name: string;
  cover?: string;
}
/** Page for a Playing / watched game. */
export const gameHref = (platform: string, id: string) => (platform === 'steam' ? `/game/${id}` : `/g/${id}`);

type State = { status: 'idle' | 'loading' | 'ok' | 'error'; games: PlayingGame[]; userId: string | null };
let state: State = { status: 'idle', games: [], userId: null };
const listeners = new Set<(s: State) => void>();
const emit = (s: Partial<State>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l(state));
};

async function load(userId: string) {
  if (!supabase) return;
  emit({ status: 'loading', userId });
  const { data, error } = await supabase
    .from('playing')
    .select('platform, game_id, game_name, cover_url, added_at')
    .order('added_at', { ascending: false });
  if (state.userId !== userId) return; // signed out / switched meanwhile
  emit(error ? { status: 'error' } : { status: 'ok', games: (data ?? []) as PlayingGame[] });
}

export async function setPlayingGame(userId: string, g: GameKey, on: boolean): Promise<boolean> {
  if (!supabase) return false;
  const same = (x: PlayingGame) => x.platform === g.platform && x.game_id === g.id;
  const before = state.games;
  // optimistic update
  emit({
    games: on
      ? [{ platform: g.platform, game_id: g.id, game_name: g.name, cover_url: g.cover ?? '', added_at: new Date().toISOString() }, ...before.filter((x) => !same(x))]
      : before.filter((x) => !same(x)),
  });
  const { error } = on
    ? await supabase.from('playing').insert({ user_id: userId, platform: g.platform, game_id: g.id, game_name: g.name, cover_url: g.cover ?? '' })
    : await supabase.from('playing').delete().eq('platform', g.platform).eq('game_id', g.id);
  if (error && !(on && error.code === '23505')) {
    emit({ games: before });
    return false;
  }
  return true;
}

/** Steam shortcut. */
export const setPlaying = (userId: string, appid: number, name: string, on: boolean) =>
  setPlayingGame(userId, { platform: 'steam', id: String(appid), name }, on);

/** The signed-in user's Playing list (newest first). Empty when signed out. */
export function usePlaying(): State & { isPlaying: (appid: number) => boolean; isPlayingGame: (platform: GamePlatform, id: string) => boolean } {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [s, set] = useState(state);
  useEffect(() => {
    listeners.add(set);
    return () => void listeners.delete(set);
  }, []);
  useEffect(() => {
    if (!userId) emit({ status: 'idle', games: [], userId: null });
    else if (state.userId !== userId || state.status === 'idle' || state.status === 'error') void load(userId);
  }, [userId]);
  const isPlayingGame = (platform: GamePlatform, id: string) => s.games.some((g) => g.platform === platform && g.game_id === id);
  return { ...s, isPlaying: (appid: number) => isPlayingGame('steam', String(appid)), isPlayingGame };
}
