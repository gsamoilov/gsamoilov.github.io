/**
 * Public config. The Supabase URL and anon/publishable key are SAFE to ship in frontend code
 * (Row Level Security protects the data). The Steam Web API key is NEVER here - it lives only
 * in Supabase secrets and is used inside Edge Functions.
 */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

export const authEnabled = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
