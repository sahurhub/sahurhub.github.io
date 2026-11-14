// Small helpers shared by every module.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
export const wrapAngle = a => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const smoothAngle = (current, target, rate, dt) => current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

// deterministic RNG (mulberry32) so the city is the same for every player / server
export function rng(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + f() * (b - a);
  f.int = (a, b) => Math.floor(a + f() * (b - a + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  return f;
}
export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function weightedPick(r, items, weightFn) {
  let total = 0;
  for (const it of items) total += weightFn(it);
  let x = r() * total;
  for (const it of items) {
    x -= weightFn(it);
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

export const fmtMoney = n => '$' + Math.round(n).toLocaleString('en-US');
export const fmtShort = n => {
  n = Math.round(n);
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.0+$/, '') + 'M';
  if (n >= 1e4) return '$' + (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return '$' + n.toLocaleString('en-US');
};
export const fmtTime = s => {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
};
export const fmtDist = m => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m');
export const todayKey = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// URL flags: ?mute (no audio), ?fresh (ignore the save), ?nosave (keep saves in memory only),
// ?failassets=a,b (pretend these models failed to load, to test fallbacks), ?debug
export const URLP = new URLSearchParams(location.search);
export const FLAGS = {
  mute: URLP.has('mute'),
  debug: URLP.has('debug'),
  fresh: URLP.has('fresh'),
  nosave: URLP.has('nosave'),
  failAssets: (URLP.get('failassets') || '').split(',').filter(Boolean),
};

// tiny event bus
export class Emitter {
  constructor() { this._h = {}; }
  on(ev, fn) { (this._h[ev] ||= []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const a = this._h[ev]; if (a) this._h[ev] = a.filter(f => f !== fn); }
  emit(ev, ...args) {
    const a = this._h[ev];
    if (!a) return;
    for (const f of a.slice()) {
      try { f(...args); } catch (e) { console.warn('[event ' + ev + ']', e); }
    }
  }
}
