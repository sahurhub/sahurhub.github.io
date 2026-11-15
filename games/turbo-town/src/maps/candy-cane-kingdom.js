// Candy Cane Kingdom (Winter): an evening race through a sweet town with twinkly lights,
// gingerbread houses, lollipop trees, giant presents and a chocolate river.
import { pointAt } from '../shared/track-math.js';
import { scatter, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns, mapObstacles, arches } from './common-decor.js';

export const vis = {
  models: ['candy.glb'],
  sky: { top: '#5a3db8', horizon: '#ff9fd0', bottom: '#ffd8ec', sun: '#fff0d0', clouds: 12, cloudColor: '#ffe0f4', seed: 23 },
  fog: { color: '#f4b8e4', near: 120 },
  light: { sky: '#ffe0f4', ground: '#c8a0ff', hemi: 1.25, sun: '#ffe8d8', sunI: 1.2 },
  road: { color: '#ffb8d8', texture: 'smooth', kerbA: '#ff3d5a', kerbB: '#ffffff' },
  rail: { style: 'candy' },         // candy-striped rail on lollipop posts
  shortcut: { color: '#ffd0e4', texture: 'smooth' },
  colors: { grassLow: '#fdf6ff', grassHigh: '#ffffff', verge: '#fff0fa', far: '#ffe8f6', sand: '#e8c0a0' },
  terrain: { seed: 71, base: 2.0, noise: 2.4, rim: 20, hills: [{ x: -150, z: 200, h: 9, r: 40 }, { x: -200, z: 150, h: 7, r: 40 }] },
  water: { color: '#8a4b2a', glow: '#3a1a0a' },
  bridge: { deck: '#ff3d5a', rail: '#ffffff', post: '#ff3d5a', skirt: '#ffd8ec' },
  ramp: { a: '#ff3d5a', b: '#ffffff', side: '#ff9fd0' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  startArea(ctx, kit, { standS: 35, standSide: 1 });
  edges(ctx, kit, { spacing: 5, pick: (pt, i) => (pt.path !== 'main' ? null : i % 2 === 0 ? 'candy_cane' : (i % 8 === 1 ? 'light_pole' : 'peppermint')) });
  cornerSigns(ctx, kit);
  mapObstacles(ctx, kit);

  // candy-cane arches over the tunnel shortcut
  const ct = track.paths.find((p) => p.id === 'cane-tunnel');
  if (ct) arches(ctx, kit, 'cane_arch', ct, 12, ct.length - 12, 6, 5.5, { pad: 0.8 });
  // castle on the hill, gingerbread village, sweets everywhere
  const castle = { x: 60 * 1.3, z: 60 * 1.3 };
  kit.place('candy_castle', [{ x: castle.x, y: ctx.terrain.heightAt(castle.x, castle.z) - 0.3, z: castle.z, ry: 0.5 }], { collide: 10 });
  const houses = scatter(ctx, rng, { count: 12, min: 10, max: 40, spacing: 18, water: 6, avoid: [{ ...castle, r: 20 }] });
  houses.forEach((h) => { const n = nearest(track, h.x, h.z); h.ry = faceYaw(n.x - h.x, n.z - h.z); });
  kit.place('gingerbread_house', houses, { collide: 3.2 });
  const trees = scatter(ctx, rng, { count: 120, min: 3, max: 90, spacing: 8, falloff: 1, scale: [0.8, 1.3], water: 3, avoid: [{ ...castle, r: 18 }] });
  kit.place('lollipop_tree', trees.filter((_, i) => i % 2 === 0), { collide: 0.4, thin: true });
  kit.place('lollipop_tree_b', trees.filter((_, i) => i % 2 === 1), { collide: 0.4, thin: true });
  kit.place('gumdrop', scatter(ctx, rng, { count: 50, min: 2, max: 40, spacing: 6, scale: [0.8, 2.0] }), { shadow: false, thin: true });
  kit.place('gumdrop_b', scatter(ctx, rng, { count: 50, min: 2, max: 40, spacing: 6, scale: [0.8, 2.0] }), { shadow: false, thin: true });
  kit.place('present_a', scatter(ctx, rng, { count: 14, min: 3, max: 30, spacing: 10, scale: [0.6, 1.0] }), { collide: 1.4 });
  kit.place('present_b', scatter(ctx, rng, { count: 14, min: 3, max: 30, spacing: 10, scale: [0.6, 1.0] }), { collide: 1.3 });
  kit.place('cupcake', scatter(ctx, rng, { count: 16, min: 4, max: 35, spacing: 14 }), { collide: 1.0 });

  let snowAcc = 0;
  return {
    update(dt, t, game) {
      if (game && game.fx) {
        snowAcc += dt * 18;
        const cam = game.r.camera.position;
        const cols = ['#ffffff', '#ffffff', '#ffd0ec', '#d8f0ff'];
        while (snowAcc > 1) {
          snowAcc -= 1;
          game.fx.emit({ x: cam.x + (Math.random() - 0.5) * 50, y: cam.y + 3 + Math.random() * 10, z: cam.z + (Math.random() - 0.5) * 50,
            vx: 0.4, vy: -1.5, vz: 0.3, spread: 0.6, color: cols[Math.floor(Math.random() * 4)], size: 0.2, life: 6, drag: 1, alpha: 1 });
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
