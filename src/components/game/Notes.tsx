import { useEffect, useRef, useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase';

type Status = 'loading' | 'idle' | 'saving' | 'saved' | 'error' | 'local';

/**
 * "Where I left off": private per-game notes. Signed in -> saved to Supabase (RLS: only you can read them),
 * signed out -> kept on this device only.
 */
export function Notes({ appid, userId, platform = 'steam' }: { appid: number | string; userId: string | null; platform?: 'steam' | 'igdb' }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const localKey = `notes:${platform}:${appid}`;

  useEffect(() => {
    let live = true;
    setStatus('loading');
    if (!userId || !supabase) {
      setText(localStorage.getItem(localKey) ?? '');
      setStatus('local');
      return;
    }
    supabase
      .from('notes')
      .select('body, updated_at')
      .eq('platform', platform)
      .eq('game_id', String(appid))
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) return setStatus('error');
        setText(data?.body ?? '');
        setSavedAt(data ? new Date(data.updated_at) : null);
        setStatus('idle');
      });
    return () => {
      live = false;
    };
  }, [appid, userId, platform]);

  const save = async () => {
    const body = pending.current;
    if (body === null) return;
    pending.current = null;
    if (!userId || !supabase) {
      localStorage.setItem(localKey, body);
      return;
    }
    setStatus('saving');
    const { error } = await supabase
      .from('notes')
      .upsert({ user_id: userId, platform, game_id: String(appid), body, updated_at: new Date().toISOString() });
    if (error) {
      pending.current = pending.current ?? body; // keep it for the next attempt
      setStatus('error');
    } else {
      setSavedAt(new Date());
      setStatus(pending.current === null ? 'saved' : 'saving');
    }
  };

  const onInput = (v: string) => {
    setText(v);
    pending.current = v;
    if (userId) setStatus('saving');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 700);
  };

  // flush when leaving the page or switching apps (phone)
  useEffect(() => {
    const flush = () => {
      if (pending.current !== null) {
        clearTimeout(timer.current);
        void save();
      }
    };
    const onVis = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      flush();
    };
  }, [appid, userId, platform]);

  const label =
    status === 'loading' ? 'Loading…'
    : status === 'saving' ? 'Saving…'
    : status === 'error' ? "Couldn't save. Will retry when you type"
    : status === 'local' ? 'Saved on this device. Sign in to sync'
    : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Private. Only you can see these';

  return (
    <div class="notes-wrap">
      <textarea
        class="notes"
        value={text}
        disabled={status === 'loading'}
        placeholder="Where did you leave off? Next quest, where you stashed stuff, what to try next…"
        onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)}
        onBlur={() => {
          clearTimeout(timer.current);
          void save();
        }}
        maxLength={20000}
        aria-label="Where I left off notes"
      />
      <p class={`notes-status ${status}`} aria-live="polite">{label}</p>
    </div>
  );
}
