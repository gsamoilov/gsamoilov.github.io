import { describe, expect, it } from 'vitest';
import { FEATURED } from '../src/data/featured';
import { steamArt } from '../src/platform/steam';

describe('featured games', () => {
  it('has unique appids', () => {
    expect(new Set(FEATURED.map((g) => g.appid)).size).toBe(FEATURED.length);
  });
});

describe('steamArt', () => {
  it('builds CDN urls from the appid', () => {
    expect(steamArt(570).cover).toBe('https://cdn.akamai.steamstatic.com/steam/apps/570/library_600x900.jpg');
  });
});

describe('secrets', () => {
  it('frontend config never contains a Steam Web API key', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/config.ts', 'utf8');
    expect(src).not.toMatch(/[0-9A-F]{32}/); // Steam keys are 32 hex chars
  });
});
