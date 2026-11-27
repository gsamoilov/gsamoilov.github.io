import { describe, expect, it } from 'vitest';
import data from '../src/data/wikis.json';
import { matchWiki, normalize, type WikiEntry } from '../src/lib/wikiMatch';

const wikis = data.wikis as WikiEntry[];
const id = (name: string, appid = 0) => {
  const m = matchWiki(name, appid, wikis);
  return m.kind === 'independent' ? m.wiki.id : 'fandom';
};

describe('normalize', () => {
  it('ignores case, marks, punctuation and a leading "The"', () => {
    expect(normalize('The Witcher® 3: Wild Hunt')).toBe('witcher 3 wild hunt');
    expect(normalize("Baldur's Gate 3")).toBe('baldur s gate 3');
    expect(normalize('HELLDIVERS™ 2')).toBe('helldivers 2');
  });
});

describe('matchWiki (real Indie Wiki Buddy data)', () => {
  it('finds exact matches using Steam store names', () => {
    expect(id('ELDEN RING')).toBe('en-eldenring');
    expect(id("Baldur's Gate 3")).toBe('en-baldursgate3');
    expect(id('Stardew Valley')).toBe('en-stardewvalley');
    expect(id('Terraria')).toBe('en-terraria');
    expect(id('Risk of Rain 2')).toBe('en-riskofrain2');
    expect(id('Hollow Knight')).toBe('en-hollowknight');
  });
  it('prefers the most specific wiki', () => {
    expect(id('Stardew Valley Expanded')).toBe('en-stardewvalleyexpanded');
  });
  it('falls back to Fandom when no independent wiki exists', () => {
    expect(id('Cyberpunk 2077')).toBe('fandom');
    expect(id('Some Unknown Indie Game')).toBe('fandom');
  });
  it('matches editions and subtitles by prefix, flagged as not exact', () => {
    const m = matchWiki('Valheim Deluxe Edition', 0, wikis);
    expect(m.kind === 'independent' && m.wiki.id).toBe('en-valheim');
    expect(m.kind === 'independent' && m.exact).toBe(false);
  });
});
