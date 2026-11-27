import { useMemo, useState } from 'preact/hooks';
import { FEATURED } from '../data/featured';
import { steamArt } from '../platform/steam';
import { Poster } from '../components/Poster';
import { SteamButton } from '../components/SteamButton';
import { GameSearch } from '../components/GameSearch';
import { IconArrow, IconBook, IconNote, IconTrophy, IconNews } from '../components/Icons';

const FEATURES = [
  { Icon: IconBook, title: 'The real wiki', body: 'The independent wiki for your game, shown in a clean panel here. No Fandom ads, no autoplay videos.' },
  { Icon: IconTrophy, title: 'Missed achievements', body: 'Only the ones you still need. Hidden achievements stay blurred until you tap them.' },
  { Icon: IconNote, title: 'Where I left off', body: 'Private notes for each game that save as you type, so you know what you were doing next time.' },
  { Icon: IconNews, title: 'Patch notes', body: 'The latest updates for your game, without a trip to the store page.' },
];

export function Home() {
  // pick a backdrop once per visit
  const hero = useMemo(() => FEATURED[Math.floor(Math.random() * 8)], []);
  const [heroOk, setHeroOk] = useState(false);

  return (
    <>
      <section class="hero">
        <div class="hero-art" aria-hidden="true">
          <img
            src={steamArt(hero.appid).hero}
            alt=""
            class={heroOk ? 'loaded' : ''}
            onLoad={() => setHeroOk(true)}
            fetchpriority="high"
          />
        </div>
        <div class="wrap hero-inner">
          <p class="eyebrow">A companion for the game you're playing</p>
          <h1>
            Your game,
            <br />
            <span class="grad">one tap away.</span>
          </h1>
          <p class="lede">
            Open samoilov.org next to your PC and go straight to your game: its wiki, the achievements you've missed, your
            notes and the latest patch notes. No ads.
          </p>
          <div class="hero-cta">
            <SteamButton />
            <a class="btn btn-ghost" href="#popular">
              Browse games <IconArrow class="ic" />
            </a>
          </div>
          <GameSearch />
          {heroOk && <p class="hero-credit">Backdrop: {hero.name}</p>}
        </div>
      </section>

      <div class="wrap">
        {/* "Now playing" quick-link strip appears here once signed in (Phase 4) */}

        <section class="section" id="popular">
          <div class="section-head">
            <h2>Popular on Steam</h2>
            <span class="eyebrow">Tap a cover</span>
          </div>
          <div class="poster-row">
            {FEATURED.slice(0, 10).map((g, i) => (
              <Poster appid={g.appid} name={g.name} tint={g.tint} href={`/game/${g.appid}`} eager={i < 4} />
            ))}
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <h2>What you get on every game</h2>
          </div>
          <div class="features">
            {FEATURES.map(({ Icon, title, body }) => (
              <div class="feature card">
                <span class="feature-ic"><Icon /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <h2>More games</h2>
          </div>
          <div class="poster-grid">
            {FEATURED.slice(10).map((g) => (
              <Poster appid={g.appid} name={g.name} tint={g.tint} href={`/game/${g.appid}`} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
