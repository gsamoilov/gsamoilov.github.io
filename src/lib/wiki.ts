/**
 * MediaWiki client for independent wikis. Fetches straight from the wiki's API (CORS via origin=*),
 * falling back to our caching proxy when a wiki blocks browser requests. All HTML is sanitized
 * and rewritten before it is shown in our own panel.
 */
import DOMPurify from 'dompurify';
import type { WikiEntry } from './wikiMatch';
import { callSteam } from '../platform/steamClient';

export interface WikiArticle {
  title: string;
  html: string;
  url: string;
}
export interface WikiSearchHit {
  title: string;
  snippet: string;
}
export interface WikiLicense {
  text: string;
  url: string;
}

const proxyHosts = new Set<string>(JSON.parse(sessionStorage.getItem('wiki-proxy-hosts') ?? '[]'));
const rememberProxy = (host: string) => {
  proxyHosts.add(host);
  sessionStorage.setItem('wiki-proxy-hosts', JSON.stringify([...proxyHosts]));
};

async function apiGet(wiki: WikiEntry, params: Record<string, string>): Promise<any> {
  const p = { ...params, format: 'json', formatversion: '2' };
  if (!proxyHosts.has(wiki.host)) {
    try {
      const u = new URL(wiki.api);
      for (const [k, v] of Object.entries({ ...p, origin: '*' })) u.searchParams.set(k, v);
      const res = await fetch(u, { headers: { 'Api-User-Agent': 'samoilov.org gaming companion' } });
      if (res.ok) return await res.json();
      if (res.status !== 403 && res.status !== 429) throw new Error(`wiki ${res.status}`);
    } catch (e) {
      // TypeError = network/CORS block: fall through to the proxy
      if (!(e instanceof TypeError) && !(e instanceof SyntaxError)) throw e;
    }
    rememberProxy(wiki.host);
  }
  return callSteam('wiki', { api: wiki.api, params: p });
}

export const articleUrl = (wiki: WikiEntry, title: string) => wiki.article + encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':');

export async function fetchArticle(wiki: WikiEntry, title: string): Promise<WikiArticle> {
  const r = await apiGet(wiki, {
    action: 'parse',
    page: title,
    prop: 'text|displaytitle',
    redirects: '1',
    disableeditsection: '1',
    disablelimitreport: '1',
    disabletoc: '1',
  });
  if (r?.error) throw new Error(r.error.code === 'missingtitle' ? 'That page does not exist on this wiki.' : r.error.info ?? 'Wiki error');
  const t: string = r.parse.title;
  return { title: t, html: cleanArticleHtml(r.parse.text, wiki), url: articleUrl(wiki, t) };
}

export async function searchWiki(wiki: WikiEntry, q: string): Promise<WikiSearchHit[]> {
  const r = await apiGet(wiki, { action: 'query', list: 'search', srsearch: q, srlimit: '12', srprop: 'snippet' });
  return ((r?.query?.search ?? []) as any[]).map((h) => ({
    title: String(h.title),
    snippet: DOMPurify.sanitize(String(h.snippet ?? ''), { ALLOWED_TAGS: ['span'], ALLOWED_ATTR: ['class'] }),
  }));
}

const licenseCache = new Map<string, Promise<WikiLicense | null>>();
export function wikiLicense(wiki: WikiEntry): Promise<WikiLicense | null> {
  let p = licenseCache.get(wiki.id);
  if (!p) {
    p = apiGet(wiki, { action: 'query', meta: 'siteinfo', siprop: 'rightsinfo' })
      .then((r) => (r?.query?.rightsinfo?.text ? { text: r.query.rightsinfo.text, url: r.query.rightsinfo.url ?? '' } : null))
      .catch(() => null);
    licenseCache.set(wiki.id, p);
  }
  return p;
}

// ---------- HTML cleanup ----------

const REMOVE = [
  '.mw-editsection', '.navbox', '.navbox-wrapper', '.noprint', '.metadata', '.mw-empty-elt', '.toc', '#toc',
  '.reference', '.mw-references-wrap', '.printfooter', '.catlinks', '.ambox', '.mbox', '.navigation-not-searchable',
  'script', 'style', 'link', 'meta', 'iframe', 'form', 'input', 'button', 'audio', 'video', 'object', 'embed',
].join(',');

/** Turns a wiki href into a page title if it points at an article on the same wiki, else null. */
export function internalTitle(href: string, wiki: WikiEntry): string | null {
  let u: URL;
  try {
    u = new URL(href, wiki.base + '/');
  } catch {
    return null;
  }
  const wikiUrl = new URL(wiki.article);
  if (u.host !== wikiUrl.host) return null;
  let title: string | null = null;
  if (u.pathname.startsWith(wikiUrl.pathname) && u.pathname.length > wikiUrl.pathname.length && !u.search) {
    title = decodeURIComponent(u.pathname.slice(wikiUrl.pathname.length));
  } else if (u.pathname.endsWith('/index.php') && u.searchParams.get('title') && !u.searchParams.get('action')) {
    title = u.searchParams.get('title');
  }
  if (!title) return null;
  title = title.replace(/_/g, ' ');
  // non-article namespaces open on the wiki itself
  if (/^(File|Image|Category|Special|Template|User|Talk|Help|MediaWiki|Module)( talk)?:/i.test(title)) return null;
  return title;
}

const absolutize = (src: string, wiki: WikiEntry) => {
  if (src.startsWith('//')) return 'https:' + src;
  try {
    return new URL(src, wiki.base + '/').href;
  } catch {
    return '';
  }
};

export function cleanArticleHtml(html: string, wiki: WikiEntry): string {
  const clean = DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button', 'svg', 'math'],
    FORBID_ATTR: ['style', 'onerror', 'onclick'],
    RETURN_DOM_FRAGMENT: true,
  }) as DocumentFragment;

  clean.querySelectorAll(REMOVE).forEach((el) => el.remove());

  clean.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href')!;
    if (href.startsWith('#')) return;
    const t = internalTitle(href, wiki);
    if (t) {
      a.setAttribute('data-wiki-title', t);
      a.setAttribute('href', articleUrl(wiki, t));
    } else {
      a.setAttribute('href', absolutize(href, wiki));
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });

  clean.querySelectorAll('img').forEach((img) => {
    const lazy = img.getAttribute('data-src');
    const src = lazy || img.getAttribute('src') || '';
    img.setAttribute('src', absolutize(src, wiki));
    const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset');
    if (srcset) {
      img.setAttribute(
        'srcset',
        srcset
          .split(',')
          .map((part) => {
            const [u, d] = part.trim().split(/\s+/);
            return [absolutize(u, wiki), d].filter(Boolean).join(' ');
          })
          .join(', '),
      );
    }
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.removeAttribute('data-src');
    img.removeAttribute('data-srcset');
  });

  // wide tables scroll sideways instead of breaking the phone layout
  clean.querySelectorAll('table').forEach((t) => {
    if (t.parentElement?.classList.contains('table-scroll')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    t.replaceWith(wrap);
    wrap.appendChild(t);
  });

  const div = document.createElement('div');
  div.appendChild(clean);
  return div.innerHTML;
}
