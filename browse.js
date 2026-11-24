/*
  SahurHub Browse (added 2026-11-23): a web browser inside SahurHub.
  app.js loads this file (and browse.css) the first time the Browse button is pressed.

  Look: "side tabs". A sidebar with the address bar, buttons, page tools (zoom, mute), the tabs,
  the ad blocker count and (for the Owner) the Browse controls; the website on the right.

  How it works: websites run inside a frame from the Browse server (its host.html page, made
  with Scramjet 2). That server has its own address, so websites never share this page's
  storage, where the SahurHub Chat sign-in is kept. Only signed-in chat accounts can use
  Browse: this page asks the chat server for a "browse ticket" and hands only that ticket
  to the Browse frame.

  2026-11-24: spring animations like the rest of SahurHub (iOS 26 feel), Browse settings
  (search engine, start page wallpaper, compact sidebar, dark mode for websites, sidebar
  themes from the Shop), reopen closed tab, zoom and mute per tab. Open tabs (and their zoom
  and mute) are saved on the device, so they come back next time.
*/

const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
// The local preview talks to the test copies of the servers through SSH tunnels.
const CHAT = LOCAL ? 'http://localhost:10002' : 'https://chat-79-72-86-205.nip.io';
const BROWSE = LOCAL ? 'http://localhost:10008' : 'https://browse-79-72-86-205.nip.io';
const BROWSE_ORIGIN = new URL(BROWSE).origin;
const TABS_KEY = 'sahurhub.browse.tabs';
const PREFS_KEY = 'sahurhub.browse.prefs';
const MAX_TABS = 12;
const MAX_CLOSED = 10;
const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

// Search engines (tested 2026-11-24 through Browse: DuckDuckGo and Bing work; Brave shows a
// "drag the slider" check; Google blocks searches from the server. Startpage and Ecosia refused.)
const ENGINES = [
  { id: 'brave', name: 'Brave Search', note: 'May ask you to drag a slider first', url: 'https://search.brave.com/search?q=' },
  { id: 'duckduckgo', name: 'DuckDuckGo', note: 'Works best in Browse', url: 'https://duckduckgo.com/?q=' },
  { id: 'bing', name: 'Bing', note: 'Works well', url: 'https://www.bing.com/search?q=' },
  { id: 'google', name: 'Google', note: 'Often blocked in Browse', url: 'https://www.google.com/search?q=' }
];
const WALLPAPERS = [
  { id: 'dots', name: 'Dots' }, { id: 'plain', name: 'Plain' }, { id: 'aurora', name: 'Aurora' },
  { id: 'sunset', name: 'Sunset' }, { id: 'ocean', name: 'Ocean' }, { id: 'midnight', name: 'Midnight' }
];

// Quick open: shortcut tiles on the start page (saved on this device; you can add and remove them).
const SHORTCUTS_KEY = 'sahurhub.browse.shortcuts';
const MAX_SHORTCUTS = 16;
const DEFAULT_SHORTCUTS = [
  { name: 'GeForce NOW', url: 'https://play.geforcenow.com/' },
  { name: 'YouTube', url: 'https://www.youtube.com/' },
  { name: 'TikTok', url: 'https://www.tiktok.com/' }
];
let shortcuts = DEFAULT_SHORTCUTS.slice();
try {
  const saved = JSON.parse(localStorage.getItem(SHORTCUTS_KEY) || 'null');
  if (Array.isArray(saved)) shortcuts = saved.filter((s) => s && /^https?:\/\//i.test(s.url)).slice(0, MAX_SHORTCUTS).map((s) => ({ name: String(s.name || '').slice(0, 40), url: String(s.url) }));
} catch (e) {}
function saveShortcuts() { try { localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts)); } catch (e) {} }
let quickEdit = false;

// Sidebar width (drag the handle between the sidebar and the website).
const SIDE_MIN = 200;
const SIDE_MAX = 440;
const SIDE_DEFAULT = 256;

let prefs = { engine: 'brave', wallpaper: 'dots', compact: false, darkSites: false, sideWidth: SIDE_DEFAULT };
try { prefs = Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch (e) {}
function engine() { return ENGINES.find((x) => x.id === prefs.engine) || ENGINES[0]; }
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} }

const ICONS = {
  back: '<path d="M15 5.5 8.5 12l6.5 6.5"/>',
  forward: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
  reload: '<path d="M19.2 12a7.2 7.2 0 1 1-2.1-5.1"/><path d="M19.4 4.6v4.2h-4.2"/>',
  reopen: '<path d="M4.8 12a7.2 7.2 0 1 0 2.1-5.1"/><path d="M4.6 4.6v4.2h4.2"/>',
  share: '<path d="M12 3.8v11"/><path d="m7.8 7.8 4.2-4.2 4.2 4.2"/><path d="M5.5 12.5v5.3a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-5.3"/>',
  full: '<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>',
  unfull: '<path d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  minus: '<path d="M5.5 12h13"/>',
  close: '<path d="M7 7l10 10M17 7 7 17"/>',
  shield: '<path d="M12 3.2 5 6v5.6c0 4.3 3 7.6 7 9.2 4-1.6 7-4.9 7-9.2V6Z"/><path d="m9.2 12.2 2 2 3.8-4"/>',
  search: '<circle cx="10.6" cy="10.6" r="6.4"/><path d="m15.4 15.4 4.9 4.9"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8M12 3.4c2.4 2.4 3.6 5.3 3.6 8.6s-1.2 6.2-3.6 8.6c-2.4-2.4-3.6-5.3-3.6-8.6S9.6 5.8 12 3.4Z"/>',
  sliders: '<path d="M5 7h9M18 7h1M5 17h1M10 17h9"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5Z"/>',
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  check: '<path d="m5.5 12.5 4.2 4.2 8.8-9.4"/>',
  volume: '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  muted: '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3Z"/><path d="m15.5 9.5 5 5M20.5 9.5l-5 5"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/>',
  bag: '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'
};
function ico(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
// The letter on a tab: "W" for en.wikipedia.org, "B" for bbc.co.uk.
function siteLetter(host) {
  const parts = String(host || '').split('.').filter(Boolean);
  if (!parts.length) return '';
  let name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  if (parts.length >= 3 && name.length <= 3 && parts[parts.length - 1].length === 2) name = parts[parts.length - 3];
  return name.charAt(0).toUpperCase();
}
function narrow() { return matchMedia('(max-width: 760px)').matches; }

// ---------------------------------------------------------------- springs (the iOS feel)
// Real spring physics, turned into a CSS linear() easing so the browser runs it smoothly.

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)');
const HAS_LINEAR = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)');
function makeSpring(stiffness, damping) {
  const dt = 1 / 240;
  let x = 0, v = 0, t = 0;
  const xs = [0];
  while (t < 2) {
    const a = -stiffness * (x - 1) - damping * v;
    v += a * dt;
    x += v * dt;
    t += dt;
    xs.push(x);
    if (t > 0.12 && Math.abs(x - 1) < 0.0015 && Math.abs(v) < 0.02) break;
  }
  const n = 50;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(+xs[Math.round((i / n) * (xs.length - 1))].toFixed(4));
  pts[n] = 1;
  return { duration: Math.round(t * 1000), easing: HAS_LINEAR ? 'linear(' + pts.join(', ') + ')' : 'cubic-bezier(0.34, 1.56, 0.64, 1)' };
}
const SPRING = {
  pop: makeSpring(430, 19),    // bouncy: icons, checks, little badges
  snap: makeSpring(620, 36),   // quick with a tiny overshoot: tabs, selection
  soft: makeSpring(250, 25),   // big things: the whole Browse window
  sheet: makeSpring(330, 30)   // panels sliding in
};
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

