import { useAsync, type Async } from '../lib/useAsync';
import { getFriendsNow, type FriendInGame, type FriendsNow } from '../platform/steamClient';

function Row({ f, showGame }: { f: FriendInGame; showGame: boolean }) {
  return (
    <li class="friend">
      <a href={f.profileUrl} target="_blank" rel="noopener">
        <img src={f.avatar} alt="" width={32} height={32} loading="lazy" />
        <span class="friend-name">{f.name}</span>
      </a>
      {showGame && (
        <a class="friend-game" href={`/game/${f.appid}`}>
          {f.game || `App ${f.appid}`}
        </a>
      )}
    </li>
  );
}

function Body({ r, showGame, emptyText }: { r: Async<FriendsNow>; showGame: boolean; emptyText: string }) {
  if (r.status === 'loading' || r.status === 'idle') {
    return (
      <div class="pending">
        <div class="skel" style={{ height: '32px' }} />
      </div>
    );
  }
  if (r.status === 'error') return <p class="muted small">{r.error}</p>;
  const d = r.data;
  if (d.state === 'private') {
    return (
      <p class="muted small">
        Your Steam friends list is private, so we can't see who's online. Set <b>Friends List</b> to Public in{' '}
        <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener">
          Steam privacy settings
        </a>
        .
      </p>
    );
  }
  return (
    <>
      {d.inGame.length ? (
        <ul class="friend-list">
          {d.inGame.map((f) => (
            <Row f={f} showGame={showGame} />
          ))}
        </ul>
      ) : (
        <p class="muted small">{emptyText}</p>
      )}
      {d.privateCount > 0 && (
        <p class="muted small">
          {d.privateCount} of your {d.total} friends have private profiles, so Steam doesn't show what they're playing.
        </p>
      )}
    </>
  );
}

/** Game page: friends in this game right now. */
export function FriendsHere({ appid, userId }: { appid: number; userId: string }) {
  const r = useAsync(() => getFriendsNow(userId, appid), [appid, userId]);
  return <Body r={r} showGame={false} emptyText="None of your friends are playing this right now." />;
}

/** Profile: every friend who's in a game right now. */
export function FriendsPlaying({ userId }: { userId: string }) {
  const r = useAsync(() => getFriendsNow(userId), [userId]);
  return <Body r={r} showGame emptyText="None of your friends are in a game right now." />;
}
