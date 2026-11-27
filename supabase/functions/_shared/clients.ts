import { createClient } from 'npm:@supabase/supabase-js@2';

const url = () => Deno.env.get('SUPABASE_URL')!;

function firstKey(jsonVar: string): string | undefined {
  try {
    const v = JSON.parse(Deno.env.get(jsonVar) ?? '{}');
    return v.default ?? Object.values(v)[0];
  } catch {
    return undefined;
  }
}

/** Full-access client (bypasses RLS). Server-side only. */
export function adminClient() {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? firstKey('SUPABASE_SECRET_KEYS');
  if (!key) throw new Error('No service role / secret key available to the function');
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Public-key client, used to exchange a one-time token for a user session. */
export function publicClient() {
  const key = Deno.env.get('SUPABASE_ANON_KEY') ?? firstKey('SUPABASE_PUBLISHABLE_KEYS');
  if (!key) throw new Error('No anon / publishable key available to the function');
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
