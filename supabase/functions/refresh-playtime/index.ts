/**
 * POST /functions/v1/refresh-playtime   header: x-cron-secret: <CRON_SECRET>
 *
 * Daily job (called by .github/workflows/refresh-playtime.yml). For every signed-up user it reads
 * Steam's "recently played" list and saves the playtimes, so Family Library games keep their
 * last known hours after they drop off Steam's 2-week window.
 */
import { adminClient } from '../_shared/clients.ts';
import { fetchRecentlyPlayed, rememberPlaytime } from '../steam/logic.ts';

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  if (secret.length < 16) return new Response('CRON_SECRET not configured', { status: 503 });
  if (req.method !== 'POST' || !sameSecret(req.headers.get('x-cron-secret') ?? '', secret)) {
    return new Response('forbidden', { status: 403 });
  }

  const db = adminClient();
  let users = 0;
  let games = 0;
  let failed = 0;
  // page through profiles; only public ones can have a visible "recently played" list
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('profiles').select('steamid').eq('public_profile', true).range(from, from + 499);
    if (error) return new Response(`profiles: ${error.message}`, { status: 500 });
    for (const { steamid } of data ?? []) {
      try {
        const recent = await fetchRecentlyPlayed(steamid);
        await rememberPlaytime(db, steamid, recent);
        users++;
        games += recent.length;
      } catch (e) {
        failed++;
        console.warn('refresh failed for a user', e instanceof Error ? e.message : e);
      }
      await new Promise((r) => setTimeout(r, 250)); // stay gentle with Steam's rate limits
    }
    if (!data || data.length < 500) break;
  }
  const summary = { users, games, failed };
  console.log('refresh-playtime', summary);
  return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } });
});
