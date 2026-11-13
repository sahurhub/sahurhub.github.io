/*
  SahurHub Desktop Mode
  A Mac-style desktop: a see-through menu bar, windows, Spotlight-style search,
  an Apps grid and a liquid glass Dock that magnifies under the pointer.
  This file only loads when someone opens Desktop Mode. All icons are drawn
  for SahurHub.
*/
// The liquid glass library is only downloaded when Settings > Glass is "Liquid glass".
const H = window.SahurHub;
const esc = H.escapeHtml;
const SETTINGS_KEY = 'sahurhub.desktop';
const WELCOME_KEY = 'sahurhub.desktop.welcomed';
const DEFAULTS = { size: 54, magnify: true, magnification: 2 };

// Dock measurements (must match desktop.css)
const MENUBAR_H = 30;
const DOCK_BOTTOM = 8;
const DOCK_PAD = 7;
const DOCK_GAP = 5;
const SEP_W = 15;

const EASE_SOFT = 'cubic-bezier(.2, .9, .25, 1)';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function loadSettings() {
  try {
    return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch (e) {
    return Object.assign({}, DEFAULTS);
  }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ }
}
const settings = loadSettings();

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const APPS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' + [
  ['#ff453a', 0, 0], ['#ff9f0a', 1, 0], ['#ffd60a', 2, 0],
  ['#30d158', 0, 1], ['#64d2ff', 1, 1], ['#0a84ff', 2, 1],
  ['#5e5ce6', 0, 2], ['#bf5af2', 1, 2], ['#ff375f', 2, 2]
].map(([c, x, y]) => `<rect x="${2.2 + x * 7}" y="${2.2 + y * 7}" width="5.6" height="5.6" rx="1.7" fill="${c}"/>`).join('') + '</svg>';

const GEAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.2l1.4.2.5 2.1 1.6.7 1.9-1.1 1.9 1.9-1.1 1.9.7 1.6 2.1.5.2 1.4-.2 1.4-2.1.5-.7 1.6 1.1 1.9-1.9 1.9-1.9-1.1-1.6.7-.5 2.1-1.4.2-1.4-.2-.5-2.1-1.6-.7-1.9 1.1-1.9-1.9 1.1-1.9-.7-1.6-2.1-.5L3.2 12l.2-1.4 2.1-.5.7-1.6-1.1-1.9 1.9-1.9 1.9 1.1 1.6-.7.5-2.1Z"/><circle cx="12" cy="12" r="3.4" fill="#000" fill-opacity=".32"/></svg>';

const POWER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3.6v7.2"/><path d="M7 6.8a7.2 7.2 0 1 0 10 0"/></svg>';

const CHAT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 6.6A2.6 2.6 0 0 1 6.6 4h10.8A2.6 2.6 0 0 1 20 6.6v7.8a2.6 2.6 0 0 1-2.6 2.6H10.2l-4.3 3.4c-.5.4-1.2 0-1.2-.6V17A2.6 2.6 0 0 1 4 14.4Z"/><circle cx="8.6" cy="10.5" r="1.2" fill="#000" fill-opacity=".28"/><circle cx="12" cy="10.5" r="1.2" fill="#000" fill-opacity=".28"/><circle cx="15.4" cy="10.5" r="1.2" fill="#000" fill-opacity=".28"/></svg>';

const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 20.4s-7.8-4.7-7.8-10.6A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.8 2.7c0 5.9-7.8 10.6-7.8 10.6Z"/></svg>';

const WIFI_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" aria-hidden="true"><path d="M2.6 9a14 14 0 0 1 18.8 0"/><path d="M5.9 12.5a9.2 9.2 0 0 1 12.2 0"/><path d="M9.2 16a4.5 4.5 0 0 1 5.6 0"/><circle cx="12" cy="19.2" r="1.3" fill="currentColor" stroke="none"/></svg>';

const BATTERY_SVG = '<svg viewBox="0 0 28 24" aria-hidden="true"><rect x="1.5" y="6.5" width="22" height="11" rx="3.4" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".55"/><rect x="3.4" y="8.4" width="15" height="7.2" rx="1.9" fill="currentColor"/><path d="M25.5 10.2v3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".55"/></svg>';

const CONTROL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4.4" width="18" height="6.2" rx="3.1"/><circle cx="17.5" cy="7.5" r="1.7" fill="currentColor" stroke="none"/><rect x="3" y="13.4" width="18" height="6.2" rx="3.1"/><circle cx="6.5" cy="16.5" r="1.7" fill="currentColor" stroke="none"/></svg>';

const folderSvg = (back, front, shine) =>
  `<svg viewBox="0 0 64 52" aria-hidden="true"><path d="M4 9a5 5 0 0 1 5-5h15l5 5h26a5 5 0 0 1 5 5v5H4Z" fill="${back}"/><path d="M4 16a5 5 0 0 1 5-5h46a5 5 0 0 1 5 5v27a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" fill="${front}"/><path d="M4 16a5 5 0 0 1 5-5h46a5 5 0 0 1 5 5v2.5H4Z" fill="${shine}"/></svg>`;

const DOC_SVG = '<svg viewBox="0 0 52 64" aria-hidden="true"><path d="M6 4h28l12 12v42a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" fill="#fff"/><path d="M34 4v9a3 3 0 0 0 3 3h9Z" fill="#d6d9e1"/><g stroke="#b6bbc7" stroke-width="2.4" stroke-linecap="round"><path d="M11 26h28M11 33h28M11 40h28M11 47h17"/></g></svg>';

function gameIcon(g, extraClass = '') {
  const art = g.cover ? coverImg(g) : H.glyph(g.icon);
  return `<span class="dt-icon dt-icon-game ${extraClass}" style="--c1:${g.c1};--c2:${g.c2}">${art}</span>`;
}

