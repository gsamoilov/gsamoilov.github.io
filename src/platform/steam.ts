import type { GameArt } from './types';

const CDN = 'https://cdn.akamai.steamstatic.com/steam/apps';

/** Steam artwork by appid. All live calls go through Supabase Edge Functions (added in later phases). */
export function steamArt(appid: string | number): GameArt {
  return {
    cover: `${CDN}/${appid}/library_600x900.jpg`,
    hero: `${CDN}/${appid}/library_hero.jpg`,
    header: `${CDN}/${appid}/header.jpg`,
  };
}

export const steamStoreUrl = (appid: string | number) => `https://store.steampowered.com/app/${appid}/`;
