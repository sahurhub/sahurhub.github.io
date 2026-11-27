// Amazon Rainforest (Thrill Cup): deep in the rainforest. Giant trees lean in from both
// sides and meet over the road like a green tunnel, with vines hanging down and swaying.
// Monkeys swing on the vines, toucans sit on the branches and look around, macaws fly in
// flocks, butterflies flutter by the road, frogs hop on lily pads, fish jump in the river,
// canoes drift along it, a waterfall pours into a pool, and fireflies, mist and falling
// leaves float about wherever you are.
import { nearest, pointAt } from '../shared/track-math.js';
import { scatter, trackSpot, faceYaw } from './scatter.js';
import { startArea, edges, cornerSigns } from './common-decor.js';
import { matrixOf } from '../render/props.js';

const K = 1.52;

// spots on the canopy arch model, in its own space (x across the road, y up, z along it).
// build_amazon.py builds the branches and leaves to match these numbers.
const PERCH = { x: 5.4, y: 7.94, z: -1.02 };       // the low branch a toucan sits on
const VINES = [[-7.0, 9.7, 1.6], [-3.8, 11.3, -2.0], [-1.0, 11.9, 2.4], [2.0, 11.9, -1.2], [4.6, 11.0, 2.0], [7.2, 9.7, -1.6]];
const TRAIL_VINES = [[-2.6, 6.6, 1.2], [0.4, 7.2, -1.4], [2.8, 6.6, 1.0]];

export const vis = {
  models: ['amazon.glb'],
  sky: { top: '#4fa8e8', horizon: '#d4f0cc', bottom: '#eaf8e4', sun: '#fff4c8', clouds: 9, seed: 41 },
  // the forest fades into a green haze not far away
  fog: { color: '#b4d8aa', near: 105 },
  light: { sky: '#e8ffe0', ground: '#3f7a3a', hemi: 1.18, sun: '#fff0c8', sunI: 1.35 },
  road: { color: '#c98a5a', texture: 'smooth', kerbA: '#4c9a3a', kerbB: '#e8d48a' },
  rail: { style: 'rope' },
  shortcut: { color: '#8a7a3a', texture: 'smooth' },
  colors: { grassLow: '#3a9436', grassHigh: '#58ae3e', verge: '#46a23a', far: '#2c7a32', sand: '#8a6a40', specks: ['#ff4f6a', '#ffd32a', '#ffffff', '#b06aff'], speckChance: 0.05 },
  // a rocky rise behind the waterfall pool
  terrain: { seed: 23, base: 2, noise: 2.2, rim: 0, hills: [{ x: -203.6 * K, z: -59.8 * K, h: 15, r: 23.2 * K }, { x: 53.6 * K, z: 62.5 * K, h: 6, r: 35.7 * K }] },
  water: { color: '#4a9a7a', glow: '#0a5a4a' },
  bridge: { deck: '#9a6a3a', rail: '#c9a46a', post: '#5a3a1f', skirt: '#5a3a1f' },
  ramp: { a: '#4c9a3a', b: '#ffd32a', side: '#e8d48a' },
};

// arches over a stretch of road, like arches() in common-decor, but this keeps the list so
// vines, monkeys and toucans can be hung on them
function canopy(ctx, path, from, to, every, baseWidth, pad) {
  const items = [];
  const L = ctx.track.length;
  const len = path.closed ? ((to - from + L) % L) : to - from;
  for (let d = 0; d <= len + 0.01; d += every) {
    const p = pointAt(path, from + d);
    const s = (p.w / 2 + p.m + pad) / baseWidth;
    const y = ctx.groundAt(p.x, p.z, p.y + 3) - 0.1;
    const posts = [-1, 1].map((side) => ({ x: p.x + p.rx * side * baseWidth * s, z: p.z + p.rz * side * baseWidth * s }));
    // leave the arch out where its trunks would stand in another road (a shortcut entrance)
    if (posts.some((q) => { const e = ctx.world.edge(q.x, p.y, q.z, 0, {}); return e && e.excess < pad - 0.4; })) continue;
    items.push({ x: p.x, y, z: p.z, ry: faceYaw(p.tx, p.tz), s });
    for (const q of posts) ctx.world.addCircle({ x: q.x, z: q.z, r: 1.1 * s, y0: p.y - 2, y1: p.y + 8, kind: 'arch' });
  }
  return items;
}

