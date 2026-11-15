// Haunted Hollow (Autumn): fun, not scary. Purple misty forest, glowing pumpkins and
// lanterns, friendly floating ghosts and bats, a swamp bridge and a house to drive through.
import { pointAt } from '../shared/track-math.js';
import { scatter, faceYaw, edgeDistance } from './scatter.js';
import { startArea, edges, cornerSigns } from './common-decor.js';
import { matrixOf } from '../render/props.js';

export const vis = {
  models: ['haunted.glb'],
  sky: { top: '#3b2a8f', horizon: '#c88cff', bottom: '#e8c8ff', sun: '#fff0b0', clouds: 10, cloudColor: '#d8c8ff', seed: 13 },
  fog: { color: '#b89cff', near: 70 },
  light: { sky: '#d8c8ff', ground: '#7a5ad0', hemi: 1.15, sun: '#ffe8c8', sunI: 1.1 },
  road: { color: '#b8a2e8', texture: 'cobble', kerbA: '#ff8a1f', kerbB: '#3b2a8f' },
  rail: { style: 'iron' },          // dark iron railing with glowing orange caps
  shortcut: { color: '#8f6bff', texture: 'planks' },
  colors: { grassLow: '#4f9a6a', grassHigh: '#7fca7a', verge: '#5fb07a', far: '#6a5ad0', sand: '#c9a0ff' },
  terrain: { seed: 51, base: 2.6, noise: 3.0, rim: 22, hills: [] },
  water: { color: '#b06cff', glow: '#5a1aa8' },
  bridge: { deck: '#a89cd0', rail: '#d8d0ff', post: '#7a6ab8', skirt: '#6a5aa8' },
  ramp: { a: '#ff8a1f', b: '#3b2a8f', side: '#ffd36b' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const ground = (x, z) => ctx.terrain.heightAt(x, z);
  startArea(ctx, kit, { standS: 35, standSide: 1 });
  edges(ctx, kit, { spacing: 4.2, pick: (pt, i) => (pt.path !== 'main' ? null : i % 6 === 0 ? 'jack_o_lantern' : 'fence_iron') });
  cornerSigns(ctx, kit);

  // the house the shortcut drives through
  const hs = track.paths.find((p) => p.id === 'haunted-house');
  if (hs) {
    const p = pointAt(hs, hs.length / 2);
    const s = (p.w / 2 + p.m + 0.6) / 5;
    kit.place('house_tunnel', [{ x: p.x, y: ctx.groundAt(p.x, p.z) - 0.1, z: p.z, ry: faceYaw(p.tx, p.tz), s }]);
    for (const side of [-1, 1]) for (const d of [-5, 0, 5]) {
      const q = pointAt(hs, hs.length / 2 + d);
      ctx.world.addCircle({ x: q.x + q.rx * side * 5.6 * s, z: q.z + q.rz * side * 5.6 * s, r: 0.8, kind: 'house' });
    }
    // bushes hide the entrance a little
    const e = pointAt(hs, 14);
    kit.place('spooky_tree_b', [{ x: e.x + e.rx * 6, y: ground(e.x + e.rx * 6, e.z + e.rz * 6), z: e.z + e.rz * 6, s: 0.8 }], { collide: 0.4 });
  }
  // haunted houses, spooky trees, glowing things
  const houses = scatter(ctx, rng, { count: 7, min: 14, max: 45, spacing: 32, water: 6 });
  houses.forEach((h) => { const n = nearest(track, h.x, h.z); h.ry = faceYaw(n.x - h.x, n.z - h.z); });
  kit.place('haunted_house', houses, { collide: 3.5 });
  const trees = scatter(ctx, rng, { count: 150, min: 3, max: 90, spacing: 7, falloff: 1, scale: [0.9, 1.4], water: 3 });
  kit.place('spooky_tree', trees.filter((_, i) => i % 2 === 0), { collide: 0.45, thin: true });
  kit.place('spooky_tree_b', trees.filter((_, i) => i % 2 === 1), { collide: 0.45, thin: true });
  kit.place('jack_o_lantern', scatter(ctx, rng, { count: 70, min: 1, max: 25, spacing: 4, scale: [0.8, 1.4] }), { shadow: false, view: 170, thin: true });
  kit.place('lantern_post', scatter(ctx, rng, { count: 30, min: 1.2, max: 6, spacing: 22 }), { collide: 0.2 });
  kit.place('glow_mushrooms', scatter(ctx, rng, { count: 120, min: 0.5, max: 30, spacing: 3, scale: [0.8, 1.6] }), { shadow: false, view: 120, thin: true });
  kit.place('cauldron', scatter(ctx, rng, { count: 5, min: 4, max: 20, spacing: 40 }), { collide: 1.0 });

  // friendly ghosts floating around, and bats fluttering
  const ghosts = scatter(ctx, rng, { count: 18, min: 2, max: 30, spacing: 12 }).map((g) => ({ ...g, ph: rng() * 6.28, r: 2 + rng() * 3 }));
  const gm = kit.place('ghost', ghosts, { animated: true, shadow: false });
  const bats = scatter(ctx, rng, { count: 16, min: 0, max: 30, spacing: 10 }).map((b) => ({ ...b, ph: rng() * 6.28, r: 3 + rng() * 4 }));
  const bm = kit.place('bat', bats, { animated: true, shadow: false });
  const tmp = {};

  let fogAcc = 0;
  return {
    update(dt, t, game) {
      if (gm) for (const mesh of gm.children) {
        ghosts.forEach((g, i) => {
          const a = t * 0.5 + g.ph;
          tmp.x = g.x + Math.cos(a) * g.r; tmp.z = g.z + Math.sin(a) * g.r; tmp.y = g.y + 1.5 + Math.sin(t * 1.6 + g.ph) * 0.6;
          tmp.ry = -a; tmp.s = 1.3; tmp.rz = Math.sin(t * 2 + g.ph) * 0.15;
          mesh.setMatrixAt(i, matrixOf(tmp));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (bm) for (const mesh of bm.children) {
        bats.forEach((b, i) => {
          const a = t * 1.2 + b.ph;
          mesh.setMatrixAt(i, matrixOf({ x: b.x + Math.cos(a) * b.r, z: b.z + Math.sin(a) * b.r, y: b.y + 6 + Math.sin(t * 3 + b.ph), ry: -a, sx: 0.4 + Math.abs(Math.sin(t * 14 + b.ph)) * 0.8, s: 1.2 }));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
      // little glowing motes in the mist
      if (game && game.fx) {
        fogAcc += dt * 10;
        const cam = game.r.camera.position;
        while (fogAcc > 1) {
          fogAcc -= 1;
          game.fx.emit({ x: cam.x + (Math.random() - 0.5) * 40, y: cam.y - 1 + Math.random() * 5, z: cam.z + (Math.random() - 0.5) * 40,
            vx: 0.2, vy: 0.3, vz: 0.2, spread: 0.5, color: Math.random() < 0.5 ? '#c6ff8a' : '#ffe58a', size: 0.14, life: 4, drag: 1, alpha: 0.9 });
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

export { edgeDistance };
