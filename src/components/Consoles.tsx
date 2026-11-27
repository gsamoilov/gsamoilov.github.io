import { useState } from 'preact/hooks';
import { formatPlaytime, useAsync } from '../lib/useAsync';
import {
  findConsoleGame,
  getConsoleAchievements,
  getConsoleLibrary,
  linkStart,
  linkVerify,
  PLATFORM_LABEL,
  reloadLinked,
  unlink,
  useLinked,
  type ConsoleAchievement,
  type ConsoleGame,
  type ConsolePlatform,
} from '../platform/consoles';
import { IconEye } from './Icons';

const HOW_TO_EDIT: Record<ConsolePlatform, string> = {
  psn: 'PlayStation app → your profile → Edit profile → About me (or on the console: Profile → Edit profile).',
  xbox: 'Xbox app or console → your profile → Customize / Edit profile → Bio.',
};
const PRIVACY_HELP: Record<ConsolePlatform, string> = {
  psn: 'On PlayStation: Settings → Privacy → Gaming | Media → set Trophies and Games to “Anyone”.',
  xbox: 'At account.xbox.com/settings → Privacy: set “Others can see your game and app history” and achievements to “Everyone”.',
};

function LinkFlow({ platform, userId }: { platform: ConsolePlatform; userId: string }) {
  const [handle, setHandle] = useState('');
  const [step, setStep] = useState<{ code: string; handle: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = PLATFORM_LABEL[platform];

  const start = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      setStep(await linkStart(platform, handle));
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  };
  const verify = async () => {
    setBusy(true);
    setErr(null);
    try {
      await linkVerify(platform);
      await reloadLinked(userId);
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  };

  if (!step) {
    return (
      <form class="link-form" onSubmit={start}>
        <label class="sr-only" for={`h-${platform}`}>{platform === 'psn' ? 'PSN Online ID' : 'Gamertag'}</label>
        <input id={`h-${platform}`} class="text-input" placeholder={platform === 'psn' ? 'Your PSN Online ID' : 'Your Xbox gamertag'} value={handle} onInput={(e) => setHandle((e.target as HTMLInputElement).value)} autocomplete="off" />
        <button class="btn btn-ghost btn-sm" disabled={busy || handle.trim().length < 1}>{busy ? 'Looking…' : `Link ${label}`}</button>
        {err && <p class="form-err">{err}</p>}
      </form>
    );
  }
  return (
    <div class="link-steps">
      <p>
        To prove <b>{step.handle}</b> is yours, add this code anywhere in your {platform === 'psn' ? 'About me' : 'bio'}:
      </p>
      <p class="link-code" aria-label="Your code">{step.code}</p>
      <p class="muted small">{HOW_TO_EDIT[platform]} Save it, wait a few seconds, then tap Check. You can remove it afterwards.</p>
      <div class="profile-actions">
        <button class="btn btn-primary btn-sm" onClick={verify} disabled={busy}>{busy ? 'Checking…' : 'Check'}</button>
        <button class="btn btn-ghost btn-sm" onClick={() => setStep(null)}>Start over</button>
      </div>
      {err && <p class="form-err">{err}</p>}
    </div>
  );
}

function LibrarySummary({ platform, userId }: { platform: ConsolePlatform; userId: string }) {
  const lib = useAsync(() => getConsoleLibrary(platform, userId), [platform, userId]);
  if (lib.status === 'loading' || lib.status === 'idle') return <div class="skel" style={{ height: '40px' }} />;
  if (lib.status === 'error') return <p class="muted small">{lib.error}</p>;
  const l = lib.data;
  if (l.state === 'private') return <p class="muted small">Can’t see your games yet. {PRIVACY_HELP[platform]}</p>;
  if (l.state !== 'ok') return null;
  const recent = l.games.slice(0, 6);
  return (
    <div class="console-lib">
      <p class="muted small">
        {l.games.length} games
        {platform === 'psn' && l.totalMinutes > 0 && <> · {formatPlaytime(l.totalMinutes)} on PS4/PS5</>}
        {platform === 'xbox' && <> · Xbox doesn’t share hours, only achievements</>}
      </p>
      <ul class="console-games">
        {recent.map((g) => (
          <li>
            {g.image ? <img src={g.image} alt="" loading="lazy" width={40} height={40} /> : <span class="ach-icon" />}
            <span class="cg-name">{g.name}</span>
            <span class="cg-meta">
              {g.minutes !== null && <>{formatPlaytime(g.minutes)}</>}
              {g.trophies && g.trophies.total > 0 && <> · {g.trophies.progress}%</>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Profile: link / unlink PlayStation and Xbox. */
export function LinkedAccounts({ userId }: { userId: string }) {
  const linked = useLinked();
  if (linked.status !== 'ok') return <div class="skel" style={{ height: '80px' }} />;
  return (
    <div class="linked-grid">
      {(['psn', 'xbox'] as ConsolePlatform[]).map((p) => {
        const acc = linked.get(p);
        return (
          <div class="card pad linked-card">
            <div class="linked-head">
              <b>{PLATFORM_LABEL[p]}</b>
              {acc && (
                <>
                  <span class="pill pill-good">{acc.handle}</span>
                  <button class="btn btn-ghost btn-sm" onClick={() => unlink(userId, p)}>Unlink</button>
                </>
              )}
            </div>
            {acc ? <LibrarySummary platform={p} userId={userId} /> : <LinkFlow platform={p} userId={userId} />}
          </div>
        );
      })}
      <p class="muted small">
        We only read what your privacy settings allow everyone to see. {PRIVACY_HELP.psn}
      </p>
    </div>
  );
}

function TrophyRow({ a }: { a: ConsoleAchievement }) {
  const [revealed, setRevealed] = useState(false);
  const hiddenView = a.hidden && !revealed;
  return (
    <li class={`ach ${hiddenView ? 'is-hidden' : ''}`}>
      {a.icon ? <img class="ach-icon" src={a.icon} alt="" loading="lazy" width={44} height={44} /> : <span class="ach-icon" />}
      <div class="ach-body">
        {hiddenView ? (
          <button class="ach-reveal" onClick={() => setRevealed(true)} aria-label="Hidden trophy, spoiler. Tap to reveal.">
            <span class="ach-name">Hidden {a.kind ? a.kind : 'achievement'}</span>
            <span class="ach-desc"><IconEye class="ic" /> Spoiler. Tap to reveal</span>
          </button>
        ) : (
          <>
            <span class="ach-name">{a.name}{a.kind && <span class={`trophy-kind ${a.kind}`}> {a.kind}</span>}</span>
            <span class="ach-desc">{a.description}</span>
          </>
        )}
      </div>
      {a.globalPercent !== undefined && <span class={`ach-pct ${a.globalPercent < 5 ? 'rare' : a.globalPercent < 20 ? 'uncommon' : ''}`}>{a.globalPercent < 1 ? a.globalPercent.toFixed(1) : Math.round(a.globalPercent)}%</span>}
    </li>
  );
}

function MissedList({ platform, g }: { platform: ConsolePlatform; g: ConsoleGame }) {
  const list = useAsync(() => getConsoleAchievements(platform, g.trophyRef!), [platform, g.trophyRef?.id]);
  if (list.status === 'loading' || list.status === 'idle') return <div class="skel" style={{ height: '44px' }} />;
  if (list.status === 'error') return <p class="muted small">{list.error}</p>;
  const missed = list.data.filter((a) => !a.achieved).sort((x, y) => (y.globalPercent ?? -1) - (x.globalPercent ?? -1));
  if (!missed.length) return <p class="muted small">🏆 Nothing missed. You've got them all.</p>;
  return <ul class="ach-list">{missed.map((a) => <TrophyRow key={a.id} a={a} />)}</ul>;
}

function PlatformProgress({ platform, userId, gameName }: { platform: ConsolePlatform; userId: string; gameName: string }) {
  const lib = useAsync(() => getConsoleLibrary(platform, userId), [platform, userId]);
  const [open, setOpen] = useState(false);
  if (lib.status !== 'ok') return null;
  const g = findConsoleGame(lib.data, gameName);
  if (!g) return null;
  const word = platform === 'psn' ? 'trophies' : 'achievements';
  return (
    <div class="console-progress">
      <p class="cp-line">
        <b>{PLATFORM_LABEL[platform]}</b> <span class="muted">({g.platform})</span>
        {g.minutes !== null && <> · {formatPlaytime(g.minutes)}</>}
        {g.trophies && g.trophies.total > 0 && <> · {g.trophies.earned}/{g.trophies.total} {word} ({g.trophies.progress}%)</>}
      </p>
      {g.trophyRef && g.trophies && g.trophies.earned < g.trophies.total && (
        open ? <MissedList platform={platform} g={g} /> : <button class="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Show missed {word}</button>
      )}
    </div>
  );
}

/** Game pages: your PlayStation / Xbox progress for this game, if you've linked and played it. */
export function ConsoleProgress({ userId, gameName }: { userId: string; gameName: string }) {
  const linked = useLinked();
  if (linked.status !== 'ok' || !linked.accounts.length || !gameName) return null;
  return (
    <div class="console-progress-wrap">
      {linked.accounts.map((a) => <PlatformProgress key={a.platform} platform={a.platform} userId={userId} gameName={gameName} />)}
    </div>
  );
}
