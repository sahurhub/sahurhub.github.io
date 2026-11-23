// Tiny DOM helpers: elements, toasts, money and time formatting, one full-screen menu at a time.
import { sfx } from '../core/audio.js';

export const $ui = () => document.getElementById('ui');

export function el(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => '£' + Math.round(n || 0).toLocaleString('en-GB');
export const pct = (f) => Math.floor(Math.min(1, Math.max(0, f || 0)) * 100 + 1e-6) + '%';
export const time = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// one menu screen at a time (title, jobs, shop, settings, pause, results...)
let current = null;
export function showScreen(node, { dim = true, onClose = null } = {}) {
  closeScreen(true);
  const wrap = el('div', { class: 'screen' + (dim ? ' dim' : '') });
  wrap.appendChild(node);
  $ui().appendChild(wrap);
  current = { wrap, onClose };
  return wrap;
}
export function closeScreen(silent) {
  if (!current) return;
  const c = current;
  current = null;
  c.wrap.remove();
  if (!silent && c.onClose) c.onClose();
}
export const screenOpen = () => !!current;

// A panel with a coloured header. Returns { panel, body }.
export function panel({ title, color = '', size = '', extra = '', onBack = null }) {
  const p = el('div', { class: 'panel ' + size });
  const head = el('div', { class: 'panel-head ' + color });
  head.innerHTML = `<h2>${esc(title)}</h2>${extra}`;
  if (onBack) head.appendChild(el('button', { class: 'btn small grey', onclick: () => { sfx.click(); onBack(); } }, 'Back'));
  const body = el('div', { class: 'panel-body' });
  p.append(head, body);
  return { panel: p, body, head };
}

let toastBox = null;
export function toast(text, kind = '', ms = 2600) {
  if (!toastBox || !toastBox.isConnected) { toastBox = el('div', { class: 'toasts' }); $ui().appendChild(toastBox); }
  const t = el('div', { class: 'toast ' + kind }, esc(text));
  toastBox.appendChild(t);
  while (toastBox.children.length > 3) toastBox.firstChild.remove();
  setTimeout(() => t.remove(), ms);
}

export function clearToasts() { if (toastBox) toastBox.innerHTML = ''; }

// The game logo: three stacked words with thick outlines, a water splash and a spraying gun behind.
const SPLASH = `<svg class="splash" viewBox="0 0 640 330" aria-hidden="true">
  <path d="M60 170c-30-40 10-90 60-70 10-50 80-70 120-30 30-60 130-60 160 0 40-40 120-20 120 40 60 0 90 70 40 100 30 40-20 90-70 70-20 40-100 50-130 10-40 40-130 30-150-20-60 20-130-20-110-70-50-10-60-40-40-60z" fill="#3fb4ff" stroke="#0a2a66" stroke-width="10" stroke-linejoin="round"/>
  <path d="M110 150c-10-30 30-50 55-30 10-35 60-45 85-15 25-40 95-35 110 5" fill="none" stroke="#c9f3ff" stroke-width="12" stroke-linecap="round" opacity=".8"/>
  <g fill="#5fd0ff" stroke="#0a2a66" stroke-width="7">
    <path d="M30 120c-20-10-20-40 5-40 10 0 20 20-5 40z"/><path d="M590 90c20-15 45 5 30 25-10 10-30 0-30-25z"/>
    <circle cx="40" cy="250" r="16"/><circle cx="600" cy="240" r="13"/><circle cx="120" cy="40" r="11"/><circle cx="520" cy="30" r="14"/><circle cx="18" cy="190" r="9"/>
  </g>
  <g transform="translate(470 96) rotate(-24)">
    <path d="M0 0h86v26H0z" fill="#1e7bff" stroke="#0a2a66" stroke-width="7"/><path d="M14 26l-6 44h26l6-44z" fill="#1e7bff" stroke="#0a2a66" stroke-width="7"/>
    <path d="M86 6h40v14H86z" fill="#2b3446" stroke="#0a2a66" stroke-width="6"/>
  </g>
  <path d="M590 60l50-40M592 70l48-8M590 80l46 22" stroke="#e6fbff" stroke-width="9" stroke-linecap="round"/>
</svg>`;
export function logoHtml(extra = '') {
  return `<div class="logo ${extra}">${SPLASH}<span class="w1" data-t="PRESSURE">PRESSURE</span><span class="w2" data-t="WASHER">WASHER</span><span class="w3" data-t="SIMULATOR">SIMULATOR</span></div>`;
}

// small inline SVG icons (no icon font, no extra downloads)
export const ICONS = {
  play: '<svg viewBox="0 0 40 40"><path d="M11 6 L34 20 L11 34 Z" fill="#fff" stroke="#0a3a1a" stroke-width="3" stroke-linejoin="round"/></svg>',
  jobs: '<svg viewBox="0 0 40 40"><rect x="7" y="7" width="26" height="29" rx="4" fill="#fff" stroke="#0a2350" stroke-width="3"/><rect x="14" y="3" width="12" height="8" rx="2" fill="#ffc21a" stroke="#0a2350" stroke-width="2.5"/><path d="M12 18h16M12 24h16M12 30h10" stroke="#1e7bff" stroke-width="3" stroke-linecap="round"/></svg>',
  cart: '<svg viewBox="0 0 40 40"><path d="M3 7h6l4 19h18l4-13H11" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="15" cy="32" r="3.5" fill="#fff"/><circle cx="29" cy="32" r="3.5" fill="#fff"/></svg>',
  gear: '<svg viewBox="0 0 40 40"><path d="M17 3h6l1 5 4 2 5-3 4 4-3 5 2 4 5 1v6l-5 1-2 4 3 5-4 4-5-3-4 2-1 5h-6l-1-5-4-2-5 3-4-4 3-5-2-4-5-1v-6l5-1 2-4-3-5 4-4 5 3 4-2z" fill="#fff" stroke="#0a2350" stroke-width="2.5" stroke-linejoin="round"/><circle cx="20" cy="20" r="6" fill="#1e7bff" stroke="#0a2350" stroke-width="2.5"/></svg>',
  home: '<svg viewBox="0 0 40 40"><path d="M5 19 L20 6 L35 19 V35 H24 V25 H16 V35 H5 Z" fill="#fff" stroke="#0a2350" stroke-width="3" stroke-linejoin="round"/></svg>',
  sound: '<svg viewBox="0 0 40 40"><path d="M6 15h7l9-8v26l-9-8H6z" fill="#fff" stroke="#0a2350" stroke-width="2.5" stroke-linejoin="round"/><path d="M27 13c3 3 3 11 0 14M31 9c6 6 6 16 0 22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>',
  muted: '<svg viewBox="0 0 40 40"><path d="M6 15h7l9-8v26l-9-8H6z" fill="#fff" stroke="#0a2350" stroke-width="2.5" stroke-linejoin="round"/><path d="M27 14l10 12M37 14L27 26" stroke="#ff5a4f" stroke-width="4" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 40 40"><path d="M20 3l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#ffd23f" stroke="#8a5c00" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  drop: '<svg viewBox="0 0 40 40"><path d="M20 3C14 13 8 19 8 26a12 12 0 0 0 24 0c0-7-6-13-12-23z" fill="#5fd8ff" stroke="#0a2350" stroke-width="3"/><path d="M15 25a6 6 0 0 0 4 7" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  tank: '<svg viewBox="0 0 40 40"><rect x="9" y="6" width="22" height="30" rx="7" fill="#8ff2ff" stroke="#0b4f96" stroke-width="3"/><rect x="15" y="2" width="10" height="6" rx="2" fill="#0b4f96"/><path d="M12 22h16v8a5 5 0 0 1-5 5h-6a5 5 0 0 1-5-5z" fill="#1fb7e8"/></svg>',
  pressure: '<svg viewBox="0 0 40 40"><circle cx="20" cy="22" r="15" fill="#fff" stroke="#0b4f96" stroke-width="3"/><path d="M20 22 L29 13" stroke="#ff4f4f" stroke-width="4" stroke-linecap="round"/><circle cx="20" cy="22" r="3" fill="#0b4f96"/><path d="M9 26a12 12 0 0 1 3-11" stroke="#3fcf3a" stroke-width="3" fill="none"/></svg>',
  nozzle: '<svg viewBox="0 0 40 40"><path d="M4 20h14" stroke="#0b4f96" stroke-width="6" stroke-linecap="round"/><path d="M18 20 L36 8 M18 20 L37 20 M18 20 L36 32" stroke="#8ff2ff" stroke-width="3" stroke-linecap="round"/></svg>',
  hose: '<svg viewBox="0 0 40 40"><path d="M6 32c0-10 10-6 14-12s-2-14 8-14 8 10 6 12" stroke="#2d3a4c" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M6 32c0-10 10-6 14-12s-2-14 8-14 8 10 6 12" stroke="#ffc21a" stroke-width="2" fill="none" stroke-dasharray="3 4"/></svg>',
  surface: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="27" rx="16" ry="7" fill="#ffc21a" stroke="#6b4300" stroke-width="3"/><rect x="17" y="4" width="6" height="20" rx="2" fill="#2d3a4c"/></svg>',
  detergent: '<svg viewBox="0 0 40 40"><rect x="11" y="12" width="18" height="24" rx="5" fill="#9bff7a" stroke="#1c6b1c" stroke-width="3"/><rect x="15" y="5" width="10" height="8" rx="2" fill="#1c6b1c"/><circle cx="29" cy="9" r="4" fill="#fff" stroke="#8ff2ff" stroke-width="2"/><circle cx="33" cy="17" r="2.5" fill="#fff" stroke="#8ff2ff" stroke-width="1.5"/></svg>',
  paint: '<svg viewBox="0 0 40 40"><path d="M8 30c0-6 6-6 6-12s6-12 14-10 6 10 0 14-6 8-12 10-8 2-8-2z" fill="#ffc21a" stroke="#6b4300" stroke-width="3"/><circle cx="24" cy="15" r="3" fill="#ff4f4f"/><circle cx="17" cy="21" r="2.5" fill="#1e9bff"/></svg>',
  narrow: '<svg viewBox="0 0 40 34"><path d="M3 17h12" stroke="#c9d6e8" stroke-width="6" stroke-linecap="round"/><path d="M15 17 L38 17" stroke="#8ff2ff" stroke-width="3" stroke-linecap="round"/><path d="M15 17 L38 14 M15 17 L38 20" stroke="#8ff2ff" stroke-width="1.5" opacity=".6"/></svg>',
  wide: '<svg viewBox="0 0 40 34"><path d="M3 17h12" stroke="#c9d6e8" stroke-width="6" stroke-linecap="round"/><path d="M15 17 L38 4 M15 17 L38 17 M15 17 L38 30 M15 17 L38 10 M15 17 L38 24" stroke="#8ff2ff" stroke-width="2" stroke-linecap="round"/></svg>',
  disc: '<svg viewBox="0 0 40 34"><rect x="18" y="2" width="5" height="16" rx="2" fill="#c9d6e8"/><ellipse cx="20" cy="22" rx="16" ry="7" fill="#ffc21a" stroke="#6b4300" stroke-width="2.5"/></svg>',
  soap: '<svg viewBox="0 0 40 34"><rect x="12" y="8" width="16" height="22" rx="5" fill="#9bff7a" stroke="#1c6b1c" stroke-width="2.5"/><rect x="16" y="3" width="8" height="6" rx="2" fill="#1c6b1c"/></svg>',
  car: '<svg viewBox="0 0 64 64"><path d="M8 40l6-14c2-4 5-6 9-6h18c4 0 7 2 9 6l6 14v8H8z" fill="#ff5a4f" stroke="#7a1f1a" stroke-width="3"/><path d="M19 27l3-6h20l3 6z" fill="#bfe8ff"/><circle cx="19" cy="48" r="6" fill="#2a2b30"/><circle cx="45" cy="48" r="6" fill="#2a2b30"/></svg>',
  patio: '<svg viewBox="0 0 64 64"><rect x="6" y="40" width="52" height="14" rx="3" fill="#cfc6b4" stroke="#6e6656" stroke-width="3"/><path d="M14 40V22h36v18" fill="none" stroke="#8e5a2c" stroke-width="4"/><path d="M10 22h44" stroke="#c98a4b" stroke-width="5" stroke-linecap="round"/><path d="M32 8v14" stroke="#555" stroke-width="3"/><path d="M18 12h28l-6-6H24z" fill="#ff7a59"/></svg>',
  van: '<svg viewBox="0 0 64 64"><path d="M4 18h36v28H4z" fill="#f4f4f4" stroke="#44506a" stroke-width="3"/><path d="M40 24h10l8 10v12H40z" fill="#f4f4f4" stroke="#44506a" stroke-width="3"/><path d="M43 27h7l5 7H43z" fill="#bfe8ff"/><circle cx="14" cy="48" r="6" fill="#2a2b30"/><circle cx="48" cy="48" r="6" fill="#2a2b30"/><text x="8" y="36" font-size="11" font-weight="700" fill="#ff3fa4">OI!</text></svg>',
  shop: '<svg viewBox="0 0 64 64"><rect x="6" y="14" width="52" height="42" fill="#c4473a" stroke="#6b1f18" stroke-width="3"/><rect x="10" y="8" width="44" height="12" rx="3" fill="#1e9bff" stroke="#0b4f96" stroke-width="3"/><rect x="12" y="26" width="18" height="18" fill="#bfe8ff"/><rect x="36" y="26" width="16" height="30" fill="#6e4a2a"/></svg>',
  boat: '<svg viewBox="0 0 64 64"><path d="M6 32h52l-8 14H14z" fill="#fff" stroke="#27355c" stroke-width="3"/><path d="M8 38h48" stroke="#1e9bff" stroke-width="3"/><path d="M22 32V20h16l6 12" fill="#e9eef5" stroke="#27355c" stroke-width="3"/><circle cx="20" cy="52" r="5" fill="#2a2b30"/><circle cx="44" cy="52" r="5" fill="#2a2b30"/><path d="M10 48h44" stroke="#8a909c" stroke-width="3"/></svg>',
  skate: '<svg viewBox="0 0 64 64"><path d="M4 54h56V44C46 44 40 30 40 14h-6c0 20 -10 30 -30 30z" fill="#b9bcc4" stroke="#4a4f5c" stroke-width="3"/><path d="M10 50l12-12" stroke="#ff3fa4" stroke-width="3"/><circle cx="50" cy="20" r="6" fill="#e9c690" stroke="#8a6a3a" stroke-width="2"/><rect x="45" y="26" width="10" height="16" fill="#e9c690" stroke="#8a6a3a" stroke-width="2"/></svg>',
};
