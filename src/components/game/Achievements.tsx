import { useMemo, useState } from 'preact/hooks';
import type { Async } from '../../lib/useAsync';
import type { MyAchievement, MyGameStats } from '../../platform/steamClient';
import { SteamButton } from '../SteamButton';
import { IconEye } from '../Icons';

function Row({ a }: { a: MyAchievement }) {
  const [revealed, setRevealed] = useState(false);
  const pct = a.globalPercent;
  const rarity = pct === undefined ? null : pct < 5 ? 'rare' : pct < 20 ? 'uncommon' : 'common';
  const hiddenView = a.hidden && !revealed;
  return (
    <li class={`ach ${hiddenView ? 'is-hidden' : ''}`}>
      {a.icon ? (
        <img class="ach-icon" src={a.icon} alt="" loading="lazy" width={44} height={44} onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
      ) : (
        <span class="ach-icon" />
      )}
      <div class="ach-body">
        {hiddenView ? (
          <button class="ach-reveal" onClick={() => setRevealed(true)} aria-label="Hidden achievement, spoiler. Tap to reveal.">
            <span class="ach-name">Hidden achievement</span>
            <span class="ach-desc"><IconEye class="ic" /> Spoiler. Tap to reveal</span>
          </button>
        ) : (
          <>
            <span class="ach-name">{a.name}</span>
            <span class="ach-desc">{a.description || (a.hidden ? 'Steam keeps the description of this one secret.' : '')}</span>
          </>
        )}
      </div>
      {pct !== undefined && <span class={`ach-pct ${rarity}`} title={`${pct.toFixed(1)}% of players have this`}>{pct < 1 ? pct.toFixed(1) : Math.round(pct)}%</span>}
    </li>
  );
}

export function Achievements({ signedIn, me }: { signedIn: boolean; me: Async<MyGameStats> }) {
  const missed = useMemo(
    () =>
      me.status === 'ok'
        ? me.data.achievements.filter((a) => !a.achieved).sort((x, y) => (y.globalPercent ?? -1) - (x.globalPercent ?? -1))
        : [],
    [me],
  );

  if (!signedIn) {
    return (
      <div class="panel-empty">
        <p>Sign in to see which achievements you're still missing.</p>
        <SteamButton small />
      </div>
    );
  }
  if (me.status === 'loading' || me.status === 'idle') {
    return <div class="pending">{[0, 1, 2, 3, 4].map(() => <div class="skel" style={{ height: '48px' }} />)}</div>;
  }
  if (me.status === 'error') return <p class="panel-empty muted">{me.error}</p>;

  const d = me.data;
  if (d.achievementsState === 'private') {
    return (
      <div class="panel-empty">
        <p>Steam won't share your achievements because your <b>Game details</b> are private.</p>
        <a class="btn btn-ghost btn-sm" href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener">Open Steam privacy settings</a>
        <p class="muted small">Set “Game details” to Public, then reload this page in a few minutes.</p>
      </div>
    );
  }
  if (d.achievementsState === 'nostats' || d.achievementsTotal === 0) return <p class="panel-empty muted">This game has no Steam achievements.</p>;
  if (missed.length === 0) return <p class="panel-empty">🏆 100%. You've got every achievement.</p>;

  return (
    <>
      <p class="panel-note">
        {missed.length} of {d.achievementsTotal} left · most common first
      </p>
      <ul class="ach-list">
        {missed.map((a) => (
          <Row key={a.id} a={a} />
        ))}
      </ul>
    </>
  );
}
