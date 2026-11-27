import { useEffect, useState } from 'preact/hooks';
import { searchGames, type SearchHit } from '../platform/steamClient';
import { authEnabled } from '../config';
import { IconSearch } from './Icons';

const capsule = (appid: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/capsule_184x69.jpg`;

/** Steam store search -> jump straight to a game's page. */
export function GameSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    <div class="game-search">
      <form class="search search-lg" role="search" onSubmit={(e) => e.preventDefault()}>
        <IconSearch class="ic" />
        <label class="sr-only" for="game-q">Find a game</label>
        <input id="game-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Find your game…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </form>
      {(hits || err) && (
        <ul class="search-hits" aria-live="polite">
          {err && <li class="muted">{err}</li>}
          {hits?.length === 0 && <li class="muted">No Steam games match “{q.trim()}”.</li>}
          {hits?.map((h) => (
            <li>
              <a href={`/game/${h.appid}`}>
                <img src={capsule(h.appid)} alt="" width={92} height={35} loading="lazy" />
                <span>{h.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
