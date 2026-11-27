import { useEffect, useState } from 'preact/hooks';
import { useAuth } from '../lib/auth';
import { setPlaying, usePlaying, type PlayingGame } from '../lib/playing';
import { formatPlaytime, useAsync } from '../lib/useAsync';
import { getMyStats, getRecent } from '../platform/steamClient';
import { Poster } from './Poster';
import { IconArrow, IconClock, IconPlay, IconTrophy } from './Icons';

const TAB_KEY = 'samoilov:playing-tab';
const capsule = (appid: number | string) => `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/capsule_184x69.jpg`;

function PlayingCard({ g, userId }: { g: PlayingGame; userId: string }) {
  const appid = Number(g.game_id);
  const me = useAsync(() => getMyStats(appid, userId), [appid, userId]);
  const stats = me.status === 'ok' ? me.data : null;
  const pct = stats && stats.achievementsTotal ? Math.round((stats.achievementsEarned / stats.achievementsTotal) * 100) : null;
  return (
    <div class="np-card">
      <a class="np-cover" href={`/game/${appid}`} aria-hidden="true" tabIndex={-1}>
        <Poster key={appid} appid={appid} name={g.game_name} caption={false} eager />
      </a>
      <div class="np-body">
        <h3>{g.game_name || `Steam app ${appid}`}</h3>
        <p class="np-stats">
          <span><IconClock class="ic" /> {stats?.playtimeKnown ? formatPlaytime(stats.playtimeMinutes) : '—'}</span>
          <span><IconTrophy class="ic" /> {pct !== null ? `${pct}%` : '—'}</span>
          {stats && stats.achievementsTotal > stats.achievementsEarned && (
            <span class="muted">{stats.achievementsTotal - stats.achievementsEarned} achievements left</span>
          )}
        </p>
        <div class="np-actions">
          <a class="btn btn-primary" href={`/game/${appid}`}>
            Open companion <IconArrow class="ic" />
          </a>
          <button class="btn btn-ghost btn-sm" onClick={() => setPlaying(userId, appid, g.game_name, false)}>
            Stop playing
          </button>
        </div>
      </div>
    </div>
  );
}

/** Top-of-home section for signed-in users with Playing games. Several games -> tabs. */
export function NowPlaying() {
  const { session } = useAuth();
  const playing = usePlaying();
  const [sel, setSel] = useState<string | null>(() => localStorage.getItem(TAB_KEY));
  const games = playing.games;

  useEffect(() => {
    if (games.length && !games.some((g) => g.game_id === sel)) setSel(games[0].game_id);
  }, [games, sel]);

  if (!session || !games.length) return null;
  const current = games.find((g) => g.game_id === sel) ?? games[0];
  const choose = (id: string) => {
    setSel(id);
    localStorage.setItem(TAB_KEY, id);
  };

  return (
    <section class="now-playing" aria-label="Now playing">
      <div class="np-head">
        <span class="eyebrow"><span class="dot live" /> Now playing</span>
        {games.length > 1 && (
          <div class="np-tabs" role="tablist" aria-label="Your Playing games">
            {games.map((g) => (
              <button role="tab" aria-selected={g.game_id === current.game_id} onClick={() => choose(g.game_id)}>
                {g.game_name || g.game_id}
              </button>
            ))}
          </div>
        )}
      </div>
      <PlayingCard key={current.game_id} g={current} userId={session.user.id} />
    </section>
  );
}

/** Steam's recently played list with one-tap "mark as Playing". */
export function JumpBackIn({ limit = 6 }: { limit?: number }) {
  const { session } = useAuth();
  const playing = usePlaying();
  const userId = session?.user.id ?? null;
  const recent = useAsync(userId ? () => getRecent(userId) : null, [userId]);
  if (!userId || recent.status !== 'ok') return null;
  const list = recent.data.filter((g) => !playing.isPlaying(g.appid)).slice(0, limit);
  if (!list.length) return null;
  return (
    <section class="jump-back" aria-label="Recently played on Steam">
      <div class="section-head">
        <h2>Jump back in</h2>
        <span class="eyebrow">Played on Steam in the last 2 weeks</span>
      </div>
      <ul class="jb-list">
        {list.map((g) => (
          <li>
            <a class="jb-game" href={`/game/${g.appid}`}>
              <img src={capsule(g.appid)} alt="" width={92} height={35} loading="lazy" />
              <span class="jb-text">
                <span class="jb-name">{g.name || `Steam app ${g.appid}`}</span>
                <span class="jb-time">{formatPlaytime(g.minutes2Weeks)} in the last 2 weeks</span>
              </span>
            </a>
            <button
              class="btn btn-ghost btn-sm"
              aria-label={`Mark ${g.name} as Playing`}
              onClick={() => setPlaying(userId, g.appid, g.name, true)}
              disabled={playing.status !== 'ok'}
            >
              <IconPlay class="ic" /> Playing
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