// A game's cover art (games.js "cover"), filling its spot.
function coverImg(g) {
  return `<img class="dt-cover" src="${esc(g.cover)}" alt="" decoding="async" draggable="false">`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let root, wallpaper, menubar, appNameEl, clockEl, dockGlass, dockEl, tooltip, deskIcons;
let lg = null;
let built = false;
let isOpen = false;
let onExit = null;
let clockTimer = 0;
let resizeTimer = 0;
let unlisten = [];

function listen(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  unlisten.push(() => target.removeEventListener(type, fn, opts));
}

// ---------------------------------------------------------------------------
// Build the desktop once
// ---------------------------------------------------------------------------

function build() {
  root = document.getElementById('desktop');
  root.innerHTML = `
    <canvas class="dt-wallpaper" aria-hidden="true"></canvas>
    <div class="dt-desk-icons">
      <button class="dt-desk-icon" type="button" data-desk="welcome"><span class="dt-desk-img">${DOC_SVG}</span><span class="dt-desk-label">Welcome</span></button>
      <button class="dt-desk-icon" type="button" data-desk="apps"><span class="dt-desk-img">${folderSvg('#4f9ef0', '#76bcfb', '#a7d6ff')}</span><span class="dt-desk-label">All Opsecs</span></button>
      <button class="dt-desk-icon" type="button" data-desk="favorites"><span class="dt-desk-img">${folderSvg('#f0508a', '#ff7aa8', '#ffb3cb')}</span><span class="dt-desk-label">Favorites</span></button>
    </div>
    <header class="dt-menubar">
      <div class="dt-mb-side">
        <button class="dt-mb dt-mb-logo" type="button" data-menu="logo" aria-label="SahurHub menu">${H.glyph('controller')}</button>
        <button class="dt-mb dt-mb-app" type="button" data-menu="app">SahurHub</button>
        <button class="dt-mb dt-mb-extra" type="button" data-menu="file">File</button>
        <button class="dt-mb dt-mb-extra" type="button" data-menu="view">View</button>
        <button class="dt-mb dt-mb-extra" type="button" data-menu="window">Window</button>
        <button class="dt-mb dt-mb-extra" type="button" data-menu="help">Help</button>
      </div>
      <div class="dt-mb-side">
        <button class="dt-mb dt-mb-nextup" type="button" data-menu="nextup" aria-label="School schedule"><span class="dt-nu-dot" aria-hidden="true"></span><span class="dt-nu-text"></span></button>
        <span class="dt-mb-status dt-mb-extra" aria-hidden="true">${BATTERY_SVG}</span>
        <span class="dt-mb-status dt-mb-extra" aria-hidden="true">${WIFI_SVG}</span>
        <button class="dt-mb dt-mb-status" type="button" data-action="spotlight" aria-label="Search">${H.icon('search')}</button>
        <button class="dt-mb dt-mb-status" type="button" data-action="settings" aria-label="Settings">${CONTROL_SVG}</button>
        <span class="dt-clock"></span>
      </div>
    </header>
    <div class="dt-dock-glass" aria-hidden="true"></div>
    <nav class="dt-dock" aria-label="Dock"></nav>
    <div class="dt-tooltip" aria-hidden="true"></div>
  `;
  wallpaper = root.querySelector('.dt-wallpaper');
  deskIcons = root.querySelector('.dt-desk-icons');
  menubar = root.querySelector('.dt-menubar');
  appNameEl = root.querySelector('.dt-mb-app');
  clockEl = root.querySelector('.dt-clock');
  dockGlass = root.querySelector('.dt-dock-glass');
  dockEl = root.querySelector('.dt-dock');
  tooltip = root.querySelector('.dt-tooltip');

  // Dock clicks
  dockEl.addEventListener('click', (e) => {
    if (dock.skipClick) { dock.skipClick = false; return; }
    const btn = e.target.closest('.dt-dock-item');
    if (!btn) return;
    const it = dock.items.find((x) => x.id === btn.dataset.id);
    if (it) launch(it);
  });
  // Touch: slide a finger along the Dock to magnify, lift to open
  dockEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    dock.touching = true;
    try { dockEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    updateDockPointer(e.clientX, e.clientY);
  });
  dockEl.addEventListener('pointermove', (e) => {
    if (dock.touching) updateDockPointer(e.clientX, e.clientY);
  });
  const touchEnd = (e) => {
    if (!dock.touching) return;
    dock.touching = false;
    const it = dock.hovered;
    dock.active = false;
    setHovered(null);
    dockKick();
    if (it && e.type === 'pointerup') {
      dock.skipClick = true;
      setTimeout(() => { dock.skipClick = false; }, 400);
      launch(it);
    }
  };
  dockEl.addEventListener('pointerup', touchEnd);
  dockEl.addEventListener('pointercancel', touchEnd);

  // Menu bar
  menubar.addEventListener('click', (e) => {
    const m = e.target.closest('[data-menu]');
    if (m) {
      if (menu.key === m.dataset.menu) closeMenu();
      else showMenu(m);
      return;
    }
    const a = e.target.closest('[data-action]');
    if (a) {
      closeMenu();
      if (a.dataset.action === 'spotlight') toggleSpotlight();
      if (a.dataset.action === 'settings') openSettings();
    }
  });
  menubar.addEventListener('pointerover', (e) => {
    if (!menu.el) return;
    const m = e.target.closest('[data-menu]');
    if (m && m.dataset.menu !== menu.key) showMenu(m);
  });

  // Desktop icons: click selects, double-click (or tap / Enter) opens
  deskIcons.addEventListener('click', (e) => {
    const b = e.target.closest('.dt-desk-icon');
    if (!b) return;
    deskIcons.querySelectorAll('.selected').forEach((x) => x.classList.remove('selected'));
    b.classList.add('selected');
    if (e.detail === 0 || e.pointerType === 'touch' || e.detail === 2) openDeskItem(b.dataset.desk);
  });

  built = true;
}

function openDeskItem(key) {
  if (key === 'welcome') openWelcome();
  if (key === 'apps') toggleApps(true);
  if (key === 'favorites') {
    const it = dockItem('favorites');
    if (it && !stack.el) toggleStack(it);
  }
}

// ---------------------------------------------------------------------------
// Wallpaper: layered waves, drawn on a canvas so the Dock glass can bend it
// ---------------------------------------------------------------------------

function drawWallpaper() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = window.innerWidth;
  const h = window.innerHeight;
  wallpaper.width = Math.max(1, Math.round(w * dpr));
  wallpaper.height = Math.max(1, Math.round(h * dpr));
  const ctx = wallpaper.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dark = H.isDark();

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  const skyStops = dark
    ? [[0, '#070b24'], [0.42, '#22185a'], [0.72, '#4d2462'], [1, '#160c26']]
    : [[0, '#6fa8ff'], [0.42, '#a9a2ff'], [0.72, '#ffb0c8'], [1, '#ffd2a6']];
  skyStops.forEach(([o, c]) => sky.addColorStop(o, c));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const gx = w * 0.7;
  const gy = h * 0.36;
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.5);
  glow.addColorStop(0, dark ? 'rgba(255,110,170,0.38)' : 'rgba(255,244,214,0.9)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const layers = dark
    ? [
        { y: 0.5, amp: 0.05, f: 1.1, p: 0.4, top: '#3c3f9e', bottom: '#241a5a' },
        { y: 0.6, amp: 0.06, f: 0.8, p: 2.1, top: '#2e2e85', bottom: '#1b1350' },
        { y: 0.7, amp: 0.05, f: 1.3, p: 4.0, top: '#22206a', bottom: '#140c3c' },
        { y: 0.82, amp: 0.045, f: 0.9, p: 1.2, top: '#16124a', bottom: '#0b0722' }
      ]
    : [
        { y: 0.5, amp: 0.05, f: 1.1, p: 0.4, top: '#b8c2ff', bottom: '#cdb8ff' },
        { y: 0.6, amp: 0.06, f: 0.8, p: 2.1, top: '#8f95ff', bottom: '#b38aff' },
        { y: 0.7, amp: 0.05, f: 1.3, p: 4.0, top: '#6466e6', bottom: '#8c58da' },
        { y: 0.82, amp: 0.045, f: 0.9, p: 1.2, top: '#4342b8', bottom: '#5d2fa6' }
      ];
  layers.forEach((l) => {
    const base = l.y * h;
    const wave = (x) => base + l.amp * h * (Math.sin((x / w) * Math.PI * 2 * l.f + l.p) * 0.6 + Math.sin((x / w) * Math.PI * 3.6 * l.f + l.p * 1.7) * 0.4);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, wave(x));
    ctx.lineTo(w, h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, base - l.amp * h, 0, h);
    g.addColorStop(0, l.top);
    g.addColorStop(1, l.bottom);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    for (let x = 0; x <= w + 8; x += 8) {
      if (x === 0) ctx.moveTo(x, wave(x)); else ctx.lineTo(x, wave(x));
    }
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  if (lg) lg.markChanged(wallpaper);
}

// ---------------------------------------------------------------------------
// The Dock
// ---------------------------------------------------------------------------

const dock = {
  items: [],
  base: 54,
  w0: 0,
  total: 0,
  active: false,
  mouseX: null,
  hovered: null,
  frame: 0,
  last: 0,
  touching: false,
  skipClick: false
};

function orderedGames() {
  const list = H.games.slice();
  list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  return list;
}

// Pick an icon size and how many opsecs fit on this screen.
function fitDock() {
  const games = orderedGames();
  const fixed = 5; // Apps, Chat, Favorites, Settings, Exit
  const M = settings.magnify ? settings.magnification : 1;
  const avail = window.innerWidth - 20;
  // leave room for the magnified icons to spread out
  const widthFor = (b, n) => DOCK_PAD * 2 + (n + fixed) * (b + DOCK_GAP) + SEP_W + 2.4 * b * (M - 1);
  const min = window.innerWidth < 600 ? 34 : 40;
  let base = clamp(settings.size, 36, 72);
  let n = games.length;
  while (base > min && widthFor(base, Math.min(n, 6)) > avail) base -= 2;
  while (n > 0 && widthFor(base, n) > avail) n--;
  return { base, games: games.slice(0, n) };
}

function iconFor(it) {
  if (it.kind === 'game') return gameIcon(it.game);
  if (it.kind === 'apps') return `<span class="dt-icon dt-icon-apps">${APPS_SVG}</span>`;
  if (it.kind === 'chat') return `<span class="dt-icon dt-icon-chat">${CHAT_SVG}</span>`;
  if (it.kind === 'stack') return `<span class="dt-icon dt-icon-stack">${HEART_SVG}</span>`;
  if (it.kind === 'settings') return `<span class="dt-icon dt-icon-settings">${GEAR_SVG}</span>`;
  return `<span class="dt-icon dt-icon-exit">${POWER_SVG}</span>`;
}

function dockGlassConfig() {
  const dark = H.isDark();
  return {
    blurAmount: 0.16,
    refraction: 0.95,
    chromAberration: 0.07,
    edgeHighlight: dark ? 0.16 : 0.24,
    specular: 0.55,
    fresnel: 1.1,
    cornerRadius: Math.round((dock.base + DOCK_PAD * 2) * 0.36),
    zRadius: 22,
    brightness: dark ? -0.1 : 0.14,
    saturation: 0.3,
    shadowOpacity: dark ? 0.42 : 0.22,
    shadowSpread: 18,
    shadowOffsetY: 6
  };
}

function buildDock() {
  const fit = fitDock();
  dock.base = fit.base;
  const items = [{ id: 'apps', kind: 'apps', label: 'Apps' }, { id: 'chat', kind: 'chat', label: 'Chat' }];
  fit.games.forEach((g) => items.push({ id: 'game:' + g.id, kind: 'game', label: g.title, game: g }));
  items.push({ kind: 'sep' });
  items.push({ id: 'favorites', kind: 'stack', label: 'Favorites' });
  items.push({ id: 'settings', kind: 'settings', label: 'Settings' });
  items.push({ id: 'exit', kind: 'exit', label: 'Exit Desktop Mode' });

  dockEl.innerHTML = items.map((it) => it.kind === 'sep'
    ? '<div class="dt-dock-sep" aria-hidden="true"></div>'
    : `<button class="dt-dock-item" type="button" data-id="${esc(it.id)}" aria-label="${esc(it.label)}">${iconFor(it)}<span class="dt-dot" aria-hidden="true"></span></button>`
  ).join('');

  const B = dock.base;
  items.forEach((it, i) => {
    it.el = dockEl.children[i];
    it.size = B;
    it.vel = 0;
    it._s = B;
    if (it.kind === 'sep') {
      it.el.style.height = Math.round(B * 0.62) + 'px';
      it.el.style.marginBottom = Math.round(B * 0.19) + 'px';
    } else {
      it.icon = it.el.querySelector('.dt-icon');
      it.el.style.width = B + 'px';
      it.el.style.height = B + 'px';
    }
  });
  dock.items = items;
  dock.w0 = DOCK_PAD * 2 + (items.length - 1) * DOCK_GAP + items.reduce((s, it) => s + (it.kind === 'sep' ? SEP_W : B), 0);
  dock.total = dock.w0;
  dockGlass.style.width = dock.w0 + 'px';
  dockGlass.style.height = (B + DOCK_PAD * 2) + 'px';
  dockGlass.style.marginLeft = (-dock.w0 / 2) + 'px';
  dockGlass.style.borderRadius = Math.round((B + DOCK_PAD * 2) * 0.36) + 'px';
  dockGlass.style.transform = '';
  dockGlass.dataset.config = JSON.stringify(dockGlassConfig());
  // Where each item sits before any magnification (offsets inside the Dock)
  let x = DOCK_PAD;
  const baseLeft = window.innerWidth / 2 - dock.w0 / 2;
  items.forEach((it) => {
    it.bw = it.kind === 'sep' ? SEP_W : B;
    it.bx = x + it.bw / 2;
    it.A = x;
    it.w = it.bw;
    it.cx = baseLeft + it.bx;
    x += it.bw + DOCK_GAP;
  });
  dock.left = baseLeft;
  dockEl.style.transform = `translate3d(${baseLeft.toFixed(2)}px,0,0)`;
  updateRunning();
  updateDockChat(H.chat ? H.chat.info() : null);
}

// Red number on the Dock's Chat icon (unread mentions and direct messages)
function updateDockChat(info) {
  const it = dockItem('chat');
  if (!it || !it.el) return;
  const n = info ? info.mentions || 0 : 0;
  let badge = it.el.querySelector('.dt-badge');
  if (!n) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.className = 'dt-badge'; it.el.appendChild(badge); }
  badge.textContent = n > 99 ? '99+' : String(n);
}

