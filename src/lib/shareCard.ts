/** Draws the profile stats card as a 1080x1350 PNG (good for phone sharing / stories). */
import type { ProfileStats } from '../platform/steamClient';

type OkStats = Extract<ProfileStats, { state: 'ok' }>;
const W = 1080;
const H = 1350;
const FONT = '"Space Grotesk", system-ui, sans-serif';

const hours = (min: number) => Math.round(min / 60).toLocaleString('en-US');

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous'; // without CORS the canvas couldn't be exported, so we skip the image
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    setTimeout(() => resolve(null), 4000);
  });
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function drawStatsCard(stats: OkStats, name: string, avatarUrl: string): Promise<Blob> {
  await Promise.all(['400', '600', '700'].map((w) => document.fonts?.load(`${w} 40px "Space Grotesk"`).catch(() => null)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // background
  ctx.fillStyle = '#07080d';
  ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, W * 0.9);
  g1.addColorStop(0, 'rgba(91,140,255,0.35)');
  g1.addColorStop(1, 'rgba(91,140,255,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(0, H * 0.75, 0, 0, H * 0.75, W * 0.8);
  g2.addColorStop(0, 'rgba(124,245,196,0.18)');
  g2.addColorStop(1, 'rgba(124,245,196,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  const acc = ctx.createLinearGradient(80, 0, W - 80, 0);
  acc.addColorStop(0, '#7cf5c4');
  acc.addColorStop(0.6, '#5b8cff');
  acc.addColorStop(1, '#a678ff');

  // header: avatar + name
  const avatar = await loadImage(avatarUrl);
  const ax = 80, ay = 90, as = 120;
  ctx.save();
  roundRect(ctx, ax, ay, as, as, 28);
  ctx.clip();
  if (avatar) ctx.drawImage(avatar, ax, ay, as, as);
  else {
    ctx.fillStyle = acc;
    ctx.fillRect(ax, ay, as, as);
    ctx.fillStyle = '#04120c';
    ctx.font = `700 60px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((name[0] ?? '?').toUpperCase(), ax + as / 2, ay + as / 2 + 4);
  }
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#8b92a8';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText('MY STEAM STATS', ax + as + 36, ay + 44);
  ctx.fillStyle = '#eef1fa';
  ctx.font = `700 58px ${FONT}`;
  ctx.fillText(fit(ctx, name, W - (ax + as + 36) - 80), ax + as + 36, ay + 106);

  // big numbers
  const tiles: [string, string][] = [
    [`${hours(stats.totalMinutes)}h`, 'total playtime'],
    [stats.avgCompletion !== null ? `${Math.round(stats.avgCompletion)}%` : '—', 'avg completion'],
    [stats.achievementsEarned.toLocaleString('en-US'), 'achievements'],
    [String(stats.gamesPlayed), `games played`],
  ];
  const tw = (W - 160 - 24) / 2, th = 170;
  tiles.forEach(([v, l], i) => {
    const x = 80 + (i % 2) * (tw + 24);
    const y = 280 + Math.floor(i / 2) * (th + 24);
    roundRect(ctx, x, y, tw, th, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = i === 0 ? acc : '#eef1fa';
    ctx.font = `700 76px ${FONT}`;
    ctx.fillText(v, x + 32, y + 96);
    ctx.fillStyle = '#8b92a8';
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(l, x + 32, y + 140);
  });

  // rarest achievements
  let y = 720;
  ctx.fillStyle = '#8b92a8';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText('RAREST ACHIEVEMENTS', 80, y);
  y += 30;
  const rare = stats.rarest.slice(0, 3);
  if (!rare.length) {
    ctx.fillStyle = '#5a6076';
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText('None yet. Go get some!', 80, y + 50);
  }
  for (const r of rare) {
    roundRect(ctx, 80, y, W - 160, 112, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fill();
    ctx.fillStyle = '#ffc857';
    ctx.font = `700 40px ${FONT}`;
    const pct = r.percent < 1 ? `${r.percent.toFixed(1)}%` : `${Math.round(r.percent)}%`;
    ctx.textAlign = 'right';
    ctx.fillText(pct, W - 112, y + 70);
    const pctW = ctx.measureText(pct).width;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#eef1fa';
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(fit(ctx, r.name, W - 160 - 64 - pctW - 40), 112, y + 50);
    ctx.fillStyle = '#8b92a8';
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(fit(ctx, r.game, W - 160 - 64 - pctW - 40), 112, y + 88);
    y += 128;
  }

  // footer
  ctx.fillStyle = '#5a6076';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(`Completion & rarity from my ${stats.sampledGames} most-played games`, 80, H - 120);
  ctx.fillStyle = acc;
  ctx.font = `700 38px ${FONT}`;
  ctx.fillText('samoilov.org', 80, H - 64);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png'));
}

/** Phone: native share sheet with the image. Elsewhere: download it. */
export async function shareOrDownload(blob: Blob, filename = 'samoilov-steam-stats.png'): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'My Steam stats' });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
