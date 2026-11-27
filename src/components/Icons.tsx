type P = { class?: string };
const base = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', viewBox: '0 0 24 24', 'aria-hidden': 'true' } as const;

export const IconHome = (p: P) => (<svg {...base} {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>);
export const IconPlay = (p: P) => (<svg {...base} {...p}><rect x="2" y="6" width="20" height="12" rx="4" /><path d="M7 10v4M5 12h4" /><circle cx="15.5" cy="11" r=".6" fill="currentColor" /><circle cx="17.5" cy="13" r=".6" fill="currentColor" /></svg>);
export const IconUser = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>);
export const IconSearch = (p: P) => (<svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const IconBook = (p: P) => (<svg {...base} {...p}><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 19.5V4.5" /></svg>);
export const IconNote = (p: P) => (<svg {...base} {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>);
export const IconTrophy = (p: P) => (<svg {...base} {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></svg>);
export const IconNews = (p: P) => (<svg {...base} {...p}><path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" /><path d="M17 9h3v10a2 2 0 0 1-2 2M8 9h5M8 13h5M8 17h3" /></svg>);
export const IconClock = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const IconUsers = (p: P) => (<svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 15c1.6.7 2.6 2.4 3 5" /></svg>);
export const IconArrow = (p: P) => (<svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const IconBolt = (p: P) => (<svg {...base} {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>);
export const IconEye = (p: P) => (<svg {...base} {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>);
export const IconTag = (p: P) => (<svg {...base} {...p}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.5" /></svg>);

/** Simplified Steam glyph for the "Sign in through Steam" button. */
export const IconSteam = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" {...p}>
    <path d="M12 2a10 10 0 0 0-9.96 9.2l5.36 2.22a2.83 2.83 0 0 1 1.6-.5l2.4-3.47v-.05a3.79 3.79 0 1 1 3.79 3.79h-.09l-3.42 2.44a2.84 2.84 0 0 1-5.62.58L2.3 14.67A10 10 0 1 0 12 2Zm-3.72 15.17-1.23-.51a2.13 2.13 0 1 0 1.16-2.93l1.27.53a1.57 1.57 0 0 1-1.2 2.91Zm9.4-7.72a2.53 2.53 0 1 0-2.53 2.53 2.53 2.53 0 0 0 2.53-2.53Zm-4.42 0a1.9 1.9 0 1 1 1.9 1.9 1.9 1.9 0 0 1-1.9-1.9Z" />
  </svg>
);
export const IconTrend = (p: P) => (<svg {...base} {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>);
export const IconFlame = (p: P) => (<svg {...base} {...p}><path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4 3 7 7 7z" /></svg>);
