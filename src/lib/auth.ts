import { useEffect, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { buildSteamLoginUrl } from '../../supabase/functions/_shared/openid';

export interface Profile {
  id: string;
  steamid: string;
  persona_name: string;
  avatar_url: string;
  profile_url: string;
  public_profile: boolean;
}

export interface AuthState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
}

const RETURN_KEY = 'samoilov:return-to';
export const STEAM_RETURN_PATH = '/auth/steam';

/** Send the browser to Steam. Steam sends it back to /auth/steam with a signed response. */
export function signInWithSteam() {
  sessionStorage.setItem(RETURN_KEY, location.pathname + location.search);
  const origin = location.origin;
  location.assign(buildSteamLoginUrl(origin + STEAM_RETURN_PATH, origin));
}

export function takeReturnPath(): string {
  const p = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  return p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith(STEAM_RETURN_PATH) ? p : '/';
}

/** Send Steam's response to our Edge Function, which verifies it and returns a session. */
// A Steam response can be verified exactly once, so never send the same one twice
// (e.g. if the page re-renders or the effect runs again).
const inflight = new Map<string, Promise<void>>();
export function completeSteamSignIn(query: string): Promise<void> {
  let p = inflight.get(query);
  if (!p) {
    p = doCompleteSteamSignIn(query);
    inflight.set(query, p);
  }
  return p;
}

async function doCompleteSteamSignIn(query: string): Promise<void> {
  if (!supabase) throw new Error('Sign-in is not configured yet.');
  const { data, error } = await supabase.functions.invoke('steam-auth', { body: { query } });
  if (error) {
    let msg = 'Steam sign-in failed.';
    try {
      msg = (await error.context.json()).error ?? msg;
    } catch {
      /* keep generic message */
    }
    throw new Error(msg);
  }
  const { error: setErr } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (setErr) throw setErr;
  invalidateProfile();
}

export async function signOut() {
  await supabase?.auth.signOut();
}

// ---- shared auth state (one subscription for the whole app) ----
let state: AuthState = { ready: !supabase, session: null, profile: null };
const listeners = new Set<(s: AuthState) => void>();
const emit = (next: Partial<AuthState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
};

let profileFor: string | null = null;
async function loadProfile(session: Session | null) {
  if (!session || !supabase) {
    profileFor = null;
    return emit({ ready: true, session: null, profile: null });
  }
  if (profileFor === session.user.id && state.profile) return emit({ ready: true, session });
  profileFor = session.user.id;
  const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  emit({ ready: true, session, profile: (data as Profile) ?? null });
}
function invalidateProfile() {
  profileFor = null;
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    // run outside the auth callback (supabase-js recommends not awaiting inside it)
    setTimeout(() => loadProfile(session), 0);
  });
}

export function useAuth(): AuthState {
  const [s, set] = useState(state);
  useEffect(() => {
    listeners.add(set);
    set(state);
    return () => void listeners.delete(set);
  }, []);
  return s;
}
