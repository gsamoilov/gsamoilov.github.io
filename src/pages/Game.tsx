import { useEffect, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { findFeatured } from '../data/featured';
import { steamArt, steamStoreUrl } from '../platform/steam';
import { getGame, getMyStats, getNews } from '../platform/steamClient';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { formatCount, formatPlaytime, useAsync } from '../lib/useAsync';
import { Poster } from '../components/Poster';
import { IconBook, IconClock, IconNews, IconNote, IconPlay, IconTrophy } from '../components/Icons';
import { Wiki, useWikiMatch } from '../components/game/Wiki';
import { Achievements } from '../components/game/Achievements';
import { Notes } from '../components/game/Notes';
import { News } from '../components/game/News';
import { NotFound } from './NotFound';

type Tab = 'wiki' | 'achievements' | 'notes' | 'news';
const TABS: { id: Tab; label: string; Icon: (p: { class?: string }) => preact.JSX.Element }[] = [
  { id: 'wiki', label: 'Wiki', Icon: IconBook },
  { id: 'achievements', label: 'Missed', Icon: IconTrophy },
  { id: 'notes', label: 'Notes', Icon: IconNote },
  { id: 'news', label: 'Patches', Icon: IconNews },
];

function PlayingToggle({ appid, name, userId }: { appid: number; name: string; userId: string | null }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOn(null);
    if (!userId || !supabase) return;
    supabase
      .from('playing')
      .select('game_id')
      .eq('platform', 'steam')
      .eq('game_id', String(appid))
      .maybeSingle()
      .then(({ data }) => setOn(!!data));
  }, [appid, userId]);

  if (!userId) {
    return (
      <button class="btn btn-ghost btn-sm" aria-disabled="true" title="Sign in to mark games as Playing">
        <IconPlay class="ic" /> Mark as Playing
      </button>
    );
  }
  const toggle = async () => {
    if (!supabase || busy || on === null) return;
    setBusy(true);
    const next = !on;
    setOn(next); // optimistic
    const { error } = next
      ? await supabase.from('playing').insert({ user_id: userId, platform: 'steam', game_id: String(appid), game_name: name })
      : await supabase.from('playing').delete().eq('platform', 'steam').eq('game_id', String(appid));
    if (error && !(next && error.code === '23505')) setOn(!next);
    setBusy(false);
  };
  return (
    <button class="btn btn-ghost btn-sm" aria-pressed={!!on} onClick={toggle} disabled={on === null}>
      <IconPlay class="ic" /> {on ? 'Playing' : 'Mark as Playing'}
    </button>
  );
}