function dockItem(id) { return dock.items.find((it) => it.id === id); }

function dockKick() {
  if (!dock.frame) {
    dock.last = performance.now();
    dock.frame = requestAnimationFrame(dockFrame);
  }
}

// Each frame:
// 1. Every icon gets a target size from how far the pointer is from where the
//    icon sits when nothing is magnified (a bell curve), like on a Mac.
// 2. Sizes ease toward their targets with a spring.
// 3. The magnified row is placed so the spot under the pointer stays under
//    the pointer, then kept on screen. The glass and the label follow.
function dockFrame(now) {
  const dt = clamp((now - dock.last) / 1000, 0.001, 0.034);
  dock.last = now;
  const vw = window.innerWidth;
  const B = dock.base;
  const M = settings.magnify ? settings.magnification : 1;
  const sigma = B * 1.55;
  const baseLeft = vw / 2 - dock.w0 / 2;
  const pointerOn = dock.active && dock.mouseX !== null;
  const icons = dock.items.filter((it) => it.kind !== 'sep');

  // 1. targets
  icons.forEach((it) => {
    it.target = B;
    if (pointerOn && M > 1) {
      const d = (dock.mouseX - (baseLeft + it.bx)) / sigma;
      it.target = B * (1 + (M - 1) * Math.exp(-d * d));
    }
  });
  // Never grow wider than the screen
  const growth = icons.reduce((s, it) => s + (it.target - B), 0);
  const room = vw - 16 - dock.w0;
  if (growth > room) {
    const f = Math.max(0, room) / growth;
    icons.forEach((it) => { it.target = B + (it.target - B) * f; });
  }

  // 2. springs
  let moving = false;
  const steps = Math.ceil(dt / 0.004);
  const h = dt / steps;
  icons.forEach((it) => {
    for (let i = 0; i < steps; i++) {
      const a = -900 * (it.size - it.target) - 58 * it.vel;
      it.vel += a * h;
      it.size += it.vel * h;
    }
    if (Math.abs(it.size - it.target) < 0.05 && Math.abs(it.vel) < 1) {
      it.size = it.target;
      it.vel = 0;
    } else {
      moving = true;
    }
  });

  // 3. layout: base offsets (a) and magnified offsets (A) of each item
  let total = DOCK_PAD * 2 + DOCK_GAP * (dock.items.length - 1);
  dock.items.forEach((it) => { total += it.kind === 'sep' ? SEP_W : it.size; });
  let A = DOCK_PAD;
  dock.items.forEach((it) => {
    it.A = A;
    it.w = it.kind === 'sep' ? SEP_W : it.size;
    A += it.w + DOCK_GAP;
  });
  // where the pointer's spot ends up in the magnified row
  let left = baseLeft;
  if (dock.mouseX !== null) {
    const p = dock.mouseX - baseLeft;
    let mapped = p;
    if (p >= dock.w0 - DOCK_PAD) mapped = total - (dock.w0 - p);
    else if (p > DOCK_PAD) {
      for (const it of dock.items) {
        const a = it.bx - it.bw / 2;
        if (p < a + it.bw) { mapped = it.A + clamp((p - a) / it.bw, 0, 1) * it.w; break; }
        if (p < a + it.bw + DOCK_GAP) { mapped = it.A + it.w + (p - a - it.bw); break; }
      }
    }
    left = dock.mouseX - mapped;
  }
  left = total <= vw - 16 ? clamp(left, 8, vw - 8 - total) : vw / 2 - total / 2;
  dock.left = left;
  dock.total = total;

  let hovered = null;
  dock.items.forEach((it) => {
    it.cx = left + it.A + it.w / 2;
    if (it.kind === 'sep') return;
    const s = Math.round(it.size * 4) / 4;
    if (s !== it._s) {
      it._s = s;
      it.el.style.width = s + 'px';
      it.el.style.height = s + 'px';
    }
    if (pointerOn && dock.mouseX >= left + it.A - DOCK_GAP / 2 && dock.mouseX < left + it.A + it.w + DOCK_GAP / 2) hovered = it;
  });
  dockEl.style.transform = `translate3d(${left.toFixed(2)}px,0,0)`;
  // The glass stretches and slides with the icons (cheap: no re-render needed)
  const k = total / dock.w0;
  const shift = left + total / 2 - vw / 2;
  dockGlass.style.transform = (Math.abs(k - 1) < 0.0005 && Math.abs(shift) < 0.05) ? '' : `translateX(${shift.toFixed(2)}px) scaleX(${k.toFixed(5)})`;
  setHovered(hovered);
  if (dock.hovered) placeTooltip(dock.hovered);
  if (stack.el && stack.item) positionStack();
  if (moving) dock.frame = requestAnimationFrame(dockFrame);
  else dock.frame = 0;
}

