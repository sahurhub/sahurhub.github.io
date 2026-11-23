// Small, fast 3D value noise (deterministic) used to spread the dirt, moss and oil.
function hash3(x, y, z, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1442695041) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const c000 = hash3(xi, yi, zi, seed), c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed), c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed), c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed), c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  return lerp(lerp(lerp(c000, c100, xf), lerp(c010, c110, xf), yf), lerp(lerp(c001, c101, xf), lerp(c011, c111, xf), yf), zf);
}

// 3 octaves, result 0..1 (mostly 0.25..0.75)
export function fbm3(x, y, z, seed = 0) {
  return (noise3(x, y, z, seed) * 0.57 + noise3(x * 2.03, y * 2.03, z * 2.03, seed + 7) * 0.29 + noise3(x * 4.1, y * 4.1, z * 4.1, seed + 13) * 0.14);
}

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
