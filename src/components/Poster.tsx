import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { steamArt } from '../platform/steam';

interface Props {
  appid: number;
  name: string;
  tint?: [string, string];
  href?: string;
  caption?: boolean;
  badge?: ComponentChildren;
  eager?: boolean;
  /** explicit cover image (non-Steam games); default is the Steam cover for `appid` */
  src?: string;
}

/** 2:3 cover art with a designed fallback tile (Steam has no portrait art for some games). */
export function Poster({ appid, name, tint = ['#1a1f2e', '#0a0c12'], href, caption = true, badge, eager, src }: Props) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>(src === '' ? 'failed' : 'loading');
  const inner = (
    <>
      <div class="poster" style={{ background: `linear-gradient(160deg, ${tint[0]}, ${tint[1]})` }}>
        {badge && <div class="badge">{badge}</div>}
        {state !== 'ok' && <div class="fallback" aria-hidden="true">{name}</div>}
        {state !== 'failed' && (
          <img
            src={src ?? steamArt(appid).cover}
            alt={`${name} cover art`}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            width={600}
            height={900}
            class={state === 'ok' ? 'loaded' : ''}
            onLoad={() => setState('ok')}
            onError={() => setState('failed')}
          />
        )}
      </div>
      {caption && <div class="poster-caption">{name}</div>}
    </>
  );
  return href ? <a href={href} aria-label={name}>{inner}</a> : <div>{inner}</div>;
}
