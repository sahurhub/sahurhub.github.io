// Mushroom Meadow (Spring): giant mushrooms, bouncy mushroom pads, a hollow-log tunnel.
import { pointAt } from '../shared/track-math.js';
import { scatter, edgeDistance, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns, mapObstacles, arches } from './common-decor.js';

export const vis = {
  models: ['mushroom.glb'],
  sky: { top: '#4cb6ff', horizon: '#d6f2ff', bottom: '#f4fff0', sun: '#fff8d0', clouds: 18, seed: 5 },
  fog: { color: '#d9f4ff', near: 150 },
  light: { sky: '#eaf8ff', ground: '#a6e88a', hemi: 1.3, sun: '#fff4dc', sunI: 1.45 },
  road: { color: '#f7d2a0', texture: 'smooth', kerbA: '#ff4f5e', kerbB: '#ffffff' },
  rail: { style: 'log' },           // log rails on little toadstool posts
  shortcut: { color: '#d9a066', texture: 'smooth' },
  colors: { grassLow: '#4fd36a', grassHigh: '#a8ef6c', verge: '#6fde6b', far: '#8be47a', sand: '#ffe39a' },
  terrain: { seed: 11, base: 1.8, noise: 3.4, rim: 16, hills: [{ x: 0, z: 0, h: 2, r: 25 }, { x: 0, z: -150, h: 10, r: 60 }] },
  water: { color: '#58d0ff', glow: '#0b6a9a' },
  bridge: { deck: '#ffe9c4', rail: '#ff4f5e', post: '#ffffff', skirt: '#f2c58d' },
  ramp: { a: '#ff4f5e', b: '#ffffff', side: '#ffe9c4' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const ground = (x, z) => ctx.terrain.heightAt(x, z);
  startArea(ctx, kit, { standS: 30, standSide: -1 });
  edges(ctx, kit, { spacing: 5, pick: (pt, i) => (pt.path === 'main' ? (i % 3 === 0 ? 'mushroom_small' : 'hedge') : (i % 2 ? 'mushroom_small' : null)) });
  cornerSigns(ctx, kit);
  mapObstacles(ctx, kit);

  // bouncy mushroom pads drawn over the bounce patches
  const pads = [];
  for (const pt of track.def.patches || []) {
    if (pt.surface !== 'bounce') continue;
    const mid = pointAt(track.main, (pt.from + ((pt.to - pt.from + track.length) % track.length) / 2) % track.length);
    const lat = ((pt.lat0 ?? -mid.w / 2) + (pt.lat1 ?? mid.w / 2)) / 2;
    const w = (pt.lat1 ?? mid.w / 2) - (pt.lat0 ?? -mid.w / 2);
    const x = mid.x + mid.rx * lat, z = mid.z + mid.rz * lat;
    pads.push({ x, y: ctx.groundAt(x, z, mid.y + 2) - 0.12, z, ry: mid.heading, sx: w / 2, sz: 3.0, sy: 1 });
  }
  kit.place('bounce_pad', pads, { shadow: false });

  // the hollow log over the road
  for (const tn of track.def.tunnels || []) {
    const len = (tn.to - tn.from + track.length) % track.length;
    arches(ctx, kit, 'log_tunnel', track.main, tn.from, tn.to, Math.max(10, len / Math.max(1, Math.round(len / 10))), 15, { pad: 1.6 });
  }

  // giant mushrooms (trees of this world), mushroom houses, small mushrooms and flowers
  const big = scatter(ctx, rng, { count: 70, min: 4, max: 90, spacing: 11, falloff: 1.1, scale: [0.8, 1.5], water: 4 });
  kit.place('giant_mushroom', big.filter((_, i) => i % 3 === 0), { collide: 1.3, thin: true });
  kit.place('giant_mushroom_b', big.filter((_, i) => i % 3 === 1), { collide: 1.2, thin: true });
  kit.place('giant_mushroom_c', big.filter((_, i) => i % 3 === 2), { collide: 1.1, thin: true });
  const houses = scatter(ctx, rng, { count: 5, min: 14, max: 40, spacing: 30, water: 8 });
  houses.forEach((h) => { const n = nearestMain(track, h.x, h.z); h.ry = faceYaw(n.x - h.x, n.z - h.z); });
  kit.place('mushroom_house', houses, { collide: 2.6 });
  kit.place('tree_round', scatter(ctx, rng, { count: 60, min: 60, max: 200, spacing: 12, scale: [1.2, 1.8] }), { thin: true, shadow: false });
  kit.place('mushroom_small', scatter(ctx, rng, { count: 140, min: 0.8, max: 35, spacing: 3, falloff: 1.3, scale: [0.8, 1.6] }), { thin: true, shadow: false, view: 140 });
  kit.place('bluebells', scatter(ctx, rng, { count: 260, min: 0.5, max: 40, spacing: 2.4, falloff: 1.3, scale: [1, 1.5] }), { thin: true, shadow: false, view: 100 });
  kit.place('clover', scatter(ctx, rng, { count: 200, min: 0.5, max: 30, spacing: 2.4, scale: [1, 1.8] }), { thin: true, shadow: false, view: 90 });
  // a ring of small mushrooms around the stream banks
  const st = ctx.waters.find((w) => w.id === 'stream');
  if (st) {
    const bank = [];
    st.poly.forEach(([x, z], i) => { if (i % 2 === 0 && edgeDistance(ctx, x + 6, z) > 1) bank.push({ x: x + 6, y: ground(x + 6, z), z, ry: i, s: 1.2 }); });
    kit.place('mushroom_small', bank, { shadow: false });
  }

  let petal = 0;
  return {
    update(dt, t, game) {
      // floating spores drifting in the air
      if (game && game.fx) {
        petal += dt * 8;
        const cam = game.r.camera.position;
        while (petal > 1) {
          petal -= 1;
          game.fx.emit({ x: cam.x + (Math.random() - 0.5) * 40, y: cam.y - 1 + Math.random() * 6, z: cam.z + (Math.random() - 0.5) * 40,
            vx: 0.3, vy: 0.25, vz: 0.2, spread: 0.4, color: Math.random() < 0.5 ? '#fff6a8' : '#ffffff', size: 0.16, life: 5, drag: 1, alpha: 0.9 });
        }
      }
    },
  };
}

function nearestMain(track, x, z) {
  let best = null, bd = Infinity;
  for (const p of track.main.pts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
