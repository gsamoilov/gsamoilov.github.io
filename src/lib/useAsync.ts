import { useEffect, useState } from 'preact/hooks';

export type Async<T> = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; error: string };

/** Runs `f` whenever deps change; ignores results from stale runs. Pass `null` to stay idle. */
export function useAsync<T>(f: (() => Promise<T>) | null, deps: unknown[]): Async<T> {
  const [s, set] = useState<Async<T>>(f ? { status: 'loading' } : { status: 'idle' });
  useEffect(() => {
    if (!f) return set({ status: 'idle' });
    let live = true;
    set({ status: 'loading' });
    f().then(
      (data) => live && set({ status: 'ok', data }),
      (e: unknown) => live && set({ status: 'error', error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, deps);
  return s;
}

export const formatPlaytime = (min: number) => {
  if (min < 60) return `${min}m`;
  const h = min / 60;
  return h < 10 ? `${h.toFixed(1)}h` : `${Math.round(h).toLocaleString()}h`;
};

export const formatCount = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString();

export const timeAgo = (unixSeconds: number) => {
  const d = Date.now() / 1000 - unixSeconds;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  if (d < 86400 * 30) return `${Math.round(d / 86400)} days ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
