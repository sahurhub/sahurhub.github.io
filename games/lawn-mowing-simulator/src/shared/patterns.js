// "Mow the pattern" shapes. Each pattern marks which lawn cells should be cut.
import { levelGrid } from './lawn.js';

export const PATTERNS = {
  checker: { name: 'Checkerboard' },
  diagonal: { name: 'Diagonal Stripes' },
  diamond: { name: 'Diamond' },
  heart: { name: 'Heart' },
  target: { name: 'Target' },
  star: { name: 'Star' },
  smile: { name: 'Smiley Face' },
  cross: { name: 'Big Plus' },
};
export const PATTERN_IDS = Object.keys(PATTERNS);

function starPoly(n = 5, r1 = 0.95, r2 = 0.42) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}
const STAR = starPoly();
function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// u, v in [-1, 1] across the lawn's bounding box (v down the lawn), aspect = width/height
function test(id, u, v, aspect) {
  // keep shapes round on long lawns
  const su = aspect > 1 ? u * aspect : u, sv = aspect > 1 ? v : v / aspect;
  switch (id) {
    case 'checker': return (Math.floor((u + 1) * 3) + Math.floor((v + 1) * 2)) % 2 === 0;
    case 'diagonal': return Math.floor((su + sv + 4) * 1.6) % 2 === 0;
    case 'diamond': return Math.abs(su) + Math.abs(sv) < 0.85;
    case 'heart': {
      const x = su * 1.25, y = -sv * 1.25 + 0.25;
      const a = x * x + y * y - 0.7;
      return a * a * a - x * x * y * y * y < 0;
    }
    case 'target': { const r = Math.hypot(su, sv); return r < 0.25 || (r > 0.5 && r < 0.78); }
    case 'star': return inPoly(STAR, su, sv);
    case 'smile': {
      const r = Math.hypot(su, sv);
      if (r > 0.8 && r < 0.95) return true;
      if (Math.hypot(su - 0.3, sv + 0.28) < 0.13 || Math.hypot(su + 0.3, sv + 0.28) < 0.13) return true;
      return r > 0.42 && r < 0.56 && sv > 0.12;
    }
    case 'cross': return (Math.abs(su) < 0.22 && Math.abs(sv) < 0.85) || (Math.abs(sv) < 0.22 && Math.abs(su) < 0.85);
    default: return false;
  }
}

// Uint8Array over the level grid: 1 = this cell should be cut.
export function patternMask(levelId, patternId) {
  const g = levelGrid(levelId);
  let i0 = g.nx, j0 = g.nz, i1 = 0, j1 = 0;
  for (let k = 0; k < g.n; k++) if (g.mow[k]) {
    const i = k % g.nx, j = (k / g.nx) | 0;
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
  }
  const w = Math.max(1, i1 - i0), h = Math.max(1, j1 - j0);
  const aspect = w / h;
  const m = new Uint8Array(g.n);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * g.nx + i;
    if (!g.mow[k]) continue;
    const u = ((i - i0) / w) * 2 - 1, v = ((j - j0) / h) * 2 - 1;
    if (test(patternId, u, v, aspect)) m[k] = 1;
  }
  return m;
}
