-- Phase 6: games from any platform (IGDB ids) can be marked Playing, have notes and be watched.
alter table public.playing   drop constraint if exists playing_platform_check;
alter table public.playing   add constraint playing_platform_check   check (platform in ('steam', 'psn', 'xbox', 'igdb'));
alter table public.notes     drop constraint if exists notes_platform_check;
alter table public.notes     add constraint notes_platform_check     check (platform in ('steam', 'psn', 'xbox', 'igdb'));
alter table public.watchlist drop constraint if exists watchlist_platform_check;
alter table public.watchlist add constraint watchlist_platform_check check (platform in ('steam', 'psn', 'xbox', 'igdb'));

-- cover art for non-Steam games (Steam covers are derived from the appid)
alter table public.playing add column if not exists cover_url text not null default ''
  check (cover_url = '' or cover_url like 'https://images.igdb.com/%');
