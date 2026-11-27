import { SteamButton } from '../components/SteamButton';
import { IconPlay, IconUser } from '../components/Icons';

export function Playing() {
  return (
    <div class="wrap empty-page">
      <span class="empty-ic"><IconPlay /></span>
      <h1>Nothing marked as Playing</h1>
      <p class="muted">Sign in, open a game and tap “Mark as Playing”. After that, samoilov.org takes you straight to it.</p>
      <SteamButton />
    </div>
  );
}

export function Profile() {
  return (
    <div class="wrap empty-page">
      <span class="empty-ic"><IconUser /></span>
      <h1>Your profile</h1>
      <p class="muted">Total playtime, completion, your rarest achievements, friends online and price alerts. Sign in through Steam to see them.</p>
      <SteamButton />
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
