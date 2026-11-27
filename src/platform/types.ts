/**
 * Platform adapter contract. Pages only talk to this interface, never to Steam directly,
 * so PlayStation (psn-api) and Xbox (OpenXBL) adapters can be added later.
 */
export type PlatformId = 'steam' | 'psn' | 'xbox';

export interface GameRef {
  platform: PlatformId;
  /** Platform-native id. For Steam this is the appid. */
  id: string;
  name: string;
}

export interface GameArt {
  cover: string; // portrait 2:3
  hero: string; // wide backdrop
  header: string; // 460x215 capsule (fallback)
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  hidden: boolean;
  achieved: boolean;
  unlockedAt?: number;
  /** Global unlock percentage, if known. */
  globalPercent?: number;
}

export interface PlayerGameStats {
  playtimeMinutes: number;
  achievementsTotal: number;
  achievementsEarned: number;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  date: number; // unix seconds
  author?: string;
  contents: string; // raw (BBCode / HTML) - sanitise before rendering
  feed: string;
}

export interface Friend {
  id: string;
  name: string;
  avatar: string;
  profileUrl: string;
  /** Game the friend is currently in, if their profile is public. */
  inGame?: GameRef;
  visibility: 'public' | 'private';
}

export interface PlatformAdapter {
  id: PlatformId;
  label: string;
  art(gameId: string): GameArt;
  currentPlayers(gameId: string): Promise<number | null>;
  playerStats(gameId: string): Promise<PlayerGameStats | null>;
  achievements(gameId: string): Promise<Achievement[]>;
  news(gameId: string, count?: number): Promise<NewsItem[]>;
  friendsInGame(gameId: string): Promise<Friend[]>;
}