function setHovered(it) {
  if (it === dock.hovered) return;
  dock.hovered = it;
  if (!it || stack.el) {
    tooltip.classList.remove('show');
    return;
  }
  tooltip.textContent = it.label;
  tooltip.classList.add('show');
  placeTooltip(it);
}

function placeTooltip(it) {
  const lift = DOCK_BOTTOM + DOCK_PAD + it.size + 14;
  tooltip.style.transform = `translate(${it.cx.toFixed(1)}px, ${(-lift).toFixed(1)}px) translateX(-50%)`;
}

function updateDockPointer(x, y) {
  const vh = window.innerHeight;
  const B = dock.base;
  const glassTop = vh - DOCK_BOTTOM - (B + DOCK_PAD * 2);
  const M = settings.magnify ? settings.magnification : 1;
  const reach = dock.active ? glassTop - B * (M - 1) - 14 : glassTop;
  const left = dock.left == null ? window.innerWidth / 2 - dock.w0 / 2 : dock.left;
  const right = left + Math.max(dock.total, dock.w0);
  const blocked = apps.open || spot.open;
  const inside = !blocked && y >= reach && y <= vh && x >= left - 4 && x <= right + 4;
  if (inside !== dock.active) {
    dock.active = inside;
    if (!inside) setHovered(null);
  }
  dock.mouseX = x;
  dockKick();
}

function onPointerMove(e) {
  if (e.pointerType !== 'mouse' && !dock.touching) return;
  updateDockPointer(e.clientX, e.clientY);
}

function onLeave() {
  dock.active = false;
  setHovered(null);
  dockKick();
}

// The classic launch bounce: up, down, smaller bounce, settle.
function bounceIcon(it) {
  if (!it || !it.icon || H.reduceMotion()) return;
  const B = dock.base;
  it.icon.animate([
    { transform: 'translateY(0)', easing: 'cubic-bezier(.3, .8, .45, 1)' },
    { transform: `translateY(${(-0.55 * B).toFixed(1)}px)`, offset: 0.22, easing: 'cubic-bezier(.55, 0, .8, .4)' },
    { transform: 'translateY(0)', offset: 0.44, easing: 'cubic-bezier(.3, .8, .45, 1)' },
    { transform: `translateY(${(-0.3 * B).toFixed(1)}px)`, offset: 0.64, easing: 'cubic-bezier(.55, 0, .8, .4)' },
    { transform: 'translateY(0)', offset: 0.82, easing: 'cubic-bezier(.3, .8, .45, 1)' },
    { transform: `translateY(${(-0.1 * B).toFixed(1)}px)`, offset: 0.91, easing: 'cubic-bezier(.55, 0, .8, .4)' },
    { transform: 'translateY(0)' }
  ], { duration: 1150 });
}

function updateRunning() {
  dock.items.forEach((it) => {
    if (it.kind === 'sep') return;
    const running = (it.kind === 'game' && wins.has(it.id)) || (it.kind === 'settings' && wins.has('settings')) || (it.kind === 'chat' && wins.has('chat'));
    it.el.classList.toggle('is-running', running);
  });
}

function launch(it) {
  if (it.kind !== 'stack') closeStack();
  closeMenu();
  if (spot.open) toggleSpotlight(false);
  if (it.kind === 'apps') toggleApps();
  else if (it.kind === 'chat') openChat(it);
  else if (it.kind === 'game') openGame(it.game, it);
  else if (it.kind === 'stack') toggleStack(it);
  else if (it.kind === 'settings') openSettings(it);
  else if (it.kind === 'exit') exit();
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

const wins = new Map();
let zCounter = 10;
let activeWin = null;

function workArea() {
  const top = MENUBAR_H + 8;
  const bottom = window.innerHeight - (DOCK_BOTTOM + dock.base + DOCK_PAD * 2 + 10);
  return { x: 8, y: top, w: window.innerWidth - 16, h: Math.max(220, bottom - top) };
}

function openWindow(opts) {
  const area = workArea();
  const width = Math.min(opts.width, area.w);
  const height = Math.min(opts.height, area.h);
  const n = wins.size % 6;
  const left = clamp(area.x + (area.w - width) / 2 + n * 26 - 40, area.x, area.x + area.w - width);
  const top = clamp(area.y + (area.h - height) / 2 + n * 22 - 26, area.y, area.y + area.h - height);
  const el = document.createElement('section');
  el.className = 'dt-window ' + (opts.className || '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', opts.title);
  el.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
  el.innerHTML = `
    <header class="dt-titlebar">
      <div class="dt-traffic">
        <button class="dt-tl dt-tl-close" type="button" aria-label="Close" data-tl="close"></button>
        <button class="dt-tl dt-tl-min" type="button" aria-label="Minimize" data-tl="min"></button>
        <button class="dt-tl dt-tl-zoom" type="button" aria-label="Zoom" data-tl="zoom"></button>
      </div>
      <div class="dt-title">${esc(opts.title)}</div>
    </header>
    <div class="dt-win-body">${opts.body}</div>`;
  root.appendChild(el);
  const w = { appId: opts.appId, title: opts.title, el, minimized: false, maximized: false, restoreRect: null };
  wins.set(opts.appId, w);
  wireWindow(w);
  focusWindow(w);
  animateWindowIn(w, opts.from);
  if (opts.onMount) opts.onMount(w);
  updateRunning();
  return w;
}

function animateWindowIn(w, fromEl) {
  if (H.reduceMotion()) return;
  const r = w.el.getBoundingClientRect();
  if (fromEl) {
    const f = fromEl.getBoundingClientRect();
    const dx = (f.left + f.width / 2) - (r.left + r.width / 2);
    const dy = (f.top + f.height / 2) - (r.top + r.height / 2);
    const s = Math.max(0.06, f.width / r.width);
    w.el.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 }, { opacity: 1, offset: 0.35 }, { transform: 'none', opacity: 1 }],
      { duration: 600, easing: 'cubic-bezier(.16, 1, .3, 1)' }
    );
  } else {
    w.el.animate([{ transform: 'scale(.88)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EASE_SOFT });
  }
}

function wireWindow(w) {
  const el = w.el;
  const bar = el.querySelector('.dt-titlebar');
  el.addEventListener('pointerdown', () => { if (activeWin !== w) focusWindow(w); }, true);
  el.querySelector('.dt-traffic').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tl]');
    if (!b) return;
    if (b.dataset.tl === 'close') closeWindow(w);
    else if (b.dataset.tl === 'min') minimizeWindow(w);
    else zoomWindow(w);
  });
  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.dt-traffic') || w.maximized) return;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, left: el.offsetLeft, top: el.offsetTop };
    try { bar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    el.classList.add('dt-dragging');
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const left = clamp(drag.left + e.clientX - drag.sx, -el.offsetWidth + 90, window.innerWidth - 90);
    const top = clamp(drag.top + e.clientY - drag.sy, MENUBAR_H, window.innerHeight - 60);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    if (lg) lg.markChanged(el);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    el.classList.remove('dt-dragging');
    if (lg) lg.markChanged(el);
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.dt-traffic')) zoomWindow(w); });
}

function focusWindow(w) {
  if (!w) return;
  zCounter += 1;
  if (zCounter > 38) {
    // Keep every window under the menu bar (40) and the Dock (50)
    const ordered = [...wins.values()].sort((a, b) => (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0));
    zCounter = 10;
    ordered.forEach((x) => { if (x !== w) x.el.style.zIndex = ++zCounter; });
    zCounter += 1;
  }
  w.el.style.zIndex = zCounter;
  wins.forEach((x) => x.el.classList.toggle('is-active', x === w));
  activeWin = w;
  updateAppName();
  if (lg) lg.markChanged();
}

