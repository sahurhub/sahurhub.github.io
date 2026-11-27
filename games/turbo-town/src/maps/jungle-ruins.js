// Jungle Ruins (Explorer Cup): huge jungle trees and ferns round an old stone temple, ruined
// arches over the road, broken pillars and carved stone heads, torches, the road behind a
// waterfall, and a log swinging over the temple courtyard.
import { nearest } from '../shared/track-math.js';
import { scatter, trackSpot, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns, moverVisuals, arches } from './common-decor.js';

const K = 1.35;

export const vis = {
  models: ['jungle.glb'],
  sky: { top: '#4fb8ff', horizon: '#d9f5d0', bottom: '#eefbe8', sun: '#fff6c4', clouds: 10, seed: 7 },
  fog: { color: '#cfeccf', near: 150 },
  light: { sky: '#eaffea', ground: '#5fa04a', hemi: 1.25, sun: '#fff1cc', sunI: 1.45 },
  road: { color: '#d8c9a0', texture: 'cobble', kerbA: '#6fae4a', kerbB: '#efe2b8' },
  rail: { style: 'stone' },
  shortcut: { color: '#b89a6a', texture: 'cobble' },
  colors: { grassLow: '#3fb04a', grassHigh: '#7ad04a', verge: '#5fc04a', far: '#2f9a42', sand: '#c9b07a', specks: ['#ff5aa0', '#ffd32a', '#ffffff'], speckChance: 0.06 },
  terrain: { seed: 17, base: 2, noise: 3, rim: 30, hills: [{ x: 81.8 * K, z: -136.4 * K, h: 8, r: 27.3 * K }, { x: -63.6 * K, z: -86.4 * K, h: 16, r: 23.6 * K }] },
  water: { color: '#3fd0b0', glow: '#0a6d5a' },
  bridge: { deck: '#b98a52', rail: '#e0c48a', post: '#7a4f2a', skirt: '#7a4f2a' },
  ramp: { a: '#6fae4a', b: '#ffd32a', side: '#efe2b8' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const sAt = (x, z) => nearest(track, x * K, 5, z * K, {}).s;
  startArea(ctx, kit, { standS: 32, standSide: -1 });
  edges(ctx, kit, { spacing: 6, pick: (pt, i) => (pt.path !== 'main' ? null : i % 4 === 0 ? 'fern' : i % 4 === 2 ? 'flower_bush' : null) });
  cornerSigns(ctx, kit);

  // the jungle: big trees, palms, ferns and flowers everywhere
  const trees = scatter(ctx, rng, { count: 130, min: 4, max: 90, spacing: 8, falloff: 0.8, scale: [0.85, 1.4], water: 3 });
  kit.place('jungle_tree', trees.filter((_, i) => i % 3 !== 2), { collide: 0.8, thin: true });
  kit.place('jungle_palm', trees.filter((_, i) => i % 3 === 2), { collide: 0.45, thin: true });
  kit.place('fern', scatter(ctx, rng, { count: 120, min: 1.5, max: 40, spacing: 4, scale: [0.8, 1.5] }), { shadow: false, view: 150, thin: true });
  kit.place('flower_bush', scatter(ctx, rng, { count: 50, min: 2, max: 35, spacing: 6 }), { shadow: false, view: 140, thin: true });

  // the ruins: arches over the road on the plateau, pillars, walls, stone heads, the temple
  arches(ctx, kit, 'ruin_arch', track.main, sAt(140, -95), sAt(80, -118), 12, 9.5, { pad: 2 });
  const temple = track.paths.find((p) => p.id === 'temple');
  if (temple) arches(ctx, kit, 'ruin_arch_small', temple, 8, temple.length - 8, 14, 5.2, { pad: 1.6 });
  const ruins = scatter(ctx, rng, { count: 30, min: 3, max: 30, spacing: 9, area: { x: 70 * K, z: -130 * K, w: 145 * K, h: 82 * K } });
  kit.place('ruin_pillar', ruins.filter((_, i) => i % 3 === 0), { collide: 0.8 });
  kit.place('ruin_wall', ruins.filter((_, i) => i % 3 === 1), { collide: 1.6 });
  const heads = ruins.filter((_, i) => i % 3 === 2).map((h) => { const n = nearest(track, h.x, h.y, h.z, {}); return { ...h, ry: faceYaw(n.x - h.x, n.z - h.z) }; });
  kit.place('stone_head', heads, { collide: 1.2 });
  const tp = trackSpot(ctx, sAt(95, -128), -34);
  kit.place('temple', [{ x: tp.x, y: tp.y - 0.3, z: tp.z, ry: faceYaw(-tp.p.rx, -tp.p.rz) }], { collide: 9, view: 900 });
  // torches along the plateau road
  const torches = [];
  for (let s = sAt(150, -70); s < sAt(30, -158); s += 22) for (const side of [-1, 1]) { const q = trackSpot(ctx, s, side * 9.2); torches.push({ x: q.x, y: q.y, z: q.z }); }
  kit.place('torch', torches, { collide: 0.25, shadow: false });

  // the road behind the waterfall
  for (const tn of track.def.tunnels || []) arches(ctx, kit, 'waterfall_arch', track.main, tn.from, tn.to, 5, 9.5, { pad: 1.8 });

  const swing = moverVisuals(ctx, kit);
  let mist = 0;
  return {
    update(dt, t, game) {
      swing(t);
      // spray from the waterfall when you drive behind it
      if (game && game.fx && game.race && game.race.player) {
        const k = game.race.player.kart;
        const tn = track.def.tunnels[0];
        if (tn && k.near && k.near.path === track.main && k.near.s > tn.from - 5 && k.near.s < tn.to + 5) {
          mist += dt * 25;
          while (mist > 1) { mist -= 1; game.fx.emit({ x: k.x + (rng() - 0.5) * 10, y: k.y + 3 + rng() * 2, z: k.z + (rng() - 0.5) * 10, vy: -2, spread: 2, color: '#e8fff8', size: 0.45, life: 0.8, gravity: 4 }); }
        }
      }
    },
  };
}