// a point in an arch's own space turned into the world
function onArch(a, lx, ly, lz) {
  const c = Math.cos(a.ry), sn = Math.sin(a.ry);
  return { x: a.x + a.s * (lx * c + lz * sn), y: a.y + a.s * ly, z: a.z + a.s * (-lx * sn + lz * c) };
}

// random spots on a water surface (for lily pads)
function waterSpots(ctx, w, n, rng) {
  const out = [];
  for (let i = 0; i < n * 6 && out.length < n; i++) {
    let x, z;
    if (w.poly) {
      const k = Math.floor(rng() * (w.poly.length - 1));
      const a = w.poly[k], b = w.poly[k + 1], u = rng();
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const off = (rng() - 0.5) * w.width * 0.85;
      x = a[0] + dx * u - (dz / l) * off; z = a[1] + dz * u + (dx / l) * off;
    } else {
      const a = rng() * 6.283, r = Math.sqrt(rng()) * w.r * 0.85;
      x = w.x + Math.cos(a) * r; z = w.z + Math.sin(a) * r;
    }
    if (w.dist(x, z) > -1.2) continue;
    if (ctx.terrain.heightAt(x, z) > w.level - 0.3) continue; // off the end of the map
    out.push({ x, y: w.level + 0.05, z, ry: rng() * 6.283, s: 0.7 + rng() * 0.8 });
  }
  return out;
}

// position and heading at fraction u along a line of points
function alongPoly(poly, u) {
  let total = 0;
  const seg = [];
  for (let i = 0; i < poly.length - 1; i++) { const l = Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]); seg.push(l); total += l; }
  let d = u * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const f = Math.min(1, d / seg[i]);
      const a = poly[i], b = poly[i + 1];
      return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, ry: faceYaw(b[0] - a[0], b[1] - a[1]) };
    }
    d -= seg[i];
  }
  return { x: poly[0][0], z: poly[0][1], ry: 0 };
}

