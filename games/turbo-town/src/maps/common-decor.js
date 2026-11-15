// TURBO TOWN - decorations every map uses: the start gantry and grandstand, props along
// the track edges, and chevron signs on the outside of sharp corners.
import { pointAt } from '../shared/track-math.js';
import { trackSpot, alongYaw, faceYaw } from './scatter.js';
import { matrixOf } from '../render/props.js';

export function startArea(ctx, kit, opts = {}) {
  const track = ctx.track;
  const p = pointAt(track.main, 0.5);
  const limit = p.w / 2 + p.m;
  const scale = Math.max(1, (limit + 1.2) / 10.5);
  // the gantry over the line, facing the karts as they arrive
  kit.place('start_gantry', [{ x: p.x, y: ctx.groundAt(p.x, p.z), z: p.z, ry: faceYaw(-p.tx, -p.tz), s: scale }], { shadow: true });
  for (const side of [-1, 1]) {
    const x = p.x + p.rx * side * 10.5 * scale, z = p.z + p.rz * side * 10.5 * scale;
    ctx.world.addCircle({ x, z, r: 0.9 * scale, kind: 'gantry' });
  }
  // grandstand beside the start straight, looking at the road
  const side = opts.standSide ?? 1;
  const st = trackSpot(ctx, opts.standS ?? 35, side * (limit + 9));
  kit.place('grandstand', [{ x: st.x, y: ctx.terrain.heightAt(st.x, st.z) - 0.2, z: st.z, ry: faceYaw(-st.p.rx * side, -st.p.rz * side) }]);
  // balloons and flags along the straight
  const balloons = [], flags = [];
  for (let s = -40; s <= 90; s += 26) {
    for (const sd of [-1, 1]) {
      const q = trackSpot(ctx, (s + track.length) % track.length, sd * (limit + 2.2));
      (Math.abs(s) % 52 < 1 ? balloons : flags).push({ x: q.x, y: ctx.terrain.heightAt(q.x, q.z), z: q.z, ry: q.p.heading });
    }
  }
  kit.place('balloons', balloons, { collide: 0.3 });
  kit.place('flag_pole', flags, { collide: 0.2 });
}

// Props along the outside edges of every path. pick(pt, index) returns a model name or null.
export function edges(ctx, kit, { spacing = 4.2, offset = 0.7, pick, collide = 0 }) {
  const pts = ctx.edgeDecor(spacing, offset);
  const groups = {};
  pts.forEach((pt, i) => {
    const name = pick(pt, i);
    if (!name) return;
    (groups[name] ||= []).push({ x: pt.x, y: ctx.terrain.heightAt(pt.x, pt.z) > pt.y - 0.6 ? pt.y - 0.15 : ctx.terrain.heightAt(pt.x, pt.z), z: pt.z, ry: alongYaw(Math.sin(pt.yaw), Math.cos(pt.yaw)) });
  });
  const view = 120 + 180 * kit.quality.detail; // 210 m on low, 300 m on high
  for (const [name, items] of Object.entries(groups)) kit.place(name, items, { collide, shadow: false, view });
  return pts;
}

// The map's fixed obstacles (from the shared layout data). Their colliders are added by
// the track builder; this draws them.
export function mapObstacles(ctx, kit) {
  const groups = {};
  for (const o of ctx.track.def.obstacles || []) {
    const p = pointAt(ctx.track.main, o.s);
    const x = p.x + p.rx * (o.lat || 0), z = p.z + p.rz * (o.lat || 0);
    (groups[o.model] ||= []).push({ x, y: ctx.groundAt(x, z, p.y + 5) - 0.05, z, ry: p.heading + (o.lat || 0) * 0.3 });
  }
  for (const [name, items] of Object.entries(groups)) kit.place(name, items);
}

