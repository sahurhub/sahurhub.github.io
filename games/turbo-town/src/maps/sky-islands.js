// Sky Islands (Thrill Cup): grassy islands on a sea of clouds. Puffy clouds drifting past,
// hot-air balloons, little rocks floating in the air, windmills turning, glowing crystals,
// a rainbow arch, and birds flying round.
import { nearest } from '../shared/track-math.js';
import def from '../shared/maps/sky-islands.js';
import { scatter, trackSpot, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns, arches } from './common-decor.js';
import { matrixOf } from '../render/props.js';

const K = 1.5;

// Land round the road on each island: round hills along the road that stop short of the
// bridges and the jump gap, so the ground drops away into the clouds only between islands.
function islandHills() {
  const pts = def.path.map((p) => ({ x: p[0], z: p[2], y: p[1] }));
  const voids = [...(def.bridges || []), ...(def.gaps || [])].filter((b) => Array.isArray(b.from) && Array.isArray(b.to));
  const segDist = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
  };
  const hills = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 28));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
      if (voids.some((v) => segDist(x, z, v.from, v.to) < 36)) continue;
      hills.push({ x, z, r: 44, h: 1, want: y - 1.5 - BASE });
    }
  }
  // the hills overlap, so share the height out until each centre is about right
  const g = (p, q) => Math.exp(-((p.x - q.x) ** 2 + (p.z - q.z) ** 2) / (q.r * q.r));
  for (let it = 0; it < 6; it++) {
    for (const p of hills) {
      const sum = hills.reduce((s, q) => s + q.h * g(p, q), 0);
      p.h *= p.want / Math.max(1e-3, sum);
    }
  }
  return hills.map(({ x, z, r, h }) => ({ x, z, r, h }));
}
const BASE = -40;

