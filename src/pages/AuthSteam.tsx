import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { completeSteamSignIn, takeReturnPath } from '../lib/auth';
import { SteamButton } from '../components/SteamButton';

/** Steam redirects here after sign-in. We hand the response to the server to verify. */
export function AuthSteam() {
  const { route } = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = location.search;
    if (!query.includes('openid.mode=id_res')) {
      setError(query.includes('openid.mode=cancel') ? 'Sign-in was cancelled.' : 'Steam did not return a sign-in response.');
      return;
    }
    // remove the long OpenID query from the address bar right away
    history.replaceState(null, '', location.pathname);
    completeSteamSignIn(query)
      .then(() => route(takeReturnPath(), true))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div class="wrap empty-page" aria-live="polite">
      {error ? (
        <>
          <h1>Couldn't sign you in</h1>
          <p class="muted">{error}</p>
          <SteamButton />
        </>
      ) : (
        <>
          <div class="spinner" aria-hidden="true" />
          <h1>Signing you in…</h1>
          <p class="muted">Checking with Steam.</p>
        </>
      )}
    </div>
  );
}
