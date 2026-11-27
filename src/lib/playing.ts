import { useEffect, useState } from 'preact/hooks';
import { supabase } from './supabase';
import { useAuth } from './auth';

/** Games the user marked as "Playing". One shared list so the toggle, home strip and Playing tab stay in sync. */
export interface PlayingGame {
  platform: 'steam' | 'psn' | 'xbox';
  game_id: string;
  game_name: string;
  added_at: string;
}

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
    .select('platform, game_id, game_name, added_at')
    .order('added_at', { ascending: false });
  if (state.userId !== userId) return; // signed out / switched meanwhile
  emit(error ? { status: 'error' } : { status: 'ok', games: (data ?? []) as PlayingGame[] });
}

export async function setPlaying(userId: string, appid: number, name: string, on: boolean): Promise<boolean> {
  if (!supabase) return false;
  const id = String(appid);
  const before = state.games;
  // optimistic update
  emit({
    games: on
      ? [{ platform: 'steam', game_id: id, game_name: name, added_at: new Date().toISOString() }, ...before.filter((g) => g.game_id !== id)]
      : before.filter((g) => g.game_id !== id),
  });
  const { error } = on
    ? await supabase.from('playing').insert({ user_id: userId, platform: 'steam', game_id: id, game_name: name })
    : await supabase.from('playing').delete().eq('platform', 'steam').eq('game_id', id);
  if (error && !(on && error.code === '23505')) {
    emit({ games: before });
    return false;
  }
  return true;
}

/** The signed-in user's Playing list (newest first). Empty when signed out. */
export function usePlaying(): State & { isPlaying: (appid: number) => boolean } {
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
  return { ...s, isPlaying: (appid: number) => s.games.some((g) => g.platform === 'steam' && g.game_id === String(appid)) };
}
