/**
 * POST /functions/v1/steam-auth   body: { query: "<the ?openid.* query string Steam sent back>" }
 *
 * 1. Sanity-checks the OpenID response (provider, claimed id, return_to, freshness).
 * 2. Asks Steam directly whether the response is genuine (check_authentication).
 * 3. Records the nonce so the same response can't be used twice.
 * 4. Finds or creates the Supabase user for that SteamID64 and refreshes their profile.
 * 5. Returns a normal Supabase session (access + refresh token) to the browser.
 */
import { adminClient, publicClient } from '../_shared/clients.ts';
import { allowedOrigins, corsHeaders, json } from '../_shared/http.ts';
import { buildCheckAuthBody, isCheckAuthValid, precheckAssertion, STEAM_OPENID_ENDPOINT } from '../_shared/openid.ts';
import { getPlayerSummaries } from '../_shared/steamApi.ts';

// Placeholder address that identifies the user inside Supabase Auth. Nothing is ever emailed to it
// (generateLink below only creates a token; it does not send mail). steam.samoilov.org has no mail server.
const userEmail = (steamid: string) => `${steamid}@steam.samoilov.org`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405);

  let query: string;
  try {
    query = String((await req.json()).query ?? '');
  } catch {
    return json(req, { error: 'bad request' }, 400);
  }
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);

  // 1. local checks
  const pre = precheckAssertion(params, allowedOrigins(), Date.now());
  if (!pre.ok) return json(req, { error: `Steam sign-in rejected: ${pre.reason}` }, 401);
  const { steamid } = pre;

  // 2. ask Steam to confirm the signature
  const check = await fetch(STEAM_OPENID_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildCheckAuthBody(params),
  });
  if (!check.ok || !isCheckAuthValid(await check.text())) {
    return json(req, { error: 'Steam could not confirm this sign-in. Please try again.' }, 401);
  }

  const admin = adminClient();

  // 3. replay protection: the primary key makes a second insert of the same nonce fail
  const nonce = params.get('openid.response_nonce')!;
  const { error: nonceErr } = await admin.from('steam_auth_nonces').insert({ nonce });
  if (nonceErr) return json(req, { error: 'This sign-in link was already used. Please sign in again.' }, 401);
  // keep the table small
  await admin.from('steam_auth_nonces').delete().lt('created_at', new Date(Date.now() - 864e5).toISOString());

  // 4. find or create the user
  const email = userEmail(steamid);
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { provider: 'steam', steamid },
  });
  if (createErr && !/already|exists|registered/i.test(createErr.message)) {
    console.error('createUser', createErr);
    return json(req, { error: 'Could not create your account.' }, 500);
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link?.user || !link.properties?.hashed_token) {
    console.error('generateLink', linkErr);
    return json(req, { error: 'Could not start your session.' }, 500);
  }
  const userId = link.user.id;

  // refresh public Steam profile info (non-fatal if Steam's API hiccups)
  let summary: Awaited<ReturnType<typeof getPlayerSummaries>>[number] | undefined;
  try {
    [summary] = await getPlayerSummaries([steamid]);
  } catch (e) {
    console.warn('GetPlayerSummaries failed', e);
  }
  const { error: profErr } = await admin.from('profiles').upsert({
    id: userId,
    steamid,
    ...(summary && {
      persona_name: summary.personaname,
      avatar_url: summary.avatarfull,
      profile_url: summary.profileurl,
      public_profile: summary.communityvisibilitystate === 3,
    }),
    updated_at: new Date().toISOString(),
  });
  if (profErr) {
    console.error('profile upsert', profErr);
    return json(req, { error: 'Could not save your profile.' }, 500);
  }

  // 5. exchange the one-time token for a real session
  const pub = publicClient();
  let { data: verified, error: otpErr } = await pub.auth.verifyOtp({ type: 'email', token_hash: link.properties.hashed_token });
  if (otpErr || !verified?.session) {
    ({ data: verified, error: otpErr } = await pub.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token }));
  }
  if (otpErr || !verified?.session) {
    console.error('verifyOtp', otpErr);
    return json(req, { error: 'Could not start your session.' }, 500);
  }

  return json(req, {
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
    steamid,
  });
});
