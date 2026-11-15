// Practice Park: bright little test-drive area for party lobbies.
import { scatter } from './scatter.js';
import { edges, mapObstacles } from './common-decor.js';

export const vis = {
  models: [],
  sky: { top: '#45b0ff', horizon: '#d0f0ff', bottom: '#f4fff4', sun: '#fff6c4', clouds: 12, seed: 31 },
  fog: { color: '#d8f2ff', near: 160 },
  light: { sky: '#eaf8ff', ground: '#a8ec90', hemi: 1.3, sun: '#fff4dc', sunI: 1.5 },
  road: { color: '#c7b8ff', texture: 'smooth', kerbA: '#ff4f9a', kerbB: '#ffffff' },
  rail: { style: 'metal', post: '#ff4f9a' },
  shortcut: { color: '#c7b8ff', texture: 'smooth' },
  colors: { grassLow: '#55d46a', grassHigh: '#aef07a', verge: '#7ae070', far: '#90e47c', sand: '#ffe39a' },
  terrain: { seed: 3, base: 1.6, noise: 1.2, rim: 14, hills: [] },
  water: { color: '#45c8ff', glow: '#0b6a9a' },
  bridge: { deck: '#d99a5c', rail: '#ffffff', post: '#ff7aa8', skirt: '#a8673a' },
  ramp: { a: '#ffd23f', b: '#ff6fa8', side: '#ffffff' },
};

export function decorate(ctx, kit, rng) {
  edges(ctx, kit, { spacing: 4.2, pick: (pt, i) => (i % 3 === 0 ? 'barrier' : 'hedge') });
  mapObstacles(ctx, kit);
  // cones around the drift pad and the open field
  const cones = [];
  for (const z of ctx.track.zones || []) for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const x = z.x + Math.cos(a) * (z.r - 2), zz = z.z + Math.sin(a) * (z.r - 2);
    cones.push({ x, y: ctx.groundAt(x, zz), z: zz, ry: a });
  }
  kit.place('cone', cones, { shadow: false });
  kit.place('balloons', scatter(ctx, rng, { count: 10, min: 4, max: 20, spacing: 15 }), { shadow: false });
  kit.place('tree_round', scatter(ctx, rng, { count: 50, min: 6, max: 120, spacing: 10, scale: [1, 1.5] }), { collide: 0.5, thin: true });
  kit.place('flag_pole', scatter(ctx, rng, { count: 12, min: 2, max: 8, spacing: 18 }), { shadow: false });
  return { update() {} };
}
