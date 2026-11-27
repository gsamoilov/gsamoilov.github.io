import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { hitHref, searchGames, type SearchHit } from '../platform/steamClient';
import { authEnabled } from '../config';
import { IconSearch } from './Icons';

const steamCapsule = (appid: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/capsule_184x69.jpg`;

export function HitThumb({ h }: { h: SearchHit }) {
  const src = h.cover || (h.appid ? steamCapsule(h.appid) : '');
  return src ? <img class={h.cover ? 'thumb-cover' : 'thumb-capsule'} src={src} alt="" loading="lazy" /> : <span class="thumb-cover thumb-empty" />;
}

export function HitMeta({ h }: { h: SearchHit }) {
  const bits = [h.year, h.platforms.slice(0, 4).join(' · ')].filter(Boolean);
  return bits.length ? <span class="hit-meta">{bits.join(' — ')}</span> : null;
}

/** Search box: live suggestions from every platform; Enter opens the full results page. */
export function GameSearch({ initial = '' }: { initial?: string }) {
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { route } = useLocation();

  useEffect(() => {
    const t = q.trim();
    setErr(null);
    if (t.length < 2) return setHits(null);
    let live = true;
    const timer = setTimeout(() => {
      searchGames(t).then(
        (h) => live && setHits(h),
        (e: Error) => live && setErr(e.message),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  if (!authEnabled()) return null;
  return (
    <div class="game-search" onFocusIn={() => setOpen(true)} onFocusOut={(e) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && setOpen(false)}>
      <form
        class="search search-lg"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const t = q.trim();
          if (t.length >= 2) route(`/search?q=${encodeURIComponent(t)}`);
        }}
      >
        <IconSearch class="ic" />
        <label class="sr-only" for="game-q">Find a game</label>
        <input id="game-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Find any game…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </form>
      {open && (hits || err) && (
        <ul class="search-hits" aria-live="polite">
          {err && <li class="muted">{err}</li>}
          {hits?.length === 0 && <li class="muted">No games match “{q.trim()}”.</li>}
          {hits?.slice(0, 8).map((h) => (
            <li>
              <a href={hitHref(h)}>
                <HitThumb h={h} />
                <span class="hit-text">
                  <span>{h.name}</span>
                  <HitMeta h={h} />
                </span>
              </a>
            </li>
          ))}
          {hits && hits.length > 0 && (
            <li>
              <a class="hit-all" href={`/search?q=${encodeURIComponent(q.trim())}`}>See all results for “{q.trim()}” →</a>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