function spring(el, frames, sp, extra) {
  if (!el || !el.animate || REDUCE.matches) return null;
  return el.animate(frames, Object.assign({ duration: sp.duration, easing: sp.easing }, extra || {}));
}
function ease(el, frames, ms, easing, extra) {
  if (!el || !el.animate || REDUCE.matches) return null;
  return el.animate(frames, Object.assign({ duration: ms, easing: easing || EASE_OUT }, extra || {}));
}
// Like the hub's icon bounce.
function bounce(node) {
  ease(node, [{ transform: 'scale(1)' }, { transform: 'scale(.78)' }, { transform: 'scale(1.18)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], 620);
}
// Children slide up and fade in one after another.
function stagger(nodes, delay0, step) {
  [...nodes].forEach((n, i) => {
    const d = (delay0 || 0) + i * (step || 35);
    ease(n, [{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], 420, EASE_OUT, { delay: d, fill: 'backwards' });
  });
}

// ---------------------------------------------------------------- state

let api = null;
let root = null;
const el = {};
let opened = false;
let phase = 'idle'; // idle | signin | connecting | ready | off | error | unsupported
let phaseText = '';
let hostFrame = null;
let hostHello = false;
let ticket = null; // { value, owner, at, ttl }
let ticketPromise = null;
let tabs = []; // { id, url, title, loading, ads, opened, zoom, muted, audible }
let activeId = null;
let nextId = 1;
let closed = []; // recently closed tabs: { url, title, zoom, muted }
let panel = null; // null | 'prefs' | 'owner'
let renderQueued = false;
let chatMod = null;
let wallet = null;
const tabEls = new Map();
let selBox = null; // where the tab selection pill was last drawn
let shownMsg = '';
let startShown = false;

// ---------------------------------------------------------------- page structure

function build() {
  root = document.getElementById('browse');
  root.className = 'br';
  root.setAttribute('aria-label', 'Browse');
  root.innerHTML = `
    <aside class="br-side">
      <div class="br-head">
        <span class="br-title">${ico('globe')}<span>Browse</span></span>
        <button class="br-iconbtn br-compact-btn" type="button" data-act="compact" aria-label="Compact sidebar" title="Compact sidebar">${ico('sidebar')}</button>
        <button class="br-iconbtn br-x" type="button" data-act="exit" aria-label="Back to SahurHub" title="Back to SahurHub">${ico('close')}</button>
      </div>
      <form class="br-addr" autocomplete="off">
        <span class="br-addr-ico">${ico('search')}</span>
        <input class="br-addr-input" type="text" inputmode="url" spellcheck="false" autocapitalize="off" aria-label="Address">
      </form>
      <div class="br-nav">
        <button class="br-iconbtn" type="button" data-act="back" aria-label="Back" title="Back">${ico('back')}</button>
        <button class="br-iconbtn" type="button" data-act="forward" aria-label="Forward" title="Forward">${ico('forward')}</button>
        <button class="br-iconbtn" type="button" data-act="reload" aria-label="Reload" title="Reload">${ico('reload')}</button>
        <button class="br-iconbtn" type="button" data-act="share" aria-label="Share to SahurHub Chat" title="Share to SahurHub Chat">${ico('share')}</button>
        <button class="br-iconbtn" type="button" data-act="full" aria-label="Fullscreen" title="Fullscreen">${ico('full')}</button>
        <button class="br-iconbtn" type="button" data-act="prefs" aria-label="Browse settings" title="Browse settings">${ico('gear')}</button>
      </div>
      <div class="br-tools">
        <div class="br-zoom" role="group" aria-label="Zoom">
          <button class="br-iconbtn br-sm" type="button" data-act="zoom-out" aria-label="Zoom out" title="Zoom out">${ico('minus')}</button>
          <button class="br-zoom-val" type="button" data-act="zoom-reset" title="Reset zoom">100%</button>
          <button class="br-iconbtn br-sm" type="button" data-act="zoom-in" aria-label="Zoom in" title="Zoom in">${ico('plus')}</button>
        </div>
        <button class="br-iconbtn br-sm br-mute" type="button" data-act="mute" aria-label="Mute tab" title="Mute tab">${ico('volume')}</button>
      </div>
      <div class="br-tabs" role="tablist" aria-label="Tabs"><span class="br-tab-sel" aria-hidden="true"></span></div>
      <div class="br-newrow">
        <button class="br-newtab" type="button" data-act="newtab" title="New tab">${ico('plus')}<span>New tab</span></button>
        <button class="br-iconbtn br-sm" type="button" data-act="reopen" aria-label="Reopen closed tab" title="Reopen closed tab">${ico('reopen')}</button>
      </div>
      <div class="br-foot">
        <span class="br-shield" title="Ads and trackers are blocked">${ico('shield')}<span class="br-shield-text">Ad blocker on</span></span>
        <button class="br-iconbtn br-owner-btn" type="button" data-act="owner" aria-label="Browse controls (Owner)" title="Browse controls (Owner)" hidden>${ico('sliders')}</button>
      </div>
    </aside>
    <div class="br-resizer" role="separator" aria-orientation="vertical" aria-label="Drag to resize the sidebar" title="Drag to resize. Double-click to reset." tabindex="0"><span></span></div>
    <section class="br-main">
      <div class="br-card">
        <div class="br-host"></div>
        <div class="br-start" hidden>
          <div class="br-start-in">
            <div class="br-start-logo">${ico('globe')}</div>
            <h2>Browse</h2>
            <form class="br-start-form" autocomplete="off">
              <span>${ico('search')}</span>
              <input type="text" spellcheck="false" autocapitalize="off" aria-label="Search or address">
            </form>
            <div class="br-quick">
              <div class="br-quick-head"><span>Quick open</span><button class="br-link" type="button" data-act="quick-edit">Edit</button></div>
              <div class="br-quick-grid"></div>
            </div>
            <p class="br-start-note">${ico('shield')}Ads and trackers are blocked</p>
          </div>
        </div>
        <div class="br-msg" hidden></div>
        <div class="br-loadbar" hidden></div>
        <div class="br-scrim" hidden></div>
        <div class="br-panel" hidden role="dialog"></div>
      </div>
    </section>`;
  el.side = root.querySelector('.br-side');
  el.head = root.querySelector('.br-head');
  el.addr = root.querySelector('.br-addr');
  el.addrInput = root.querySelector('.br-addr-input');
  el.addrIco = root.querySelector('.br-addr-ico');
  el.nav = root.querySelector('.br-nav');
  el.tools = root.querySelector('.br-tools');
  el.zoomVal = root.querySelector('.br-zoom-val');
  el.mute = root.querySelector('.br-mute');
  el.tabs = root.querySelector('.br-tabs');
  el.sel = root.querySelector('.br-tab-sel');
  el.newrow = root.querySelector('.br-newrow');
  el.foot = root.querySelector('.br-foot');
  el.card = root.querySelector('.br-card');
  el.host = root.querySelector('.br-host');
  el.start = root.querySelector('.br-start');
  el.startForm = root.querySelector('.br-start-form');
  el.startInput = el.startForm.querySelector('input');
  el.quick = root.querySelector('.br-quick');
  el.quickGrid = root.querySelector('.br-quick-grid');
  el.quickEditBtn = root.querySelector('[data-act="quick-edit"]');
  el.resizer = root.querySelector('.br-resizer');
  el.msg = root.querySelector('.br-msg');
  el.scrim = root.querySelector('.br-scrim');
  el.panel = root.querySelector('.br-panel');
  el.ownerBtn = root.querySelector('.br-owner-btn');
  el.shield = root.querySelector('.br-shield');
  el.shieldText = root.querySelector('.br-shield-text');
  el.loadbar = root.querySelector('.br-loadbar');
  el.btn = {};
  root.querySelectorAll('[data-act]').forEach((b) => { el.btn[b.dataset.act] = b; });

  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.br-iconbtn, .br-newtab, .br-zoom-val, .br-tab, .br-engine, .br-wall, .br-theme, .br-btn, .br-qt-btn, .br-qt-del');
    if (b && !b.disabled) b.classList.add('is-pressed');
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => root.addEventListener(t, () => {
    root.querySelectorAll('.is-pressed').forEach((n) => n.classList.remove('is-pressed'));
  }, true));
  el.addr.addEventListener('submit', (e) => { e.preventDefault(); navigate(el.addrInput.value); el.addrInput.blur(); });
  el.addrInput.addEventListener('focus', () => { el.addrInput.select(); if (prefs.compact && !narrow()) peek(true); });
  el.addrInput.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== el.addrInput) peek(false); }, 120); render(); });
  el.addr.addEventListener('click', () => { if (prefs.compact && !narrow()) { peek(true); el.addrInput.focus(); } });
  el.startForm.addEventListener('submit', (e) => { e.preventDefault(); navigate(el.startInput.value); el.startInput.value = ''; });
  el.tabs.addEventListener('auxclick', (e) => { const t = e.target.closest('[data-tab]'); if (t && e.button === 1) { e.preventDefault(); closeTab(t.dataset.tab); } });
  el.scrim.addEventListener('click', () => closePanel());
  el.resizer.addEventListener('pointerdown', startResize);
  el.resizer.addEventListener('dblclick', () => setSideWidth(SIDE_DEFAULT, true));
  el.resizer.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setSideWidth((prefs.sideWidth || SIDE_DEFAULT) + (e.key === 'ArrowRight' ? 16 : -16), true);
  });
  root.addEventListener('submit', (e) => {
    if (!e.target.classList.contains('br-sc-form')) return;
    e.preventDefault();
    addShortcut(e.target);
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel) { e.stopPropagation(); closePanel(); } });
  document.addEventListener('fullscreenchange', render);
  window.addEventListener('message', onHostMessage);
  window.addEventListener('resize', () => { if (opened) queueRender(); });
  setInterval(checkTicketAge, 5 * 60 * 1000);
  applyPrefs();
  renderQuick(false);
}

