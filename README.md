# samoilov.org

A gaming companion: open it next to your PC and get the wiki, missed achievements, notes and patch notes for your current game.

- Frontend: Vite + Preact + TypeScript, deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
- Backend: Supabase (auth, Postgres, Edge Functions). The Steam Web API key lives only in Supabase secrets.

```sh
npm install
npm run dev     # local dev server
npm test
npm run build   # outputs dist/ (404.html = index.html so deep links work on Pages)
```

## Backend layout

- `supabase/migrations/` – SQL for tables + Row Level Security (applied by `.github/workflows/supabase.yml`).
- `supabase/functions/steam-auth` – verifies Steam OpenID 2.0 server-side, creates/links the user by SteamID64, returns a session.
- `supabase/functions/_shared` – OpenID helpers (unit-tested in `tests/`), Steam API + cache, CORS.

Build-time variables (GitHub → Settings → Secrets and variables → Actions → **Variables**): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_REF`.
Secrets (same page → **Secrets**): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CRON_SECRET`.

Supabase Edge Function secrets: `STEAM_API_KEY`, `CRON_SECRET`, `IGDB_CLIENT_ID` + `IGDB_CLIENT_SECRET` (Twitch app, for search),
`PSN_NPSSO` (token of a dedicated PlayStation account; renew about every 2 months, the daily workflow warns you),
`OPENXBL_API_KEY` (xbl.io personal key; free tier 150 requests/hour, budgeted at 140).

## Wikis

`src/data/wikis.json` maps games to independent wikis using [Indie Wiki Buddy](https://github.com/KevinPayravi/indie-wiki-buddy)'s list (MIT).
Refresh it with `npm run wikis` (downloads their latest `data/data.json`), then commit. Pin a game to a specific wiki in `WIKI_OVERRIDES` (`src/lib/wikiMatch.ts`).

`src/styles/themes.css` holds the saved theme pack from the old site (not loaded yet).
`archive/themes-demo.html` is the original interactive theme demo (not deployed).
