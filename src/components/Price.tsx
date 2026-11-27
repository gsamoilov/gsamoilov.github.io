import { useState } from 'preact/hooks';
import { useAsync } from '../lib/useAsync';
import { getPrices, type PriceInfo } from '../platform/steamClient';
import { setWatched, useWatchlist } from '../lib/watchlist';
import { IconTag } from './Icons';

export const usd = (n: number) => (n === 0 ? 'Free' : `$${n.toFixed(2)}`);

export function PriceSummary({ p }: { p: PriceInfo }) {
  if (!p?.best) return <span class="muted">No current deals tracked</span>;
  return (
    <>
      <a class="price-best" href={p.best.url} target="_blank" rel="noopener sponsored">
        <b>{usd(p.best.price)}</b> at {p.best.store}
        {p.best.savings > 0 && <span class="price-cut">-{p.best.savings}%</span>}
      </a>
      {p.lowestEver && <span class="muted"> · lowest ever {usd(p.lowestEver.price)}</span>}
    </>
  );
}

/** Game page: best current price + Watch toggle. */
export function PriceLine({ appid, name, userId }: { appid: number; name: string; userId: string | null }) {
  const price = useAsync(() => getPrices([appid]).then((r) => r?.[0] ?? null), [appid]);
  const watch = useWatchlist();
  const [busy, setBusy] = useState(false);
  const watched = watch.isWatched(appid);
  return (
    <div class="price-line">
      <IconTag class="ic" />
      {price.status === 'ok' ? (
        <span>{price.data ? <PriceSummary p={price.data} /> : <span class="muted">No price info</span>}</span>
      ) : price.status === 'error' ? (
        <span class="muted">Prices unavailable</span>
      ) : (
        <span class="skel" style={{ width: '14ch', height: '1em' }} />
      )}
      {userId && (
        <button
          class="btn btn-ghost btn-sm"
          aria-pressed={watched}
          disabled={watch.status !== 'ok' || busy}
          onClick={async () => {
            setBusy(true);
            await setWatched(userId, appid, name, !watched);
            setBusy(false);
          }}
        >
          {watched ? 'Watching price' : 'Watch price'}
        </button>
      )}
    </div>
  );
}

/** Profile: watched games with their current deals. */
export function PriceWatch({ userId }: { userId: string }) {
  const watch = useWatchlist();
  const ids = watch.games.map((g) => Number(g.game_id));
  const prices = useAsync(ids.length ? () => getPrices(ids) : null, [ids.join(',')]);
  if (watch.status !== 'ok') {
    return (
      <div class="pending">
        <div class="skel" style={{ height: '48px' }} />
      </div>
    );
  }
  if (!ids.length) {
    return <p class="panel-empty muted">Not watching any games yet. Tap “Watch price” on a game page to add it here.</p>;
  }
  const byId = new Map(prices.status === 'ok' ? prices.data.map((p) => [p.appid, p]) : []);
  return (
    <ul class="watch-list">
      {watch.games.map((g) => {
        const p = byId.get(Number(g.game_id));
        const nearLow = !!(p?.best && p.lowestEver && p.best.price <= p.lowestEver.price * 1.05);
        return (
          <li class={nearLow ? 'is-low' : ''}>
            <a class="watch-name" href={`/game/${g.game_id}`}>
              {g.game_name || p?.title || g.game_id}
            </a>
            <span class="watch-price">
              {p ? (
                <PriceSummary p={p} />
              ) : prices.status === 'loading' ? (
                <span class="skel" style={{ width: '12ch', height: '1em', display: 'inline-block' }} />
              ) : (
                <span class="muted">—</span>
              )}
              {nearLow && <span class="pill pill-good">At or near lowest ever</span>}
            </span>
            <button
              class="watch-remove"
              aria-label={`Stop watching ${g.game_name}`}
              title="Stop watching"
              onClick={() => setWatched(userId, Number(g.game_id), g.game_name, false)}
            >
              ✕
            </button>
          </li>
        );
      })}
    </ul>
  );
}
