/**
 * Public config, injected at build time from GitHub repository *variables*
 * (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) or from .env.local for local dev.
 * The URL and anon/publishable key are SAFE in frontend code; Row Level Security protects the data.
 * The Steam Web API key is NEVER here. It lives only in Supabase secrets.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const authEnabled = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
