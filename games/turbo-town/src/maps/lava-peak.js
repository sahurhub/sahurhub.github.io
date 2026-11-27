// Lava Peak (Explorer Cup): dark volcanic rock, glowing lava rivers and cracks, smoking
// vents, charred trees, purple obsidian crystals, a crater glowing at the top, and embers
// drifting in the air.
import { nearest } from '../shared/track-math.js';
import { scatter, trackSpot, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns } from './common-decor.js';

const K = 1.45;

export const vis = {
  models: ['lava.glb'],
  sky: { top: '#3a2a5a', horizon: '#ff8a4a', bottom: '#ffb070', sun: '#ffcf8a', clouds: 9, seed: 23 },
  fog: { color: '#c9805a', near: 150 },
  light: { sky: '#ffd0b0', ground: '#7a4030', hemi: 1.15, sun: '#ffb880', sunI: 1.4 },
  road: { color: '#8a7f93', texture: 'cobble', kerbA: '#ff7a1a', kerbB: '#2b2236' },
  rail: { style: 'iron', post: '#2b1f2e', cap: '#ff8a1f' },
  shortcut: { color: '#6a5f73', texture: 'smooth' },
  colors: { grassLow: '#5b4a52', grassHigh: '#3d3340', verge: '#7a6670', far: '#2e2630', sand: '#2a2024', specks: ['#ff7a1a', '#8a6a5a'], speckChance: 0.05 },
  terrain: { seed: 33, base: 1.5, noise: 3, rim: 30, hills: [{ x: 20 * K, z: -35 * K, h: 45, r: 63.6 * K }] },
  water: { color: '#ff7a1a', glow: '#ff3a00' },
  bridge: { deck: '#7a6a70', rail: '#4a3a44', post: '#ff7a1a', skirt: '#4a3a44' },
  ramp: { a: '#ff7a1a', b: '#2b2236', side: '#8a7f93' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const sAt = (x, z) => nearest(track, x * K, 15, z * K, {}).s;
  startArea(ctx, kit, { standS: 30, standSide: 1 });
  edges(ctx, kit, { spacing: 7, pick: (pt, i) => (pt.path !== 'main' ? null : i % 4 === 0 ? 'basalt_b' : null) });
  cornerSigns(ctx, kit);

  const rocks = scatter(ctx, rng, { count: 90, min: 3, max: 90, spacing: 8, scale: [0.7, 1.6], water: 4 });
  kit.place('basalt_a', rocks.filter((_, i) => i % 3 === 0), { collide: 1.2 });
  kit.place('basalt_b', rocks.filter((_, i) => i % 3 === 1), { collide: 0.9 });
  kit.place('dead_tree', rocks.filter((_, i) => i % 3 === 2), { collide: 0.35, thin: true });
  kit.place('obsidian', scatter(ctx, rng, { count: 26, min: 2, max: 40, spacing: 10, water: 3 }), { collide: 0.6 });
  kit.place('lava_crack', scatter(ctx, rng, { count: 50, min: 2, max: 50, spacing: 6, water: 2 }), { shadow: false, view: 160 });
  const vents = scatter(ctx, rng, { count: 10, min: 6, max: 30, spacing: 20, water: 4 });
  kit.place('smoke_vent', vents, { collide: 1.3 });
  // the crater rim at the very top, and lava falls down the mountain side
  const top = { x: 20 * K, z: -35 * K };
  kit.place('volcano_rim', [{ x: top.x, y: ctx.terrain.heightAt(top.x, top.z + 13) - 1.5, z: top.z }], { view: 900 });
  const falls = [];
  for (let i = 0; i < 5; i++) {
    const a = 0.6 + i * 1.25, r = 26 + i * 3;
    const x = top.x + Math.cos(a) * r, z = top.z + Math.sin(a) * r;
    falls.push({ x, y: ctx.terrain.heightAt(x, z) - 0.4, z, ry: faceYaw(top.x - x, top.z - z) + Math.PI });
  }
  kit.place('lava_fall', falls, { shadow: false, view: 900 });
  const signs = [];
  for (const s of [sAt(130, -90), sAt(-111, 6)]) { const q = trackSpot(ctx, s, 9.5); signs.push({ x: q.x, y: q.y, z: q.z, ry: faceYaw(-q.p.tx, -q.p.tz) }); }
  kit.place('warning_sign', signs, { collide: 0.3 });

  let ember = 0, smoke = 0;
  return {
    update(dt, t, game) {
      if (!game || !game.fx) return;
      // smoke from the vents and the crater, embers floating up near the player
      smoke += dt * 8;
      while (smoke > 1) {
        smoke -= 1;
        const v = rng() < 0.4 ? { x: top.x, y: 46, z: top.z } : vents[Math.floor(rng() * vents.length)];
        if (v) game.fx.emit({ x: v.x + (rng() - 0.5) * 2, y: (v.y || 0) + 2.5, z: v.z + (rng() - 0.5) * 2, vy: 2.5, spread: 1.2, color: rng() < 0.5 ? '#5a4a5a' : '#7a6a70', size: 1.6, life: 3, gravity: -0.4 });
      }
      if (game.race && game.race.player) {
        const k = game.race.player.kart;
        ember += dt * 14;
        while (ember > 1) { ember -= 1; game.fx.emit({ x: k.x + (rng() - 0.5) * 40, y: k.y + rng() * 3, z: k.z + (rng() - 0.5) * 40, vy: 1.5, spread: 0.8, color: rng() < 0.5 ? '#ffb030' : '#ff5a1f', size: 0.22, life: 2.2, gravity: -0.6 }); }
      }
    },
  };
}
