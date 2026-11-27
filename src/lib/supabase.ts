import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, authEnabled } from '../config';

export const supabase: SupabaseClient | null = authEnabled()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;