// ---------------------------------------------------------------- open / close

export function isOpen() { return opened; }

export function open(hubApi) {
  api = hubApi || api;
  if (!root) build();
  if (opened) return;
  opened = true;
  root.hidden = false;
  root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  if (api && api.onChange) api.onChange(true);
  hookChat();
  connect();
  render();
  animateOpen();
  const t = active();
  if ((!t || !t.url) && phase === 'ready' && matchMedia('(hover: hover)').matches) setTimeout(() => el.startInput.focus(), 120);
}

export function close() {
  if (!opened) return;
  opened = false;
  if (panel) closePanel(true);
  if (document.fullscreenElement && root.contains(document.fullscreenElement)) document.exitFullscreen().catch(() => {});
  if (api && api.onChange) api.onChange(false);
  const done = () => { if (!opened) root.hidden = true; };
  if (REDUCE.matches) { done(); return; }
  const o = pillOrigin(el.card);
  el.card.style.transformOrigin = o;
  ease(el.card, [{ transform: 'scale(1)', opacity: 1, filter: 'blur(0)' }, { transform: 'scale(.18)', opacity: 0, filter: 'blur(10px)' }], 260, EASE_IN, { fill: 'forwards' });
  const a = ease(el.side, [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-28px) scale(.96)', opacity: 0 }], 230, EASE_IN, { fill: 'forwards' });
  (a ? a.finished : Promise.resolve()).then(done, done);
}

// The Browse button's middle, as a transform-origin inside el (so the window grows out of it).
function pillOrigin(node) {
  const btn = document.getElementById('browse-btn');
  const c = node.getBoundingClientRect();
  if (!btn) return 'top right';
  const b = btn.getBoundingClientRect();
  return (b.left + b.width / 2 - c.left) + 'px ' + (b.top + b.height / 2 - c.top) + 'px';
}

function animateOpen() {
  if (REDUCE.matches) return;
  el.card.style.transformOrigin = pillOrigin(el.card);
  spring(el.card, [{ transform: 'scale(.12)' }, { transform: 'scale(1)' }], SPRING.soft);
  ease(el.card, [{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0)' }], 380);
  spring(el.side, [{ transform: 'translateX(-40px) scale(.94)' }, { transform: 'none' }], SPRING.soft, { delay: 40, fill: 'backwards' });
  ease(el.side, [{ opacity: 0 }, { opacity: 1 }], 300, EASE_OUT, { delay: 40, fill: 'backwards' });
  stagger([el.head, el.addr, el.nav, el.tools, el.tabs, el.newrow, el.foot], 110, 32);
}

// ---------------------------------------------------------------- sign-in ticket and the Browse frame

function auth() {
  try {
    const token = localStorage.getItem('sahurhub.chat.session');
    const device = localStorage.getItem('sahurhub.chat.device');
    return token && /^[a-f0-9]{64}$/.test(device || '') ? { token, device } : null;
  } catch (e) { return null; }
}

async function postChat(path, body) {
  const r = await fetch(CHAT + path, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'The chat server did not answer.');
  return d;
}

function getTicket(force) {
  if (ticket && !force && Date.now() - ticket.at < ticket.ttl - 3600e3) return Promise.resolve(ticket);
  if (ticketPromise) return ticketPromise;
  const a = auth();
  if (!a) return Promise.resolve(null);
  ticketPromise = postChat('/api/browse/ticket', a).then((d) => {
    ticket = d.ok ? { value: d.ticket, owner: !!d.owner, at: Date.now(), ttl: d.ttl || 12 * 3600e3 } : null;
    return ticket;
  }).finally(() => { ticketPromise = null; });
  return ticketPromise;
}

async function checkTicketAge() {
  if (!ticket || phase !== 'ready') return;
  if (Date.now() - ticket.at < ticket.ttl - 3600e3) return;
  try { const t = await getTicket(true); if (t) send({ type: 'ticket', ticket: t.value }); } catch (e) {}
}

async function connect() {
  if (phase === 'ready' || phase === 'connecting') { if (phase === 'ready') checkTicketAge(); return; }
  if (!auth()) { setPhase('signin'); return; }
  setPhase('connecting');
  let t = null;
  try { t = await getTicket(false); } catch (e) { setPhase('error', 'Could not reach SahurHub Chat. Check your connection.'); return; }
  if (!t) { setPhase('signin'); return; }
  if (!hostFrame) {
    hostFrame = document.createElement('iframe');
    hostFrame.className = 'br-frame';
    hostFrame.title = 'Browse';
    hostFrame.setAttribute('allow', 'fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write');
    hostFrame.allowFullscreen = true;
    hostFrame.src = BROWSE + '/host.html';
    el.host.appendChild(hostFrame);
  } else if (hostHello) {
    send({ type: 'init', ticket: t.value, dark: !!prefs.darkSites });
  }
  const frameNow = hostFrame;
  setTimeout(() => {
    if (phase === 'connecting' && hostFrame === frameNow) setPhase('error', 'Browse is not answering. Try again in a minute.');
  }, 30000);
}

// While it says "Sign in", start as soon as the chat signs in (the chat is on this same page).
setInterval(() => { if (opened && phase === 'signin' && auth()) connect(); }, 1500);

function send(msg) {
  if (hostFrame && hostFrame.contentWindow) hostFrame.contentWindow.postMessage(msg, BROWSE_ORIGIN);
}

function onHostMessage(e) {
  if (!hostFrame || e.source !== hostFrame.contentWindow || e.origin !== BROWSE_ORIGIN) return;
  const m = e.data || {};
  if (m.type === 'hello') {
    hostHello = true;
    if (ticket) send({ type: 'init', ticket: ticket.value, dark: !!prefs.darkSites });
  } else if (m.type === 'ready') {
    setPhase('ready');
    restoreTabs();
  } else if (m.type === 'fail') {
    if (m.code === 'off') setPhase('off');
    else if (m.code === 'unsupported') setPhase('unsupported');
    else setPhase('error', 'Browse could not start. Try again.');
  } else if (m.type === 'state') {
    const t = tabs.find((x) => x.id === m.id);
    if (!t) return;
    const changed = t.url !== m.url;
    const ads = Number(m.ads) || 0;
    if (t.id === activeId && ads > t.ads) shieldPop();
    t.url = String(m.url || '');
    t.title = String(m.title || '');
    t.loading = !!m.loading;
    t.ads = ads;
    t.audible = !!m.audible;
    if (changed) saveTabs();
    queueRender();
  } else if (m.type === 'newtab') {
    newTab(String(m.url || ''), true);
  }
}

function setPhase(p, text) {
  phase = p;
  phaseText = text || '';
  if (p !== 'ready' && p !== 'connecting') {
    // start over next time (for example after signing in)
    hostHello = false;
    if (hostFrame) { hostFrame.remove(); hostFrame = null; }
    tabs.forEach((t) => { t.opened = false; });
  }
  render();
}

// ---------------------------------------------------------------- tabs

function active() { return tabs.find((t) => t.id === activeId) || null; }

function makeTab(s) {
  return {
    id: 't' + nextId++, url: s.url || '', title: s.title || '', loading: false, ads: 0, opened: false,
    zoom: ZOOMS.includes(s.zoom) ? s.zoom : 1, muted: !!s.muted, audible: false
  };
}

function newTab(url, activate, from) {
  if (tabs.length >= MAX_TABS) { if (api) api.toast('You can have up to ' + MAX_TABS + ' tabs.'); return null; }
  const t = makeTab(Object.assign({ url }, from || {}));
  t.loading = !!url;
  tabs.push(t);
  if (activate !== false) select(t.id); else render();
  saveTabs();
  return t;
}

function ensureOpened(t) {
  if (!t || t.opened || phase !== 'ready') return;
  t.opened = true;
  send({ type: 'open', id: t.id, url: t.url || '', zoom: t.zoom, muted: t.muted });
}

function select(id) {
  activeId = id;
  ensureOpened(active());
  send({ type: 'show', id });
  saveTabs();
  render();
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i === -1) return;
  const [t] = tabs.splice(i, 1);
  if (t.url) {
    closed.push({ url: t.url, title: t.title, zoom: t.zoom, muted: t.muted });
    if (closed.length > MAX_CLOSED) closed.shift();
  }
  if (t.opened) send({ type: 'close', id: t.id });
  if (!tabs.length) newTab('', true);
  else if (activeId === id) select(tabs[Math.min(i, tabs.length - 1)].id);
  saveTabs();
  render();
}

function reopenTab() {
  const c = closed.pop();
  if (!c) return;
  const t = newTab(c.url, true, c);
  if (!t) closed.push(c);
  saveTabs();
}

function toUrl(text) {
  text = String(text || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (!/\s/.test(text) && /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text)) return 'https://' + text;
  return engine().url + encodeURIComponent(text);
}

function navigate(text) {
  const url = toUrl(text);
  if (!url || phase !== 'ready') return;
  let t = active();
  if (!t) t = newTab('', true);
  t.url = url;
  t.title = '';
  t.loading = true;
  t.ads = 0;
  if (!t.opened) ensureOpened(t); else send({ type: 'go', id: t.id, url });
  send({ type: 'show', id: t.id });
  saveTabs();
  render();
}

function setZoom(t, z) {
  if (!t) return;
  t.zoom = z;
  send({ type: 'zoom', id: t.id, zoom: z });
  saveTabs();
  render();
  spring(el.zoomVal, [{ transform: 'scale(.82)' }, { transform: 'scale(1)' }], SPRING.pop);
}

function setMuted(t, muted) {
  if (!t) return;
  t.muted = muted;
  send({ type: 'mute', id: t.id, muted });
  saveTabs();
  render();
}

// Tabs (with their zoom and mute) and recently closed tabs are saved on this device.
function saveTabs() {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify({
      tabs: tabs.map((t) => ({ url: t.url, title: t.title, zoom: t.zoom, muted: t.muted })),
      active: tabs.findIndex((t) => t.id === activeId),
      closed
    }));
  } catch (e) {}
}

