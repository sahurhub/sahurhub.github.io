// Pumpkin Patch (Autumn): a farm with hay bales, a barn to drive through, giant pumpkins,
// cornfields, orange trees and falling leaves.
import { pointAt } from '../shared/track-math.js';
import { scatter, faceYaw, edgeDistance } from './scatter.js';
import { startArea, edges, cornerSigns, mapObstacles } from './common-decor.js';

export const vis = {
  models: ['pumpkin.glb'],
  sky: { top: '#5ab0ff', horizon: '#ffe2b8', bottom: '#fff2dc', sun: '#ffe9b0', clouds: 14, seed: 4 },
  fog: { color: '#ffe8c8', near: 150 },
  light: { sky: '#fff2dc', ground: '#d8c070', hemi: 1.25, sun: '#ffe8c0', sunI: 1.55 },
  road: { color: '#e8a76a', texture: 'smooth', kerbA: '#ff8a1f', kerbB: '#ffffff' },
  rail: { style: 'wood' },          // wooden farm rails
  shortcut: { color: '#c98a4b', texture: 'smooth' },
  colors: { grassLow: '#9ccc3d', grassHigh: '#d6e05a', verge: '#c7b05a', far: '#b9d058', sand: '#ffd98a' },
  terrain: { seed: 41, base: 2.0, noise: 2.6, rim: 16, hills: [{ x: 115, z: -155, h: 6, r: 50 }] },
  water: { color: '#4fc6ff', glow: '#0b6a9a' },
  bridge: { deck: '#c98b52', rail: '#ffffff', post: '#e8433f', skirt: '#8a5a2b' },
  ramp: { a: '#ff8a1f', b: '#ffd23f', side: '#ffffff' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const ground = (x, z) => ctx.terrain.heightAt(x, z);
  startArea(ctx, kit, { standS: 35, standSide: 1 });
  edges(ctx, kit, { spacing: 4.2, pick: (pt, i) => (pt.path !== 'main' ? null : i % 5 === 0 ? 'hay_round' : i % 5 === 3 ? 'hay_square' : 'fence_farm') });
  cornerSigns(ctx, kit);
  mapObstacles(ctx, kit);

  // the barn the road runs through (sized to the road)
  for (const tn of track.def.tunnels || []) {
    const len = (tn.to - tn.from + track.length) % track.length;
    const p = pointAt(track.main, tn.from + len / 2);
    const s = (p.w / 2 + p.m + 0.8) / 14;
    kit.place('barn', [{ x: p.x, y: ctx.groundAt(p.x, p.z) - 0.1, z: p.z, ry: faceYaw(p.tx, p.tz), s }]);
    for (const side of [-1, 1]) for (const d of [-5, 0, 5]) {
      const q = pointAt(track.main, tn.from + len / 2 + d);
      ctx.world.addCircle({ x: q.x + q.rx * side * 14.5 * s, z: q.z + q.rz * side * 14.5 * s, r: 1.2, kind: 'barn' });
    }
  }
  // the cornfield around the hidden shortcut
  const cf = track.paths.find((p) => p.id === 'cornfield');
  const corn = [];
  if (cf) {
    for (let d = 8; d < cf.length - 8; d += 2.6) {
      const p = pointAt(cf, d);
      for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
        const lat = side * (p.w / 2 + p.m + 1 + k * 1.6);
        const x = p.x + p.rx * lat, z = p.z + p.rz * lat;
        if (edgeDistance(ctx, x, z) > 0.4) corn.push({ x, y: ground(x, z), z, ry: rng() * 6.28, s: 0.9 + rng() * 0.3 });
      }
    }
  }
  corn.push(...scatter(ctx, rng, { count: 160, min: 6, max: 30, spacing: 2.4, area: { x: -190 * 1.17, z: -20 * 1.17, w: 120, h: 160 } }));
  kit.place('corn', corn, { shadow: false, view: 200 });
  // farm buildings
  kit.place('silo', [{ x: 170, y: ground(170, -210), z: -210 }, { x: 186, y: ground(186, -196), z: -196, s: 0.8 }], { collide: 2.8 });
  const tractor = scatter(ctx, rng, { count: 3, min: 6, max: 20, spacing: 40 });
  kit.place('tractor', tractor, { collide: 1.6 });
  kit.place('scarecrow', scatter(ctx, rng, { count: 10, min: 4, max: 30, spacing: 25 }), { collide: 0.4 });
  // pumpkins everywhere, orange trees, leaf piles, crates
  kit.place('pumpkin', scatter(ctx, rng, { count: 220, min: 0.8, max: 40, spacing: 2.2, falloff: 1.2, scale: [0.8, 1.6] }), { thin: true, shadow: false, view: 150 });
  kit.place('giant_pumpkin', scatter(ctx, rng, { count: 14, min: 4, max: 40, spacing: 18 }), { collide: 1.8 });
  const trees = scatter(ctx, rng, { count: 120, min: 4, max: 90, spacing: 8, falloff: 1, scale: [0.9, 1.3], water: 4 });
  kit.place('autumn_tree', trees.filter((_, i) => i % 2 === 0), { collide: 0.45, thin: true });
  kit.place('autumn_tree_b', trees.filter((_, i) => i % 2 === 1), { collide: 0.45, thin: true });
  kit.place('leaf_pile', scatter(ctx, rng, { count: 60, min: 1, max: 25, spacing: 5 }), { shadow: false, view: 120 });
  kit.place('crate', scatter(ctx, rng, { count: 20, min: 2, max: 20, spacing: 8 }), { shadow: false, collide: 0.6 });

  let leafAcc = 0;
  return {
    update(dt, t, game) {
      if (game && game.fx) {
        leafAcc += dt * 12;
        const cam = game.r.camera.position;
        const cols = ['#ff8a1f', '#ffc93c', '#e8433f'];
        while (leafAcc > 1) {
          leafAcc -= 1;
          game.fx.emit({ x: cam.x + (Math.random() - 0.5) * 45, y: cam.y + 5 + Math.random() * 8, z: cam.z + (Math.random() - 0.5) * 45,
            vx: 1.6, vy: -1.4, vz: 0.5, spread: 1.2, color: cols[Math.floor(Math.random() * 3)], size: 0.28, life: 6, drag: 1, alpha: 1 });
        }
      }
    },
  };
}
