// Dusty Canyon (Explorer Cup): red rock, cacti, mesas on the horizon, an old mine with its
// carts and water tower, a natural rock arch, and tumbleweeds blowing about.
import { nearest } from '../shared/track-math.js';
import { scatter, trackSpot, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns, moverVisuals, arches } from './common-decor.js';

const K = 1.27;

export const vis = {
  models: ['canyon.glb'],
  sky: { top: '#3d8bff', horizon: '#ffd9a0', bottom: '#fff1d6', sun: '#fff2b0', clouds: 6, seed: 41 },
  fog: { color: '#ffd8b0', near: 180 },
  light: { sky: '#fff4e0', ground: '#e8a35c', hemi: 1.25, sun: '#ffe8c0', sunI: 1.7 },
  road: { color: '#f2c896', texture: 'smooth', kerbA: '#ff6b2c', kerbB: '#ffffff' },
  rail: { style: 'wood' },
  shortcut: { color: '#c98a5a', texture: 'planks' },
  colors: { grassLow: '#e8a35c', grassHigh: '#d9824a', verge: '#f0c27a', far: '#c9653a', sand: '#b0763a', specks: ['#c96a3a', '#f6d29a'], speckChance: 0.1 },
  terrain: { seed: 61, base: 2.5, noise: 3.5, rim: 42, hills: [{ x: 18.2 * K, z: -136.4 * K, h: 10, r: 21.8 * K }, { x: 181.8 * K, z: 90.9 * K, h: 30, r: 63.6 * K }, { x: -200 * K, z: -163.6 * K, h: 34, r: 72.7 * K }] },
  water: { color: '#c48a4a', glow: '#5a3010' },
  bridge: { deck: '#c98b52', rail: '#fff3d6', post: '#8a5a2b', skirt: '#8a5a2b' },
  ramp: { a: '#ff6b2c', b: '#ffd32a', side: '#ffffff' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const sAt = (x, z) => nearest(track, x * K, 5, z * K, {}).s;
  startArea(ctx, kit, { standS: 30, standSide: 1 });
  edges(ctx, kit, { spacing: 7, pick: (pt, i) => (pt.path !== 'main' ? null : i % 5 === 0 ? 'canyon_rock' : i % 5 === 2 ? 'cactus_round' : null) });
  cornerSigns(ctx, kit);

  // cacti and rocks near the road, mesas and buttes out on the plain
  const cacti = scatter(ctx, rng, { count: 90, min: 3, max: 70, spacing: 7, falloff: 1, scale: [0.8, 1.35] });
  kit.place('cactus_tall', cacti.filter((_, i) => i % 3 === 0), { collide: 0.45, thin: true });
  kit.place('cactus_round', cacti.filter((_, i) => i % 3 === 1), { collide: 0.5, thin: true });
  kit.place('canyon_rock', cacti.filter((_, i) => i % 3 === 2), { collide: 0.9 });
  kit.place('desert_flower', scatter(ctx, rng, { count: 70, min: 1.5, max: 30, spacing: 4 }), { shadow: false, view: 110, thin: true });
  const mesas = scatter(ctx, rng, { count: 14, min: 70, max: 230, spacing: 45, scale: [0.8, 1.6] });
  kit.place('mesa_a', mesas.filter((_, i) => i % 2 === 0), { view: 900 });
  kit.place('mesa_b', mesas.filter((_, i) => i % 2 === 1), { view: 900 });
  kit.place('tumbleweed', scatter(ctx, rng, { count: 16, min: 2, max: 30, spacing: 10 }), { shadow: false, view: 120 });

  // the natural rock arch over the road on the climb
  const archS = sAt(166, -100);
  arches(ctx, kit, 'rock_arch', track.main, archS, archS + 1, 10, 9.5, { pad: 2.5 });

  // the old mine: timber frames along the shortcut, carts, the water tower and a wind pump
  const mine = track.paths.find((p) => p.id === 'mine');
  if (mine) {
    arches(ctx, kit, 'mine_arch', mine, 6, mine.length - 6, 7, 5.2, { pad: 1.2 });
    const a = trackSpot(ctx, 4, 6.5, mine), b = trackSpot(ctx, mine.length - 4, -6.5, mine);
    kit.place('mine_cart', [{ x: a.x, y: a.y, z: a.z, ry: a.p.heading }, { x: b.x, y: b.y, z: b.z, ry: b.p.heading + 0.4 }], { collide: 1.1 });
  }
  const wt = trackSpot(ctx, sAt(60, -140), 16);
  kit.place('water_tower', [{ x: wt.x, y: wt.y, z: wt.z, ry: faceYaw(-wt.p.rx, -wt.p.rz) }], { collide: 2.4 });
  const wp = trackSpot(ctx, sAt(-110, 20), -15);
  kit.place('windpump', [{ x: wp.x, y: wp.y, z: wp.z, ry: 0.6 }], { collide: 1.2 });
  const wheels = [];
  for (const s of [sAt(120, -15), sAt(-50, 46), sAt(-118, -30)]) { const q = trackSpot(ctx, s, (rng() < 0.5 ? -1 : 1) * 11); wheels.push({ x: q.x, y: q.y, z: q.z, ry: rng() * 6.28 }); }
  kit.place('wagon_wheel', wheels, { shadow: false });

  const tumble = moverVisuals(ctx, kit);
  let dust = 0;
  return {
    update(dt, t, game) {
      tumble(t);
      // dust devils of sand blowing around near the player
      if (game && game.fx && game.race && game.race.player) {
        const k = game.race.player.kart;
        dust += dt * 6;
        while (dust > 1) {
          dust -= 1;
          const a = rng() * 6.28, d = 12 + rng() * 25;
          game.fx.emit({ x: k.x + Math.cos(a) * d, y: k.y + 0.5, z: k.z + Math.sin(a) * d, vy: 0.6, spread: 2.5, color: '#f2c896', size: 0.6, life: 1.6, gravity: -0.3 });
        }
      }
    },
  };
}
