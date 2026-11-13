// Small shared maths helpers.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

export function wrapPi(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Move `v` toward `target` by at most `maxStep`. */
export function approach(v, target, maxStep) {
  const d = target - v;
  return Math.abs(d) <= maxStep ? target : v + Math.sign(d) * maxStep;
}

/** Deterministic random numbers (mulberry32). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Piecewise-linear lookup in a table of [x, y] pairs sorted by x. */
export function lookup(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

/** 83.456 -> "1:23.456". */
export function fmtTime(sec, showSign = false) {
  if (sec == null || !isFinite(sec)) return '--:--.---';
  const sign = sec < 0 ? '-' : showSign ? '+' : '';
  sec = Math.abs(sec);
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const ss = s.toFixed(3).padStart(6, '0');
  return m > 0 ? `${sign}${m}:${ss}` : `${sign}${s.toFixed(3)}`;
}

export const KPH = 3.6;
