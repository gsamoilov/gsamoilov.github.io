import { useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { findFeatured } from '../data/featured';
import { steamArt, steamStoreUrl } from '../platform/steam';
import { Poster } from '../components/Poster';
import { IconBook, IconClock, IconNews, IconNote, IconPlay, IconSearch, IconTrophy, IconUsers } from '../components/Icons';
import { NotFound } from './NotFound';

type Tab = 'wiki' | 'achievements' | 'notes' | 'news';
const TABS: { id: Tab; label: string; Icon: (p: { class?: string }) => preact.JSX.Element }[] = [
  { id: 'wiki', label: 'Wiki', Icon: IconBook },
  { id: 'achievements', label: 'Missed', Icon: IconTrophy },
  { id: 'notes', label: 'Notes', Icon: IconNote },
  { id: 'news', label: 'Patches', Icon: IconNews },
];

function Pending({ title, phase, lines = 4 }: { title: string; phase: number; lines?: number }) {
  return (
    <div class="pending">
      {Array.from({ length: lines }, (_, i) => (
        <div class="skel" style={{ height: '12px', width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
      <p class="muted">
        {title}: <span class="pill">coming in phase {phase}</span>
      </p>
    </div>
  );
}

export function Game() {
  const { params } = useRoute();
  const appid = Number(params.appid);
  const [tab, setTab] = useState<Tab>('wiki');
  const [heroOk, setHeroOk] = useState(false);
  if (!Number.isInteger(appid) || appid <= 0) return <NotFound />;

  const known = findFeatured(appid);
  const name = known?.name ?? `Steam app ${appid}`;
  const art = steamArt(appid);
  const show = (t: Tab) => (tab === t ? 'panel is-active' : 'panel');

  return (
    <>
      <section class="game-hero">
        <div class="game-hero-art" aria-hidden="true">
          <img src={art.hero} alt="" class={heroOk ? 'loaded' : ''} onLoad={() => setHeroOk(true)} />
        </div>
        <div class="wrap game-head">
          <div class="game-cover">
            <Poster appid={appid} name={name} tint={known?.tint} caption={false} eager />
          </div>
          <div class="game-meta">
            <p class="eyebrow">Steam</p>
            <h1>{name}</h1>
            <div class="stat-row">
              <div class="stat"><b><span class="dot live" /> —</b><span>playing now</span></div>
              <div class="stat"><b><IconClock class="ic" /> —</b><span>your playtime</span></div>
              <div class="stat"><b><IconTrophy class="ic" /> —</b><span>complete</span></div>
            </div>
            <div class="game-actions">
              <button class="btn btn-ghost btn-sm" aria-pressed="false" aria-disabled="true" title="Sign in to mark games as Playing">
                <IconPlay class="ic" /> Mark as Playing
              </button>
              <a class="btn btn-ghost btn-sm" href={steamStoreUrl(appid)} target="_blank" rel="noopener">Store page</a>
            </div>
          </div>
        </div>
      </section>

      <div class="game-tabs" role="tablist" aria-label="Game sections">
        {TABS.map(({ id, label, Icon }) => (
          <button role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            <Icon class="ic" />
            {label}
          </button>
        ))}
      </div>

      <div class="wrap game-grid">
        <aside class={show('achievements')} aria-label="Missed achievements">
          <div class="panel-head"><IconTrophy class="ic" /><h2>Missed achievements</h2></div>
          <Pending title="Unearned achievements, hidden ones blurred" phase={3} lines={6} />
        </aside>

        <section class={`${show('wiki')} wiki`} aria-label="Wiki">
          <div class="panel-head"><IconBook class="ic" /><h2>Wiki</h2></div>
          <label class="search">
            <IconSearch class="ic" />
            <span class="sr-only">Search the wiki</span>
            <input type="search" placeholder={`Search the ${name} wiki`} disabled />
          </label>
          <Pending title="Independent-wiki articles in this panel" phase={3} lines={9} />
        </section>

        <aside class={show('notes')} aria-label="Where I left off">
          <div class="panel-head"><IconNote class="ic" /><h2>Where I left off</h2></div>
          <textarea class="notes" placeholder="Private notes, saved as you type… (sign in, phase 3)" disabled />
          <div class="panel-sub"><IconUsers class="ic" /> Friends playing now: phase 5</div>
        </aside>

        <section class={`${show('news')} news`} aria-label="Patch notes">
          <div class="panel-head"><IconNews class="ic" /><h2>Latest patch notes</h2></div>
          <Pending title="Steam news and patch notes" phase={3} lines={5} />
        </section>
      </div>
    </>
  );
}