function focusTopWindow() {
  let top = null;
  wins.forEach((x) => {
    if (!x.minimized && (!top || (+x.el.style.zIndex || 0) > (+top.el.style.zIndex || 0))) top = x;
  });
  if (top) focusWindow(top);
  else {
    activeWin = null;
    wins.forEach((x) => x.el.classList.remove('is-active'));
    updateAppName();
  }
}

function closeWindow(w) {
  if (!w || w.closing) return;
  w.closing = true;
  wins.delete(w.appId);
  if (w.onClose) w.onClose();
  const done = () => { w.el.remove(); if (lg) lg.markChanged(); };
  if (H.reduceMotion()) done();
  else w.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.9)', opacity: 0 }], { duration: 200, easing: 'cubic-bezier(.4, 0, 1, 1)' }).onfinish = done;
  if (activeWin === w) { activeWin = null; focusTopWindow(); }
  updateRunning();
  updateAppName();
}

function minimizeWindow(w) {
  if (!w || w.minimized) return;
  const item = dockItem(w.appId) || dockItem('apps');
  w.minimized = true;
  const finish = () => { w.el.hidden = true; if (lg) lg.markChanged(); };
  if (item && !H.reduceMotion()) {
    const r = w.el.getBoundingClientRect();
    const f = item.el.getBoundingClientRect();
    const dx = (f.left + f.width / 2) - (r.left + r.width / 2);
    const dy = (f.top + f.height / 2) - (r.top + r.height / 2);
    const s = f.width / r.width;
    w.el.animate([
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.3}px) scale(${0.62}, ${0.5})`, opacity: 0.9, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}, ${s * 0.6})`, opacity: 0 }
    ], { duration: 520, easing: 'cubic-bezier(.5, 0, .75, .3)' }).onfinish = finish;
  } else {
    finish();
  }
  if (activeWin === w) { activeWin = null; focusTopWindow(); }
}

function restoreWindow(w) {
  if (!w.minimized) return;
  w.minimized = false;
  w.el.hidden = false;
  const item = dockItem(w.appId) || dockItem('apps');
  animateWindowIn(w, item ? item.el : null);
}

function zoomWindow(w) {
  if (!w) return;
  const el = w.el;
  const area = workArea();
  el.classList.add('dt-animating');
  const set = (r) => {
    el.style.left = r.left + 'px';
    el.style.top = r.top + 'px';
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
  };
  if (!w.maximized) {
    w.restoreRect = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
    set({ left: area.x, top: area.y - 4, width: area.w, height: area.h + 4 });
    w.maximized = true;
  } else {
    set(w.restoreRect);
    w.maximized = false;
  }
  setTimeout(() => { el.classList.remove('dt-animating'); if (lg) lg.markChanged(el); }, 480);
}

function updateAppName() {
  const name = activeWin ? activeWin.title : 'SahurHub';
  if (appNameEl.textContent !== name) {
    appNameEl.textContent = name;
    if (!H.reduceMotion()) appNameEl.animate([{ opacity: 0, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }
}

// ---------------------------------------------------------------------------
// Window contents
// ---------------------------------------------------------------------------

function openGame(g, fromItem, fromEl) {
  if (!g) return;
  const appId = 'game:' + g.id;
  const existing = wins.get(appId);
  if (existing) {
    if (existing.minimized) restoreWindow(existing);
    focusWindow(existing);
    return;
  }
  const item = fromItem || dockItem(appId);
  if (item) bounceIcon(item);
  openWindow({
    appId,
    title: g.title,
    width: 560,
    height: 500,
    className: 'dt-win-game',
    from: fromEl || (item ? item.el : dockItem('apps').el),
    body: `
      <div class="dt-game" style="--c1:${g.c1};--c2:${g.c2}">
        <div class="dt-game-hero">${g.cover ? coverImg(g) : gameIcon(g, 'dt-game-icon')}</div>
        <div class="dt-game-info">
          <h2>${esc(g.title)}</h2>
          <p class="dt-game-meta">${esc(g.category)}${g.isNew ? ' · New' : ''}${g.url ? '' : ' · Coming soon'}</p>
          <p class="dt-game-desc">${esc(g.description)}</p>
          <div class="dt-tags">${[g.category].concat(g.tags).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
          <div class="dt-actions">
            <button class="dt-btn dt-btn-primary" type="button" data-act="play">${H.icon('play')}Play</button>
            <button class="dt-btn dt-fav" type="button" data-act="fav"></button>
          </div>
          ${openModeChoice(g)}
        </div>
      </div>`,
    onMount: (w) => {
      const fav = w.el.querySelector('[data-act="fav"]');
      w.sync = () => {
        const on = H.isFavorite(g.id);
        fav.classList.toggle('is-fav', on);
        fav.innerHTML = H.icon('heart', on) + (on ? 'Favorited' : 'Favorite');
      };
      w.sync();
      w.el.querySelector('[data-act="play"]').addEventListener('click', () => H.play(g.id));
      const mode = w.el.querySelector('[data-act="mode"]');
      if (mode) mode.addEventListener('change', () => H.setOpenMode(mode.value));
      fav.addEventListener('click', () => H.toggleFavorite(g.id, fav.querySelector('svg')));
    }
  });
}

// "Open in" choice (about:blank / SahurHub / New tab), shared with the normal site.
function openModeChoice(g) {
  if (!g.url || g.newTabOnly || !H.openModes) return '';
  const current = H.getOpenMode();
  const options = H.openModes.map((m) => `<option value="${m.id}"${m.id === current ? ' selected' : ''}>${esc(m.label)}</option>`).join('');
  return `<label class="dt-open-mode">Open in <select data-act="mode">${options}</select></label>`;
}
document.addEventListener('sahurhub:openmode', (e) => {
  document.querySelectorAll('.dt-open-mode select').forEach((s) => { s.value = e.detail; });
});

// SahurHub Chat in a window (the same chat as on the normal site)
let chatOpening = false;
async function openChat(fromItem) {
  const existing = wins.get('chat');
  if (existing) {
    if (existing.minimized) restoreWindow(existing);
    focusWindow(existing);
    return;
  }
  if (chatOpening || !H.chat) return;
  const item = fromItem || dockItem('chat');
  if (item) bounceIcon(item);
  chatOpening = true;
  let mod;
  try { mod = await H.chat.load(); } catch (e) { H.toast('The chat could not load. Check your connection.'); return; } finally { chatOpening = false; }
  if (!isOpen || wins.get('chat')) return;
  const area = workArea();
  openWindow({
    appId: 'chat',
    title: 'SahurHub Chat',
    width: Math.min(1000, area.w),
    height: Math.min(680, area.h),
    className: 'dt-win-chat',
    from: item ? item.el : null,
    body: '<div class="dt-chat-host"></div>',
    onMount: (w) => {
      const host = w.el.querySelector('.dt-chat-host');
      mod.mountInto(host);
      w.onClose = () => mod.unmount(host);
    }
  });
}

function openSettings(fromItem) {
  const existing = wins.get('settings');
  if (existing) {
    if (existing.minimized) restoreWindow(existing);
    focusWindow(existing);
    return;
  }
  const item = fromItem || dockItem('settings');
  if (item) bounceIcon(item);
  openWindow({
    appId: 'settings',
    title: 'Settings',
    width: 470,
    height: 470,
    className: 'dt-win-settings',
    from: item ? item.el : null,
    body: `
      <div class="dt-settings">
        <div class="dt-group">
          <div class="dt-group-title">Appearance</div>
          <div class="dt-group-box">
            <div class="dt-row"><span>Theme</span>
              <div class="dt-seg" role="radiogroup" aria-label="Theme">
                ${H.themes.map((t) => `<button type="button" role="radio" data-dt-theme="${t.id}">${esc(t.label)}</button>`).join('')}
              </div>
            </div>
            <div class="dt-row"><span>Glass</span>
              <div class="dt-seg" role="radiogroup" aria-label="Glass">
                ${H.glassModes.map((m) => `<button type="button" role="radio" data-dt-glass="${m.id}" title="${esc(m.desc)}">${esc(m.label)}</button>`).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="dt-group">
          <div class="dt-group-title">Dock</div>
          <div class="dt-group-box">
            <label class="dt-row"><span>Size</span><input type="range" min="40" max="72" step="1" data-set="size"></label>
            <label class="dt-row"><span>Magnification</span><input type="checkbox" class="dt-switch" data-set="magnify"></label>
            <label class="dt-row"><span>Magnified size</span><input type="range" min="1.3" max="2.6" step="0.05" data-set="magnification"></label>
          </div>
        </div>
        <div class="dt-group">
          <div class="dt-group-title">Desktop Mode</div>
          <div class="dt-group-box">
            <div class="dt-row"><span>Back to the normal site</span><button type="button" class="dt-btn" data-act="exit">Exit</button></div>
          </div>
        </div>
      </div>`,
    onMount: (w) => {
      const el = w.el;
      w.sync = () => {
        el.querySelectorAll('[data-dt-theme]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.dtTheme === H.getTheme())));
        el.querySelectorAll('[data-dt-glass]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.dtGlass === H.getGlass())));
        el.querySelector('[data-set="size"]').value = settings.size;
        el.querySelector('[data-set="magnify"]').checked = settings.magnify;
        const m = el.querySelector('[data-set="magnification"]');
        m.value = settings.magnification;
        m.disabled = !settings.magnify;
      };
      w.sync();
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-dt-theme]');
        if (t) H.setThemeChoice(t.dataset.dtTheme, t);
        const g = e.target.closest('[data-dt-glass]');
        if (g) H.setGlass(g.dataset.dtGlass);
        if (e.target.closest('[data-act="exit"]')) exit();
      });
      el.addEventListener('input', (e) => {
        const key = e.target.dataset.set;
        if (!key) return;
        setSetting(key, e.target.type === 'checkbox' ? e.target.checked : parseFloat(e.target.value));
      });
    }
  });
}

function setSetting(key, value) {
  settings[key] = value;
  saveSettings();
  if (key === 'size' || key === 'magnify' || key === 'magnification') {
    buildDock();
    if (lg) lg.markChanged();
  }
  const w = wins.get('settings');
  if (w && w.sync) w.sync();
}

function openWelcome() {
  const existing = wins.get('welcome');
  if (existing) {
    if (existing.minimized) restoreWindow(existing);
    focusWindow(existing);
    return;
  }
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch (e) { /* private mode */ }
  openWindow({
    appId: 'welcome',
    title: 'Welcome',
    width: 500,
    height: 470,
    body: `
      <div class="dt-doc">
        <h2>Welcome to Desktop Mode</h2>
        <p>This is SahurHub as a desktop. Some things to try:</p>
        <ul>
          <li><b>Move the pointer along the Dock</b> at the bottom. Icons grow as you pass over them.</li>
          <li><b>Click an opsec</b> in the Dock to open it in a window. Drag windows by their top bar. The red, yellow and green buttons close, minimize and zoom.</li>
          <li><b>Apps</b> (the first Dock icon) shows every opsec. <b>Favorites</b> pops up the ones you liked.</li>
          <li><b>Chat</b> (the speech bubble next to Apps) opens SahurHub Chat in a window.</li>
          <li><b>Search</b> with the magnifier in the menu bar, or press <kbd>/</kbd>.</li>
          <li><b>Settings</b> changes the theme, the glass look, the Dock size and the magnification.</li>
        </ul>
        <p>To leave, press the power button at the end of the Dock.</p>
      </div>`
  });
}

function openAbout() {
  const existing = wins.get('about');
  if (existing) { focusWindow(existing); return; }
  openWindow({
    appId: 'about',
    title: 'About SahurHub',
    width: 340,
    height: 330,
    body: `
      <div class="dt-about">
        <span class="dt-icon dt-icon-about">${H.glyph('controller')}</span>
        <h2>SahurHub</h2>
        <p>Desktop Mode</p>
        <p class="dt-about-small">All my opsecs in one place.</p>
      </div>`
  });
}

// ---------------------------------------------------------------------------
// Apps grid (every opsec, full screen)
// ---------------------------------------------------------------------------

const apps = { el: null, open: false };

function buildApps() {
  apps.el = document.createElement('div');
  apps.el.className = 'dt-apps';
  apps.el.hidden = true;
  apps.el.innerHTML = `
    <label class="dt-apps-search">${H.icon('search')}<input type="search" placeholder="Search opsecs" aria-label="Search opsecs" autocomplete="off" spellcheck="false"></label>
    <div class="dt-apps-grid" role="list"></div>`;
  root.appendChild(apps.el);
  const input = apps.el.querySelector('input');
  input.addEventListener('input', () => renderApps(input.value, false));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = apps.el.querySelector('[data-game]');
      if (first) first.click();
    }
  });
  apps.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-game]');
    if (b) {
      const g = H.byId[b.dataset.game];
      const icon = b.querySelector('.dt-icon');
      const rect = icon.getBoundingClientRect();
      toggleApps(false);
      // open from where the icon was
      const ghost = document.createElement('span');
      ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
      document.body.appendChild(ghost);
      openGame(g, dockItem('game:' + g.id), ghost);
      ghost.remove();
      return;
    }
    if (!e.target.closest('.dt-apps-search')) toggleApps(false);
  });
}

