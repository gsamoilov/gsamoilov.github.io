import { SteamButton } from '../components/SteamButton';
import { IconPlay } from '../components/Icons';
import { useAuth } from '../lib/auth';
import { usePlaying } from '../lib/playing';
import { JumpBackIn, NowPlaying } from '../components/NowPlaying';
import { useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';

export function Playing() {
  const { ready, session } = useAuth();
  const playing = usePlaying();
  const { route } = useLocation();
  const only = playing.status === 'ok' && playing.games.length === 1 ? playing.games[0] : null;

  // exactly one Playing game: go straight to it
  useEffect(() => {
    if (only) route(`/game/${only.game_id}`, true);
  }, [only?.game_id]);

  if (!ready || (session && playing.status !== 'ok' && playing.status !== 'error') || only) {
    return <div class="wrap empty-page"><div class="spinner" aria-hidden="true" /></div>;
  }
  if (session && playing.games.length > 1) {
    return (
      <div class="wrap playing-page">
        <NowPlaying />
        <JumpBackIn />
      </div>
    );
  }
  return (
    <div class="wrap playing-page">
      <div class="empty-page">
        <span class="empty-ic"><IconPlay /></span>
        <h1>Nothing marked as Playing</h1>
        <p class="muted">
          {session
            ? 'Tap “Playing” on a game below, or on any game page. It then shows up at the top of your home page.'
            : 'Sign in, open a game and tap “Mark as Playing”. It will show up at the top of your home page.'}
        </p>
        {session ? <a class="btn btn-ghost" href="/#popular">Browse games</a> : <SteamButton />}
      </div>
      <JumpBackIn />
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
        <li>
          Which wiki belongs to which game comes from{' '}
          <a href="https://github.com/KevinPayravi/indie-wiki-buddy" target="_blank" rel="noopener">Indie Wiki Buddy</a> by Kevin Payravi
          (MIT License), the community list of independent wikis. Thank you!
        </li>
        <li>
          Prices come from <a href="https://www.cheapshark.com" target="_blank" rel="noopener">CheapShark</a> (in US dollars).
          Deal links go through CheapShark.
        </li>
        <li>Wiki articles belong to their wikis and editors. Each article shows its source and license (usually CC BY-SA) underneath.</li>
      </ul>
    </div>
  );
}
