/** Steam announcement BBCode -> sanitized HTML. */
import DOMPurify from 'dompurify';

const CLAN_IMG = 'https://clan.cloudflare.steamstatic.com/images/';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function bbcodeToHtml(src: string): string {
  // Some news feeds already deliver HTML; only convert when it looks like BBCode.
  const looksHtml = /<\/?(p|br|div|h\d|ul|li|img|a)\b/i.test(src) && !/\[\/?(h\d|b|list|url|img|p)\b/i.test(src);
  let s = looksHtml ? src : esc(src);

  if (!looksHtml) {
    const rules: [RegExp, string | ((...m: string[]) => string)][] = [
      [/\{STEAM_CLAN_IMAGE\}\//g, CLAN_IMG],
      [/\[h1\]([\s\S]*?)\[\/h1\]/gi, '<h3>$1</h3>'],
      [/\[h2\]([\s\S]*?)\[\/h2\]/gi, '<h4>$1</h4>'],
      [/\[h3\]([\s\S]*?)\[\/h3\]/gi, '<h5>$1</h5>'],
      [/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>'],
      [/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>'],
      [/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>'],
      [/\[strike\]([\s\S]*?)\[\/strike\]/gi, '<s>$1</s>'],
      [/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, '<span class="bb-spoiler">$1</span>'],
      [/\[code\]([\s\S]*?)\[\/code\]/gi, '<pre><code>$1</code></pre>'],
      [/\[quote(?:=[^\]]*)?\]([\s\S]*?)\[\/quote\]/gi, '<blockquote>$1</blockquote>'],
      [/\[url=(?:&quot;)?([^\]\s]+?)(?:&quot;)?\]([\s\S]*?)\[\/url\]/gi, '<a href="$1">$2</a>'],
      [/\[url\]([\s\S]*?)\[\/url\]/gi, '<a href="$1">$1</a>'],
      [/\[img(?:\s[^\]]*)?\]([\s\S]*?)\[\/img\]/gi, '<img src="$1" alt="">'],
      [/\[img\s+src=(?:&quot;)?([^\]\s]+?)(?:&quot;)?[^\]]*\](?:\[\/img\])?/gi, '<img src="$1" alt="">'],
      [/\[previewyoutube=([\w-]+)[^\]]*\]\s*\[\/previewyoutube\]/gi, '<a class="bb-video" href="https://www.youtube.com/watch?v=$1">▶ Watch video on YouTube</a>'],
      [/\[video[^\]]*\][\s\S]*?\[\/video\]/gi, ''],
      [/\[\*\]/g, '<li>'],
      [/\[\/\*\]/g, '</li>'],
      [/\[list\]/gi, '<ul>'],
      [/\[\/list\]/gi, '</ul>'],
      [/\[olist\]/gi, '<ol>'],
      [/\[\/olist\]/gi, '</ol>'],
      [/\[hr\]\s*\[\/hr\]|\[hr\]/gi, '<hr>'],
      [/\[p\]([\s\S]*?)\[\/p\]/gi, '<p>$1</p>'],
      [/\[(table|tr|th|td)\]/gi, '<$1>'],
      [/\[\/(table|tr|th|td)\]/gi, '</$1>'],
      [/\[\/?[a-z]+(?:=[^\]]*)?\]/gi, ''], // drop anything we don't know
    ];
    for (const [re, rep] of rules) s = s.replace(re, rep as string);
    s = s.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  } else {
    s = s.replace(/\{STEAM_CLAN_IMAGE\}\//g, CLAN_IMG);
  }

  const frag = DOMPurify.sanitize(s, { FORBID_ATTR: ['style'], FORBID_TAGS: ['script', 'iframe', 'style', 'form'], RETURN_DOM_FRAGMENT: true }) as DocumentFragment;
  frag.querySelectorAll('a').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  frag.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'lazy'));
  const div = document.createElement('div');
  div.appendChild(frag);
  return div.innerHTML;
}

/** Plain-text preview for collapsed cards. */
export function bbcodeExcerpt(src: string, max = 180): string {
  const t = src
    .replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? t.slice(0, max).replace(/\s\S*$/, '') + '…' : t;
}