function renderApps(q, animate) {
  const grid = apps.el.querySelector('.dt-apps-grid');
  const list = H.search(q);
  grid.innerHTML = list.length
    ? list.map((g) => `<button class="dt-app" type="button" role="listitem" data-game="${esc(g.id)}">${gameIcon(g)}<span class="dt-app-label">${esc(g.title)}</span></button>`).join('')
    : '<p class="dt-apps-empty">No opsecs found</p>';
  if (animate && !H.reduceMotion()) {
    Array.prototype.forEach.call(grid.children, (child, i) => {
      child.animate([{ opacity: 0, transform: 'scale(1.18)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: Math.min(i, 20) * 18, easing: EASE_SOFT, fill: 'backwards' });
    });
  }
}

function toggleApps(force) {
  const want = force === undefined ? !apps.open : force;
  if (want === apps.open) return;
  if (!apps.el) buildApps();
  apps.open = want;
  dock.active = false;
  setHovered(null);
  dockKick();
  if (want) {
    closeMenu();
    closeStack();
    if (spot.open) toggleSpotlight(false);
    const input = apps.el.querySelector('input');
    input.value = '';
    renderApps('', true);
    apps.el.hidden = false;
    requestAnimationFrame(() => apps.el.classList.add('open'));
    setTimeout(() => input.focus({ preventScroll: true }), 60);
  } else {
    apps.el.classList.remove('open');
    setTimeout(() => { if (!apps.open) apps.el.hidden = true; }, 320);
  }
}

// ---------------------------------------------------------------------------
// Favorites stack (pops up from its Dock icon)
// ---------------------------------------------------------------------------

const stack = { el: null, item: null };

function toggleStack(it) {
  if (stack.el) { closeStack(); return; }
  closeMenu();
  const favs = H.favorites().map((id) => H.byId[id]).filter(Boolean);
  const el = document.createElement('div');
  el.className = 'dt-stack';
  el.innerHTML = '<div class="dt-stack-title">Favorites</div>' + (favs.length
    ? `<div class="dt-stack-grid">${favs.map((g) => `<button class="dt-app" type="button" data-game="${esc(g.id)}">${gameIcon(g)}<span class="dt-app-label">${esc(g.title)}</span></button>`).join('')}</div>`
    : '<p class="dt-stack-empty">No favorites yet. Open an opsec and press Favorite.</p>');
  root.appendChild(el);
  stack.el = el;
  stack.item = it;
  tooltip.classList.remove('show');
  positionStack();
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-game]');
    if (!b) return;
    const g = H.byId[b.dataset.game];
    const icon = b.querySelector('.dt-icon');
    closeStack();
    openGame(g, dockItem('game:' + g.id), icon);
  });
  if (!H.reduceMotion()) {
    el.animate([{ opacity: 0, transform: 'translateY(16px) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2, 1.1, .3, 1)' });
  }
}

function positionStack() {
  const el = stack.el;
  const it = stack.item;
  if (!el || !it) return;
  const width = el.offsetWidth;
  const left = clamp(it.cx - width / 2, 8, window.innerWidth - width - 8);
  el.style.left = left + 'px';
  el.style.bottom = (DOCK_BOTTOM + dock.base + DOCK_PAD * 2 + 14) + 'px';
  el.style.transformOrigin = `${(it.cx - left).toFixed(0)}px 100%`;
}

function closeStack() {
  if (!stack.el) return;
  const el = stack.el;
  stack.el = null;
  stack.item = null;
  if (H.reduceMotion()) { el.remove(); return; }
  el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(.75)' }], { duration: 180, easing: 'ease-in' }).onfinish = () => el.remove();
}

// ---------------------------------------------------------------------------
// Spotlight-style search
// ---------------------------------------------------------------------------

const spot = { el: null, open: false, index: 0, list: [] };

function buildSpotlight() {
  spot.el = document.createElement('div');
  spot.el.className = 'dt-spotlight';
  spot.el.hidden = true;
  spot.el.setAttribute('role', 'dialog');
  spot.el.setAttribute('aria-label', 'Search');
  spot.el.innerHTML = `
    <label class="dt-spot-field">${H.icon('search')}<input type="search" placeholder="Search opsecs" aria-label="Search opsecs" autocomplete="off" spellcheck="false"></label>
    <div class="dt-spot-results" role="listbox"></div>`;
  root.appendChild(spot.el);
  const input = spot.el.querySelector('input');
  input.addEventListener('input', () => { spot.index = 0; renderSpot(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); spot.index = Math.min(spot.list.length - 1, spot.index + 1); renderSpot(input.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); spot.index = Math.max(0, spot.index - 1); renderSpot(input.value); }
    else if (e.key === 'Enter') { e.preventDefault(); openSpotResult(spot.index); }
  });
  spot.el.querySelector('.dt-spot-results').addEventListener('click', (e) => {
    const row = e.target.closest('[data-i]');
    if (row) openSpotResult(+row.dataset.i);
  });
}

