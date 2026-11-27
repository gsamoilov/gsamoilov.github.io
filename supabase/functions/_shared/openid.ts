/**
 * Steam OpenID 2.0 helpers. Pure functions (no Deno / browser APIs) so the
 * frontend, the Edge Function and the unit tests can all share them.
 */
export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/;

/** URL that sends the browser to Steam's sign-in page. */
export function buildSteamLoginUrl(returnTo: string, realm: string): string {
  const p = new URLSearchParams({
    'openid.ns': NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_ENDPOINT}?${p}`;
}

export type CheckResult = { ok: true; steamid: string } | { ok: false; reason: string };

/**
 * Local sanity checks on Steam's response BEFORE asking Steam to confirm it.
 * Passing these does NOT mean the login is genuine. The server must still call
 * Steam's check_authentication (see buildCheckAuthBody / isCheckAuthValid).
 */
export function precheckAssertion(
  params: URLSearchParams,
  allowedReturnOrigins: string[],
  nowMs: number,
  maxAgeMs = 5 * 60 * 1000,
): CheckResult {
  if (params.get('openid.ns') !== NS) return { ok: false, reason: 'bad namespace' };
  if (params.get('openid.mode') !== 'id_res') return { ok: false, reason: 'not a positive assertion' };
  if (params.get('openid.op_endpoint') !== STEAM_OPENID_ENDPOINT) return { ok: false, reason: 'wrong provider' };

  const claimed = params.get('openid.claimed_id') ?? '';
  const m = CLAIMED_ID_RE.exec(claimed);
  if (!m || params.get('openid.identity') !== claimed) return { ok: false, reason: 'bad claimed_id' };

  let returnTo: URL;
  try {
    returnTo = new URL(params.get('openid.return_to') ?? '');
  } catch {
    return { ok: false, reason: 'bad return_to' };
  }
  if (!allowedReturnOrigins.includes(returnTo.origin)) return { ok: false, reason: 'return_to origin not allowed' };

  // The fields Steam signed must include the ones we rely on.
  const signed = (params.get('openid.signed') ?? '').split(',');
  for (const f of ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce']) {
    if (!signed.includes(f)) return { ok: false, reason: `unsigned field ${f}` };
  }

  // Nonce looks like 2026-11-27T15:00:00Z<random>. Reject stale ones.
  const nonce = params.get('openid.response_nonce') ?? '';
  const ts = Date.parse(nonce.slice(0, 20));
  if (Number.isNaN(ts)) return { ok: false, reason: 'bad nonce' };
  if (Math.abs(nowMs - ts) > maxAgeMs) return { ok: false, reason: 'nonce expired' };

  return { ok: true, steamid: m[1] };
}

/** Body for the server-to-server check_authentication POST to Steam. */
export function buildCheckAuthBody(params: URLSearchParams): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith('openid.')) body.set(k, v);
  body.set('openid.mode', 'check_authentication');
  return body;
}

/** Steam answers in key:value lines; we need exactly "is_valid:true". */
export function isCheckAuthValid(responseText: string): boolean {
  return responseText.split('\n').some((line) => line.trim() === 'is_valid:true');
}
