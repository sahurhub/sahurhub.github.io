// TURBO TOWN - item icons for the HUD slot (SVG drawn in code).
const S = {
  speed: `<path d="M10 4h14l-6 9h8L12 30l3-12H8z" fill="#ffb02e" stroke="#2b2560" stroke-width="2" stroke-linejoin="round"/>
          <path d="M3 13h5M2 18h5M4 23h5" stroke="#ff4f9a" stroke-width="2.5" stroke-linecap="round"/>`,
  shield: `<circle cx="16" cy="16" r="12" fill="#5fd0ff" fill-opacity="0.55" stroke="#2b2560" stroke-width="2"/>
           <ellipse cx="11.5" cy="11" rx="4" ry="2.6" fill="#fff" transform="rotate(-30 11.5 11)"/>`,
  sticky: `<path d="M16 6c3 4 9 6 9 12a9 9 0 0 1-18 0c0-6 6-8 9-12z" fill="#ff6fd0" stroke="#2b2560" stroke-width="2"/>
           <circle cx="12.5" cy="17" r="2" fill="#fff"/><circle cx="19" cy="21" r="1.4" fill="#fff"/>`,
  rocket: `<path d="M16 3c5 4 6 11 4 18h-8c-2-7-1-14 4-18z" fill="#ff4757" stroke="#2b2560" stroke-width="2"/>
           <circle cx="16" cy="12" r="2.6" fill="#fff" stroke="#2b2560" stroke-width="1.5"/>
           <path d="M12 21l-4 5 5-1M20 21l4 5-5-1" fill="#ffd32a" stroke="#2b2560" stroke-width="1.5"/>
           <path d="M14 23l2 6 2-6z" fill="#ffb02e"/>`,
  trail: `<path d="M4 24c6-1 8-6 12-6s6 4 12 3" stroke="#ffd32a" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="M4 24c6-1 8-6 12-6s6 4 12 3" stroke="#ff8a1f" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="3 3"/>
          <path d="M22 6l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill="#fff36b" stroke="#2b2560" stroke-width="1.5"/>`,
  spring: `<path d="M9 27h14M9 5h14" stroke="#ffd32a" stroke-width="3.5" stroke-linecap="round"/>
           <path d="M10 24l12-3-12-3 12-3-12-3 12-3" stroke="#3ddc84" stroke-width="3" fill="none" stroke-linejoin="round"/>`,
  freeze: `<rect x="10" y="4" width="12" height="18" rx="4" fill="#9fe8ff" stroke="#2b2560" stroke-width="2"/>
           <rect x="14.5" y="21" width="3" height="8" rx="1.2" fill="#e0b36a" stroke="#2b2560" stroke-width="1.5"/>
           <path d="M13 9l6 6M19 9l-6 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  mystery: `<rect x="5" y="9" width="22" height="18" rx="3" fill="#a55eea" stroke="#2b2560" stroke-width="2"/>
            <rect x="4" y="6" width="24" height="6" rx="2" fill="#ff4f9a" stroke="#2b2560" stroke-width="2"/>
            <text x="16" y="25" text-anchor="middle" font-family="'Bungee', sans-serif" font-size="14" fill="#fff">?</text>`,
};

export function itemIcon(id) {
  return `<svg viewBox="0 0 32 32" width="100%" height="100%">${S[id] || S.mystery}</svg>`;
}

export const ICON_IDS = Object.keys(S);
