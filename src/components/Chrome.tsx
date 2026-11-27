import { useLocation } from 'preact-iso';
import { IconHome, IconPlay, IconUser } from './Icons';
import { SteamButton } from './SteamButton';

const NAV = [
  { href: '/', label: 'Home', Icon: IconHome, match: (p: string) => p === '/' },
  { href: '/playing', label: 'Playing', Icon: IconPlay, match: (p: string) => p.startsWith('/game') || p === '/playing' },
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
        <SteamButton small />
      </div>
    </header>
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
