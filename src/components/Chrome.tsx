import { useLocation } from 'preact-iso';
import { IconFlame, IconHome, IconPlay, IconTrend, IconUser } from './Icons';
import { SteamButton } from './SteamButton';
import { useAuth } from '../lib/auth';

const NAV = [
  { href: '/', label: 'Home', Icon: IconHome, match: (p: string) => p === '/' },
  { href: '/trending', label: 'Trending', Icon: IconTrend, match: (p: string) => p === '/trending' },
  { href: '/popular', label: 'Popular', Icon: IconFlame, match: (p: string) => p === '/popular' },
  { href: '/playing', label: 'Playing', Icon: IconPlay, match: (p: string) => p.startsWith('/game') || p.startsWith('/g/') || p === '/playing' },
  { href: '/profile', label: 'Profile', Icon: IconUser, match: (p: string) => p.startsWith('/profile') },
];

export function TopNav() {
  const { path } = useLocation();
  return (
    <header class="topnav">
      <div class="wrap">
        <a class="brand" href="/">
          <span class="brand-mark">S</span>
          <span>samoilov<small>.org</small></span>
        </a>
        <nav class="links" aria-label="Main">
          {NAV.map((n) => (
            <a href={n.href} aria-current={n.match(path) ? 'page' : undefined}>{n.label}</a>
          ))}
        </nav>
        <div class="spacer" />
        <AccountChip />
      </div>
    </header>
  );
}

function AccountChip() {
  const { ready, session, profile } = useAuth();
  if (!ready) return <span class="avatar skel" aria-hidden="true" />;
  if (!session) return <SteamButton small />;
  const name = profile?.persona_name || 'Profile';
  return (
    <a class="account" href="/profile" aria-label={`${name}: your profile`}>
      {profile?.avatar_url ? <img class="avatar" src={profile.avatar_url} alt="" width={32} height={32} /> : <span class="avatar" />}
      <span class="account-name">{name}</span>
    </a>
  );
}

export function TabBar() {
  const { path } = useLocation();
  return (
    <nav class="tabbar" aria-label="Main">
      {NAV.map(({ href, label, Icon, match }) => (
        <a href={href} aria-current={match(path) ? 'page' : undefined}>
          <Icon />
          {label}
        </a>
      ))}
    </nav>
  );
}

export function Footer() {
  return (
    <footer class="footer">
      <div class="wrap">
        <span>samoilov.org · no ads, no clutter</span>
        <span>
          <a href="/about">About &amp; credits</a> · Not affiliated with Valve. Game data and art © their owners.
        </span>
      </div>
    </footer>
  );
}
