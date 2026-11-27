import { IconSteam } from './Icons';
import { authEnabled } from '../config';

export function SteamButton({ small }: { small?: boolean }) {
  const enabled = authEnabled();
  return (
    <button
      type="button"
      class={`btn btn-steam ${small ? 'btn-sm' : ''}`}
      aria-disabled={!enabled}
      title={enabled ? 'Sign in through Steam' : 'Steam sign-in is coming soon'}
      onClick={() => {
        if (!enabled) return;
        // wired up in Phase 2
      }}
    >
      <IconSteam />
      {small ? 'Sign in' : 'Sign in through Steam'}
    </button>
  );
}
