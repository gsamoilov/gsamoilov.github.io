import { IconSteam } from './Icons';
import { authEnabled } from '../config';
import { signInWithSteam } from '../lib/auth';

export function SteamButton({ small }: { small?: boolean }) {
  const enabled = authEnabled();
  return (
    <button
      type="button"
      class={`btn btn-steam ${small ? 'btn-sm' : ''}`}
      aria-disabled={!enabled}
      title={enabled ? 'Sign in through Steam' : 'Steam sign-in is not configured yet'}
      onClick={() => enabled && signInWithSteam()}
    >
      <IconSteam />
      {small ? 'Sign in' : 'Sign in through Steam'}
    </button>
  );
}
