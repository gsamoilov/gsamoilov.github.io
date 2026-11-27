import { SteamButton } from '../components/SteamButton';
import { IconPlay, IconUser } from '../components/Icons';
import { signOut, useAuth } from '../lib/auth';

export function Playing() {
  const { session } = useAuth();
  return (
    <div class="wrap empty-page">
      <span class="empty-ic"><IconPlay /></span>
      <h1>Nothing marked as Playing</h1>
      <p class="muted">
        {session
          ? 'Open a game and tap “Mark as Playing”. It will show up at the top of your home page (phase 4).'
          : 'Sign in, open a game and tap “Mark as Playing”. It will show up at the top of your home page.'}
      </p>
      {session ? <a class="btn btn-primary" href="/#popular">Browse games</a> : <SteamButton />}
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
  return (
    <div class="wrap profile-page">
      <div class="profile-card card">
        {profile?.avatar_url ? <img class="avatar avatar-lg" src={profile.avatar_url} alt="" width={96} height={96} /> : <span class="avatar avatar-lg" />}
        <div class="profile-id">
          <p class="eyebrow">Signed in through Steam</p>
          <h1>{profile?.persona_name || 'Steam user'}</h1>
          <div class="stat-row-inline">
            <span class="pill">SteamID {profile?.steamid ?? '…'}</span>
            {profile && (
              <span class={`pill ${profile.public_profile ? 'pill-good' : 'pill-warn'}`}>
                {profile.public_profile ? 'Public profile' : 'Private profile'}
              </span>
            )}
          </div>
          {profile && !profile.public_profile && (
            <p class="muted small">
              Steam only shares playtime, achievements and friends for public profiles. To get the most out of this site, set
              “Game details” to Public in your Steam privacy settings.
            </p>
          )}
        </div>
        <div class="profile-actions">
          {profile?.profile_url && <a class="btn btn-ghost btn-sm" href={profile.profile_url} target="_blank" rel="noopener">Steam profile</a>}
          <button class="btn btn-ghost btn-sm" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
      <p class="muted small center">Stats card, friends playing now and price alerts arrive in phase 5.</p>
    </div>
  );
}

export function About() {
  return (
    <div class="wrap prose">
      <p class="eyebrow">About</p>
      <h1>samoilov.org</h1>
      <p>
        A gaming companion: open it on your phone while you play and you get the wiki, your missed achievements, your notes and
        patch notes for the game you're in. No ads.
      </p>
      <h2>Credits</h2>
      <ul>
        <li>Game data and artwork come from Steam. This site isn't affiliated with or endorsed by Valve. “Steam” is a trademark of Valve Corporation.</li>
      </ul>
    </div>
  );
}