function renderSpot(q) {
  const results = spot.el.querySelector('.dt-spot-results');
  const query = q.trim();
  let list;
  let head;
  if (query) {
    list = H.search(query).slice(0, 8);
    head = list.length ? 'Opsecs' : '';
  } else {
    const recent = H.recent().map((r) => H.byId[r.id]).filter(Boolean);
    list = (recent.length ? recent : H.games.filter((g) => g.featured).concat(H.games)).filter((g, i, all) => all.indexOf(g) === i).slice(0, 6);
    head = recent.length ? 'Recently played' : 'Suggestions';
  }
  spot.list = list;
  spot.index = clamp(spot.index, 0, Math.max(0, list.length - 1));
  if (!list.length) {
    results.innerHTML = query ? `<p class="dt-spot-empty">No opsecs match “${esc(query)}”</p>` : '';
    return;
  }
  results.innerHTML = `<div class="dt-spot-head">${head}</div>` + list.map((g, i) => `
    <button class="dt-spot-row${i === spot.index ? ' sel' : ''}" type="button" role="option" aria-selected="${i === spot.index}" data-i="${i}">
      ${gameIcon(g)}<span><span class="dt-spot-title">${esc(g.title)}</span><span class="dt-spot-sub">${esc(g.category)}</span></span>
    </button>`).join('');
}

function openSpotResult(i) {
  const g = spot.list[i];
  if (!g) return;
  toggleSpotlight(false);
  openGame(g, dockItem('game:' + g.id));
}

function toggleSpotlight(force) {
  const want = force === undefined ? !spot.open : force;
  if (want === spot.open) return;
  if (!spot.el) buildSpotlight();
  spot.open = want;
  if (want) {
    closeMenu();
    closeStack();
    if (apps.open) toggleApps(false);
    dock.active = false;
    setHovered(null);
    dockKick();
    const input = spot.el.querySelector('input');
    input.value = '';
    spot.index = 0;
    renderSpot('');
    spot.el.hidden = false;
    requestAnimationFrame(() => spot.el.classList.add('open'));
    setTimeout(() => input.focus({ preventScroll: true }), 30);
  } else {
    spot.el.classList.remove('open');
    spot.el.querySelector('input').blur();
    setTimeout(() => { if (!spot.open) spot.el.hidden = true; }, 260);
  }
}

// ---------------------------------------------------------------------------
// Menu bar menus
// ---------------------------------------------------------------------------

const menu = { el: null, key: null, btn: null };

const MENUS = {
  logo: () => [
    { label: 'About SahurHub', action: openAbout },
    'sep',
    { label: 'Settings…', action: () => openSettings() },
    'sep',
    { label: 'Exit Desktop Mode', action: exit }
  ],
  app: () => {
    const w = activeWin;
    const gameId = w && w.appId.indexOf('game:') === 0 ? w.appId.slice(5) : null;
    if (gameId) {
      const fav = H.isFavorite(gameId);
      return [
        { label: 'Play ' + w.title, action: () => H.play(gameId) },
        { label: fav ? 'Remove from Favorites' : 'Add to Favorites', action: () => H.toggleFavorite(gameId) },
        'sep',
        { label: 'Close ' + w.title, action: () => closeWindow(w) }
      ];
    }
    return [
      { label: 'About SahurHub', action: openAbout },
      { label: 'Settings…', action: () => openSettings() },
      'sep',
      { label: 'Exit Desktop Mode', action: exit }
    ];
  },
  file: () => [
    { label: 'Open Apps', action: () => toggleApps(true) },
    { label: 'Open Chat', action: () => openChat() },
    { label: 'Search Opsecs…', shortcut: '/', action: () => toggleSpotlight(true) },
    'sep',
    { label: 'Close Window', disabled: !activeWin, action: () => closeWindow(activeWin) }
  ],
  view: () => [
    { label: 'Dark Mode', checked: H.isDark(), action: () => H.toggleTheme() },
    { label: 'Dock Magnification', checked: settings.magnify, action: () => setSetting('magnify', !settings.magnify) }
  ],
  window: () => {
    const items = [
      { label: 'Minimize', disabled: !activeWin, action: () => minimizeWindow(activeWin) },
      { label: 'Zoom', disabled: !activeWin, action: () => zoomWindow(activeWin) }
    ];
    if (wins.size) {
      items.push('sep');
      wins.forEach((x) => items.push({ label: x.title, checked: x === activeWin, action: () => { if (x.minimized) restoreWindow(x); focusWindow(x); } }));
    }
    return items;
  },
  help: () => [
    { label: 'Desktop Mode Help', action: openWelcome }
  ],
  nextup: () => {
    const C = H.countdown;
    if (!C) return [{ header: 'Schedule unavailable' }];
    const now = new Date();
    const st = C.getStatus(now);
    const d = C.describe(st, now);
    const sched = C.scheduleRows(st, now);
    const items = [{ header: d.label.replace(/,$/, '') + ', ' + d.time }];
    if (sched.day) {
      items.push({ header: (sched.listingToday ? 'Today, ' : '') + sched.day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }), small: true });
    }
    sched.rows.forEach((r) => {
      if (r.gap) {
        if (r.state === 'current') items.push({ label: 'Passing time', shortcut: C.minutesText(r.from) + '–' + C.minutesText(r.to), checked: true, info: true });
        return;
      }
      items.push({
        label: r.period.name + (r.state === 'next' ? ' (next)' : ''),
        shortcut: r.period.startText + '–' + r.period.endText,
        checked: r.state === 'current',
        dim: r.state === 'past',
        info: true
      });
    });
    return items;
  }
};

function updateNextup(st, d) {
  const btn = menubar && menubar.querySelector('.dt-mb-nextup');
  if (!btn) return;
  const text = d.label + ' ' + d.time;
  const label = btn.querySelector('.dt-nu-text');
  if (label.textContent !== text) label.textContent = text;
  if (btn.getAttribute('data-type') !== d.type) btn.setAttribute('data-type', d.type);
}

