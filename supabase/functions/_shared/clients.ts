import { createClient } from 'npm:@supabase/supabase-js@2';

const url = () => Deno.env.get('SUPABASE_URL')!;

function firstKey(jsonVar: string): string | undefined {
  try {
    const v = JSON.parse(Deno.env.get(jsonVar) ?? '{}');
    const k = v.default ?? Object.values(v)[0];
    return typeof k === 'string' && k ? k : undefined;
  } catch {
    return undefined;
  }
}

/** Full-access client (bypasses RLS). Server-side only. */
export function adminClient() {
  // New-style secret key first (sb_secret_...); legacy service_role JWT only as a fallback,
  // because projects can disable legacy keys and then every admin query fails.
  const key = firstKey('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('No service role / secret key available to the function');
  // Log only the kind of key, never the key itself.
  console.log('admin client key kind:', key.startsWith('sb_secret_') ? 'new secret key' : key.startsWith('sb_publishable_') ? 'PUBLISHABLE (wrong!)' : 'legacy JWT');
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Public-key client, used to exchange a one-time token for a user session. */
export function publicClient() {
  const key = firstKey('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!key) throw new Error('No anon / publishable key available to the function');
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