export const vis = {
  models: ['sky.glb'],
  sky: { top: '#5fb4ff', horizon: '#ffe0f4', bottom: '#ffffff', sun: '#fffbe0', clouds: 18, seed: 77 },
  fog: { color: '#eef4ff', near: 210 },
  light: { sky: '#ffffff', ground: '#d8e8ff', hemi: 1.35, sun: '#fff6e8', sunI: 1.55 },
  road: { color: '#efe6ff', texture: 'cobble', kerbA: '#7bdcff', kerbB: '#ffffff' },
  rail: { style: 'picket', post: '#7bdcff' },
  shortcut: { color: '#efe6ff', texture: 'cobble' },
  colors: { grassLow: '#5fd36a', grassHigh: '#b0f070', verge: '#7ae070', far: '#8ae06a', sand: '#c9e8a0', specks: ['#ffffff', '#ffd3f0', '#fff3a0'], speckChance: 0.1 },
  // islands: the ground drops off quickly (blend) to far below the cloud sea (base)
  terrain: { seed: 5, base: BASE, noise: 1.5, rim: 0, blend: 11, hills: islandHills() },
  water: { color: '#ffffff', glow: '#c9dcff' },
  bridge: { deck: '#efe6ff', rail: '#ffffff', post: '#7bdcff', skirt: '#c9c3e6' },
  ramp: { a: '#7bdcff', b: '#ff9ad6', side: '#ffffff' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const sAt = (x, z) => nearest(track, x * K, 25, z * K, {}).s;
  startArea(ctx, kit, { standS: 30, standSide: -1 });
  edges(ctx, kit, { spacing: 6, pick: (pt, i) => (pt.path !== 'main' ? null : i % 4 === 0 ? 'flower_tuft' : null) });
  cornerSigns(ctx, kit);

  // on the islands: round trees, crystals, windmills (only where the ground is high)
  const onIsland = (list) => list.filter((p) => p.y > 15);
  kit.place('sky_tree', onIsland(scatter(ctx, rng, { count: 80, min: 2.5, max: 14, spacing: 6, scale: [0.8, 1.3], water: -1e9 })), { collide: 0.5, thin: true });
  kit.place('crystal', onIsland(scatter(ctx, rng, { count: 30, min: 2, max: 12, spacing: 8, water: -1e9 })), { collide: 0.5, shadow: false });
  kit.place('flower_tuft', onIsland(scatter(ctx, rng, { count: 60, min: 1.5, max: 12, spacing: 4, water: -1e9 })), { shadow: false, view: 120 });
  const mills = onIsland(scatter(ctx, rng, { count: 4, min: 6, max: 12, spacing: 40, water: -1e9 }));
  kit.place('windmill_base', mills, { collide: 1.5 });
  const blades = mills.map((m) => ({ x: m.x, y: m.y + 7.2, z: m.z, ry: m.ry }));
  const bladeMesh = kit.place('windmill_blades', blades, { animated: true, shadow: false });
  // the rainbow over the start straight
  const rb = sAt(40, 0);
  arches(ctx, kit, 'rainbow_arch', track.main, rb, rb + 1, 10, 9.5, { pad: 3, collide: false, shadow: false });
  // around the islands: clouds, floating rocks, balloons, birds
  const clouds = [], rocks = [], balloons = [], birds = [];
  for (let i = 0; i < 40; i++) clouds.push({ x: (rng() - 0.5) * 520, y: -4 + rng() * 16, z: -70 * K + (rng() - 0.5) * 420, s: 2 + rng() * 4, ph: rng() * 6.28 });
  for (let i = 0; i < 24; i++) rocks.push({ x: (rng() - 0.5) * 420, y: 10 + rng() * 40, z: -70 * K + (rng() - 0.5) * 340, s: 0.6 + rng() * 1.8, ry: rng() * 6.28, ph: rng() * 6.28 });
  for (let i = 0; i < 6; i++) balloons.push({ x: (rng() - 0.5) * 380, y: 40 + rng() * 30, z: -70 * K + (rng() - 0.5) * 320, ph: rng() * 6.28 });
  for (let i = 0; i < 16; i++) birds.push({ cx: (rng() - 0.5) * 300, cz: -70 * K + (rng() - 0.5) * 260, r: 10 + rng() * 25, h: 34 + rng() * 20, sp: (0.4 + rng() * 0.4) * (rng() < 0.5 ? 1 : -1), ph: rng() * 6.28 });
  // keep floaters off the road itself
  const clear = (p) => { const n = nearest(track, p.x, p.y, p.z, {}); return n.dist > 16 || Math.abs(p.y - n.y) > 10; };
  const cl = clouds.filter(clear), rk = rocks.filter(clear);
  const cloudMesh = kit.place('cloud_puff', cl, { animated: true, shadow: false, view: 900 });
  const rockMesh = kit.place('floating_rock', rk, { animated: true, view: 900 });
  const balloonMesh = kit.place('hot_air_balloon', balloons, { animated: true, shadow: false, view: 900 });
  const birdMesh = kit.place('bird', birds.map((b) => ({ x: b.cx, y: b.h, z: b.cz })), { animated: true, shadow: false });

  const move = (group, list, fn) => { if (!group) return; for (const mesh of group.children) { list.forEach((b, i) => mesh.setMatrixAt(i, matrixOf(fn(b)))); mesh.instanceMatrix.needsUpdate = true; } };
  void trackSpot; void faceYaw;
  return {
    update(dt, t) {
      move(bladeMesh, blades, (b) => ({ x: b.x, y: b.y, z: b.z, ry: b.ry, rz: t * 1.4 }));
      move(cloudMesh, cl, (c) => ({ x: c.x + Math.sin(t * 0.02 + c.ph) * 30, y: c.y, z: c.z, s: c.s }));
      move(rockMesh, rk, (r) => ({ x: r.x, y: r.y + Math.sin(t * 0.7 + r.ph) * 1.2, z: r.z, s: r.s, ry: r.ry + t * 0.1 }));
      move(balloonMesh, balloons, (b) => ({ x: b.x + Math.sin(t * 0.05 + b.ph) * 25, y: b.y + Math.sin(t * 0.4 + b.ph) * 2, z: b.z, ry: t * 0.05 + b.ph }));
      move(birdMesh, birds, (g) => { const a = g.ph + t * g.sp; return { x: g.cx + Math.cos(a) * g.r, y: g.h + Math.sin(t * 2 + g.ph), z: g.cz + Math.sin(a) * g.r, ry: g.sp > 0 ? -a : Math.PI - a, rz: Math.sin(t * 7 + g.ph) * 0.25 }; });
    },
  };
}
