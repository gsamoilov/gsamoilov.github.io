import { useEffect } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { GameSearch } from '../components/GameSearch';
import { Poster } from '../components/Poster';
import { getCharts, getIgdbGame, hitHref, searchGames, type ChartEntry } from '../platform/steamClient';
import { formatCount, useAsync } from '../lib/useAsync';
import { useAuth } from '../lib/auth';
import { setPlayingGame, usePlaying } from '../lib/playing';
import { Wiki, useWikiMatch } from '../components/game/Wiki';
import { Notes } from '../components/game/Notes';
import { IconBook, IconNote, IconPlay } from '../components/Icons';
import { NotFound } from './NotFound';

/** /search?q=… — full results from every platform. */
export function SearchPage() {
  const { query } = useLocation();
  const q = (query.q ?? '').trim();
  const res = useAsync(q.length >= 2 ? () => searchGames(q) : null, [q]);
  useEffect(() => void (document.title = q ? `${q} · search · samoilov.org` : 'Search · samoilov.org'), [q]);
  return (
    <div class="wrap browse-page">
      <h1 class="page-title">Search</h1>
      <GameSearch key={q} initial={q} />
      {res.status === 'loading' && <div class="poster-grid">{[0, 1, 2, 3, 4, 5].map(() => <div class="poster skel" />)}</div>}
      {res.status === 'error' && <p class="muted">{res.error}</p>}
      {res.status === 'ok' && (
        res.data.length ? (
          <>
            <p class="muted small">{res.data.length} games for “{q}”, across all platforms</p>
            <div class="poster-grid">
              {res.data.map((h) => (
                <div class="hit-card">
                  <Poster appid={h.appid ?? 0} src={h.cover || (h.appid ? undefined : '')} name={h.name} href={hitHref(h)} />
                  <span class="hit-meta">{[h.year, h.platforms.slice(0, 3).join(' · ')].filter(Boolean).join(' — ')}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p class="muted">No games match “{q}”.</p>
        )
      )}
    </div>
  );
}

function ChartBadge({ e, kind }: { e: ChartEntry; kind: 'popular' | 'trending' }) {
  if (kind === 'trending') return <span class="pill pill-good">{e.change === null ? 'NEW' : `▲ ${e.change}`}</span>;
  return <span class="pill">#{e.rank}</span>;
}

/** /trending and /popular — Steam's weekly most-played chart, two views. */
export function ChartPage({ kind }: { kind: 'popular' | 'trending' }) {
  const chart = useAsync(() => getCharts(kind), [kind]);
  const title = kind === 'trending' ? 'Trending on Steam' : 'Popular on Steam';
  useEffect(() => void (document.title = `${title} · samoilov.org`), [title]);
  return (
    <div class="wrap browse-page">
      <h1 class="page-title">{title}</h1>
      <p class="muted small">
        {kind === 'trending'
          ? 'Games climbing Steam’s weekly most-played chart, or new on it this week. Biggest jumps first.'
          : 'Steam’s most-played games this week, by peak players.'}
      </p>
      {chart.status === 'loading' && <div class="poster-grid">{Array.from({ length: 12 }, () => <div class="poster skel" />)}</div>}
      {chart.status === 'error' && <p class="muted">{chart.error}</p>}
      {chart.status === 'ok' && (
        <div class="poster-grid">
          {chart.data.map((e) => (
            <div class="hit-card">
              <Poster appid={e.appid} name={e.name || `Steam app ${e.appid}`} href={`/game/${e.appid}`} badge={<ChartBadge e={e} kind={kind} />} />
              <span class="hit-meta">{formatCount(e.peak)} peak players</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Home page row: first few of a chart, with "See all". */
export function ChartRow({ kind, count = 10 }: { kind: 'popular' | 'trending'; count?: number }) {
  const chart = useAsync(() => getCharts(kind), [kind]);
  if (chart.status === 'error') return null;
  return (
    <section class="section">
      <div class="section-head">
        <h2>{kind === 'trending' ? 'Trending on Steam' : 'Popular on Steam'}</h2>
        <a class="eyebrow" href={`/${kind}`}>See all →</a>
      </div>
      <div class="poster-row">
        {chart.status === 'ok'
          ? chart.data.slice(0, count).map((e, i) => (
              <Poster appid={e.appid} name={e.name || `Steam app ${e.appid}`} href={`/game/${e.appid}`} eager={i < 4} badge={<ChartBadge e={e} kind={kind} />} />
            ))
          : Array.from({ length: 6 }, () => <div class="poster skel" />)}
      </div>
    </section>
  );
}

/** /g/:id — a game from any platform (IGDB). Steam games redirect to their full page. */
export function IgdbGamePage() {
  const { params } = useRoute();
  const { route } = useLocation();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const g = useAsync(valid ? () => getIgdbGame(id) : null, [id]);
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const playing = usePlaying();
  const name = g.status === 'ok' ? g.data.name : null;
  const match = useWikiMatch(name, 0);

  useEffect(() => {
    if (g.status === 'ok' && g.data.appid) route(`/game/${g.data.appid}`, true);
    if (name) document.title = `${name} · samoilov.org`;
  }, [g.status, name]);

  if (!valid) return <NotFound />;
  if (g.status === 'error') return <div class="wrap empty-page"><p class="muted">{g.error}</p></div>;
  if (g.status !== 'ok' || g.data.appid) return <div class="wrap empty-page"><div class="spinner" aria-hidden="true" /></div>;
  const d = g.data;
  const on = playing.isPlayingGame('igdb', String(id));

  return (
    <>
      <section class="game-hero">
        <div class="game-hero-art" aria-hidden="true" />
        <div class="wrap game-head">
          <div class="game-cover"><Poster appid={0} src={d.cover} name={d.name} caption={false} eager /></div>
          <div class="game-meta">
            <p class="eyebrow">{[d.platforms.slice(0, 5).join(' · '), d.year].filter(Boolean).join(' — ')}</p>
            <h1>{d.name}</h1>
            {d.developers.length > 0 && <p class="muted small">by {d.developers.slice(0, 2).join(', ')}</p>}
            <div class="game-actions">
              {userId ? (
                <button
                  class="btn btn-ghost btn-sm"
                  aria-pressed={on}
                  disabled={playing.status !== 'ok'}
                  onClick={() => setPlayingGame(userId, { platform: 'igdb', id: String(id), name: d.name, cover: d.cover }, !on)}
                >
                  <IconPlay class="ic" /> {on ? 'Playing' : 'Mark as Playing'}
                </button>
              ) : (
                <button class="btn btn-ghost btn-sm" aria-disabled="true" title="Sign in to mark games as Playing"><IconPlay class="ic" /> Mark as Playing</button>
              )}
            </div>
          </div>
        </div>
      </section>
      <div class="wrap igdb-grid">
        <section class="panel is-active wiki" aria-label="Wiki">
          <div class="panel-head"><IconBook class="ic" /><h2>Wiki</h2></div>
          <Wiki gameName={d.name} match={match} />
        </section>
        <aside class="igdb-side">
          {d.summary && (
            <div class="panel is-active">
              <div class="panel-head"><h2>About</h2></div>
              <p class="rich">{d.summary}</p>
              {d.genres.length > 0 && <p class="muted small">{d.genres.join(' · ')}</p>}
            </div>
          )}
          <div class="panel is-active" aria-label="Where I left off">
            <div class="panel-head"><IconNote class="ic" /><h2>Where I left off</h2></div>
            <Notes appid={id} platform="igdb" userId={userId} />
          </div>
          <p class="muted small">
            This game isn't on Steam, so there are no Steam stats here. PlayStation and Xbox progress will show here once you link those accounts.
          </p>
        </aside>
      </div>
    </>
  );
}
