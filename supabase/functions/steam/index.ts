/**
 * POST /functions/v1/steam   body: { action, ...args }
 *
 * Public actions (no sign-in needed):
 *   game   { appid }            store details + live player count
 *   news   { appid }            latest announcements / patch notes
 *   search { term }             Steam store search
 *   wiki   { api, params }      MediaWiki proxy, only for wikis on the Indie Wiki Buddy list (used when a wiki blocks direct browser requests)
 * Signed-in actions (Authorization: Bearer <user session>):
 *   me     { appid }            my playtime + achievements (with global rarity)
 *   recent {}                   my recently played games (last 2 weeks)
 *   profile { refresh? }        my overall stats (playtime, completion, rarest achievements)
 *   friends { appid? }          friends in a game right now (optionally only this game)
 * Public:
 *   prices { appids[] }         current deals via CheapShark (USD)
 *
 * Every Steam response is cached in public.steam_cache. The Steam Web API key never leaves this function.
 */
import { adminClient } from '../_shared/clients.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { appidOf, game, HttpError, me, news, recent, search, steamidFor, wiki } from './logic.ts';
import { friendsNow, prices, profileStats } from './profile.ts';

// ---------- router ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'bad request' }, 400);
  }

  const db = adminClient();
  try {
    switch (body?.action) {
      case 'game':
        return json(req, await game(db, appidOf(body.appid)));
      case 'news':
        return json(req, await news(db, appidOf(body.appid)));
      case 'search':
        return json(req, await search(db, String(body.term ?? '')));
      case 'wiki':
        return json(req, await wiki(db, String(body.api ?? ''), body.params));
      case 'me': {
        const appid = appidOf(body.appid);
        const steamid = await steamidFor(db, req);
        return json(req, await me(db, steamid, appid));
      }
      case 'prices': {
        const ids = (Array.isArray(body.appids) ? body.appids : []).map(appidOf);
        return json(req, await prices(db, ids));
      }
      case 'profile':
        return json(req, await profileStats(db, await steamidFor(db, req), body.refresh === true));
      case 'friends':
        return json(req, await friendsNow(db, await steamidFor(db, req), body.appid ? appidOf(body.appid) : undefined));
      case 'recent':
        return json(req, await recent(db, await steamidFor(db, req)));
      default:
        return json(req, { error: 'unknown action' }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message }, e.status);
    console.error(body?.action, e);
    return json(req, { error: 'Steam is not responding right now. Try again in a minute.' }, 502);
  }
});
