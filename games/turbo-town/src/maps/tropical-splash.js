// Tropical Splash (Summer): beaches, palms, a water slide down the cliff, the sea and a pier.
import { pointAt } from '../shared/track-math.js';
import { scatter, waterDistance, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns } from './common-decor.js';
import { matrixOf } from '../render/props.js';

export const vis = {
  models: ['tropical.glb'],
  sky: { top: '#1fa2ff', horizon: '#b8f0ff', bottom: '#e8fbff', sun: '#fffbe0', clouds: 12, seed: 2 },
  fog: { color: '#c4efff', near: 170 },
  light: { sky: '#e8fbff', ground: '#ffe3a0', hemi: 1.3, sun: '#fff6e0', sunI: 1.6 },
  road: { color: '#ffd59a', texture: 'smooth', kerbA: '#2fb6ff', kerbB: '#ffffff' },
  rail: { style: 'bamboo' },        // bamboo poles
  shortcut: { color: '#5fd0ff', texture: 'smooth' },
  colors: { grassLow: '#5fd36a', grassHigh: '#b0f070', verge: '#ffe08a', far: '#7fe07a', sand: '#ffe39a' },
  terrain: { seed: 21, base: 2.3, noise: 2.0, rim: 26, hills: [{ x: 120, z: -40, h: 16, r: 75 }, { x: 40, z: -60, h: 12, r: 60 }, { x: 0, z: 330, h: -6, r: 200 }] },
  water: { color: '#2fd0ff', glow: '#0a6d9a' },
  bridge: { deck: '#d99a5c', rail: '#ffffff', post: '#2fb6ff', skirt: '#a8673a' },
  ramp: { a: '#2fb6ff', b: '#ffd32a', side: '#ffffff' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  startArea(ctx, kit, { standS: 30, standSide: -1 });
  edges(ctx, kit, { spacing: 6, pick: (pt, i) => (pt.path !== 'main' ? null : i % 4 === 0 ? 'rock_a' : i % 4 === 2 ? 'bush_round' : null) });
  cornerSigns(ctx, kit);

  // (the water slide is lined by the track's bamboo guard rails like the rest of the road)

  // palms along the beach, umbrellas, huts and towers on the sand
  const palms = scatter(ctx, rng, { count: 120, min: 3, max: 70, spacing: 8, falloff: 1.1, scale: [0.85, 1.25], water: 2 });
  kit.place('palm_a', palms.filter((_, i) => i % 2 === 0), { collide: 0.45, thin: true });
  kit.place('palm_b', palms.filter((_, i) => i % 2 === 1), { collide: 0.45, thin: true });
  const beach = scatter(ctx, rng, { count: 40, min: 3, max: 30, spacing: 9, water: 1 }).filter((p) => p.z > 140 * 1.08 || waterDistance(ctx, p.x, p.z) < 25);
  kit.place('beach_umbrella', beach.filter((_, i) => i % 3 !== 2), { shadow: false });
  kit.place('surfboards', beach.filter((_, i) => i % 3 === 2), { shadow: false });
  const huts = scatter(ctx, rng, { count: 6, min: 10, max: 35, spacing: 30, water: 6 });
  huts.forEach((h) => { const n = nearest(track, h.x, h.z); h.ry = faceYaw(n.x - h.x, n.z - h.z); });
  kit.place('tiki_hut', huts.slice(0, 4), { collide: 2.2 });
  kit.place('lifeguard_tower', huts.slice(4), { collide: 1.2 });
  kit.place('sandcastle', scatter(ctx, rng, { count: 10, min: 2, max: 20, spacing: 10, water: 1 }), { shadow: false });
  kit.place('starfish', scatter(ctx, rng, { count: 60, min: 0.5, max: 25, spacing: 3, water: 0.5 }), { shadow: false, view: 90, thin: true });
  kit.place('crab', scatter(ctx, rng, { count: 20, min: 1, max: 20, spacing: 6, water: 0.5 }).map((c) => ({ ...c, s: 1.4 })), { shadow: false, view: 100 });
  kit.place('bush_round', scatter(ctx, rng, { count: 60, min: 2, max: 50, spacing: 6, falloff: 1, scale: [0.8, 1.4] }), { thin: true, shadow: false, view: 160 });
  // sailboats bobbing on the sea
  const sea = ctx.waters.find((w) => w.id === 'sea');
  const boats = [];
  for (let i = 0; i < 6; i++) boats.push({ x: -300 + i * 120 + rng() * 40, y: (sea ? sea.level : 0.8) - 0.2, z: 290 + rng() * 60, ry: rng() * 6.28, ph: rng() * 6.28 });
  const boatMesh = kit.place('sailboat', boats, { animated: true, shadow: false });

  let spray = 0;
  return {
    update(dt, t, game) {
      if (boatMesh) {
        for (const mesh of boatMesh.children) {
          boats.forEach((b, i) => mesh.setMatrixAt(i, matrixOf({ x: b.x + Math.sin(t * 0.1 + b.ph) * 8, y: b.y + Math.sin(t * 1.3 + b.ph) * 0.25, z: b.z, ry: b.ry, rz: Math.sin(t + b.ph) * 0.06 })));
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
      // splashy spray on the water slide around the camera
      if (game && game.fx && game.race && game.race.player) {
        const k = game.race.player.kart;
        if (k.surf === 14 && Math.abs(k.speed) > 8) {
          spray += dt * 30;
          while (spray > 1) { spray -= 1; game.fx.emit({ x: k.x, y: k.y + 0.3, z: k.z, vy: 3, spread: 4, color: '#e3f8ff', size: 0.35, life: 0.5, gravity: 10 }); }
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
