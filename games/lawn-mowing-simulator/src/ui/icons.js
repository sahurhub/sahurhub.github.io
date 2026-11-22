// Simple inline SVG icons (drawn here, no icon files or fonts needed).
const S = (body, vb = '0 0 64 64') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  grass: S(`<path d="M8 58 C10 40 6 26 2 14 C14 24 18 40 18 58Z" fill="#37b52c" stroke="#145f12" stroke-width="3" stroke-linejoin="round"/>
    <path d="M18 58 C20 34 24 18 32 4 C34 22 32 42 34 58Z" fill="#4fd13a" stroke="#145f12" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 58 C36 40 44 26 58 16 C52 30 48 44 46 58Z" fill="#37b52c" stroke="#145f12" stroke-width="3" stroke-linejoin="round"/>
    <path d="M44 58 C46 48 52 40 62 34 C58 44 56 50 56 58Z" fill="#62de48" stroke="#145f12" stroke-width="3" stroke-linejoin="round"/>`),
  shop: S(`<path d="M4 10h9l7 30h30l6-22H17" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20 18h33l-5 16H24z" fill="#fff" opacity=".9"/><circle cx="24" cy="50" r="6" fill="#fff"/><circle cx="46" cy="50" r="6" fill="#fff"/>`),
  paw: S(`<ellipse cx="32" cy="42" rx="14" ry="12" fill="#fff"/><ellipse cx="14" cy="28" rx="6" ry="8" fill="#fff"/><ellipse cx="25" cy="16" rx="6" ry="8" fill="#fff"/>
    <ellipse cx="39" cy="16" rx="6" ry="8" fill="#fff"/><ellipse cx="50" cy="28" rx="6" ry="8" fill="#fff"/>`),
  stats: S(`<rect x="8" y="34" width="12" height="22" rx="3" fill="#fff"/><rect x="26" y="20" width="12" height="36" rx="3" fill="#fff"/><rect x="44" y="8" width="12" height="48" rx="3" fill="#fff"/>`),
  gear: S(`<path d="M32 4l5 7 8-2 2 8 8 2-2 8 7 5-7 5 2 8-8 2-2 8-8-2-5 7-5-7-8 2-2-8-8-2 2-8-7-5 7-5-2-8 8-2 2-8 8 2z" fill="#fff"/><circle cx="32" cy="32" r="9" fill="#6b7486"/>`),
  jobs: S(`<rect x="10" y="10" width="44" height="50" rx="6" fill="#fff"/><rect x="22" y="4" width="20" height="12" rx="4" fill="#ffd23f" stroke="#7a5a00" stroke-width="2"/>
    <path d="M18 28l4 4 8-8M18 44l4 4 8-8" fill="none" stroke="#23962a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M36 28h12M36 44h12" stroke="#8a93a6" stroke-width="4" stroke-linecap="round"/>`),
  mower: S(`<rect x="24" y="30" width="54" height="22" rx="8" fill="#e8322e" stroke="#7a1512" stroke-width="3"/><rect x="58" y="22" width="22" height="14" rx="4" fill="#e8322e" stroke="#7a1512" stroke-width="3"/>
    <path d="M30 30 L22 6" stroke="#2f3136" stroke-width="5" stroke-linecap="round"/><path d="M16 6h12" stroke="#2f3136" stroke-width="6" stroke-linecap="round"/>
    <rect x="38" y="20" width="16" height="12" rx="3" fill="#2f3136"/><circle cx="34" cy="54" r="9" fill="#2f3136" stroke="#111" stroke-width="2"/><circle cx="34" cy="54" r="4" fill="#c4c8d0"/>
    <circle cx="72" cy="54" r="7" fill="#2f3136" stroke="#111" stroke-width="2"/><circle cx="72" cy="54" r="3" fill="#c4c8d0"/>`, '0 0 90 66'),
  bag: S(`<path d="M14 22h36l-4 34H18z" fill="#ffd23f" stroke="#7a5a00" stroke-width="3" stroke-linejoin="round"/><path d="M22 22c0-10 20-10 20 0" fill="none" stroke="#7a5a00" stroke-width="4"/>`),
  fuel: S(`<path d="M32 6C22 22 14 30 14 40a18 18 0 0036 0C50 30 42 22 32 6z" fill="#2f8cff" stroke="#0f3f80" stroke-width="3"/>`),
  clock: S(`<circle cx="32" cy="32" r="26" fill="#fff" stroke="#2f3136" stroke-width="4"/><path d="M32 16v17l11 7" fill="none" stroke="#2f3136" stroke-width="5" stroke-linecap="round"/>`),
  camera: S(`<rect x="6" y="18" width="52" height="34" rx="7" fill="#fff"/><circle cx="32" cy="35" r="11" fill="#6b7486"/><rect x="22" y="10" width="20" height="10" rx="3" fill="#fff"/>`),
  pause: S(`<rect x="14" y="10" width="13" height="44" rx="4" fill="#fff"/><rect x="37" y="10" width="13" height="44" rx="4" fill="#fff"/>`),
  flag: S(`<path d="M14 6v54" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M16 8h36l-8 12 8 12H16z" fill="#fff"/>`),
  map: S(`<path d="M6 14l16-6 20 6 16-6v42l-16 6-20-6-16 6z" fill="#fff"/><path d="M22 8v42M42 14v42" stroke="#6b7486" stroke-width="3"/>`),
  reset: S(`<path d="M50 32a18 18 0 11-6-13" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M46 6v14H32" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`),
  trophy: S(`<path d="M18 8h28v14a14 14 0 01-28 0z" fill="#ffc23a" stroke="#7a5a00" stroke-width="3"/><path d="M18 14H8c0 10 6 14 12 14M46 14h10c0 10-6 14-12 14" fill="none" stroke="#7a5a00" stroke-width="3"/>
    <rect x="28" y="36" width="8" height="12" fill="#ffc23a"/><rect x="18" y="48" width="28" height="8" rx="2" fill="#ffc23a" stroke="#7a5a00" stroke-width="3"/>`),
  people: S(`<circle cx="22" cy="20" r="9" fill="#fff"/><circle cx="44" cy="22" r="8" fill="#fff" opacity=".8"/><path d="M6 54c0-12 8-20 16-20s16 8 16 20z" fill="#fff"/><path d="M34 54c0-10 4-17 10-17s14 7 14 17z" fill="#fff" opacity=".8"/>`),
};

export const icon = (name) => ICONS[name] || '';
