/**
 * POST /functions/v1/steam   body: { action, ...args }
 *
 * Public actions (no sign-in needed):
 *   game   { appid }            store details + live player count
 *   news   { appid }            latest announcements / patch notes
 *   search { term }             game search across all platforms (IGDB; Steam store search if IGDB isn't set up)
 *   igdb   { id }               one game's details from IGDB
 *   charts { kind }             Steam most played: kind 'popular' (by rank) or 'trending' (climbers + new)
 *   wiki   { api, params }      MediaWiki proxy, only for wikis on the Indie Wiki Buddy list (used when a wiki blocks direct browser requests)
 * Signed-in actions (Authorization: Bearer <user session>):
 *   me     { appid }            my playtime + achievements (with global rarity)
 *   recent {}                   my recently played games (last 2 weeks)
 *   profile { refresh? }        my overall stats (playtime, completion, rarest achievements)
 *   friends { appid? }          friends in a game right now (optionally only this game)
 *   link-start { platform, handle }   PSN/Xbox: get a code to put in About me / bio
 *   link-verify { platform }          PSN/Xbox: check the code and link the account
 *   console-library { platform }      PSN/Xbox: games with hours (PSN) and trophy/achievement progress
 *   console-achievements { platform, ref, service? }  trophies/achievements for one title
 * Public:
 *   prices { appids[] }         current deals via CheapShark (USD)
 *
 * Every Steam response is cached in public.steam_cache. The Steam Web API key never leaves this function.
 */
import { adminClient } from '../_shared/clients.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { appidOf, game, HttpError, me, news, recent, steamidFor, userIdFor, wiki } from './logic.ts';
import { psnLibrary, psnLinkStart, psnLinkVerify, psnTrophies } from './psn.ts';
import { xboxAchievements, xboxLibrary, xboxLinkStart, xboxLinkVerify } from './xbox.ts';
import { friendsNow, prices, profileStats } from './profile.ts';
import { igdbGame, popular, searchGames, trending } from './catalog.ts';

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
        return json(req, await searchGames(db, String(body.term ?? '')));
      case 'igdb': {
        const id = Number(body.id);
        if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'bad id');
        return json(req, await igdbGame(db, id));
      }
      case 'charts':
        return json(req, body.kind === 'trending' ? await trending(db) : await popular(db));
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
      case 'link-start': {
        const uid = await userIdFor(db, req);
        const handle = String(body.handle ?? '');
        if (body.platform === 'psn') return json(req, await psnLinkStart(db, uid, handle));
        if (body.platform === 'xbox') return json(req, await xboxLinkStart(db, uid, handle));
        throw new HttpError(400, 'bad platform');
      }
      case 'link-verify': {
        const uid = await userIdFor(db, req);
        if (body.platform === 'psn') return json(req, await psnLinkVerify(db, uid));
        if (body.platform === 'xbox') return json(req, await xboxLinkVerify(db, uid));
        throw new HttpError(400, 'bad platform');
      }
      case 'console-library': {
        const uid = await userIdFor(db, req);
        if (body.platform === 'psn') return json(req, await psnLibrary(db, uid));
        if (body.platform === 'xbox') return json(req, await xboxLibrary(db, uid));
        throw new HttpError(400, 'bad platform');
      }
      case 'console-achievements': {
        const uid = await userIdFor(db, req);
        const ref = String(body.ref ?? '');
        if (body.platform === 'psn') return json(req, await psnTrophies(db, uid, ref, String(body.service ?? '')));
        if (body.platform === 'xbox') return json(req, await xboxAchievements(db, uid, ref));
        throw new HttpError(400, 'bad platform');
      }
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
