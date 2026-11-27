// Neon Nights (Thrill Cup): the city at night. Tall buildings with glowing windows, neon
// signs and billboards, street lamps, traffic lights, a lit tunnel, glowing barriers along
// the waterfront, and a few searchlights sweeping the sky.
import { nearest } from '../shared/track-math.js';
import { scatter, trackSpot, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns, arches } from './common-decor.js';
import { matrixOf } from '../render/props.js';

const K = 1.38;

export const vis = {
  models: ['neon.glb'],
  sky: { top: '#070a24', horizon: '#3a1f5e', bottom: '#140c2a', sun: '#d8e2ff', clouds: 7, cloudColor: '#2a2350', seed: 9 },
  fog: { color: '#1e1640', near: 130 },
  light: { sky: '#7a7aff', ground: '#2a1f4a', hemi: 0.95, sun: '#a8b8ff', sunI: 0.75 },
  road: { color: '#6c6c8c', texture: 'smooth', kerbA: '#ff3d8b', kerbB: '#ffffff' },
  rail: { style: 'metal', post: '#ff3d8b' },
  shortcut: { color: '#7a5a8c', texture: 'cobble' },
  colors: { grassLow: '#3a3850', grassHigh: '#302e46', verge: '#4a4866', far: '#26243a', sand: '#2a2840', specks: ['#5a5878'], speckChance: 0.06 },
  terrain: { seed: 71, base: 2.4, noise: 0.6, rim: 6, hills: [] },
  water: { color: '#2a3a8a', glow: '#3a2aaa' },
  bridge: { deck: '#5a5a78', rail: '#7ef0ff', post: '#ff3d8b', skirt: '#3a3850' },
  ramp: { a: '#ff3d8b', b: '#7ef0ff', side: '#ffffff' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const sAt = (x, z) => nearest(track, x * K, 3, z * K, {}).s;
  startArea(ctx, kit, { standS: 30, standSide: 1 });
  edges(ctx, kit, { spacing: 7, pick: (pt, i) => (pt.path !== 'main' ? null : i % 3 === 0 ? 'barrier_glow' : null) });
  cornerSigns(ctx, kit);

  // the city: towers further out, shops with neon close to the road, all facing the track
  const face = (list) => list.map((b) => { const n = nearest(track, b.x, b.y, b.z, {}); return { ...b, ry: faceYaw(n.x - b.x, n.z - b.z) }; });
  const towers = face(scatter(ctx, rng, { count: 60, min: 18, max: 140, spacing: 24, scale: [0.85, 1.6], water: 8 }));
  kit.place('tower_a', towers.filter((_, i) => i % 3 === 0), { collide: 7, view: 900 });
  kit.place('tower_b', towers.filter((_, i) => i % 3 === 1), { collide: 7, view: 900 });
  kit.place('tower_c', towers.filter((_, i) => i % 3 === 2), { collide: 7, view: 900 });
  const shops = face(scatter(ctx, rng, { count: 30, min: 6, max: 16, spacing: 14, water: 5 }));
  kit.place('shop_row', shops, { collide: 4, view: 500 });
  const signs = face(scatter(ctx, rng, { count: 26, min: 4, max: 14, spacing: 16, water: 3 }));
  kit.place('neon_sign_a', signs.filter((_, i) => i % 2 === 0), { collide: 0.5, shadow: false, view: 500 });
  kit.place('neon_sign_b', signs.filter((_, i) => i % 2 === 1), { collide: 0.5, shadow: false, view: 500 });
  kit.place('billboard_neon', face(scatter(ctx, rng, { count: 8, min: 10, max: 30, spacing: 40, water: 4 })), { collide: 1, view: 700 });
  // lamps and traffic lights along the streets
  const lamps = [], lights = [];
  for (let s = 0; s < track.length; s += 24) for (const side of [-1, 1]) {
    const q = trackSpot(ctx, s, side * 8.4);
    (Math.round(s / 24) % 5 === 2 ? lights : lamps).push({ x: q.x, y: q.y, z: q.z, ry: faceYaw(-q.p.rx * side, -q.p.rz * side) });
  }
  kit.place('street_lamp', lamps, { collide: 0.25, shadow: false, view: 400 });
  kit.place('traffic_light', lights, { collide: 0.25, shadow: false, view: 400 });
  // the lit tunnel
  for (const tn of track.def.tunnels || []) arches(ctx, kit, 'tunnel_arch_city', track.main, tn.from, tn.to, 6, 9.5, { pad: 1.5 });
  // searchlights sweeping the sky from two rooftops
  const beams = [];
  for (const [x, z] of [[60, 80], [-60, -190], [200, -60]]) beams.push({ x: x * K, y: 2, z: z * K, ph: rng() * 6.28 });
  const beamMesh = kit.place('searchlight', beams, { animated: true, shadow: false, view: 900 });
  void sAt;
  return {
    update(dt, t) {
      if (!beamMesh) return;
      for (const mesh of beamMesh.children) {
        beams.forEach((b, i) => mesh.setMatrixAt(i, matrixOf({ x: b.x, y: b.y, z: b.z, ry: b.ph + t * 0.4, rx: 0.35 + Math.sin(t * 0.3 + b.ph) * 0.15 })));
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
