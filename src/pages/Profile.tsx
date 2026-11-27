import { useState } from 'preact/hooks';
import { SteamButton } from '../components/SteamButton';
import { IconClock, IconTag, IconTrophy, IconUser, IconUsers } from '../components/Icons';
import { FriendsPlaying } from '../components/Friends';
import { PriceWatch } from '../components/Price';
import { signOut, useAuth } from '../lib/auth';
import { useAsync, formatPlaytime, timeAgo } from '../lib/useAsync';
import { getProfileStats, type ProfileStats } from '../platform/steamClient';
import { drawStatsCard, shareOrDownload } from '../lib/shareCard';

function StatsCard({ userId, name, avatar }: { userId: string; name: string; avatar: string }) {
  const [refreshTick, setRefreshTick] = useState(0);
  const stats = useAsync<ProfileStats>(() => getProfileStats(userId, refreshTick > 0), [userId, refreshTick]);
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  if (stats.status === 'loading' || stats.status === 'idle') {
    return (
      <div class="stats-card card">
        <p class="muted small">Crunching your Steam stats… (the first time takes a few seconds)</p>
        <div class="stats-grid">{[0, 1, 2, 3].map(() => <div class="skel" style={{ height: '84px' }} />)}</div>
      </div>
    );
  }
  if (stats.status === 'error') return <div class="stats-card card"><p class="muted">{stats.error}</p></div>;
  const s = stats.data;
  if (s.state === 'private') {
    return (
      <div class="stats-card card">
        <p>Steam won't share your games because your <b>Game details</b> are private.</p>
        <a class="btn btn-ghost btn-sm" href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener">Open Steam privacy settings</a>
      </div>
    );
  }

  const share = async () => {
    setShareState('busy');
    try {
      await shareOrDownload(await drawStatsCard(s, name, avatar));
      setShareState('done');
    } catch {
      setShareState('error');
    }
  };

  return (
    <div class="stats-card card">
      <div class="stats-grid">
        <div class="big-stat"><b class="grad">{formatPlaytime(s.totalMinutes)}</b><span><IconClock class="ic" /> total playtime</span></div>
        <div class="big-stat"><b>{s.avgCompletion !== null ? `${Math.round(s.avgCompletion)}%` : '—'}</b><span><IconTrophy class="ic" /> avg completion</span></div>
        <div class="big-stat"><b>{s.achievementsEarned.toLocaleString()}</b><span>achievements</span></div>
        <div class="big-stat"><b>{s.perfectGames}</b><span>perfect games</span></div>
      </div>

      {s.rarest.length > 0 && (
        <>
          <h3 class="sub-head">Rarest achievements</h3>
          <ul class="rare-list">
            {s.rarest.map((r) => (
              <li>
                {r.icon ? <img src={r.icon} alt="" width={40} height={40} loading="lazy" /> : <span class="ach-icon" />}
                <span class="rare-text">
                  <span class="rare-name">{r.name}</span>
                  <a class="rare-game" href={`/game/${r.appid}`}>{r.game}</a>
                </span>
                <span class="ach-pct rare">{r.percent < 1 ? r.percent.toFixed(1) : Math.round(r.percent)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {s.topGames.length > 0 && (
        <>
          <h3 class="sub-head">Most played</h3>
          <ol class="top-games">
            {s.topGames.map((g) => (
              <li><a href={`/game/${g.appid}`}>{g.name}</a><span class="muted">{formatPlaytime(g.minutes)}</span></li>
            ))}
          </ol>
        </>
      )}

      <p class="muted small">
        {s.gamesPlayed} of {s.gamesOwned} owned games played. Completion and rarity use your {s.sampledGames} most-played games with
        achievements. Updated {timeAgo(new Date(s.generatedAt).getTime() / 1000)}. Family Library games aren't included.
      </p>
      <div class="profile-actions">
        <button class="btn btn-primary btn-sm" onClick={share} disabled={shareState === 'busy'}>
          {shareState === 'busy' ? 'Making image…' : 'Share stats card'}
        </button>
        <button class="btn btn-ghost btn-sm" onClick={() => setRefreshTick((n) => n + 1)}>Refresh</button>
        {shareState === 'error' && <span class="muted small">Couldn't create the image.</span>}
      </div>
    </div>
  );
}

export function Profile() {
  const { ready, session, profile } = useAuth();
  if (!ready) return <div class="wrap empty-page"><div class="spinner" aria-hidden="true" /></div>;
  if (!session) {
    return (
      <div class="wrap empty-page">
        <span class="empty-ic"><IconUser /></span>
        <h1>Your profile</h1>
        <p class="muted">Total playtime, completion, your rarest achievements, friends online and price alerts. Sign in through Steam to see them.</p>
        <SteamButton />
      </div>
    );
  }
  const userId = session.user.id;
  const name = profile?.persona_name || 'Steam user';
  return (
    <div class="wrap profile-page">
      <div class="profile-card card">
        {profile?.avatar_url ? <img class="avatar avatar-lg" src={profile.avatar_url} alt="" width={96} height={96} /> : <span class="avatar avatar-lg" />}
        <div class="profile-id">
          <p class="eyebrow">Signed in through Steam</p>
          <h1>{name}</h1>
          <div class="stat-row-inline">
            <span class="pill">SteamID {profile?.steamid ?? '…'}</span>
            {profile && (
              <span class={`pill ${profile.public_profile ? 'pill-good' : 'pill-warn'}`}>
                {profile.public_profile ? 'Public profile' : 'Private profile'}
              </span>
            )}
          </div>
        </div>
        <div class="profile-actions">
          {profile?.profile_url && <a class="btn btn-ghost btn-sm" href={profile.profile_url} target="_blank" rel="noopener">Steam profile</a>}
          <button class="btn btn-ghost btn-sm" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>

      <section class="profile-section">
        <h2 class="section-title"><IconTrophy class="ic" /> Stats</h2>
        <StatsCard userId={userId} name={name} avatar={profile?.avatar_url ?? ''} />
      </section>

      <section class="profile-section">
        <h2 class="section-title"><IconUsers class="ic" /> Friends playing now</h2>
        <div class="card pad"><FriendsPlaying userId={userId} /></div>
      </section>

      <section class="profile-section">
        <h2 class="section-title"><IconTag class="ic" /> Price watch</h2>
        <div class="card pad">
          <PriceWatch userId={userId} />
          <p class="muted small">Prices in US dollars from <a href="https://www.cheapshark.com" target="_blank" rel="noopener">CheapShark</a>, checked hourly.</p>
        </div>
      </section>
    </div>
  );
}
