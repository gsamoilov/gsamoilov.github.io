import { useState } from 'preact/hooks';
import type { Async } from '../../lib/useAsync';
import { timeAgo } from '../../lib/useAsync';
import type { SteamNewsItem } from '../../platform/steamClient';
import { bbcodeExcerpt, bbcodeToHtml } from '../../lib/bbcode';

function Item({ n, open: initiallyOpen }: { n: SteamNewsItem; open: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const patch = n.tags.includes('patchnotes') || /patch|hotfix|update|fix/i.test(n.title);
  return (
    <article class={`news-item ${open ? 'open' : ''}`}>
      <button class="news-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="news-meta">
          {patch && <span class="pill pill-good">Patch notes</span>}
          <time dateTime={new Date(n.date * 1000).toISOString()}>{timeAgo(n.date)}</time>
        </span>
        <span class="news-title">{n.title}</span>
        {!open && <span class="news-excerpt">{bbcodeExcerpt(n.contents)}</span>}
      </button>
      {open && (
        <div class="news-body">
          <div class="rich" dangerouslySetInnerHTML={{ __html: bbcodeToHtml(n.contents) }} />
          <a class="btn btn-ghost btn-sm" href={n.url} target="_blank" rel="noopener">Read on Steam</a>
        </div>
      )}
    </article>
  );
}

export function News({ news }: { news: Async<SteamNewsItem[]> }) {
  if (news.status === 'loading' || news.status === 'idle') {
    return <div class="pending">{[0, 1, 2].map(() => <div class="skel" style={{ height: '64px' }} />)}</div>;
  }
  if (news.status === 'error') return <p class="panel-empty muted">{news.error}</p>;
  if (!news.data.length) return <p class="panel-empty muted">No announcements from the developers yet.</p>;
  return (
    <div class="news-list">
      {news.data.map((n, i) => (
        <Item key={n.id} n={n} open={i === 0} />
      ))}
    </div>
  );
}
