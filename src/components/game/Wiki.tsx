import { useEffect, useRef, useState } from 'preact/hooks';
import type { WikiEntry, WikiMatch } from '../../lib/wikiMatch';
import { matchWiki } from '../../lib/wikiMatch';
import { fetchArticle, searchWiki, wikiLicense, type WikiArticle, type WikiLicense, type WikiSearchHit } from '../../lib/wiki';
import { IconArrow, IconSearch } from '../Icons';

/** Loads the Indie Wiki Buddy map lazily (only game pages need it). */
let wikisPromise: Promise<WikiEntry[]> | null = null;
const loadWikis = () => (wikisPromise ??= import('../../data/wikis.json').then((m) => m.default.wikis as WikiEntry[]));

export function useWikiMatch(gameName: string | null, appid: number): WikiMatch | null {
  const [m, set] = useState<WikiMatch | null>(null);
  useEffect(() => {
    set(null);
    if (!gameName) return;
    let live = true;
    loadWikis().then((w) => live && set(matchWiki(gameName, appid, w)));
    return () => {
      live = false;
    };
  }, [gameName, appid]);
  return m;
}

type View =
  | { kind: 'article'; title: string }
  | { kind: 'search'; q: string };

function FandomWarning({ gameName, url }: { gameName: string; url: string }) {
  return (
    <div class="fandom-warn" role="note">
      <p class="fandom-title">⚠ No independent wiki found for {gameName}</p>
      <p>The only wiki we know of is probably on <b>Fandom</b>. Things to expect there:</p>
      <ul>
        <li>Heavy ads, including ones placed inside articles, plus pop-ups and auto-playing videos.</li>
        <li>Slow, cluttered pages, especially on phones.</li>
        <li>Many big game communities (Minecraft, Terraria, Warcraft, RuneScape, GTA) left Fandom over this. When editors move to a new wiki, the old Fandom copy stays online and can fall out of date.</li>
      </ul>
      <a class="btn btn-ghost btn-sm" href={url} target="_blank" rel="noopener noreferrer">
        Search Fandom for {gameName} <IconArrow class="ic" />
      </a>
      <p class="muted small">
        Know a better wiki for this game? Suggest it to{' '}
        <a href="https://github.com/KevinPayravi/indie-wiki-buddy" target="_blank" rel="noopener">Indie Wiki Buddy</a>. We refresh our copy of their list regularly.
      </p>
    </div>
  );
}

function Article({ wiki, title, onNavigate }: { wiki: WikiEntry; title: string; onNavigate: (t: string) => void }) {
  const [state, set] = useState<{ s: 'loading' } | { s: 'ok'; a: WikiArticle } | { s: 'error'; e: string }>({ s: 'loading' });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    set({ s: 'loading' });
    fetchArticle(wiki, title).then(
      (a) => live && set({ s: 'ok', a }),
      (e: Error) => live && set({ s: 'error', e: e.message }),
    );
    return () => {
      live = false;
    };
  }, [wiki.id, title]);

  // intercept clicks on internal links so articles open inside the panel
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const t = a.getAttribute('data-wiki-title');
    if (t && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onNavigate(t);
    } else if (a.getAttribute('href')?.startsWith('#')) {
      e.preventDefault();
      const id = decodeURIComponent(a.getAttribute('href')!.slice(1));
      ref.current?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (state.s === 'loading') {
    return (
      <div class="pending" aria-busy="true">
        <div class="skel" style={{ height: '28px', width: '60%' }} />
        {[92, 85, 97, 70, 88, 60].map((w) => <div class="skel" style={{ height: '12px', width: `${w}%` }} />)}
      </div>
    );
  }
  if (state.s === 'error') {
    return (
      <div class="panel-empty">
        <p>{state.e}</p>
        <a class="btn btn-ghost btn-sm" href={wiki.article + encodeURIComponent(title)} target="_blank" rel="noopener">Open on {wiki.name}</a>
      </div>
    );
  }
  return (
    <article class="wiki-article">
      <h3 class="wiki-title">{state.a.title}</h3>
      <div class="rich wiki-content" ref={ref} onClick={onClick} dangerouslySetInnerHTML={{ __html: state.a.html }} />
      <Attribution wiki={wiki} url={state.a.url} />
    </article>
  );
}