function restoreTabs() {
  if (tabs.length) {
    // Browse was reconnected: open the tabs again in the new frame
    tabs.forEach((t) => { t.opened = false; });
    select((active() || tabs[0]).id);
    return;
  }
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(TABS_KEY) || 'null'); } catch (e) {}
  if (saved && Array.isArray(saved.closed)) closed = saved.closed.filter((c) => c && /^https?:\/\//i.test(c.url)).slice(-MAX_CLOSED);
  const list = saved && Array.isArray(saved.tabs) ? saved.tabs.filter((t) => t && typeof t.url === 'string').slice(0, MAX_TABS) : [];
  if (!list.length) { newTab('', true); return; }
  list.forEach((s) => { tabs.push(makeTab({ url: /^https?:\/\//i.test(s.url) ? s.url : '', title: String(s.title || ''), zoom: s.zoom, muted: s.muted })); });
  const i = Math.max(0, Math.min(tabs.length - 1, Number(saved.active) || 0));
  select(tabs[i].id); // only the tab on screen loads now; the others load when picked
}

// ---------------------------------------------------------------- buttons

function onClick(e) {
  const muteBtn = e.target.closest('[data-mute]');
  if (muteBtn) { const t = tabs.find((x) => x.id === muteBtn.dataset.mute); if (t) { setMuted(t, !t.muted); bounce(muteBtn); } return; }
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) { closeTab(closeBtn.dataset.close); return; }
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { if (tabBtn.dataset.tab !== activeId) bounce(tabBtn.querySelector('.br-fav')); select(tabBtn.dataset.tab); return; }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const t = active();
  const svg = b.querySelector(':scope > svg');
  switch (b.dataset.act) {
    case 'exit': close(); break;
    case 'newtab': if (phase === 'ready') { bounce(svg); newTab('', true); setTimeout(() => el.startInput.focus(), 60); } break;
    case 'reopen': bounce(svg); reopenTab(); break;
    case 'back': bounce(svg); if (t && t.opened) send({ type: 'back', id: t.id }); break;
    case 'forward': bounce(svg); if (t && t.opened) send({ type: 'forward', id: t.id }); break;
    case 'reload':
      if (t && t.url) {
        t.loading = true;
        send({ type: 'reload', id: t.id });
        ease(svg, [{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], 600);
        render();
      }
      break;
    case 'share':
      bounce(svg);
      if (!t || !t.url) { if (api) api.toast('Open a website first, then share it.'); break; }
      if (api) api.loadChat().then((m) => { if (m.shareLink) m.shareLink(t.url, t.title, b); }).catch(() => api.toast('The chat could not load.'));
      break;
    case 'full': bounce(svg); toggleFullscreen(); break;
    case 'prefs': bounce(svg); togglePanel('prefs'); break;
    case 'owner': bounce(svg); togglePanel('owner'); break;
    case 'panel-close': closePanel(); break;
    case 'compact': bounce(svg); setPref('compact', !prefs.compact); break;
    case 'zoom-in': bounce(svg); if (t) setZoom(t, ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(t.zoom) + 1)] || 1); break;
    case 'zoom-out': bounce(svg); if (t) setZoom(t, ZOOMS[Math.max(0, ZOOMS.indexOf(t.zoom) - 1)] || 1); break;
    case 'zoom-reset': if (t) setZoom(t, 1); break;
    case 'mute': if (t) { setMuted(t, !t.muted); bounce(el.mute.querySelector('svg')); } break;
    case 'retry': setPhase('idle'); connect(); break;
    case 'signin': if (api && api.openChat) api.openChat(); break;
    case 'owner-save': saveOwner(); break;
    case 'engine': pickEngine(b); break;
    case 'wall': pickWallpaper(b); break;
    case 'switch': setPref(b.dataset.pref, !prefs[b.dataset.pref]); break;
    case 'theme': pickTheme(b); break;
    case 'shop': closePanel(true); if (api && api.openShop) api.openShop(); break;
    case 'quick': {
      if (quickEdit) break;
      const s = shortcuts[Number(b.dataset.i)];
      if (s) { bounce(b.querySelector('.br-qt-ico')); setTimeout(() => navigate(s.url), 120); }
      break;
    }
    case 'quick-del': removeShortcut(Number(b.dataset.i), b); break;
    case 'quick-edit': toggleQuickEdit(); break;
    case 'quick-add': quickEdit = false; renderQuick(false); togglePanel('shortcut'); break;
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  if (!el.card.requestFullscreen) { if (api) api.toast('Fullscreen is not available here.'); return; }
  el.card.requestFullscreen().catch(() => { if (api) api.toast('Fullscreen is not available here.'); });
}

function shieldPop() {
  const now = Date.now();
  if (shieldPop.at && now - shieldPop.at < 700) return;
  shieldPop.at = now;
  spring(el.shield.querySelector('svg'), [{ transform: 'scale(1.35) rotate(-8deg)' }, { transform: 'none' }], SPRING.pop);
}

// ---------------------------------------------------------------- resizing the sidebar (drag the handle)
// Drag left or right to make the sidebar (and so the website) narrower or wider. Dragging it
// right down snaps to the compact sidebar; dragging out of compact opens it again.

function sideAnim(fromW) {
  const now = el.side.getBoundingClientRect().width;
  if (Math.abs(now - fromW) > 1) spring(el.side, [{ width: fromW + 'px' }, { width: now + 'px' }], SPRING.snap);
}

function setSideWidth(w, animate) {
  const from = el.side.getBoundingClientRect().width;
  prefs.sideWidth = Math.round(Math.max(SIDE_MIN, Math.min(SIDE_MAX, w)));
  if (prefs.compact) prefs.compact = false;
  savePrefs();
  applyPrefs();
  if (animate) sideAnim(from);
  queueRender();
  if (panel === 'prefs') updatePrefs();
}

function startResize(e) {
  if (narrow() || e.button !== 0) return;
  e.preventDefault();
  const r = el.resizer;
  try { r.setPointerCapture(e.pointerId); } catch (err) {}
  r.classList.add('is-drag');
  root.classList.add('is-resizing');
  const left = el.side.getBoundingClientRect().left;
  const move = (ev) => {
    const w = ev.clientX - left - 6;
    if (prefs.compact) {
      if (w > 160) { const from = el.side.getBoundingClientRect().width; prefs.compact = false; prefs.sideWidth = Math.max(SIDE_MIN, Math.min(SIDE_MAX, w)); applyPrefs(); sideAnim(from); }
      return;
    }
    if (w < 130) { const from = el.side.getBoundingClientRect().width; prefs.compact = true; applyPrefs(); sideAnim(from); return; }
    prefs.sideWidth = Math.round(Math.max(SIDE_MIN, Math.min(SIDE_MAX, w)));
    root.style.setProperty('--side-w', prefs.sideWidth + 'px');
    queueRender();
  };
  const up = () => {
    r.removeEventListener('pointermove', move);
    r.removeEventListener('pointerup', up);
    r.removeEventListener('pointercancel', up);
    r.classList.remove('is-drag');
    root.classList.remove('is-resizing');
    savePrefs();
    queueRender();
    if (panel === 'prefs') updatePrefs();
  };
  r.addEventListener('pointermove', move);
  r.addEventListener('pointerup', up);
  r.addEventListener('pointercancel', up);
}

// ---------------------------------------------------------------- Quick open (shortcut tiles on the start page)

function hueOf(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

// A tile's picture: known sites get their colours, everything else a letter on a colour picked from its name.
function quickIcon(s) {
  const host = hostOf(s.url);
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return { bg: '#ff0033', html: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="4" fill="#fff"/><path d="M10.2 9.2v5.6l4.8-2.8Z" fill="#ff0033"/></svg>' };
  if (/(^|\.)tiktok\.com$/.test(host)) return { bg: '#111114', html: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.6 4.5v9.8a3.2 3.2 0 1 1-2.8-3.2" stroke="#25f4ee" transform="translate(-.8 -.6)"/><path d="M13.6 4.5c.4 2.2 2 3.7 4.2 3.9" stroke="#25f4ee" transform="translate(-.8 -.6)"/><path d="M13.6 4.5v9.8a3.2 3.2 0 1 1-2.8-3.2" stroke="#fe2c55" transform="translate(.8 .6)"/><path d="M13.6 4.5c.4 2.2 2 3.7 4.2 3.9" stroke="#fe2c55" transform="translate(.8 .6)"/><path d="M13.6 4.5v9.8a3.2 3.2 0 1 1-2.8-3.2M13.6 4.5c.4 2.2 2 3.7 4.2 3.9" stroke="#fff"/></svg>' };
  if (/(^|\.)(geforcenow\.com|nvidia\.com)$/.test(host)) return { bg: '#76b900', html: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="11" rx="2.5"/><path d="M10.3 8.6v4.8l4-2.4Z" fill="#fff"/><path d="M9 19.5h6"/></svg>' };
  const letter = esc(siteLetter(host) || String(s.name || '?').charAt(0).toUpperCase());
  return { bg: `hsl(${hueOf(host || s.name)} 62% 46%)`, html: `<span>${letter}</span>` };
}

function renderQuick(animate) {
  if (!el.quickGrid) return;
  el.quick.classList.toggle('is-editing', quickEdit);
  el.quickEditBtn.textContent = quickEdit ? 'Done' : 'Edit';
  el.quickGrid.innerHTML = shortcuts.map((s, i) => {
    const ic = quickIcon(s);
    const name = s.name || hostOf(s.url);
    return `<div class="br-qt" style="--d:${(i % 5) * -0.07}s">
      <button class="br-qt-btn" type="button" data-act="quick" data-i="${i}" title="${esc(s.url)}"><span class="br-qt-ico" style="background:${esc(ic.bg)}">${ic.html}</span><span class="br-qt-name">${esc(name)}</span></button>
      <button class="br-qt-del" type="button" data-act="quick-del" data-i="${i}" aria-label="Remove ${esc(name)}">${ico('minus')}</button>
    </div>`;
  }).join('') + (shortcuts.length < MAX_SHORTCUTS ? `<div class="br-qt"><button class="br-qt-btn is-add" type="button" data-act="quick-add"><span class="br-qt-ico">${ico('plus')}</span><span class="br-qt-name">Add</span></button></div>` : '');
  if (animate) {
    el.quickGrid.querySelectorAll('.br-qt').forEach((t, i) => {
      spring(t, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], SPRING.pop, { delay: 120 + i * 35, fill: 'backwards' });
    });
  }
}

function toggleQuickEdit() {
  quickEdit = !quickEdit;
  renderQuick(false);
  if (quickEdit) el.quickGrid.querySelectorAll('.br-qt-del').forEach((d, i) => spring(d, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], SPRING.pop, { delay: i * 25, fill: 'backwards' }));
}

function removeShortcut(i, btn) {
  const tile = btn && btn.closest('.br-qt');
  const done = () => {
    shortcuts.splice(i, 1);
    saveShortcuts();
    renderQuick(false);
  };
  if (!tile) { done(); return; }
  const a = ease(tile, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.3)', opacity: 0 }], 200, EASE_IN, { fill: 'forwards' });
  (a ? a.finished : Promise.resolve()).then(done, done);
}

function buildShortcutForm() {
  el.panel.innerHTML = `<div class="br-panel-in">
    ${panelHead('Add to Quick open')}
    <form class="br-sc-form br-sec" autocomplete="off">
      <label class="br-label" for="br-sc-url">Web address</label>
      <input class="br-input" id="br-sc-url" name="url" type="text" inputmode="url" spellcheck="false" autocapitalize="off" placeholder="example.com" required>
      <label class="br-label" for="br-sc-name">Name (optional)</label>
      <input class="br-input" id="br-sc-name" name="name" type="text" maxlength="40" placeholder="My site">
      <p class="br-sc-err" hidden></p>
      <button class="br-btn" type="submit">${ico('plus')}Add</button>
      <p class="br-muted br-small">Tip: the page you're on now can be added with this too.</p>
    </form>
  </div>`;
  const t = active();
  const urlIn = el.panel.querySelector('[name="url"]');
  if (t && t.url) { urlIn.value = t.url; el.panel.querySelector('[name="name"]').value = (t.title || '').slice(0, 40); }
  setTimeout(() => { if (matchMedia('(hover: hover)').matches) urlIn.focus(); }, 260);
}

function addShortcut(form) {
  const err = form.querySelector('.br-sc-err');
  let url = form.url.value.trim();
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  let host = '';
  try { host = new URL(url).hostname; } catch (e) {}
  if (!host || !/\./.test(host)) {
    err.textContent = 'Type a web address, for example youtube.com.';
    err.hidden = false;
    spring(form.url, [{ transform: 'translateX(-8px)' }, { transform: 'none' }], SPRING.pop);
    return;
  }
  if (shortcuts.length >= MAX_SHORTCUTS) { err.textContent = 'Quick open is full. Remove one first.'; err.hidden = false; return; }
  shortcuts.push({ name: form.name.value.trim().slice(0, 40) || hostOf(url), url });
  saveShortcuts();
  closePanel();
  renderQuick(false);
  const last = el.quickGrid.querySelectorAll('.br-qt')[shortcuts.length - 1];
  if (last) spring(last, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], SPRING.pop);
  if (api) api.toast('Added to Quick open.');
}

// ---------------------------------------------------------------- compact sidebar ("peek" opens it over the page while typing)

function peek(on) {
  if (!root) return;
  if (root.classList.contains('is-peek') === on) return;
  root.classList.toggle('is-peek', on);
  if (on) {
    spring(el.side, [{ width: '72px' }, { width: '268px' }], SPRING.snap);
    stagger([el.addr, el.nav, el.tools], 20, 25);
  }
}

// ---------------------------------------------------------------- settings (saved on this device)

function setPref(key, value) {
  const old = el.side.getBoundingClientRect().width;
  prefs[key] = value;
  savePrefs();
  applyPrefs();
  if (key === 'compact' && !narrow()) {
    const now = el.side.getBoundingClientRect().width;
    spring(el.side, [{ width: old + 'px' }, { width: now + 'px' }], SPRING.snap);
    stagger(el.tabs.querySelectorAll('.br-tab'), 40, 20);
  }
  if (key === 'darkSites') send({ type: 'dark', on: !!value });
  if (panel === 'prefs') updatePrefs();
  render();
}

function applyPrefs() {
  root.classList.toggle('is-compact', !!prefs.compact);
  const w = Math.max(SIDE_MIN, Math.min(SIDE_MAX, Number(prefs.sideWidth) || SIDE_DEFAULT));
  root.style.setProperty('--side-w', w + 'px');
  el.start.dataset.wall = WALLPAPERS.some((w) => w.id === prefs.wallpaper) ? prefs.wallpaper : 'dots';
  applyTheme();
}

function pickEngine(b) {
  prefs.engine = b.dataset.engine;
  savePrefs();
  updatePrefs(true);
  render();
}

function pickWallpaper(b) {
  prefs.wallpaper = b.dataset.wall;
  savePrefs();
  applyPrefs();
  updatePrefs();
  spring(b, [{ transform: 'scale(.86)' }, { transform: 'scale(1)' }], SPRING.pop);
}

// ---------------------------------------------------------------- sidebar themes (bought in the Shop with coins)

function hookChat() {
  if (chatMod || !api) return;
  api.loadChat().then((m) => {
    if (chatMod) return;
    chatMod = m;
    if (m.onWallet) m.onWallet((info) => { wallet = info && info.wallet; applyTheme(); if (panel === 'prefs') updatePrefs(); });
  }).catch(() => {});
}

function browseThemes() { return chatMod && chatMod.shopItems ? chatMod.shopItems('browse') : []; }

function applyTheme() {
  if (!root) return;
  const id = wallet && wallet.look ? wallet.look.browse : '';
  const it = id ? browseThemes().find((x) => x.id === id) : null;
  root.classList.toggle('has-theme', !!it);
  if (it) {
    root.style.setProperty('--bt-bg', it.look.bg);
    root.style.setProperty('--bt-accent', it.look.accent || '#ffffff');
    root.dataset.ink = it.look.ink === 'dark' ? 'dark' : 'light';
    root.dataset.themeAnim = it.look.anim || '';
  } else {
    root.style.removeProperty('--bt-bg');
    root.style.removeProperty('--bt-accent');
    delete root.dataset.ink;
    delete root.dataset.themeAnim;
  }
}

async function pickTheme(b) {
  if (!chatMod || !chatMod.equip) return;
  const id = b.dataset.theme || '';
  spring(b, [{ transform: 'scale(.88)' }, { transform: 'scale(1)' }], SPRING.pop);
  try { await chatMod.equip('browse', id); } catch (e) { if (api) api.toast(e.message || 'That did not work.'); }
}

// ---------------------------------------------------------------- panels (settings and Owner controls)

function togglePanel(kind) {
  if (panel === kind) { closePanel(); return; }
  if (panel) closePanel(true);
  panel = kind;
  el.scrim.hidden = false;
  el.panel.hidden = false;
  el.panel.className = 'br-panel is-' + kind;
  el.panel.setAttribute('aria-label', kind === 'owner' ? 'Browse controls' : kind === 'shortcut' ? 'Add to Quick open' : 'Browse settings');
  if (kind === 'prefs') buildPrefs();
  else if (kind === 'shortcut') buildShortcutForm();
  else { ownerData = null; renderOwner(); loadOwner(); }
  render();
  const sheet = narrow();
  ease(el.scrim, [{ opacity: 0 }, { opacity: 1 }], 260);
  spring(el.panel, [{ transform: sheet ? 'translateY(104%)' : 'translateX(104%)' }, { transform: 'none' }], SPRING.sheet);
  stagger(el.panel.querySelectorAll('.br-panel-in > *'), 80, 30);
}

function closePanel(instant) {
  if (!panel) return;
  panel = null;
  render();
  const hide = () => { if (!panel) { el.panel.hidden = true; el.scrim.hidden = true; el.panel.innerHTML = ''; } };
  if (instant || REDUCE.matches) { hide(); return; }
  const sheet = narrow();
  ease(el.scrim, [{ opacity: 1 }, { opacity: 0 }], 200, EASE_IN, { fill: 'forwards' });
  const a = ease(el.panel, [{ transform: 'none' }, { transform: sheet ? 'translateY(104%)' : 'translateX(104%)' }], 230, EASE_IN, { fill: 'forwards' });
  (a ? a.finished : Promise.resolve()).then(() => { el.panel.getAnimations().forEach((x) => x.cancel()); el.scrim.getAnimations().forEach((x) => x.cancel()); hide(); }, hide);
}

function panelHead(title) {
  return `<div class="br-panel-head"><span class="br-grab" aria-hidden="true"></span><h3>${esc(title)}</h3><button class="br-iconbtn" type="button" data-act="panel-close" aria-label="Close">${ico('close')}</button></div>`;
}

function buildPrefs() {
  el.panel.innerHTML = `<div class="br-panel-in">
    ${panelHead('Browse settings')}
    <section class="br-sec">
      <p class="br-label">Search engine</p>
      <div class="br-engines" role="radiogroup" aria-label="Search engine">
        <span class="br-engine-sel" aria-hidden="true"></span>
        ${ENGINES.map((x) => `<button class="br-engine" type="button" role="radio" data-act="engine" data-engine="${x.id}">
          <span class="br-engine-dot">${ico('check')}</span><span class="br-engine-text">${esc(x.name)}<small>${esc(x.note)}</small></span></button>`).join('')}
      </div>
      <p class="br-muted br-small">Typing words (not a web address) searches with this. Some search engines are fussy in Browse because every search comes from SahurHub's server.</p>
    </section>
    <section class="br-sec">
      <p class="br-label">Start page wallpaper</p>
      <div class="br-walls">${WALLPAPERS.map((w) => `<button class="br-wall" type="button" data-act="wall" data-wall="${w.id}" aria-label="${esc(w.name)}"><span class="br-wall-sw" data-wall="${w.id}"></span><span>${esc(w.name)}</span></button>`).join('')}</div>
    </section>
    <section class="br-sec">
      <p class="br-label">Look</p>
      <button class="br-switch" type="button" role="switch" data-act="switch" data-pref="compact"><span class="br-switch-ui"></span><span><b>Compact sidebar</b><small>Only icons, so websites get more room. On bigger screens.</small></span></button>
      <button class="br-switch" type="button" role="switch" data-act="switch" data-pref="darkSites"><span class="br-switch-ui"></span><span><b>Dark mode for websites</b><small>Makes bright websites dark. Pictures and videos keep their colours.</small></span></button>
    </section>
    <section class="br-sec">
      <p class="br-label">Sidebar theme</p>
      <div class="br-themes"></div>
      <button class="br-btn br-btn-quiet br-shop-btn" type="button" data-act="shop">${ico('bag')}Get more themes in the Shop</button>
    </section>
  </div>`;
  updatePrefs();
}

function updatePrefs(animateSel) {
  if (panel !== 'prefs') return;
  const cur = engine().id;
  const rows = el.panel.querySelectorAll('.br-engine');
  let onRow = null;
  rows.forEach((r) => {
    const on = r.dataset.engine === cur;
    r.classList.toggle('is-on', on);
    r.setAttribute('aria-checked', on ? 'true' : 'false');
    if (on) onRow = r;
  });
  const sel = el.panel.querySelector('.br-engine-sel');
  if (sel && onRow) {
    const from = sel.style.transform;
    const to = `translateY(${onRow.offsetTop}px)`;
    sel.style.height = onRow.offsetHeight + 'px';
    sel.style.transform = to;
    if (animateSel && from && from !== to) {
      spring(sel, [{ transform: from }, { transform: to }], SPRING.snap);
      spring(onRow.querySelector('.br-engine-dot'), [{ transform: 'scale(.4)' }, { transform: 'scale(1)' }], SPRING.pop);
    }
  }
  el.panel.querySelectorAll('.br-wall').forEach((w) => w.classList.toggle('is-on', w.dataset.wall === (prefs.wallpaper || 'dots')));
  el.panel.querySelectorAll('.br-switch').forEach((s) => s.setAttribute('aria-checked', prefs[s.dataset.pref] ? 'true' : 'false'));
  // sidebar themes: Default plus the ones you own
  const box = el.panel.querySelector('.br-themes');
  if (box) {
    const all = browseThemes();
    const owned = wallet && wallet.owned ? all.filter((x) => wallet.owned.includes(x.id)) : [];
    const cur2 = wallet && wallet.look ? wallet.look.browse || '' : '';
    const html = [`<button class="br-theme${!cur2 ? ' is-on' : ''}" type="button" data-act="theme" data-theme=""><span class="br-theme-sw is-default"></span><span>Default</span></button>`]
      .concat(owned.map((x) => `<button class="br-theme${cur2 === x.id ? ' is-on' : ''}" type="button" data-act="theme" data-theme="${esc(x.id)}"><span class="br-theme-sw${x.look.anim ? ' is-shift' : ''}" style="background:${esc(x.look.bg)}"><i style="background:${esc(x.look.accent || '#fff')}"></i></span><span>${esc(x.name)}</span></button>`))
      .join('') + (!chatMod ? '<p class="br-muted br-small">Loading your themes...</p>' : !owned.length ? '<p class="br-muted br-small">Buy a theme in the Shop with your coins and it shows up here.</p>' : '');
    if (box.innerHTML !== html) box.innerHTML = html;
  }
}

// ---------------------------------------------------------------- Owner controls

let ownerData = null;
let ownerBusy = false;

async function loadOwner() {
  const a = auth();
  if (!a) return;
  try { ownerData = await postChat('/api/browse/owner', { ...a, op: 'get' }); } catch (e) { ownerData = { error: e.message }; }
  renderOwner();
}

async function saveOwner() {
  if (ownerBusy) return;
  const a = auth();
  if (!a) return;
  const sw = el.panel.querySelector('[data-f="enabled"]');
  const enabled = sw ? sw.getAttribute('aria-checked') === 'true' : true;
  const blocked = el.panel.querySelector('[data-f="blocked"]').value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  ownerBusy = true;
  try {
    ownerData = await postChat('/api/browse/owner', { ...a, op: 'set', enabled, blocked });
    send({ type: 'lists' });
    if (api) api.toast('Browse settings saved.');
  } catch (e) {
    if (api) api.toast(e.message);
  }
  ownerBusy = false;
  renderOwner();
}

function renderOwner() {
  if (panel !== 'owner') return;
  const first = !el.panel.querySelector('.br-panel-in');
  if (!ownerData) { el.panel.innerHTML = `<div class="br-panel-in">${panelHead('Browse controls')}<div class="br-sec"><span class="br-spinner"></span></div></div>`; return; }
  if (ownerData.error) { el.panel.innerHTML = `<div class="br-panel-in">${panelHead('Browse controls')}<p class="br-muted">${esc(ownerData.error)}</p></div>`; return; }
  const u = ownerData.usage || {};
  const day = (u.days && u.days[u.today]) || [];
  const totalMb = Math.round(day.reduce((s, r) => s + (r.mb || 0), 0) * 10) / 10;
  const rows = day.slice(0, 30).map((r) => `<tr><td>${esc(r.display || r.name)} <span class="br-muted">@${esc(r.name)}</span></td><td>${r.conns}</td><td>${r.mb} MB</td></tr>`).join('');
  const wasLoading = !!el.panel.querySelector('.br-spinner');
  el.panel.innerHTML = `<div class="br-panel-in">
    ${panelHead('Browse controls')}
    <section class="br-sec">
      <button class="br-switch" type="button" role="switch" data-act="owner-toggle" data-f="enabled" aria-checked="${ownerData.enabled ? 'true' : 'false'}"><span class="br-switch-ui"></span><span><b>Browse is ${ownerData.enabled ? 'on' : 'off'}</b><small>Turning it off stops everyone's browsing straight away. Press Save to apply.</small></span></button>
    </section>
    <section class="br-sec">
      <label class="br-label" for="br-blocked">Blocked sites</label>
      <textarea id="br-blocked" data-f="blocked" rows="5" spellcheck="false" placeholder="One site per line, for example example.com">${esc((ownerData.blocked || []).join('\n'))}</textarea>
      <p class="br-muted br-small">Blocking a site also blocks everything under it (blocking example.com blocks www.example.com). ${u.adsList ? u.adsList + ' ad and tracker sites are blocked as well.' : ''}</p>
      <button class="br-btn" type="button" data-act="owner-save"${ownerBusy ? ' disabled' : ''}>Save</button>
    </section>
    <section class="br-sec">
      <p class="br-label">Today</p>
      <p class="br-muted br-small">${day.length} ${day.length === 1 ? 'person' : 'people'} used Browse, ${totalMb} MB in total. ${u.online || 0} using it right now.</p>
      ${rows ? `<table class="br-table"><thead><tr><th>Who</th><th>Connections</th><th>Data</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    </section>
  </div>`;
  if (first || wasLoading) stagger(el.panel.querySelectorAll('.br-panel-in > .br-sec'), 0, 40);
}

// The Owner's on/off switch only flips here; Save sends it.
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-act="owner-toggle"]');
  if (!b || !root || !root.contains(b)) return;
  const on = b.getAttribute('aria-checked') !== 'true';
  b.setAttribute('aria-checked', on ? 'true' : 'false');
  b.querySelector('b').textContent = 'Browse is ' + (on ? 'on' : 'off');
});

// ---------------------------------------------------------------- drawing

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function tabLabel(t) { return t.title || hostOf(t.url) || 'New tab'; }

function renderTabs() {
  const seen = new Set();
  let prev = el.sel;
  let moved = false;
  tabs.forEach((t) => {
    seen.add(t.id);
    let node = tabEls.get(t.id);
    const fresh = !node;
    if (fresh) {
      node = document.createElement('div');
      node.className = 'br-tab';
      node.setAttribute('role', 'tab');
      node.dataset.tab = t.id;
      node.innerHTML = `<span class="br-fav"></span><span class="br-tab-name"></span><button class="br-tab-snd" type="button" data-mute="${t.id}"></button><button class="br-tab-x" type="button" data-close="${t.id}" aria-label="Close tab">${ico('close')}</button>`;
      tabEls.set(t.id, node);
    }
    // keep the order without moving tabs that are already in place
    let next = prev.nextSibling;
    while (next && next.classList && next.classList.contains('is-leaving')) next = next.nextSibling;
    if (next !== node) { el.tabs.insertBefore(node, prev.nextSibling); moved = true; }
    prev = node;
    const letter = siteLetter(hostOf(t.url));
    const fav = node.children[0];
    const favHtml = letter ? esc(letter) : ico('globe');
    if (fav.dataset.v !== favHtml) { fav.innerHTML = favHtml; fav.dataset.v = favHtml; }
    fav.classList.toggle('is-loading', !!(t.loading && t.url));
    const name = tabLabel(t);
    if (node.children[1].textContent !== name) node.children[1].textContent = name;
    node.title = t.url || 'New tab';
    node.classList.toggle('is-active', t.id === activeId);
    node.setAttribute('aria-selected', t.id === activeId ? 'true' : 'false');
    const snd = node.children[2];
    const showSnd = t.audible || t.muted;
    snd.hidden = !showSnd;
    if (showSnd) {
      const k = t.muted ? 'muted' : 'volume';
      if (snd.dataset.v !== k) {
        snd.innerHTML = ico(k);
        snd.dataset.v = k;
        snd.setAttribute('aria-label', t.muted ? 'Unmute tab' : 'Mute tab');
        spring(snd, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], SPRING.pop);
      }
    }
    if (fresh && opened) {
      spring(node, [{ transform: 'scale(.86) translateY(-6px)', opacity: 0 }, { transform: 'none', opacity: 1 }], SPRING.snap);
      ease(node, [{ maxHeight: '0px' }, { maxHeight: '44px' }], 260);
    }
  });
  for (const [id, node] of tabEls) {
    if (seen.has(id)) continue;
    tabEls.delete(id);
    node.removeAttribute('data-tab');
    node.classList.add('is-leaving');
    const a = ease(node, [{ opacity: 1, transform: 'none', maxHeight: '44px' }, { opacity: 0, transform: 'scale(.86)', maxHeight: '0px', marginTop: '-2px' }], 220, EASE_IN, { fill: 'forwards' });
    const gone = () => { node.remove(); queueRender(); };
    if (a) a.finished.then(gone, gone); else node.remove();
  }
  if (moved && opened) setTimeout(queueRender, 300); // new tabs finish growing, then the pill lines up again
  // the sliding selection pill behind the active tab
  const act = tabEls.get(activeId);
  if (!act) { el.sel.style.opacity = '0'; selBox = null; return; }
  const box = { x: act.offsetLeft, y: act.offsetTop, w: act.offsetWidth, h: act.offsetHeight };
  el.sel.style.opacity = '1';
  el.sel.style.width = box.w + 'px';
  el.sel.style.height = box.h + 'px';
  el.sel.style.transform = `translate(${box.x}px, ${box.y}px)`;
  if (selBox && (selBox.x !== box.x || selBox.y !== box.y) && opened) {
    spring(el.sel, [{ transform: `translate(${selBox.x}px, ${selBox.y}px)`, width: selBox.w + 'px' }, { transform: `translate(${box.x}px, ${box.y}px)`, width: box.w + 'px' }], SPRING.snap);
  }
  selBox = box;
}

function render() {
  if (!root) return;
  const t = active();
  const ready = phase === 'ready';
  renderTabs();

  // address bar and buttons
  const ph = 'Search with ' + engine().name + ' or type a web address';
  if (el.addrInput.placeholder !== ph) { el.addrInput.placeholder = ph; el.startInput.placeholder = ph; }
  if (document.activeElement !== el.addrInput) el.addrInput.value = t && t.url ? t.url : '';
  const icoName = t && /^https:/i.test(t.url) ? 'lock' : 'search';
  if (el.addrIco.dataset.v !== icoName) { el.addrIco.innerHTML = ico(icoName); el.addrIco.dataset.v = icoName; }
  el.addrInput.disabled = !ready;
  const hasUrl = !!(t && t.url);
  ['back', 'forward', 'reload', 'share'].forEach((k) => { el.btn[k].disabled = !ready || !hasUrl; });
  el.btn.full.disabled = !ready;
  el.btn.newtab.disabled = !ready;
  el.btn.reopen.disabled = !ready || !closed.length;
  const fs = !!document.fullscreenElement;
  const fk = fs ? 'unfull' : 'full';
  if (el.btn.full.dataset.v !== fk) { el.btn.full.innerHTML = ico(fk); el.btn.full.dataset.v = fk; el.btn.full.setAttribute('aria-label', fs ? 'Exit fullscreen' : 'Fullscreen'); }
  el.btn.prefs.classList.toggle('is-on', panel === 'prefs');
  el.ownerBtn.classList.toggle('is-on', panel === 'owner');
  el.ownerBtn.hidden = !(ready && ticket && ticket.owner);

  // page tools
  const z = t ? t.zoom || 1 : 1;
  el.zoomVal.textContent = Math.round(z * 100) + '%';
  el.btn['zoom-in'].disabled = !ready || !hasUrl || z >= ZOOMS[ZOOMS.length - 1];
  el.btn['zoom-out'].disabled = !ready || !hasUrl || z <= ZOOMS[0];
  el.zoomVal.disabled = !ready || !hasUrl;
  el.tools.classList.toggle('is-zoomed', z !== 1);
  const mk = t && t.muted ? 'muted' : 'volume';
  if (el.mute.dataset.v !== mk) { el.mute.innerHTML = ico(mk); el.mute.dataset.v = mk; }
  el.mute.disabled = !ready || !hasUrl;
  el.mute.classList.toggle('is-on', !!(t && t.muted));
  el.mute.setAttribute('aria-label', t && t.muted ? 'Unmute tab' : 'Mute tab');
  el.shieldText.textContent = t && t.ads ? t.ads + (t.ads === 1 ? ' ad blocked' : ' ads blocked') : 'Ad blocker on';

  // page area
  el.loadbar.hidden = !(ready && t && t.loading && t.url);
  const showStart = ready && (!t || !t.url);
  el.start.hidden = !showStart;
  if (showStart && !startShown && opened) {
    spring(el.start.querySelector('.br-start-logo'), [{ transform: 'scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], SPRING.pop);
    stagger(el.start.querySelectorAll('h2, .br-start-form, .br-quick-head, .br-start-note'), 60, 45);
    renderQuick(true);
  }
  if (!showStart && quickEdit) { quickEdit = false; renderQuick(false); }
  startShown = showStart;
  el.host.classList.toggle('is-shown', ready && hasUrl);

  let msg = '';
  if (phase === 'signin') {
    msg = `<div class="br-msg-in">${ico('chat')}<h3>Sign in to use Browse</h3><p>Browse is for people with a SahurHub Chat account.</p><button class="br-btn" type="button" data-act="signin">Open Chat</button></div>`;
  } else if (phase === 'connecting' || phase === 'idle') {
    msg = '<div class="br-msg-in"><span class="br-spinner"></span><p>Starting Browse...</p></div>';
  } else if (phase === 'off') {
    msg = `<div class="br-msg-in">${ico('globe')}<h3>Browse is turned off</h3><p>The Owner has turned Browse off for now.</p><button class="br-btn br-btn-quiet" type="button" data-act="retry">Try again</button></div>`;
  } else if (phase === 'unsupported') {
    msg = `<div class="br-msg-in">${ico('globe')}<h3>Browse can't run here</h3><p>This browser doesn't allow it. Try Chrome, Edge or Firefox.</p></div>`;
  } else if (phase === 'error') {
    msg = `<div class="br-msg-in">${ico('globe')}<h3>Something went wrong</h3><p>${esc(phaseText || 'Browse could not start.')}</p><button class="br-btn" type="button" data-act="retry">Try again</button></div>`;
  }
  if (msg !== shownMsg) {
    const wasHidden = el.msg.hidden;
    el.msg.hidden = !msg;
    if (msg) {
      el.msg.innerHTML = msg;
      const inner = el.msg.firstElementChild;
      spring(inner, [{ transform: 'scale(.92)' }, { transform: 'none' }], SPRING.snap);
      ease(inner, [{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0)' }], 300);
    } else if (!wasHidden) {
      // fade the message away over the page
      const ghost = el.msg.cloneNode(true);
      ghost.hidden = false;
      el.card.appendChild(ghost);
      const a = ease(ghost, [{ opacity: 1 }, { opacity: 0 }], 260, EASE_IN, { fill: 'forwards' });
      if (a) a.finished.then(() => ghost.remove(), () => ghost.remove()); else ghost.remove();
    }
    shownMsg = msg;
  }
}

// When the chat signs in or out in another tab, start again.
window.addEventListener('storage', (e) => {
  if (e.key !== 'sahurhub.chat.session') return;
  ticket = null;
  setPhase('idle');
  if (opened) connect();
});
