/** Hand-picked games for the signed-out home page. Will be replaced by live Steam charts in a later phase. */
export interface FeaturedGame {
  appid: number;
  name: string;
  /** two colours used for the fallback tile when artwork can't load */
  tint: [string, string];
}

export const FEATURED: FeaturedGame[] = [
  { appid: 1245620, name: 'Elden Ring', tint: ['#3a2f12', '#0e0b05'] },
  { appid: 1086940, name: "Baldur's Gate 3", tint: ['#3b1b12', '#0f0806'] },
  { appid: 1145350, name: 'Hades II', tint: ['#2d1840', '#0b0612'] },
  { appid: 413150, name: 'Stardew Valley', tint: ['#1d3b22', '#081209'] },
  { appid: 367520, name: 'Hollow Knight', tint: ['#1b2433', '#06080d'] },
  { appid: 1030300, name: 'Hollow Knight: Silksong', tint: ['#3a1520', '#100508'] },
  { appid: 1091500, name: 'Cyberpunk 2077', tint: ['#3a3a0c', '#0f0f03'] },
  { appid: 105600, name: 'Terraria', tint: ['#173a2a', '#06110c'] },
  { appid: 553850, name: 'HELLDIVERS 2', tint: ['#3a3212', '#100d04'] },
  { appid: 892970, name: 'Valheim', tint: ['#22302c', '#080c0b'] },
  { appid: 292030, name: 'The Witcher 3: Wild Hunt', tint: ['#2a2a2a', '#0a0a0a'] },
  { appid: 646570, name: 'Slay the Spire', tint: ['#3a1c14', '#100705'] },
  { appid: 2246340, name: 'Monster Hunter Wilds', tint: ['#2b2412', '#0c0a05'] },
  { appid: 264710, name: 'Subnautica', tint: ['#0f2c3a', '#040c10'] },
  { appid: 1145360, name: 'Hades', tint: ['#3a1212', '#100404'] },
  { appid: 570, name: 'Dota 2', tint: ['#3a1410', '#100504'] },
  { appid: 730, name: 'Counter-Strike 2', tint: ['#2c2a1a', '#0c0b06'] },
  { appid: 1174180, name: 'Red Dead Redemption 2', tint: ['#3a1a10', '#100704'] },
];

export const findFeatured = (appid: number) => FEATURED.find((g) => g.appid === appid);