function showMenu(btn) {
  closeMenu();
  closeStack();
  const key = btn.dataset.menu;
  const items = MENUS[key]();
  const el = document.createElement('div');
  el.className = 'dt-menu';
  el.setAttribute('role', 'menu');
  el.innerHTML = items.map((it, i) => {
    if (it === 'sep') return '<div class="dt-menu-sep" role="separator"></div>';
    if (it.header) return `<div class="dt-menu-head${it.small ? ' dt-menu-head-small' : ''}">${esc(it.header)}</div>`;
    return `<button class="dt-menu-item${it.info ? ' dt-menu-info' : ''}${it.dim ? ' dt-menu-dim' : ''}" type="button" role="menuitem" data-i="${i}"${it.disabled ? ' disabled' : ''}>
         <span class="dt-check">${it.checked ? '✓' : ''}</span><span class="dt-menu-label">${esc(it.label)}</span>${it.shortcut ? `<span class="dt-menu-key">${esc(it.shortcut)}</span>` : ''}
       </button>`;
  }).join('');
  root.appendChild(el);
  const r = btn.getBoundingClientRect();
  el.style.left = clamp(r.left, 6, window.innerWidth - el.offsetWidth - 6) + 'px';
  el.style.top = (MENUBAR_H + 3) + 'px';
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.dt-menu-item');
    if (!b || b.disabled) return;
    const it = items[+b.dataset.i];
    closeMenu();
    if (it.action) it.action();
  });
  btn.classList.add('open');
  menu.el = el;
  menu.key = key;
  menu.btn = btn;
  if (!H.reduceMotion()) el.animate([{ opacity: 0, transform: 'translateY(-4px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 140, easing: 'ease-out' });
}

function closeMenu() {
  if (!menu.el) return;
  menu.el.remove();
  if (menu.btn) menu.btn.classList.remove('open');
  menu.el = null;
  menu.key = null;
  menu.btn = null;
}

// ---------------------------------------------------------------------------
// Clock, keyboard and global clicks
// ---------------------------------------------------------------------------

function tickClock() {
  const d = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  clockEl.textContent = window.innerWidth < 640
    ? time
    : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '') + '  ' + time;
}

function onKey(e) {
  if (e.key === 'Escape') {
    if (menu.el) closeMenu();
    else if (spot.open) toggleSpotlight(false);
    else if (apps.open) toggleApps(false);
    else if (stack.el) closeStack();
    return;
  }
  const tag = document.activeElement && document.activeElement.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA';
  if (!typing && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) {
    e.preventDefault();
    toggleSpotlight(true);
  }
}

function onRootPointerDown(e) {
  const t = e.target;
  if (menu.el && !menu.el.contains(t) && !t.closest('.dt-menubar')) closeMenu();
  if (stack.el && !stack.el.contains(t) && !t.closest('.dt-dock-item[data-id="favorites"]')) closeStack();
  if (spot.open && !spot.el.contains(t) && !t.closest('[data-action="spotlight"]')) toggleSpotlight(false);
  if (!t.closest('.dt-desk-icon')) deskIcons.querySelectorAll('.selected').forEach((x) => x.classList.remove('selected'));
}

function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawWallpaper();
    buildDock();
    closeMenu();
    closeStack();
    tickClock();
    const area = workArea();
    wins.forEach((w) => {
      const el = w.el;
      if (w.maximized) {
        el.style.left = area.x + 'px';
        el.style.top = (area.y - 4) + 'px';
        el.style.width = area.w + 'px';
        el.style.height = (area.h + 4) + 'px';
        return;
      }
      el.style.width = Math.min(el.offsetWidth, area.w) + 'px';
      el.style.height = Math.min(el.offsetHeight, area.h) + 'px';
      el.style.left = clamp(el.offsetLeft, -el.offsetWidth + 90, window.innerWidth - 90) + 'px';
      el.style.top = clamp(el.offsetTop, MENUBAR_H, window.innerHeight - 60) + 'px';
    });
  }, 140);
}

function onTheme() {
  drawWallpaper();
  dockGlass.dataset.config = JSON.stringify(dockGlassConfig());
  const w = wins.get('settings');
  if (w && w.sync) w.sync();
  closeMenu();
}

function onFavorites() {
  wins.forEach((w) => { if (w.sync && w.appId.indexOf('game:') === 0) w.sync(); });
  if (stack.el) closeStack();
}

// ---------------------------------------------------------------------------
// Liquid glass for the Dock
// ---------------------------------------------------------------------------

let glassStarting = false;
async function initGlass() {
  if (lg || !isOpen || glassStarting) return;
  if (H.getGlass && H.getGlass() !== 'liquid') return; // Simple glass: no WebGL
  glassStarting = true;
  try {
    dockGlass.dataset.config = JSON.stringify(dockGlassConfig());
    const { LiquidGlass } = await import(H.glassUrl);
    const instance = await LiquidGlass.init({ root, glassElements: [dockGlass] });
    if (!isOpen || (H.getGlass && H.getGlass() !== 'liquid')) { instance.destroy(); return; }
    lg = instance;
    root.classList.add('dt-lg-ready');
  } catch (err) {
    console.warn('SahurHub: Dock glass could not start, using the simple frosted look instead.', err);
    root.classList.add('dt-lg-fallback');
  } finally {
    glassStarting = false;
  }
}

// Settings > Glass changed while Desktop Mode is open.
function onGlass() {
  if (H.getGlass() === 'liquid') initGlass();
  else {
    if (lg) { lg.destroy(); lg = null; }
    root.classList.remove('dt-lg-ready', 'dt-lg-fallback');
  }
  const w = wins.get('settings');
  if (w && w.sync) w.sync();
}

// ---------------------------------------------------------------------------
// Open and close Desktop Mode
// ---------------------------------------------------------------------------

function intro() {
  return new Promise((resolve) => {
    if (H.reduceMotion()) { resolve(); return; }
    root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
    wallpaper.animate([{ transform: 'scale(1.12)', filter: 'blur(12px)' }, { transform: 'none', filter: 'blur(0px)' }], { duration: 1100, easing: EASE_SOFT });
    menubar.animate([{ transform: 'translateY(-100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 650, delay: 180, easing: EASE_SOFT, fill: 'backwards' });
    deskIcons.animate([{ opacity: 0, transform: 'translateX(20px)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 320, easing: EASE_SOFT, fill: 'backwards' });
    const dockIn = [{ translate: '0 160px' }, { translate: '0 0' }];
    const opts = { duration: 900, delay: 240, easing: 'cubic-bezier(.2, 1.15, .3, 1)', fill: 'backwards' };
    dockGlass.animate(dockIn, opts);
    dockEl.animate(dockIn, opts).onfinish = () => resolve();
  });
}

export function open(options) {
  onExit = options && options.onExit;
  if (!built) build();
  isOpen = true;
  root.hidden = false;
  drawWallpaper();
  buildDock();
  tickClock();
  updateAppName();
  clockTimer = setInterval(tickClock, 10000);
  unlisten = [];
  listen(window, 'pointermove', onPointerMove, { passive: true });
  listen(window, 'resize', onResize);
  listen(window, 'blur', onLeave);
  listen(document, 'keydown', onKey);
  listen(document.documentElement, 'mouseleave', onLeave);
  listen(document, 'sahurhub:theme', onTheme);
  listen(document, 'sahurhub:glass', onGlass);
  listen(document, 'sahurhub:favorites', onFavorites);
  listen(root, 'pointerdown', onRootPointerDown, true);
  if (H.countdown) unlisten.push(H.countdown.subscribe(updateNextup));
  listen(document, 'sahurhub:chat', (e) => updateDockChat(e.detail));
  intro().then(() => { if (isOpen) initGlass(); });
  let seen = false;
  try { seen = !!localStorage.getItem(WELCOME_KEY); } catch (e) { /* private mode */ }
  if (!seen && !wins.has('welcome')) setTimeout(() => { if (isOpen) openWelcome(); }, 1100);
}

export function exit() {
  if (!isOpen) return;
  isOpen = false;
  const chatWin = wins.get('chat');
  if (chatWin) closeWindow(chatWin);
  closeMenu();
  closeStack();
  if (spot.open) toggleSpotlight(false);
  if (apps.open) toggleApps(false);
  unlisten.forEach((fn) => fn());
  unlisten = [];
  clearInterval(clockTimer);
  if (dock.frame) cancelAnimationFrame(dock.frame);
  dock.frame = 0;
  dock.active = false;
  setHovered(null);
  const finish = () => {
    root.hidden = true;
    if (lg) { lg.destroy(); lg = null; }
    root.classList.remove('dt-lg-ready', 'dt-lg-fallback');
    if (onExit) onExit();
  };
  if (H.reduceMotion()) finish();
  else root.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.05)' }], { duration: 340, easing: 'cubic-bezier(.4, 0, 1, 1)' }).onfinish = finish;
}
