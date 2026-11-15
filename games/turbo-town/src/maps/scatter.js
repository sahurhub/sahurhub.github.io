// TURBO TOWN - scenery placement helpers shared by the map modules.
import { pointAt } from '../shared/track-math.js';

// metres from (x, z) to the nearest drivable edge (negative = on the track)
export function edgeDistance(ctx, x, z) {
  const t = ctx.terrain;
  const ix = Math.round((x - t.x0) / t.cell), iz = Math.round((z - t.z0) / t.cell);
  if (ix < 0 || iz < 0 || ix >= t.nx || iz >= t.nz) return 999;
  const k = iz * t.nx + ix;
  if (t.D[k] > 1e8) return 200; // further than the distance field reaches
  return t.D[k] - t.IN[k] + 1.6;
}

export function waterDistance(ctx, x, z) {
  let d = Infinity;
  for (const w of ctx.waters) d = Math.min(d, w.dist(x, z));
  return d;
}

// Random spots away from the road. opts: { count, min, max, spacing, water (min distance
// from water), falloff (prefer near the road), scale: [a, b], avoid: [{x, z, r}], yJitter }
export function scatter(ctx, rng, opts) {
  const t = ctx.terrain;
  const out = [];
  const cellS = Math.max(1, opts.spacing || 4);
  const taken = new Map();
  const key = (x, z) => Math.floor(x / cellS) + ',' + Math.floor(z / cellS);
  const near = (x, z) => {
    const cx = Math.floor(x / cellS), cz = Math.floor(z / cellS);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = taken.get((cx + a) + ',' + (cz + b));
      if (list) for (const p of list) if ((p.x - x) ** 2 + (p.z - z) ** 2 < cellS * cellS) return true;
    }
    return false;
  };
  const min = opts.min ?? 4, max = opts.max ?? 80;
  const [s0, s1] = opts.scale || [1, 1];
  let tries = opts.count * 30;
  while (out.length < opts.count && tries-- > 0) {
    const x = opts.area ? opts.area.x + (rng() - 0.5) * opts.area.w : t.x0 + rng() * (t.x1 - t.x0);
    const z = opts.area ? opts.area.z + (rng() - 0.5) * opts.area.h : t.z0 + rng() * (t.z1 - t.z0);
    const d = edgeDistance(ctx, x, z);
    if (d < min || d > max) continue;
    if (opts.falloff && rng() > Math.pow(1 - (d - min) / (max - min), opts.falloff)) continue;
    if (waterDistance(ctx, x, z) < (opts.water ?? 3)) continue;
    if (opts.avoid && opts.avoid.some((a) => (a.x - x) ** 2 + (a.z - z) ** 2 < a.r * a.r)) continue;
    if (near(x, z)) continue;
    const p = { x, y: t.heightAt(x, z) - (opts.sink || 0), z, ry: rng() * Math.PI * 2, s: s0 + (s1 - s0) * rng() };
    out.push(p);
    const k = key(x, z);
    if (!taken.has(k)) taken.set(k, []);
    taken.get(k).push(p);
  }
  return out;
}

// A spot beside the track at lap distance s, lat metres from the centre line.
export function trackSpot(ctx, s, lat, path = ctx.track.main) {
  const p = pointAt(path, s);
  const x = p.x + p.rx * lat, z = p.z + p.rz * lat;
  return { x, z, y: ctx.groundAt(x, z, p.y + 20), p };
}

// yaw that turns a model's long side (local X) along the road direction
export const alongYaw = (tx, tz) => Math.atan2(-tz, tx);
// yaw that makes a model's front (local +Z) face direction (dx, dz)
export const faceYaw = (dx, dz) => Math.atan2(dx, dz);