// Moving obstacles: one animated instanced mesh per model, moved every frame to where the
// physics put them (positions come from the race clock, see shared/movers.js).
export function moverVisuals(ctx, kit) {
  const movers = ctx.world.moving;
  if (!movers.length) return () => {};
  const byModel = {};
  movers.forEach((m, i) => { (byModel[m.def.model] ||= []).push(i); });
  const meshes = [];
  for (const [model, idx] of Object.entries(byModel)) {
    const g = kit.place(model, idx.map((i) => ({ x: movers[i].x, y: movers[i].y, z: movers[i].z })), { animated: true, shadow: true });
    if (g) meshes.push({ g, idx, roll: model === 'snowball' });
  }
  const it = { x: 0, y: 0, z: 0, ry: 0, rx: 0 };
  return (t) => {
    for (const { g, idx, roll } of meshes) {
      for (const mesh of g.children) {
        idx.forEach((mi, k) => {
          const m = movers[mi];
          it.x = m.x; it.z = m.z; it.y = ctx.groundAt(m.x, m.z, m.y + 4);
          it.ry = roll ? m.heading : m.heading + Math.sin(t * 2 + mi) * 0.3;
          it.rx = roll ? -t * 3 : 0;
          mesh.setMatrixAt(k, matrixOf(it));
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    }
  };
}

// Arches repeated along a stretch of a path (tunnels).
export function arches(ctx, kit, model, path, from, to, every, baseWidth, opts = {}) {
  const items = [];
  const len = path.closed ? ((to - from + ctx.track.length) % ctx.track.length) : to - from;
  for (let d = 0; d <= len + 0.01; d += every) {
    const p = pointAt(path, from + d);
    const s = (p.w / 2 + p.m + (opts.pad ?? 1.4)) / baseWidth;
    const y = ctx.groundAt(p.x, p.z, p.y + 3) - 0.1;
    // where another road joins (a shortcut entrance) leave the arch out, so its posts do
    // not stand in that road
    const posts = [-1, 1].map((side) => ({ x: p.x + p.rx * side * baseWidth * s, z: p.z + p.rz * side * baseWidth * s }));
    const clear = Math.min(0.6, (opts.pad ?? 1.4) - 0.2);
    if (posts.some((q) => { const e = ctx.world.edge(q.x, p.y, q.z, 0, {}); return e && e.excess < clear; })) continue;
    items.push({ x: p.x, y, z: p.z, ry: faceYaw(p.tx, p.tz), s: opts.uniform === false ? 1 : s, sx: opts.uniform === false ? s : undefined, sy: opts.uniform === false ? 1 : undefined, sz: opts.uniform === false ? 1 : undefined });
    if (opts.collide !== false) for (const q of posts) ctx.world.addCircle({ x: q.x, z: q.z, r: 1.0, y0: p.y - 2, y1: p.y + 6, kind: 'arch' });
  }
  if (!items.length) return null;
  return kit.place(model, items, { shadow: opts.shadow });
}

// Chevron signs on the outside of sharp corners, facing the oncoming karts.
export function cornerSigns(ctx, kit, { minCurv = 0.03, every = 9 } = {}) {
  const main = ctx.track.main;
  const right = [], left = [];
  let last = -1e9;
  for (const p of main.pts) {
    if (Math.abs(p.curv) < minCurv || p.s - last < every) continue;
    if (ctx.inBridge(p.s) || ctx.inGap(p.s)) continue;
    last = p.s;
    const outside = p.curv > 0 ? -1 : 1; // right turn: outside is on the left
    const lat = outside * (p.w / 2 + p.m + 1.4);
    const x = p.x + p.rx * lat, z = p.z + p.rz * lat;
    (p.curv > 0 ? right : left).push({ x, y: ctx.terrain.heightAt(x, z), z, ry: faceYaw(-p.tx, -p.tz) });
  }
  kit.place('sign_right', right, { collide: 0.8, collideY: 2.2 });
  kit.place('sign_left', left, { collide: 0.8, collideY: 2.2 });
}
