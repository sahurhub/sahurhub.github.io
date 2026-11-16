// Blossom Valley (Spring): the look of the map and its scenery.
import * as THREE from 'three';
import { pointAt } from '../shared/track-math.js';
import { scatter, edgeDistance, trackSpot, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns } from './common-decor.js';
import { matrixOf } from '../render/props.js';

export const vis = {
  models: ['blossom.glb'],
  sky: { top: '#3fa9ff', horizon: '#c4ecff', bottom: '#f0fbff', sun: '#fff6c4', clouds: 16 },
  fog: { color: '#cdeeff', near: 160 },
  light: { sky: '#e6f6ff', ground: '#9ee07a', hemi: 1.25, sun: '#fff1d6', sunI: 1.5 },
  road: { color: '#f6bf98', texture: 'cobble', kerbA: '#ff6fa8', kerbB: '#ffffff' },
  rail: { style: 'picket' },        // white rails on pink posts
  shortcut: { color: '#a6e86c', texture: 'smooth' },
  colors: {
    grassLow: '#55cc4c', grassHigh: '#a3ea62', verge: '#77d95c', far: '#8ee06a',
    sand: '#ffe39a', dirt: '#d9a066',
  },
  terrain: {
    seed: 4, base: 2, noise: 2.6, rim: 14,
    hills: [{ x: 70, z: 120, h: -1.2, r: 40 }, { x: -60, z: 110, h: 6, r: 45 }, { x: 330, z: -10, h: 18, r: 70 }],
  },
  water: { color: '#45c8ff', glow: '#0b6a9a' },
  bridge: { deck: '#d99a5c', rail: '#ffffff', post: '#ff7aa8', skirt: '#a8673a' },
  ramp: { a: '#ffd23f', b: '#ff6fa8', side: '#ffffff' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const ground = (x, z) => ctx.terrain.heightAt(x, z);

  startArea(ctx, kit, { standS: 40, standSide: 1 });

  // white fences along the start straight and the farm road, flowery hedges elsewhere
  edges(ctx, kit, {
    spacing: 4.2,
    pick: (pt) => {
      if (pt.path !== 'main') return null; // the shortcut gets bushes instead
      const s = pt.s;
      if (s > track.length - 70 || s < 130 || (s > 600 && s < 700)) return 'fence';
      return 'hedge';
    },
  });
  cornerSigns(ctx, kit);

  // the flower-field shortcut: bushes along its sides and a few in the middle to weave round
  const sc = track.paths.find((p) => p.id === 'flower-field');
  if (sc) {
    const border = [], inside = [];
    for (let d = 14; d < sc.length - 14; d += 7) {
      const p = pointAt(sc, d);
      for (const side of [-1, 1]) {
        const lat = side * (p.w / 2 + p.m + 0.9);
        const x = p.x + p.rx * lat, z = p.z + p.rz * lat;
        if (edgeDistance(ctx, x, z) > 0.2) border.push({ x, y: ground(x, z), z, ry: rng() * 6.28, s: 0.9 + rng() * 0.3 });
      }
    }
    [[0.33, -1.8], [0.5, 1.9], [0.67, -1.5], [0.8, 1.6]].forEach(([f, lat]) => {
      const p = pointAt(sc, sc.length * f);
      const x = p.x + p.rx * lat, z = p.z + p.rz * lat;
      inside.push({ x, y: ctx.groundAt(x, z), z, ry: rng() * 6.28, s: 1.1 });
    });
    kit.place('flower_bush', border);
    kit.place('flower_bush', inside, { collide: 1.0, collideY: 1.6, inRoad: true });
  }

  // flower arches over the road through the tunnel section
  for (const tn of track.def.tunnels || []) {
    const arches = [];
    for (let s = tn.from; s <= tn.to; s += 7) {
      const p = pointAt(track.main, s);
      const sc2 = (p.w / 2 + p.m + 1.4) / 10;
      arches.push({ x: p.x, y: ctx.groundAt(p.x, p.z) - 0.1, z: p.z, ry: faceYaw(p.tx, p.tz), s: sc2 });
      for (const side of [-1, 1]) ctx.world.addCircle({ x: p.x + p.rx * side * 10 * sc2, z: p.z + p.rz * side * 10 * sc2, r: 1.0, kind: 'arch' });
    }
    kit.place('flower_arch', arches);
  }

  // landmarks: windmill on the hill, cottages, pond lilies, rocks by the river
  const mill = { x: -60, z: 112 };
  const windmill = kit.single('windmill', { x: mill.x, y: ground(mill.x, mill.z) - 0.2, z: mill.z, ry: faceYaw(0.4, -1) });
  const blades = windmill && windmill.getObjectByName('blades_windmill');
  const cottages = scatter(ctx, rng, { count: 4, min: 16, max: 45, spacing: 30, avoid: [{ ...mill, r: 25 }], water: 8 });
  cottages.forEach((c) => {
    // face the nearest bit of road
    const n = nearestMain(track, c.x, c.z);
    c.ry = faceYaw(n.x - c.x, n.z - c.z);
  });
  kit.place('cottage', cottages, { collide: 2.8 });
  const pond = ctx.waters.find((w) => w.id === 'pond');
  if (pond) {
    const pads = [];
    for (let i = 0; i < 7; i++) {
      const a = rng() * 6.28, r = rng() * (pond.r - 5);
      pads.push({ x: pond.x + Math.cos(a) * r, y: pond.level, z: pond.z + Math.sin(a) * r, ry: rng() * 6.28, s: 0.8 + rng() * 0.6 });
    }
    kit.place('lily_pads', pads, { shadow: false });
  }
  const rocks = [];
  for (const w of ctx.waters) {
    if (!w.poly) continue;
    for (let i = 1; i < w.poly.length - 1; i += 2) {
      const [x0, z0] = w.poly[i], [x1, z1] = w.poly[i + 1];
      let dx = x1 - x0, dz = z1 - z0; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const side = i % 4 === 1 ? 1 : -1;
      const x = x0 - dz * side * (w.width / 2 + 1.5), z = z0 + dx * side * (w.width / 2 + 1.5);
      if (edgeDistance(ctx, x, z) > 2) rocks.push({ x, y: ground(x, z) - 0.2, z, ry: rng() * 6.28, s: 0.6 + rng() * 0.8 });
    }
  }
  kit.place('rock_a', rocks.filter((_, i) => i % 2 === 0));
  kit.place('rock_b', rocks.filter((_, i) => i % 2 === 1));

  // trees, bushes and flower beds
  const cherries = scatter(ctx, rng, { count: 150, min: 3, max: 80, spacing: 7, falloff: 1.3, scale: [0.85, 1.25], water: 4, avoid: [{ ...mill, r: 14 }] });
  kit.place('cherry_a', cherries.filter((_, i) => i % 2 === 0), { collide: 0.45, thin: true });
  kit.place('cherry_b', cherries.filter((_, i) => i % 2 === 1), { collide: 0.45, thin: true });
  kit.place('tree_round', scatter(ctx, rng, { count: 70, min: 60, max: 200, spacing: 12, scale: [1.2, 1.8] }), { thin: true, shadow: false });
  kit.place('flower_bush', scatter(ctx, rng, { count: 50, min: 1.5, max: 30, spacing: 5, falloff: 1, scale: [0.7, 1.1] }), { thin: true, shadow: false, view: 170 });
  kit.place('tulips', scatter(ctx, rng, { count: 320, min: 0.8, max: 45, spacing: 2.6, falloff: 1.4, scale: [0.9, 1.4] }), { thin: true, shadow: false, view: 110 });
  kit.place('daisies', scatter(ctx, rng, { count: 240, min: 0.5, max: 40, spacing: 2.4, falloff: 1.2, scale: [1, 1.6] }), { thin: true, shadow: false, view: 100 });

  // butterflies fluttering around the verges (animated instances)
  const flyers = scatter(ctx, rng, { count: 26, min: 1, max: 18, spacing: 8 }).map((p) => ({ ...p, ph: rng() * 6.28, r: 1.5 + rng() * 2.5 }));
  const bf = kit.place('butterfly', flyers.map((p) => ({ x: p.x, y: p.y + 1, z: p.z })), { shadow: false, animated: true });
  const tmp = { x: 0, y: 0, z: 0, ry: 0, sx: 1, sy: 1, sz: 1 };

  let petalAcc = 0;
  return {
    update(dt, t, game) {
      if (blades) blades.rotation.z += dt * 0.8;
      if (bf) {
        for (const mesh of bf.children) {
          flyers.forEach((p, i) => {
            const a = t * 0.7 + p.ph;
            tmp.x = p.x + Math.cos(a) * p.r; tmp.z = p.z + Math.sin(a * 1.3) * p.r;
            tmp.y = p.y + 1.2 + Math.sin(t * 2 + p.ph) * 0.4;
            tmp.ry = -a + Math.PI / 2;
            tmp.sx = 0.35 + Math.abs(Math.sin(t * 18 + p.ph)) * 0.75;
            mesh.setMatrixAt(i, matrixOf(tmp));
          });
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
      // pink petals drifting down around the camera
      if (game && game.fx) {
        petalAcc += dt * 14;
        const cam = game.r.camera.position;
        while (petalAcc > 1) {
          petalAcc -= 1;
          game.fx.emit({ x: cam.x + (Math.random() - 0.5) * 50, y: cam.y + 6 + Math.random() * 8, z: cam.z + (Math.random() - 0.5) * 50,
            vx: 1.2, vy: -1.2, vz: 0.4, spread: 1, color: Math.random() < 0.5 ? '#ffb3dc' : '#ffffff', size: 0.22, life: 6, drag: 1, alpha: 0.95 });
        }
      }
    },
  };
}

function nearestMain(track, x, z) {
  let best = null, bd = Infinity;
  for (const p of track.main.pts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}

export { THREE };
