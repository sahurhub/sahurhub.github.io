// Harbour Rush (Explorer Cup): docks with giant cranes, stacks of coloured containers,
// warehouses, a lighthouse, a turning big wheel on the boardwalk, ships and boats on the
// sea, buoys, and seagulls circling overhead.
import { nearest } from '../shared/track-math.js';
import { scatter, trackSpot, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns, moverVisuals } from './common-decor.js';
import { matrixOf } from '../render/props.js';

const K = 1.38;

export const vis = {
  models: ['harbour.glb'],
  sky: { top: '#2f9bff', horizon: '#c9ecff', bottom: '#eef9ff', sun: '#fff8d6', clouds: 16, seed: 15 },
  fog: { color: '#cfe8ff', near: 180 },
  light: { sky: '#eef8ff', ground: '#b9b4c9', hemi: 1.3, sun: '#fff4e0', sunI: 1.55 },
  road: { color: '#cfcbe0', texture: 'smooth', kerbA: '#ffd32a', kerbB: '#2b2560' },
  rail: { style: 'metal', post: '#ffd32a' },
  shortcut: { color: '#bdb8d0', texture: 'smooth' },
  colors: { grassLow: '#bfb8cc', grassHigh: '#a8a2b8', verge: '#d6d0e2', far: '#8fd06a', sand: '#e8d9a8', specks: ['#9a94ae'], speckChance: 0.08 },
  terrain: { seed: 52, base: 2.2, noise: 1.2, rim: 22, hills: [{ x: 0, z: 300 * K, h: -6, r: 200 * K }] },
  water: { color: '#2fb0ff', glow: '#0a5d8a' },
  bridge: { deck: '#b98a52', rail: '#ffffff', post: '#2b2560', skirt: '#6a5a4a' },
  ramp: { a: '#ffd32a', b: '#2b2560', side: '#ffffff' },
};

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const sAt = (x, z) => nearest(track, x * K, 3, z * K, {}).s;
  startArea(ctx, kit, { standS: 30, standSide: -1 });
  edges(ctx, kit, { spacing: 8, pick: (pt, i) => (pt.path !== 'main' ? null : i % 4 === 0 ? 'bollard' : i % 6 === 3 ? 'lamp' : null) });
  cornerSigns(ctx, kit);

  // container stacks: a yard round the shortcut and more along the docks
  const yard = scatter(ctx, rng, { count: 26, min: 3, max: 22, spacing: 11, area: { x: 125 * K, z: 85 * K, w: 82 * K, h: 109 * K } });
  const docks = scatter(ctx, rng, { count: 30, min: 5, max: 40, spacing: 12, water: 4 });
  const stacks = [...yard, ...docks].map((c) => ({ ...c, ry: Math.round(c.ry / 1.5708) * 1.5708 }));
  kit.place('container_stack_a', stacks.filter((_, i) => i % 2 === 0), { collide: 3.0 });
  kit.place('container_stack_b', stacks.filter((_, i) => i % 2 === 1), { collide: 3.0 });
  kit.place('crate_pile', scatter(ctx, rng, { count: 24, min: 2, max: 25, spacing: 7, water: 2 }), { collide: 0.9 });
  // cranes along the waterfront, warehouses inland
  const cranes = [];
  for (const x of [120, 60, 0]) { const s = sAt(x, 140); const q = trackSpot(ctx, s, 13); cranes.push({ x: q.x, y: q.y, z: q.z, ry: faceYaw(q.p.rx, q.p.rz) }); }
  kit.place('crane', cranes, { collide: 2.5, view: 900 });
  const sheds = scatter(ctx, rng, { count: 6, min: 14, max: 45, spacing: 30, water: 10 });
  sheds.forEach((h) => { const n = nearest(track, h.x, h.y, h.z, {}); h.ry = faceYaw(n.x - h.x, n.z - h.z); });
  kit.place('warehouse', sheds, { collide: 8, view: 700 });
  // the lighthouse at the end of the pier, the big wheel on the boardwalk
  const lh = trackSpot(ctx, sAt(-80, 168), 18);
  kit.place('lighthouse', [{ x: lh.x, y: Math.max(lh.y, 0.6), z: lh.z }], { collide: 2.2, view: 900 });
  const fw = trackSpot(ctx, sAt(40, 142), -26);
  const fwY = ctx.terrain.heightAt(fw.x, fw.z);
  const fwYaw = faceYaw(fw.p.tx, fw.p.tz) + Math.PI / 2;
  kit.place('ferris_frame', [{ x: fw.x, y: fwY, z: fw.z, ry: fwYaw }], { collide: 2.5, view: 900 });
  const rim = kit.place('ferris_rim', [{ x: fw.x, y: fwY + 11, z: fw.z, ry: fwYaw }], { animated: true, view: 900 });
  // the lifting bridge towers either side of the canal
  const canal = track.def.bridges[1];
  if (canal) {
    const towers = [];
    for (const s of [canal.from, canal.to]) for (const side of [-1, 1]) { const q = trackSpot(ctx, s, side * 8.5); towers.push({ x: q.x, y: q.y, z: q.z, ry: faceYaw(q.p.tx, q.p.tz) }); }
    kit.place('bascule_tower', towers, { collide: 1.4 });
  }
  // ships and boats on the sea, buoys bobbing, seagulls circling
  const sea = ctx.waters.find((w) => w.id === 'sea');
  const lvl = sea ? sea.level : 0.8;
  const boats = [];
  for (let i = 0; i < 5; i++) boats.push({ x: (-180 + i * 90 + rng() * 30) * K, y: lvl - 0.2, z: (192 + rng() * 22) * K, ry: rng() * 6.28, ph: rng() * 6.28, kind: i % 2 });
  const ship = kit.place('cargo_ship', boats.filter((b) => b.kind === 0), { animated: true, shadow: false, view: 900 });
  const fishing = kit.place('fishing_boat', boats.filter((b) => b.kind === 1), { animated: true, shadow: false, view: 900 });
  const buoys = [];
  for (let i = 0; i < 12; i++) { const x = (-200 + i * 36) * K, z = (172 + (i % 2) * 10) * K; buoys.push({ x, y: lvl, z, ry: 0, ph: rng() * 6.28 }); }
  const buoyMesh = kit.place('buoy', buoys, { animated: true, shadow: false, view: 600 });
  const gulls = [];
  for (let i = 0; i < 14; i++) gulls.push({ cx: (rng() - 0.5) * 327 * K, cz: (110 + rng() * 110) * K, r: 12 + rng() * 25, h: 14 + rng() * 14, sp: (0.3 + rng() * 0.4) * (rng() < 0.5 ? 1 : -1), ph: rng() * 6.28 });
  const gullMesh = kit.place('seagull', gulls.map((g) => ({ x: g.cx, y: g.h, z: g.cz })), { animated: true, shadow: false });

  const fork = moverVisuals(ctx, kit);
  const it = {};
  const move = (group, list, fn) => { if (!group) return; for (const mesh of group.children) { list.forEach((b, i) => mesh.setMatrixAt(i, matrixOf(fn(b, it)))); mesh.instanceMatrix.needsUpdate = true; } };
  return {
    update(dt, t) {
      fork(t);
      move(rim, [0], () => ({ x: fw.x, y: fwY + 11, z: fw.z, ry: fwYaw, rz: t * 0.25 }));
      const bob = (b) => ({ x: b.x + Math.sin(t * 0.05 + b.ph) * 10, y: b.y + Math.sin(t * 1.1 + b.ph) * 0.25, z: b.z, ry: b.ry, rz: Math.sin(t * 0.8 + b.ph) * 0.04 });
      move(ship, boats.filter((b) => b.kind === 0), bob);
      move(fishing, boats.filter((b) => b.kind === 1), bob);
      move(buoyMesh, buoys, (b) => ({ x: b.x, y: b.y + Math.sin(t * 1.6 + b.ph) * 0.3, z: b.z, rx: Math.sin(t * 1.3 + b.ph) * 0.15, rz: Math.cos(t * 1.1 + b.ph) * 0.15 }));
      move(gullMesh, gulls, (g) => { const a = g.ph + t * g.sp; return { x: g.cx + Math.cos(a) * g.r, y: g.h + Math.sin(t * 2 + g.ph) * 0.8, z: g.cz + Math.sin(a) * g.r, ry: -a + (g.sp > 0 ? 0 : Math.PI), rz: Math.sin(t * 6 + g.ph) * 0.2 }; });
    },
  };
}
