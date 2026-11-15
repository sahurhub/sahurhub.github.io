// Frostbite Falls (Winter): snowy pines, snowmen, a glittering ice cave, a frozen lake,
// rolling snowballs and gently falling snow.
import { pointAt } from '../shared/track-math.js';
import { scatter, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns, moverVisuals, arches } from './common-decor.js';

export const vis = {
  models: ['frost.glb'],
  sky: { top: '#5ab8ff', horizon: '#e6f6ff', bottom: '#ffffff', sun: '#fffbe8', clouds: 16, seed: 17 },
  fog: { color: '#e8f6ff', near: 140 },
  light: { sky: '#f0faff', ground: '#c8e8ff', hemi: 1.35, sun: '#fff8ec', sunI: 1.45 },
  road: { color: '#b8c8ff', texture: 'smooth', kerbA: '#2fb6ff', kerbB: '#ffffff' },
  rail: { style: 'ice' },           // icy blue rail with snow on top
  shortcut: { color: '#d8e4ff', texture: 'smooth' },
  colors: { grassLow: '#f4fbff', grassHigh: '#ffffff', verge: '#eef8ff', far: '#e6f2ff', sand: '#d8ecff' },
  terrain: { seed: 61, base: 2.0, noise: 3.0, rim: 40, hills: [{ x: 110, z: -230, h: 30, r: 80 }, { x: 260, z: -150, h: 26, r: 70 }, { x: -60, z: -230, h: 24, r: 70 }] },
  water: { color: '#8fe0ff', glow: '#2a8acc' },
  bridge: { deck: '#d8ecff', rail: '#ffffff', post: '#9fd8ff', skirt: '#a8c8f0' },
  ramp: { a: '#ffffff', b: '#2fb6ff', side: '#d8ecff' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  startArea(ctx, kit, { standS: 35, standSide: -1 });
  edges(ctx, kit, { spacing: 5, pick: (pt, i) => (i % 3 === 0 ? 'snow_rock' : i % 3 === 1 ? 'pine_snow' : null) });
  cornerSigns(ctx, kit);
  const moveMovers = moverVisuals(ctx, kit);

  // ice cave arches with crystals along the tunnel
  for (const tn of track.def.tunnels || []) arches(ctx, kit, 'cave_arch', track.main, tn.from, tn.to, 7, 14.5, { pad: 1.5 });
  // frozen waterfall above the pass, igloos and a lodge
  const fall = pointAt(track.main, (track.def.tunnels[0]?.from || 600) - 40);
  kit.place('frozen_fall', [{ x: fall.x - fall.rx * 30, y: ctx.terrain.heightAt(fall.x - fall.rx * 30, fall.z - fall.rz * 30) - 0.5, z: fall.z - fall.rz * 30, ry: faceYaw(fall.rx, fall.rz) }]);
  const huts = scatter(ctx, rng, { count: 6, min: 12, max: 40, spacing: 30, water: 4 });
  huts.forEach((h) => { const n = nearest(track, h.x, h.z); h.ry = faceYaw(n.x - h.x, n.z - h.z); });
  kit.place('igloo', huts.slice(0, 4), { collide: 2.6 });
  kit.place('ski_lodge', huts.slice(4), { collide: 4 });
  const pines = scatter(ctx, rng, { count: 170, min: 3, max: 120, spacing: 7, falloff: 0.9, scale: [0.8, 1.4], water: 3 });
  kit.place('pine_snow', pines.filter((_, i) => i % 2 === 0), { collide: 0.45, thin: true });
  kit.place('pine_snow_b', pines.filter((_, i) => i % 2 === 1), { collide: 0.45, thin: true });
  kit.place('snowman', scatter(ctx, rng, { count: 14, min: 2, max: 25, spacing: 20 }), { collide: 0.8 });
  kit.place('ice_crystal', scatter(ctx, rng, { count: 40, min: 1, max: 35, spacing: 8, scale: [0.6, 1.4] }), { shadow: false, collide: 0.5 });
  kit.place('snow_rock', scatter(ctx, rng, { count: 50, min: 2, max: 50, spacing: 8, scale: [0.7, 1.6] }), { shadow: false, thin: true });

  let snowAcc = 0;
  return {
    update(dt, t, game) {
      moveMovers(t);
      if (game && game.fx) {
        snowAcc += dt * 26;
        const cam = game.r.camera.position;
        while (snowAcc > 1) {
          snowAcc -= 1;
          game.fx.emit({ x: cam.x + (Math.random() - 0.5) * 50, y: cam.y + 3 + Math.random() * 10, z: cam.z + (Math.random() - 0.5) * 50,
            vx: 0.6, vy: -1.8, vz: 0.3, spread: 0.8, color: '#ffffff', size: 0.2, life: 6, drag: 1, alpha: 1 });
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