export function decorate(ctx, kit, rng) {
  const track = ctx.track;
  const L = track.length;
  const sAt = (x, z) => nearest(track, x * K, 4, z * K, {}).s;
  startArea(ctx, kit, { standS: 30, standSide: -1 });
  edges(ctx, kit, { spacing: 6, pick: (pt, i) => (pt.path !== 'main' ? (i % 3 === 0 ? 'fern_big' : null) : i % 4 === 0 ? 'fern_big' : i % 4 === 2 ? 'bromeliad' : null) });
  cornerSigns(ctx, kit);

  // ---- the green tunnels: giant trees meeting over the road
  const spans = [[sAt(55, 8), sAt(150, -40)], [sAt(145, -98), sAt(78, -127)], [sAt(-58, -127), sAt(-122, -68)], [sAt(-112, -18), sAt(-58, 22)]];
  const arch = [];
  for (const [a, b] of spans) arch.push(...canopy(ctx, track.main, a, b, 9.5, 9.5, 2.2));
  kit.place('canopy_arch', arch, { view: 600 });
  const trail = track.paths.find((p) => p.id === 'trail');
  const tArch = trail ? canopy(ctx, trail, 6, trail.length - 6, 7, 5.2, 1.6) : [];
  kit.place('trail_arch', tArch, { view: 400 });

  // vines hanging from the arches (a few with a monkey swinging on the end)
  const vines = [], monkeys = [];
  arch.forEach((a, i) => VINES.forEach(([lx, ly, lz], j) => {
    const q = onArch(a, lx, ly, lz);
    const v = { x: q.x, y: q.y, z: q.z, ry: a.ry, s: a.s, k: 0.75 + rng() * 0.35, ph: rng() * 6.28, sp: 0.9 + rng() * 0.6 };
    if (i % 3 === 1 && j === (i % 2 ? 1 : 4)) { v.k = 1; monkeys.push(v); } else vines.push(v);
  }));
  tArch.forEach((a) => TRAIL_VINES.forEach(([lx, ly, lz]) => {
    const q = onArch(a, lx, ly, lz);
    // short ones, so they stay well above the karts on the low trail
    vines.push({ x: q.x, y: q.y, z: q.z, ry: a.ry, s: a.s, k: 0.42 + rng() * 0.18, ph: rng() * 6.28, sp: 0.9 + rng() * 0.6 });
  }));
  const vineMesh = kit.place('vine_strand', vines, { animated: true, shadow: false });
  const monkeyMesh = kit.place('vine_monkey', monkeys, { animated: true, shadow: false });
  // toucans on the low branches, turning their heads about
  const toucans = arch.filter((_, i) => i % 2 === 0).map((a, i) => {
    const side = i % 2 ? 1 : -1;
    const q = onArch(a, side * PERCH.x, PERCH.y, PERCH.z);
    return { x: q.x, y: q.y, z: q.z, ry: a.ry + (side > 0 ? 0 : Math.PI), s: Math.min(1.4, a.s), ph: rng() * 6.28 };
  });
  const toucanMesh = kit.place('toucan', toucans, { animated: true, shadow: false });

  // between the tunnels, single trees lean right out over the road
  const bridge = (track.def.bridges || [])[0];
  const covered = (s) => spans.some(([a, b]) => (b >= a ? s > a - 6 && s < b + 6 : s > a - 6 || s < b + 6));
  const leaners = [];
  let side = 1;
  for (let s = 50; s < L - 20; s += 15) {
    if (covered(s)) continue;
    if (bridge && s > bridge.from - 10 && s < bridge.to + 10) continue;
    const p = pointAt(track.main, s);
    const q = trackSpot(ctx, s, side * (p.w / 2 + p.m + 2.6));
    leaners.push({ x: q.x, y: q.y - 0.1, z: q.z, ry: faceYaw(-q.p.rx * side, -q.p.rz * side), s: 0.9 + rng() * 0.3 });
    side = -side;
  }
  kit.place('overhang_tree', leaners, { collide: 0.9, view: 600 });

  // ---- the forest
  const pool = ctx.waters.find((w) => w.id === 'falls-pool');
  const fallsView = pool ? [{ x: pool.x - 6, z: pool.z, r: 36 }] : [];
  kit.place('kapok_tree', scatter(ctx, rng, { count: 30, min: 16, max: 140, spacing: 30, scale: [0.9, 1.3], water: 6, avoid: fallsView }), { collide: 2.2, view: 900 });
  const trees = scatter(ctx, rng, { count: 210, min: 3.5, max: 120, spacing: 7, falloff: 0.6, scale: [0.85, 1.35], water: 3, avoid: fallsView });
  kit.place('rain_tree_a', trees.filter((_, i) => i % 3 === 0), { collide: 0.8, thin: true });
  kit.place('rain_tree_b', trees.filter((_, i) => i % 3 === 1), { collide: 0.7, thin: true });
  kit.place('acai_palm', trees.filter((_, i) => i % 3 === 2), { collide: 0.4, thin: true });
  kit.place('fern_big', scatter(ctx, rng, { count: 150, min: 1.2, max: 45, spacing: 3.5, scale: [0.8, 1.5] }), { shadow: false, view: 150, thin: true });
  kit.place('monstera', scatter(ctx, rng, { count: 90, min: 1.5, max: 40, spacing: 4.5, scale: [0.8, 1.4] }), { shadow: false, view: 150, thin: true });
  kit.place('bromeliad', scatter(ctx, rng, { count: 60, min: 1.2, max: 30, spacing: 4 }), { shadow: false, view: 130, thin: true });
  kit.place('heliconia', scatter(ctx, rng, { count: 45, min: 1.5, max: 30, spacing: 6 }), { shadow: false, view: 140, thin: true });
  kit.place('orchid_bush', scatter(ctx, rng, { count: 40, min: 1.5, max: 30, spacing: 6 }), { shadow: false, view: 140, thin: true });
  kit.place('log_fallen', scatter(ctx, rng, { count: 14, min: 3, max: 40, spacing: 20 }), { collide: 0.8 });
  kit.place('mossy_rock', scatter(ctx, rng, { count: 30, min: 2.5, max: 60, spacing: 10, scale: [0.7, 1.6], water: 0 }), { collide: 1.0 });

  // ---- water: the waterfall, lily pads, frogs, fish and canoes
  if (pool) kit.place('waterfall_cliff', [{ x: pool.x - pool.r + 2, y: pool.level - 0.6, z: pool.z, ry: Math.PI / 2 }], { view: 900 });
  const pads = [];
  for (const w of ctx.waters) pads.push(...waterSpots(ctx, w, w.id === 'river' ? 70 : w.id === 'creek' ? 26 : 14, rng));
  kit.place('lily_pad', pads, { shadow: false, view: 250 });
  const frogs = pads.filter((_, i) => i % 5 === 0).map((p) => ({ x: p.x, y: p.y + 0.02, z: p.z, ry: p.ry, ph: rng() * 20 }));
  const frogMesh = kit.place('frog', frogs, { animated: true, shadow: false });
  const fish = [];
  for (const w of ctx.waters) {
    const spots = waterSpots(ctx, w, w.id === 'river' ? 8 : 2, rng);
    for (const f of spots) fish.push({ x: f.x, z: f.z, lvl: w.level, ry: rng() * 6.28, ph: rng() * 9, per: 5 + rng() * 5, last: -1 });
  }
  const fishMesh = kit.place('fish', fish.map((f) => ({ x: f.x, y: f.lvl - 3, z: f.z })), { animated: true, shadow: false });
  const river = ctx.waters.find((w) => w.id === 'river');
  const canoes = river ? [{ u: 0.3, sp: 0.006, lvl: river.level }, { u: 0.75, sp: -0.005, lvl: river.level }] : [];
  // keep the canoes on the part of the river that is inside the map
  const rpoly = river ? river.poly.filter((p) => Math.abs(p[0]) < 205 * K) : [];
  const canoeMesh = rpoly.length > 1 ? kit.place('canoe', canoes.map(() => ({ x: 0, y: 0, z: 0 })), { animated: true, shadow: false, view: 900 }) : null;

  // ---- in the air: macaws in flocks, butterflies by the road
  const birds = [];
  for (let i = 0; i < 20; i++) {
    const low = i < 6; // a few fly low over the open bits of road
    let s = rng() * L;
    if (low) for (let n = 0; n < 20 && covered(s); n++) s = rng() * L;
    const c = trackSpot(ctx, s, low ? (rng() - 0.5) * 20 : (rng() - 0.5) * 80);
    birds.push({ cx: c.x, cz: c.z, y0: c.y, r: low ? 14 + rng() * 12 : 14 + rng() * 26, h: low ? 8 + rng() * 3 : 20 + rng() * 12, sp: (0.35 + rng() * 0.3) * (rng() < 0.5 ? 1 : -1), ph: rng() * 6.28, kind: i % 3 === 0 ? 1 : 0 });
  }
  const birdPos = (b) => ({ x: b.cx, y: b.y0 + b.h, z: b.cz });
  const redMesh = kit.place('macaw_red', birds.filter((b) => b.kind === 0).map(birdPos), { animated: true, shadow: false });
  const blueMesh = kit.place('macaw_blue', birds.filter((b) => b.kind === 1).map(birdPos), { animated: true, shadow: false });
  const flies = scatter(ctx, rng, { count: 60, min: 1, max: 16, spacing: 6 }).map((p, i) => ({ x: p.x, y: p.y + 0.8 + rng() * 1.6, z: p.z, ph: rng() * 6.28, kind: i % 3 === 0 ? 1 : 0 }));
  const flyPos = (f) => ({ x: f.x, y: f.y, z: f.z });
  const morpho = kit.place('butterfly_blue', flies.filter((f) => f.kind === 0).map(flyPos), { animated: true, shadow: false, toon: false });
  const orange = kit.place('butterfly_orange', flies.filter((f) => f.kind === 1).map(flyPos), { animated: true, shadow: false, toon: false });

  const move = (group, list, fn) => { if (!group) return; for (const mesh of group.children) { list.forEach((b, i) => mesh.setMatrixAt(i, matrixOf(fn(b, i)))); mesh.instanceMatrix.needsUpdate = true; } };
  const vineM = (v, t) => ({ x: v.x, y: v.y, z: v.z, ry: v.ry, rx: Math.sin(t * v.sp + v.ph) * 0.12, sx: v.s, sy: v.s * v.k, sz: v.s });
  const monkeyM = (v, t) => ({ x: v.x, y: v.y, z: v.z, ry: v.ry, rx: Math.sin(t * 1.5 + v.ph) * 0.55, s: v.s });
  const redB = birds.filter((b) => b.kind === 0), blueB = birds.filter((b) => b.kind === 1);
  const birdM = (b, t) => {
    const a = b.ph + t * b.sp;
    return { x: b.cx + Math.cos(a) * b.r, y: b.y0 + b.h + Math.sin(t * 1.3 + b.ph) * 1.2, z: b.cz + Math.sin(a) * b.r, ry: b.sp > 0 ? -a : Math.PI - a, rz: (b.sp > 0 ? -0.3 : 0.3) + Math.sin(t * 8 + b.ph) * 0.12 };
  };
  const blueF = flies.filter((f) => f.kind === 0), orangeF = flies.filter((f) => f.kind === 1);
  const flyM = (f, t) => ({
    x: f.x + Math.sin(t * 0.7 + f.ph) * 2.5, y: f.y + Math.sin(t * 2.6 + f.ph) * 0.45, z: f.z + Math.cos(t * 0.9 + f.ph * 1.3) * 2.5,
    ry: Math.atan2(Math.cos(t * 0.7 + f.ph) * 0.7, -Math.sin(t * 0.9 + f.ph * 1.3) * 0.9),
    sx: 0.3 + 0.7 * Math.abs(Math.sin(t * 15 + f.ph * 3)), sy: 1, sz: 1,
  });

  // particles near the camera: fireflies, falling leaves, mist on the water, waterfall spray
  const acc = { fly: 0, leaf: 0, mist: 0, spray: 0 };
  const LEAF = ['#6fbf3a', '#9ad04a', '#d8c04a', '#4f9a2a'];
  const water = ctx.waters.filter((w) => w.carve !== false);

  return {
    update(dt, t, game) {
      move(vineMesh, vines, (v) => vineM(v, t));
      move(monkeyMesh, monkeys, (v) => monkeyM(v, t));
      move(toucanMesh, toucans, (b) => ({ x: b.x, y: b.y, z: b.z, s: b.s, ry: b.ry + Math.sin(t * 0.6 + b.ph) * 0.8 + Math.sin(t * 2.3 + b.ph) * 0.15, rx: Math.max(0, Math.sin(t * 1.1 + b.ph * 2)) * 0.25 }));
      move(redMesh, redB, (b) => birdM(b, t));
      move(blueMesh, blueB, (b) => birdM(b, t));
      move(morpho, blueF, (f) => flyM(f, t));
      move(orange, orangeF, (f) => flyM(f, t));
      move(frogMesh, frogs, (f) => {
        const c = (t + f.ph) % 6, hop = c < 0.45 ? Math.sin((c / 0.45) * Math.PI) * 0.45 : 0;
        return { x: f.x, y: f.y + hop, z: f.z, ry: f.ry + Math.floor((t + f.ph) / 6) * 1.3 };
      });
      const fx = game && game.fx;
      const cam = game && game.r && game.r.camera ? game.r.camera.position : null;
      move(fishMesh, fish, (f) => {
        const c = (t + f.ph) % f.per, u = c / 0.9;
        const cyc = Math.floor((t + f.ph) / f.per);
        if (u > 1) return { x: f.x, y: f.lvl - 3, z: f.z, s: 0.001 };
        if (f.last !== cyc && fx && cam && Math.hypot(cam.x - f.x, cam.z - f.z) < 120) { f.last = cyc; fx.emit({ x: f.x, y: f.lvl + 0.1, z: f.z, vy: 2.5, spread: 2, color: '#e8fff8', size: 0.35, life: 0.6, gravity: 9 }, 8); }
        const dx = Math.sin(f.ry + cyc), dz = Math.cos(f.ry + cyc);
        return { x: f.x + dx * (u - 0.5) * 2.4, y: f.lvl - 0.3 + Math.sin(u * Math.PI) * 1.6, z: f.z + dz * (u - 0.5) * 2.4, ry: f.ry + cyc, rx: (u - 0.5) * 2.4 };
      });
      if (canoeMesh) move(canoeMesh, canoes, (c) => {
        let u = (c.u + t * c.sp) % 2; if (u < 0) u += 2;
        const back = u > 1, q = alongPoly(rpoly, back ? 2 - u : u);
        const fwd = (c.sp > 0) !== back;
        return { x: q.x, y: c.lvl - 0.05 + Math.sin(t * 1.2 + c.u * 9) * 0.06, z: q.z, ry: q.ry + (fwd ? 0 : Math.PI), rz: Math.sin(t * 0.9 + c.u * 5) * 0.04 };
      });
      if (!fx || !cam) return;
      const ground = (x, z) => ctx.terrain.heightAt(x, z);
      const around = (r0, r1) => { const a = Math.random() * 6.283, r = r0 + Math.random() * (r1 - r0); return { x: cam.x + Math.cos(a) * r, z: cam.z + Math.sin(a) * r }; };
      acc.fly += dt * 10;
      while (acc.fly > 1) { acc.fly -= 1; const p = around(5, 30); fx.emit({ x: p.x, y: ground(p.x, p.z) + 0.6 + Math.random() * 3, z: p.z, vy: 0.2, spread: 0.6, color: '#dcff6a', size: 0.2, life: 2.6, gravity: -0.05, drag: 0.8 }); }
      acc.leaf += dt * 4;
      while (acc.leaf > 1) { acc.leaf -= 1; const p = around(4, 26); fx.emit({ x: p.x, y: ground(p.x, p.z) + 5 + Math.random() * 4, z: p.z, vx: 0.4, spread: 1.0, color: LEAF[Math.floor(Math.random() * LEAF.length)], size: 0.32, life: 6, gravity: 0.6, drag: 0.5 }); }
      acc.mist += dt * 3;
      while (acc.mist > 1) {
        acc.mist -= 1;
        const p = around(10, 80);
        if (!water.some((w) => w.dist(p.x, p.z) < 0)) continue;
        const w = water.find((v) => v.dist(p.x, p.z) < 0);
        fx.emit({ x: p.x, y: w.level + 0.6 + Math.random(), z: p.z, vx: 0.4, spread: 0.3, color: '#f2fff4', size: 4.5, life: 5, gravity: -0.03, drag: 0.9, alpha: 0.18 });
      }
      if (pool && Math.hypot(cam.x - pool.x, cam.z - pool.z) < 220) {
        acc.spray += dt * 16;
        while (acc.spray > 1) { acc.spray -= 1; fx.emit({ x: pool.x - pool.r + 3, y: pool.level + 0.3, z: pool.z + (Math.random() - 0.5) * 6, vx: 1.2, vy: 2.2, spread: 2.4, color: '#f4fffc', size: 0.9, life: 1.1, gravity: 2.5, drag: 0.85, alpha: 0.6 }); }
      }
    },
  };
}
