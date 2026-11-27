// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { bbcodeExcerpt, bbcodeToHtml } from '../src/lib/bbcode';
import { cleanArticleHtml, internalTitle } from '../src/lib/wiki';
import type { WikiEntry } from '../src/lib/wikiMatch';

const terraria: WikiEntry = {
  id: 'en-terraria', keys: ['Terraria'], name: 'Terraria Wiki', host: 'terraria.wiki.gg', base: 'https://terraria.wiki.gg',
  api: 'https://terraria.wiki.gg/api.php', article: 'https://terraria.wiki.gg/wiki/', main: 'Terraria_Wiki', official: true,
};
const stardew: WikiEntry = { ...terraria, id: 'en-stardewvalley', host: 'stardewvalleywiki.com', base: 'https://stardewvalleywiki.com', article: 'https://stardewvalleywiki.com/', api: 'https://stardewvalleywiki.com/mediawiki/api.php' };

describe('bbcodeToHtml', () => {
  it('converts Steam announcement markup', () => {
    const html = bbcodeToHtml('[h1]Patch 1.2[/h1][list][*]Fixed [b]crash[/b][/list][img]{STEAM_CLAN_IMAGE}/1/a.png[/img]');
    expect(html).toContain('<h3>Patch 1.2</h3>');
    expect(html).toContain('<li>Fixed <strong>crash</strong></li>');
    expect(html).toContain('src="https://clan.cloudflare.steamstatic.com/images/1/a.png"');
  });
  it('neutralises scripts and javascript: links', () => {
    const html = bbcodeToHtml('<script>alert(1)</script>[url=javascript:alert(1)]x[/url]');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/href="javascript/i);
  });
  it('opens links in a new tab', () => {
    expect(bbcodeToHtml('[url=https://store.steampowered.com]store[/url]')).toContain('target="_blank"');
  });
  it('makes a readable excerpt', () => {
    expect(bbcodeExcerpt('[h1]Hello[/h1] [b]world[/b] [img]{STEAM_CLAN_IMAGE}/x.png[/img]')).toBe('Hello world');
  });
});

describe('internalTitle', () => {
  it('recognises article links in both path styles', () => {
    expect(internalTitle('/wiki/Zenith', terraria)).toBe('Zenith');
    expect(internalTitle('/index.php?title=Moon_Lord', terraria)).toBe('Moon Lord');
    expect(internalTitle('/Parsnip', stardew)).toBe('Parsnip');
  });
  it('leaves files, categories, edit links and other sites alone', () => {
    expect(internalTitle('/wiki/File:Zenith.png', terraria)).toBeNull();
    expect(internalTitle('/wiki/Category:Swords', terraria)).toBeNull();
    expect(internalTitle('/index.php?title=Zenith&action=edit', terraria)).toBeNull();
    expect(internalTitle('https://example.com/wiki/Zenith', terraria)).toBeNull();
  });
});

describe('cleanArticleHtml', () => {
  const raw = `
    <div class="mw-parser-output">
      <style>.x{color:red}</style><script>alert(1)</script>
      <p style="background:white">The <a href="/wiki/Zenith" title="Zenith">Zenith</a> is a sword.
        <a href="https://example.com">ext</a><span class="mw-editsection">[edit]</span></p>
      <img src="/images/a.png" srcset="/images/a.png 1.5x, //cdn.example/b.png 2x" onerror="alert(1)">
      <table><tr><td>dmg</td></tr></table>
      <div class="navbox">nav</div>
    </div>`;
  const out = cleanArticleHtml(raw, terraria);
  it('strips scripts, styles, handlers, edit links and navboxes', () => {
    expect(out).not.toMatch(/<script|<style|onerror|style=|\[edit\]|navbox/);
  });
  it('turns internal links into in-panel links and external links into new tabs', () => {
    expect(out).toContain('data-wiki-title="Zenith"');
    expect(out).toMatch(/href="https:\/\/example\.com\/?" target="_blank" rel="noopener noreferrer"/);
  });
  it('makes image URLs absolute and lazy', () => {
    expect(out).toContain('src="https://terraria.wiki.gg/images/a.png"');
    expect(out).toContain('https://cdn.example/b.png 2x');
    expect(out).toContain('loading="lazy"');
  });
  it('wraps tables so they scroll on phones', () => {
    expect(out).toContain('<div class="table-scroll"><table>');
  });
});
