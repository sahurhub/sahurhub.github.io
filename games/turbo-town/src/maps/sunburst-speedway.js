// Sunburst Speedway (Summer): amusement park with a ferris wheel, carousel, fountains,
// a rollercoaster section and bumper cars.
import { pointAt } from '../shared/track-math.js';
import { scatter, faceYaw, trackSpot } from './scatter.js';
import { startArea, edges, cornerSigns, moverVisuals } from './common-decor.js';

export const vis = {
  models: ['sunburst.glb'],
  sky: { top: '#3d9bff', horizon: '#ffe0f4', bottom: '#fff4fb', sun: '#fff6c4', clouds: 14, seed: 7 },
  fog: { color: '#ffe6f6', near: 160 },
  light: { sky: '#fff0fa', ground: '#b4f0a0', hemi: 1.3, sun: '#fff1d6', sunI: 1.5 },
  road: { color: '#c7b8ff', texture: 'smooth', kerbA: '#ffd32a', kerbB: '#ff4f9a' },
  rail: { style: 'metal', post: '#ff3d5a', post2: '#ffd32a' }, // steel speedway rail, fairground posts
  shortcut: { color: '#ffb36b', texture: 'cobble' },
  colors: { grassLow: '#55d46a', grassHigh: '#aef07a', verge: '#7ae070', far: '#90e47c', sand: '#ffe39a' },
  terrain: { seed: 31, base: 1.6, noise: 1.6, rim: 12, hills: [{ x: 20, z: 90, h: -0.8, r: 40 }] },
  water: { color: '#5ad6ff', glow: '#1a7aaa' },
  bridge: { deck: '#ff6fa8', rail: '#ffffff', post: '#ff3d5a', skirt: '#ffd32a' },
  ramp: { a: '#ffd32a', b: '#ff4f9a', side: '#ffffff' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const K = 1.13;
  startArea(ctx, kit, { standS: 40, standSide: -1 });
  edges(ctx, kit, { spacing: 4.2, pick: (pt, i) => (pt.path !== 'main' ? 'barrier' : i % 7 === 0 ? 'lamp' : 'barrier'), collide: 0 });
  cornerSigns(ctx, kit);
  const moveMovers = moverVisuals(ctx, kit);

  // big rides in the middle of the park
  const wheel = kit.single('ferris_wheel', { x: 40 * K, y: ctx.terrain.heightAt(40 * K, 90 * K), z: 90 * K, ry: 0.4 }, { collide: 8 });
  const wheelSpin = wheel && wheel.getObjectByName('wheel_ferris');
  const carousel = kit.single('carousel', { x: -70 * K, y: ctx.terrain.heightAt(-70 * K, 0), z: 0 * K, ry: 0 }, { collide: 6 });
  const carTop = carousel && carousel.getObjectByName('top_carousel');
  // fountains in the plaza and by the pond
  const fountains = [trackSpot(ctx, 60, -16), trackSpot(ctx, track.length - 40, 16), trackSpot(ctx, 520, 0)];
  const fts = fountains.filter((f) => ctx.world.edge(f.x, f.y, f.z, 0, {}).excess > 3).map((f) => ({ x: f.x, y: ctx.terrain.heightAt(f.x, f.z), z: f.z }));
  kit.place('fountain', fts, { collide: 4 });
  // stalls along the paths
  const stalls = scatter(ctx, rng, { count: 26, min: 4, max: 35, spacing: 14, water: 5 });
  stalls.forEach((s) => { const n = nearest(track, s.x, s.z); s.ry = faceYaw(n.x - s.x, n.z - s.z); });
  kit.place('striped_tent', stalls.filter((_, i) => i % 4 === 0), { collide: 3.4 });
  kit.place('ticket_booth', stalls.filter((_, i) => i % 4 === 1), { collide: 1.5 });
  kit.place('ice_cream_cart', stalls.filter((_, i) => i % 4 === 2), { collide: 1.2 });
  kit.place('balloon_stand', stalls.filter((_, i) => i % 4 === 3), { collide: 1.0 });
  // bunting over the start straight
  const bunt = [];
  for (let s = 20; s < 160; s += 35) { const p = pointAt(track.main, s); bunt.push({ x: p.x, y: ctx.groundAt(p.x, p.z), z: p.z, ry: Math.atan2(-p.rz, p.rx), sx: (p.w / 2 + p.m + 1) / 6, sy: 1.6, sz: 1 }); }
  kit.place('bunting', bunt, { shadow: false });
  kit.place('tree_round', scatter(ctx, rng, { count: 80, min: 8, max: 200, spacing: 12, scale: [1.0, 1.6] }), { thin: true, collide: 0.5 });
  kit.place('bush_round', scatter(ctx, rng, { count: 70, min: 2, max: 40, spacing: 5, scale: [0.8, 1.3] }), { thin: true, shadow: false, view: 160 });
  kit.place('balloons', scatter(ctx, rng, { count: 20, min: 3, max: 30, spacing: 12 }), { shadow: false });

  let sprayAcc = 0;
  return {
    update(dt, t, game) {
      if (wheelSpin) wheelSpin.rotation.x += dt * 0.25;
      if (carTop) carTop.rotation.y += dt * 0.6;
      moveMovers(t);
      // fountain sprays
      if (game && game.fx) {
        sprayAcc += dt * 40;
        while (sprayAcc > 1) {
          sprayAcc -= 1;
          const f = fts[Math.floor(Math.random() * fts.length)];
          if (!f) break;
          game.fx.emit({ x: f.x, y: f.y + 3, z: f.z, vy: 7 + Math.random() * 2, spread: 2.2, color: '#d8f6ff', size: 0.35, life: 1.0, gravity: 12, drag: 0.9 });
        }
      }
    },
  };
}

function nearest(track, x, z) {
  let best = null, bd = Infinity;
  for (const p of track.main.pts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