function Attribution({ wiki, url }: { wiki: WikiEntry; url: string }) {
  const [lic, setLic] = useState<WikiLicense | null>(null);
  useEffect(() => void wikiLicense(wiki).then(setLic), [wiki.id]);
  return (
    <p class="wiki-attr">
      From <a href={url} target="_blank" rel="noopener">{wiki.name}</a>
      {lic && (
        <>
          {' '}· {lic.url ? <a href={lic.url} target="_blank" rel="noopener">{lic.text}</a> : lic.text}
        </>
      )}
      {' '}· Wiki found via <a href="https://github.com/KevinPayravi/indie-wiki-buddy" target="_blank" rel="noopener">Indie Wiki Buddy</a>
    </p>
  );
}

function SearchResults({ wiki, q, onOpen }: { wiki: WikiEntry; q: string; onOpen: (t: string) => void }) {
  const [hits, setHits] = useState<WikiSearchHit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setHits(null);
    setErr(null);
    searchWiki(wiki, q).then(
      (h) => live && setHits(h),
      (e: Error) => live && setErr(e.message),
    );
    return () => {
      live = false;
    };
  }, [wiki.id, q]);
  if (err) return <p class="panel-empty muted">{err}</p>;
  if (!hits) return <div class="pending">{[0, 1, 2, 3].map(() => <div class="skel" style={{ height: '44px' }} />)}</div>;
  if (!hits.length) return <p class="panel-empty muted">Nothing on {wiki.name} matches “{q}”.</p>;
  return (
    <ul class="wiki-hits">
      {hits.map((h) => (
        <li>
          <button onClick={() => onOpen(h.title)}>
            <span class="hit-title">{h.title}</span>
            <span class="hit-snippet" dangerouslySetInnerHTML={{ __html: h.snippet }} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Wiki({ gameName, match }: { gameName: string; match: WikiMatch | null }) {
  const [stack, setStack] = useState<View[]>([]);
  const [q, setQ] = useState('');
  const top = useRef<HTMLDivElement>(null);
  const wiki = match?.kind === 'independent' ? match.wiki : null;

  useEffect(() => {
    setStack(wiki ? [{ kind: 'article', title: wiki.main.replace(/_/g, ' ') }] : []);
    setQ('');
  }, [wiki?.id]);

  if (!match) {
    return <div class="pending">{[0, 1, 2].map(() => <div class="skel" style={{ height: '14px' }} />)}</div>;
  }
  if (match.kind === 'fandom') return <FandomWarning gameName={gameName} url={match.searchUrl} />;

  const w = match.wiki;
  const view = stack[stack.length - 1];
  const push = (v: View) => {
    setStack((s) => [...s, v]);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div class="wiki-panel" ref={top}>
      <div class="wiki-bar">
        <span class="wiki-name">
          {w.name}
          {w.official && <span class="pill pill-good">Official</span>}
        </span>
        <a class="wiki-open" href={w.base} target="_blank" rel="noopener">Open site ↗</a>
      </div>
      {!match.exact && <p class="panel-note">Closest match for {gameName}. It may cover a related game.</p>}
      <form
        class="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const t = q.trim();
          if (t) push({ kind: 'search', q: t });
        }}
      >
        <IconSearch class="ic" />
        <label class="sr-only" for="wiki-q">Search {w.name}</label>
        <input id="wiki-q" type="search" enterkeyhint="search" placeholder={`Search ${w.name}`} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </form>
      {stack.length > 1 && (
        <button class="wiki-back" onClick={() => setStack((s) => s.slice(0, -1))}>
          ← Back
        </button>
      )}
      {view?.kind === 'article' && <Article key={view.title} wiki={w} title={view.title} onNavigate={(t) => push({ kind: 'article', title: t })} />}
      {view?.kind === 'search' && <SearchResults wiki={w} q={view.q} onOpen={(t) => push({ kind: 'article', title: t })} />}
    </div>
  );
}
