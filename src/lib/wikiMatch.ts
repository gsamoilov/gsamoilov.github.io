/** Matching a game's name to an independent wiki from the Indie Wiki Buddy list. Pure, unit-tested. */
export interface WikiEntry {
  id: string;
  keys: string[];
  name: string;
  host: string;
  base: string;
  api: string;
  article: string;
  main: string;
  official: boolean;
  fandom?: string;
}

export type WikiMatch =
  | { kind: 'independent'; wiki: WikiEntry; exact: boolean }
  | { kind: 'fandom'; searchUrl: string; knownUrl?: undefined };

/** Hand-checked fixes where name matching picks the wrong wiki or misses one. Keyed by Steam appid. */
export const WIKI_OVERRIDES: Record<number, string | null> = {
  // 1030300: 'en-hollowknight',  // e.g. pin Silksong to the Hollow Knight wiki once verified
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim();
}

export function fandomSearchUrl(gameName: string): string {
  return `https://community.fandom.com/wiki/Special:Search?scope=cross-wiki&query=${encodeURIComponent(gameName)}`;
}

/**
 * 1. appid override  2. exact name match  3. longest wiki name that the game name starts with
 * ("Risk of Rain 2" exact, "Terraria: Otherworld" -> Terraria). Otherwise Fandom search.
 */
export function matchWiki(gameName: string, appid: number, wikis: WikiEntry[]): WikiMatch {
  if (appid in WIKI_OVERRIDES) {
    const id = WIKI_OVERRIDES[appid];
    const w = id ? wikis.find((x) => x.id === id) : undefined;
    if (w) return { kind: 'independent', wiki: w, exact: true };
    if (id === null) return { kind: 'fandom', searchUrl: fandomSearchUrl(gameName) };
  }
  const g = normalize(gameName);
  let best: { w: WikiEntry; len: number } | null = null;
  for (const w of wikis) {
    for (const k of w.keys) {
      const nk = normalize(k);
      if (!nk) continue;
      if (nk === g) return { kind: 'independent', wiki: w, exact: true };
      if (nk.length >= 4 && g.startsWith(nk + ' ') && (!best || nk.length > best.len)) best = { w, len: nk.length };
    }
  }
  if (best) return { kind: 'independent', wiki: best.w, exact: false };
  return { kind: 'fandom', searchUrl: fandomSearchUrl(gameName) };
}
