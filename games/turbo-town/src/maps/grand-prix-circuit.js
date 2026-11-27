// Grand Prix Circuit (Thrill Cup): a proper race track. The pit building and garages along
// the start straight, big covered grandstands, a bridge over the track, tyre walls on the
// corners, marshal posts, billboards, a TV tower, the podium, and flags waving.
import { nearest } from '../shared/track-math.js';
import { scatter, trackSpot, faceYaw, alongYaw } from './scatter.js';
import { startArea, edges, cornerSigns, arches } from './common-decor.js';
import { matrixOf } from '../render/props.js';

const K = 1.38;

export const vis = {
  models: ['gp.glb'],
  sky: { top: '#2f9bff', horizon: '#cfeeff', bottom: '#f0faff', sun: '#fff8d6', clouds: 12, seed: 33 },
  fog: { color: '#d6f0ff', near: 200 },
  light: { sky: '#eef8ff', ground: '#7ad06a', hemi: 1.3, sun: '#fff6e0', sunI: 1.6 },
  road: { color: '#8a8aa0', texture: 'smooth', kerbA: '#ff4757', kerbB: '#ffffff' },
  rail: { style: 'armco' },
  shortcut: { color: '#8a8aa0', texture: 'smooth' },
  colors: { grassLow: '#4fc35a', grassHigh: '#6fd36a', verge: '#5fcb5e', far: '#7ad86a', sand: '#efe2b8' },
  terrain: { seed: 8, base: 2.4, noise: 1.0, rim: 20, hills: [{ x: 214 * K, z: 53.6 * K, h: 18, r: 71.4 * K }, { x: -214 * K, z: -142.9 * K, h: 22, r: 80.4 * K }] },
  water: { color: '#3fc4ff', glow: '#0a5d8a' },
  bridge: { deck: '#8a8aa0', rail: '#ffffff', post: '#ff4757', skirt: '#5a5a70' },
  ramp: { a: '#ff4757', b: '#ffffff', side: '#ffffff' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const sAt = (x, z) => nearest(track, x * K, 3, z * K, {}).s;
  startArea(ctx, kit, { standS: 40, standSide: 1 });
  cornerSigns(ctx, kit);
  // tyre walls on the outside of the corners, billboards on the straights
  const outside = (pt) => pt.side === ((pt.curv || 0) > 0 ? -1 : 1);
  edges(ctx, kit, { spacing: 5, offset: 1.2, pick: (pt, i) => (pt.path !== 'main' ? null : Math.abs(pt.curv || 0) > 0.02 && outside(pt) ? 'tyre_stack' : Math.abs(pt.curv || 0) < 0.008 && i % 9 === 0 ? 'billboard_gp' : null) });

  // pit building and garages on the inside of the start straight, grandstands outside
  const pit = trackSpot(ctx, sAt(55, 0), -17);
  kit.place('pit_building', [{ x: pit.x, y: pit.y, z: pit.z, ry: alongYaw(pit.p.tx, pit.p.tz) }], { collide: 8, view: 900 });
  const stands = [];
  for (const [x, z, side] of [[90, 0, 1], [160, -40, 1], [-140, -30, -1], [20, -132, 1]]) {
    const s = sAt(x, z); const q = trackSpot(ctx, s, side * 21);
    stands.push({ x: q.x, y: q.y, z: q.z, ry: faceYaw(-q.p.rx * side, -q.p.rz * side) });
  }
  kit.place('grandstand_big', stands, { collide: 7, view: 900 });
  // the sponsor bridge over the back straight
  const br = sAt(40, -128);
  arches(ctx, kit, 'gantry_bridge', track.main, br, br + 1, 10, 9.5, { pad: 2 });
  // marshal posts, the TV tower, the podium
  const posts = [];
  for (let s = 60; s < track.length; s += 140) { const side = Math.round(s / 140) % 2 ? 1 : -1; const q = trackSpot(ctx, s, side * 12); posts.push({ x: q.x, y: q.y, z: q.z, ry: faceYaw(-q.p.rx * side, -q.p.rz * side) }); }
  kit.place('marshal_post', posts, { collide: 1 });
  const tv = trackSpot(ctx, sAt(-30, 20), 30);
  kit.place('tv_tower', [{ x: tv.x, y: tv.y, z: tv.z }], { collide: 2, view: 900 });
  const pod = trackSpot(ctx, sAt(20, 0), -32);
  kit.place('podium', [{ x: pod.x, y: pod.y, z: pod.z, ry: faceYaw(pod.p.rx, pod.p.rz) }], { collide: 3 });
  kit.place('tree_round', scatter(ctx, rng, { count: 60, min: 20, max: 110, spacing: 14, scale: [1, 1.5] }), { collide: 0.5, thin: true });
  // flags waving along the straight
  const flags = [];
  for (let s = 10; s < 160; s += 18) for (const side of [-1, 1]) { const q = trackSpot(ctx, s, side * 11.5); flags.push({ x: q.x, y: q.y, z: q.z, ry: q.p.heading, ph: rng() * 6.28 }); }
  const flagMesh = kit.place('race_flag', flags, { animated: true, shadow: false });
  return {
    update(dt, t) {
      if (!flagMesh) return;
      for (const mesh of flagMesh.children) {
        flags.forEach((f, i) => mesh.setMatrixAt(i, matrixOf({ x: f.x, y: f.y, z: f.z, ry: f.ry + Math.sin(t * 3 + f.ph) * 0.25 })));
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