export function Game() {
  const { params } = useRoute();
  const appid = Number(params.appid);
  const valid = Number.isInteger(appid) && appid > 0;
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [tab, setTab] = useState<Tab>('wiki');
  const [heroOk, setHeroOk] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);
  useEffect(() => {
    setHeroOk(false);
    setHeroFailed(false);
  }, [appid]);

  const game = useAsync(valid ? () => getGame(appid) : null, [appid]);
  const news = useAsync(valid ? () => getNews(appid) : null, [appid]);
  const me = useAsync(valid && userId ? () => getMyStats(appid, userId) : null, [appid, userId]);

  const known = findFeatured(appid);
  const name = game.status === 'ok' ? game.data.name : known?.name ?? null;
  const match = useWikiMatch(name, appid);

  useEffect(() => {
    document.title = name ? `${name} · samoilov.org` : 'samoilov.org';
  }, [name]);

  if (!valid) return <NotFound />;
  if (game.status === 'error' && /not a steam game/i.test(game.error)) return <NotFound />;

  const art = steamArt(appid);
  const show = (t: Tab) => (tab === t ? 'panel is-active' : 'panel');
  const players = game.status === 'ok' ? game.data.players : null;
  const stats = me.status === 'ok' ? me.data : null;
  const pct = stats && stats.achievementsTotal ? Math.round((stats.achievementsEarned / stats.achievementsTotal) * 100) : null;
  const dash = <span class="muted">—</span>;

  return (
    <>
      <section class="game-hero">
        <div class="game-hero-art" aria-hidden="true">
          {!heroFailed ? (
            <img src={art.hero} alt="" class={heroOk ? 'loaded' : ''} onLoad={() => setHeroOk(true)} onError={() => setHeroFailed(true)} />
          ) : (
            game.status === 'ok' && game.data.background && <img src={game.data.background} alt="" class="loaded" />
          )}
        </div>
        <div class="wrap game-head">
          <div class="game-cover">
            <Poster key={appid} appid={appid} name={name ?? ''} tint={known?.tint} caption={false} eager />
          </div>
          <div class="game-meta">
            <p class="eyebrow">Steam{game.status === 'ok' && game.data.developers[0] ? ` · ${game.data.developers[0]}` : ''}</p>
            <h1>{name ?? <span class="skel" style={{ display: 'inline-block', width: '8ch', height: '1em' }} />}</h1>
            <div class="stat-row">
              <div class="stat" title="Players in-game right now (Steam)">
                <b><span class="dot live" /> {players !== null ? formatCount(players) : dash}</b>
                <span>playing now</span>
              </div>
              <div class="stat" title={stats && !stats.profileVisible ? 'Your Steam game details are private' : 'Your total playtime'}>
                <b><IconClock class="ic" /> {stats?.owned ? formatPlaytime(stats.playtimeMinutes) : dash}</b>
                <span>{userId ? (stats && !stats.owned && stats.profileVisible ? 'not in library' : 'your playtime') : 'sign in'}</span>
              </div>
              <div class="stat" title={stats ? `${stats.achievementsEarned} of ${stats.achievementsTotal} achievements` : ''}>
                <b><IconTrophy class="ic" /> {pct !== null ? `${pct}%` : dash}</b>
                <span>complete</span>
              </div>
            </div>
            <div class="game-actions">
              <PlayingToggle appid={appid} name={name ?? ''} userId={userId} />
              <a class="btn btn-ghost btn-sm" href={steamStoreUrl(appid)} target="_blank" rel="noopener">Store page</a>
            </div>
          </div>
        </div>
      </section>

      <div class="game-tabs" role="tablist" aria-label="Game sections">
        {TABS.map(({ id, label, Icon }) => (
          <button
            role="tab"
            aria-selected={tab === id}
            onClick={(e) => {
              setTab(id);
              // if we've scrolled into a long panel, jump back to the top of the panels
              const bar = (e.currentTarget as HTMLElement).parentElement!;
              const grid = bar.nextElementSibling as HTMLElement;
              const navH = bar.getBoundingClientRect().height + 60;
              if (grid.getBoundingClientRect().top < navH) window.scrollTo({ top: window.scrollY + grid.getBoundingClientRect().top - navH - 8 });
            }}
          >
            <Icon class="ic" />
            {label}
          </button>
        ))}
      </div>

      <div class="wrap game-grid">
        <aside class={show('achievements')} aria-label="Missed achievements">
          <div class="panel-head"><IconTrophy class="ic" /><h2>Missed achievements</h2></div>
          <Achievements signedIn={!!userId} me={me} />
        </aside>

        <section class={`${show('wiki')} wiki`} aria-label="Wiki">
          <div class="panel-head"><IconBook class="ic" /><h2>Wiki</h2></div>
          {name ? <Wiki gameName={name} match={match} /> : game.status === 'error' ? <p class="panel-empty muted">{game.error}</p> : <div class="pending"><div class="skel" style={{ height: '44px' }} /></div>}
        </section>

        <aside class={show('notes')} aria-label="Where I left off">
          <div class="panel-head"><IconNote class="ic" /><h2>Where I left off</h2></div>
          <Notes appid={appid} userId={userId} />
        </aside>

        <section class={`${show('news')} news`} aria-label="Patch notes">
          <div class="panel-head"><IconNews class="ic" /><h2>Latest patch notes</h2></div>
          <News news={news} />
        </section>
      </div>
    </>
  );
}
