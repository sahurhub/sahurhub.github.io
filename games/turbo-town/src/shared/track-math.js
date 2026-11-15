// TURBO TOWN - track maths shared by the browser game and the Node server.
// Pure JavaScript (no three.js), so the server can import the same file.
//
// A map definition has a closed main path and optional open shortcut paths, each a list of
// control points [x, y, z, width]. They are turned into evenly spaced samples (every DS
// metres) along a centripetal Catmull-Rom spline. Every sample knows its distance along the
// main lap ("s"); shortcut samples map linearly onto the main-lap distance between the point
// where they leave and the point where they rejoin, so race progress works on any route.
//
// Coordinates: three.js style, Y up. Heading 0 faces +Z. "right" of a direction (dx, dz)
// is (-dz, dx).

export const DS = 2; // sample spacing in metres

// ------------------------------------------------------------------ spline sampling

function catmull(p0, p1, p2, p3, t, out) {
  // centripetal Catmull-Rom (alpha 0.5) between p1 and p2, Barry-Goldman form
  const d = (a, b) => Math.max(1e-4, Math.pow((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2, 0.25));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const n = p1.length;
  for (let k = 0; k < n; k++) {
    const a1 = ((t1 - u) * p0[k] + (u - t0) * p1[k]) / (t1 - t0);
    const a2 = ((t2 - u) * p1[k] + (u - t1) * p2[k]) / (t2 - t1);
    const a3 = ((t3 - u) * p2[k] + (u - t2) * p3[k]) / (t3 - t2);
    const b1 = ((t2 - u) * a1 + (u - t0) * a2) / (t2 - t0);
    const b2 = ((t3 - u) * a2 + (u - t1) * a3) / (t3 - t1);
    out[k] = ((t2 - u) * b1 + (u - t1) * b2) / (t2 - t1);
  }
  return out;
}

// Returns evenly spaced samples [{x,y,z,w}] along the spline through pts.
function sampleSpline(pts, closed, ds) {
  const n = pts.length;
  const dense = [];
  const spans = closed ? n : n - 1;
  const get = (i) => {
    if (closed) return pts[((i % n) + n) % n];
    if (i < 0) { // mirror the first point for the open end
      const a = pts[0], b = pts[1];
      return a.map((v, k) => 2 * v - b[k]);
    }
    if (i >= n) {
      const a = pts[n - 1], b = pts[n - 2];
      return a.map((v, k) => 2 * v - b[k]);
    }
    return pts[i];
  };
  const tmp = new Array(pts[0].length);
  for (let i = 0; i < spans; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    const steps = Math.max(8, Math.ceil(len / 0.5));
    for (let j = 0; j < steps; j++) dense.push(catmull(p0, p1, p2, p3, j / steps, tmp).slice());
  }
  if (!closed) dense.push(pts[n - 1].slice());
  else dense.push(dense[0].slice());
  // cumulative length
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = cum[cum.length - 1];
  const count = closed ? Math.max(8, Math.round(total / ds)) : Math.max(2, Math.round(total / ds) + 1);
  const step = closed ? total / count : total / (count - 1);
  const out = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    const a = dense[j], b = dense[j + 1];
    const p = a.map((v, k) => v + (b[k] - v) * f);
    out.push(p);
  }
  return { samples: out, length: total, step };
}

// ------------------------------------------------------------------ paths

function finishPath(raw, closed, opts) {
  const pts = raw.samples.map((p) => ({ x: p[0], y: p[1], z: p[2], w: p[3] }));
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const hl = Math.hypot(tx, tz) || 1;
    tx /= hl; tz /= hl;
    const p = pts[i];
    p.tx = tx; p.tz = tz;
    p.rx = -tz; p.rz = tx; // right vector (horizontal)
    p.slope = (b.y - a.y) / Math.max(1e-3, Math.hypot(b.x - a.x, b.z - a.z));
    p.heading = Math.atan2(tx, tz);
  }
  // signed curvature (positive = turning right) smoothed, and a small automatic bank
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 3 + n) % n : Math.max(0, i - 3)];
    const b = pts[closed ? (i + 3) % n : Math.min(n - 1, i + 3)];
    let dh = angleDiff(b.heading, a.heading);
    const dist = raw.step * (closed ? 6 : Math.max(1, Math.min(n - 1, i + 3) - Math.max(0, i - 3)));
    pts[i].curv = -dh / Math.max(1e-3, dist); // heading decreases when turning right
  }
  const bankMax = opts.bankMax ?? 0.09;
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let k = -6; k <= 6; k++) {
      const j = closed ? (i + k + n) % n : Math.min(n - 1, Math.max(0, i + k));
      sum += pts[j].curv; cnt++;
    }
    const c = sum / cnt;
    pts[i].bank = clamp(c * 4.0, -bankMax, bankMax); // radians, positive = right edge lower
  }
  return pts;
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// ------------------------------------------------------------------ build

// Go-kart sized roads: the map files keep their original (wide) road widths and sideways
// positions; here everything is scaled to ROAD_SCALE of that, and the strip of grass
// before the barrier shrinks to EDGE_MARGIN. A map can set roadScale / edgeMargin itself.
export const ROAD_SCALE = 0.68, EDGE_MARGIN = 1.6;

// Extra corners: def.wiggles = [{ from, to, amp, waves }] cuts S-bends into stretches of
// the main path. from/to are lap distances on the original layout, amp is how far (m) the
// road swings sideways (+ = right first), waves = number of full left-right swings (0.5 =
// one bulge). Everything placed by lap distance is first pinned to its map position, so
// bridges, jumps, rivers and item boxes stay where they are.
function addWiggles(def) {
  if (!def.wiggles || !def.wiggles.length) return;
  const raw = sampleSpline(def.path, true, DS);
  const base = { id: 'main', closed: true, pts: finishPath(raw, true, def), step: raw.step };
  base.pts.forEach((p, i) => { p.s = i * raw.step; });
  const L = base.pts.length * raw.step;
  const xz = (s) => { const p = pointAt(base, s); return [p.x, p.z]; };
  const pin = (e, f) => { if (typeof e[f] === 'number') e[f] = xz(e[f]); };
  for (const key of ['gaps', 'ramps', 'boostPads', 'patches', 'itemBoxes', 'tunnels', 'movers', 'obstacles', 'bridges', 'narrow']) {
    for (const e of def[key] || []) {
      if (e.path && e.path !== 'main') continue;
      pin(e, 'from'); pin(e, 'to');
      if (typeof e.s === 'number' && e.at == null) { e.at = xz(e.s); delete e.s; }
    }
  }
  for (const w of def.water || []) if (typeof w.cross === 'number') { w.at = xz(w.cross); delete w.cross; }
  for (const sc of def.shortcuts || []) { pin(sc, 'from'); pin(sc, 'to'); }
  // control points: keep the ones outside the wiggles, add new ones along each wiggle
  const ranges = def.wiggles.map((wg) => ({ ...wg, s0: resolveS(base, wg.from), s1: resolveS(base, wg.to) }));
  const out = [];
  // lap distance of each control point, searching forward from the previous one (a road
  // that crosses itself has two control points at the same map position)
  const N = base.pts.length;
  let from = 0;
  def.path.forEach((cp, ci) => {
    let best = from, bd = Infinity;
    const look = ci === 0 ? N : Math.floor(N / 3);
    for (let k = 0; k < look; k++) {
      const j = (from + k) % N, q = base.pts[j];
      const d = (q.x - cp[0]) ** 2 + (q.z - cp[2]) ** 2 + (q.y - cp[1]) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    if (ci === 0) best = 0; // the first control point is where the lap starts
    from = best;
    const s = best * raw.step;
    if (ranges.some((r) => s > r.s0 - 8 && s < r.s1 + 8)) return;
    out.push({ s, p: cp });
  });
  for (const r of ranges) {
    const span = r.s1 - r.s0, n = Math.max(4, Math.round(span / 11)), waves = r.waves ?? 1;
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = pointAt(base, r.s0 + span * u);
      const win = Math.sin(Math.PI * u) ** 2; // eases in and out so the road joins smoothly
      const off = r.amp * win * (waves === 0.5 ? 1 : Math.sin(Math.PI * 2 * waves * u) / 0.65);
      out.push({ s: r.s0 + span * u, p: [p.x + p.rx * off, p.y, p.z + p.rz * off, p.w] });
    }
  }
  out.sort((a, b) => a.s - b.s);
  def.path = out.map((o) => o.p);
  def._baseLength = L;
}

function narrowDef(def) {
  if (def._narrowed) return; // the same map data can be built more than once
  def._narrowed = true;
  addWiggles(def);
  const k = def.roadScale ?? ROAD_SCALE;
  const kSc = Math.max(k, 0.9); // shortcuts are narrow already
  def.margin = Math.min(def.margin ?? 5, def.edgeMargin ?? EDGE_MARGIN);
  def.path = def.path.map((p) => [p[0], p[1], p[2], p[3] * k]);
  for (const sc of def.shortcuts || []) {
    sc.points = sc.points.map((p) => [p[0], p[1], p[2], p[3] * kSc]);
    sc.margin = Math.min(sc.margin ?? 2, 1.2);
  }
  const lat = (e, f) => { if (typeof e[f] === 'number') e[f] *= (e.path && e.path !== 'main') ? kSc : k; };
  for (const b of def.itemBoxes || []) if (b.lats) b.lats = b.lats.map((v) => v * ((b.path && b.path !== 'main') ? kSc : k));
  for (const b of def.boostPads || []) { lat(b, 'lat'); if (b.width) b.width = Math.max(3, b.width * k); }
  for (const r of def.ramps || []) { lat(r, 'lat'); r.width = Math.max(4.5, r.width * k); }
  for (const o of def.obstacles || []) lat(o, 'lat');
  for (const pt of def.patches || []) { lat(pt, 'lat0'); lat(pt, 'lat1'); }
  for (const m of def.movers || []) { lat(m, 'lat'); lat(m, 'lat0'); lat(m, 'lat1'); lat(m, 'amp'); }
}

// def: { path: [[x,y,z,w],...], margin, shortcuts: [{ id, points, margin, from, to, surface }] ... }
// returns the track object used by physics, AI, race progress and the server.
export function buildTrack(def) {
  narrowDef(def);
  const main = sampleSpline(def.path, true, DS);
  const mainPts = finishPath(main, true, def);
  const L = mainPts.length * main.step;
  const baseMargin = def.margin ?? 5;
  mainPts.forEach((p, i) => { p.s = i * main.step; p.m = baseMargin; });
  const paths = [{ id: 'main', closed: true, pts: mainPts, length: L, step: main.step, margin: baseMargin }];
  // narrow sections (bridges, tunnels): the edge moves in to the railings, with a taper
  // so karts are guided in rather than pushed sideways
  const narrow = [...(def.narrow || []), ...(def.bridges || []).map((b) => ({ from: b.from, to: b.to, margin: b.margin ?? 0.5 }))];
  for (const nr of narrow) {
    nr.from = resolveS(paths[0], nr.from); nr.to = resolveS(paths[0], nr.to);
    const taper = nr.taper ?? 14;
    for (const p of mainPts) {
      const into = sInRange(p.s, nr.from - taper, nr.to + taper, L);
      if (into == null) continue;
      const span = sDist(nr.from - taper, nr.to + taper, L);
      const dIn = Math.min(into, span - into); // distance from the nearer end of the taper zone
      const f = clamp(dIn / taper, 0, 1);
      p.m = Math.min(p.m, baseMargin + (nr.margin - baseMargin) * f);
    }
  }
  for (const key of ['gaps', 'ramps', 'boostPads', 'patches', 'itemBoxes', 'tunnels', 'movers', 'obstacles', 'bridges']) {
    for (const e of def[key] || []) {
      if (e.path && e.path !== 'main') continue; // places on shortcuts use their own distances
      if (e.from != null) e.from = resolveS(paths[0], e.from);
      if (e.to != null) e.to = resolveS(paths[0], e.to);
      if (e.at != null && e.s == null) e.s = resolveS(paths[0], e.at);
    }
  }
  // rivers given by a map position cross the road at the nearest lap distance
  for (const w of def.water || []) if (w.at && w.cross == null) w.cross = resolveS(paths[0], w.at);

  for (const sc of def.shortcuts || []) {
    // shortcut control points start and end on the main path at s = from / to
    sc.from = resolveS(paths[0], sc.from);
    sc.to = resolveS(paths[0], sc.to);
    const a = pointAt(paths[0], sc.from), b = pointAt(paths[0], sc.to);
    const ctrl = [[a.x, a.y, a.z, sc.points[0][3]], ...sc.points, [b.x, b.y, b.z, sc.points[sc.points.length - 1][3]]];
    // lead-in points along the main tangent so the shortcut leaves smoothly
    const lead = sc.lead ?? 10;
    ctrl.unshift([a.x - a.tx * lead, a.y, a.z - a.tz * lead, ctrl[0][3]]);
    ctrl.push([b.x + b.tx * lead, b.y, b.z + b.tz * lead, ctrl[ctrl.length - 1][3]]);
    const raw = sampleSpline(ctrl, false, DS);
    const pts = finishPath(raw, false, def);
    const scm = sc.margin ?? 2;
    pts.forEach((p) => { p.m = scm; });
    // map onto lap distance: the lead-in parts follow the main path
    let sFrom = sc.from - lead, sTo = sc.to + lead;
    if (sTo < sFrom) sTo += L;
    pts.forEach((p, i) => {
      const f = i / (pts.length - 1);
      p.s = wrapS(sFrom + (sTo - sFrom) * f, L);
    });
    paths.push({ id: sc.id, closed: false, pts, length: raw.length, step: raw.step, margin: sc.margin ?? 2, surface: sc.surface || null, hidden: !!sc.hidden });
  }

  const track = { id: def.id, length: L, paths, main: paths[0], def, zones: def.zones || [] };
  track.grid = buildSegmentGrid(track);
  track.checkpoints = makeCheckpoints(L, def.checkpoints || 12);
  return track;
}

export function wrapS(s, L) { s %= L; return s < 0 ? s + L : s; }

// forward distance from a to b around the lap
export function sDist(a, b, L) { return wrapS(b - a, L); }

// if s lies in [a, b] (going forward around the lap) returns how far past a it is, else null
export function sInRange(s, a, b, L) {
  const span = sDist(a, b, L), d = sDist(a, s, L);
  return d <= span ? d : null;
}

// A place on the main lap: a number is already a lap distance, [x, z] is a map position.
export function resolveS(path, v) {
  if (typeof v === 'number') return v;
  let best = 0, bd = Infinity;
  path.pts.forEach((p, i) => {
    const d = (p.x - v[0]) ** 2 + (p.z - v[1]) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best * path.step;
}

// Resolve every { s | at } entry of a list in place (adds .s) and returns the list.
export function resolveList(track, list) {
  for (const e of list || []) if (e.s == null && e.at) e.s = resolveS(track.main, e.at);
  return list || [];
}

// position on a path at distance s (main path wraps)
export function pointAt(path, s) {
  const n = path.pts.length;
  let f = s / path.step;
  if (path.closed) f = ((f % n) + n) % n; else f = clamp(f, 0, n - 1);
  const i = Math.floor(f), t = f - i;
  const a = path.pts[i], b = path.pts[path.closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
  const lerp = (u, v) => u + (v - u) * t;
  const tx = lerp(a.tx, b.tx), tz = lerp(a.tz, b.tz), hl = Math.hypot(tx, tz) || 1;
  return {
    x: lerp(a.x, b.x), y: lerp(a.y, b.y), z: lerp(a.z, b.z), w: lerp(a.w, b.w),
    tx: tx / hl, tz: tz / hl, rx: -tz / hl, rz: tx / hl, bank: lerp(a.bank, b.bank), m: lerp(a.m, b.m),
    heading: Math.atan2(tx, tz), s: path.closed ? s : lerp(a.s, b.s), curv: lerp(a.curv, b.curv),
  };
}

// ------------------------------------------------------------------ nearest point

const CELL = 24;

function buildSegmentGrid(track) {
  const cells = new Map();
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  track.paths.forEach((path, pi) => {
    const n = path.pts.length;
    const segs = path.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = path.pts[i], b = path.pts[(i + 1) % n];
      const r = Math.max(a.w, b.w) / 2 + path.margin + 8;
      const x0 = Math.floor((Math.min(a.x, b.x) - r) / CELL), x1 = Math.floor((Math.max(a.x, b.x) + r) / CELL);
      const z0 = Math.floor((Math.min(a.z, b.z) - r) / CELL), z1 = Math.floor((Math.max(a.z, b.z) + r) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        let list = cells.get(k);
        if (!list) cells.set(k, list = []);
        list.push(pi, i);
      }
    }
  });
  return { cells, key };
}

// Nearest point on any path. y is used to tell apart roads stacked above each other.
// Returns { path, pathIndex, i, t, s, lat, dist, y, w, tx, tz, rx, rz, limit } or null.
export function nearest(track, x, y, z, out = {}) {
  const g = track.grid;
  const list = g.cells.get(g.key(Math.floor(x / CELL), Math.floor(z / CELL)));
  let best = null, bestScore = Infinity;
  const consider = (pi, i) => {
    const path = track.paths[pi];
    const n = path.pts.length;
    const a = path.pts[i], b = path.pts[(i + 1) % n];
    const ex = b.x - a.x, ez = b.z - a.z;
    const len2 = ex * ex + ez * ez || 1;
    let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
    t = clamp(t, 0, 1);
    const px = a.x + ex * t, pz = a.z + ez * t, py = a.y + (b.y - a.y) * t;
    const d = Math.hypot(x - px, z - pz);
    const dy = Math.abs(y - py);
    // rank by how far outside that path's drivable corridor the point is, so where two
    // corridors overlap (shortcut junctions) the point counts as inside either
    const limit = (a.w + (b.w - a.w) * t) / 2 + a.m + (b.m - a.m) * t;
    const score = d - limit + Math.max(0, dy - 4) * 3;
    if (score < bestScore) { bestScore = score; best = { pi, i, t, px, py, pz, d }; }
  };
  if (list) for (let k = 0; k < list.length; k += 2) consider(list[k], list[k + 1]);
  else {
    track.paths.forEach((path, pi) => {
      const segs = path.closed ? path.pts.length : path.pts.length - 1;
      for (let i = 0; i < segs; i++) consider(pi, i);
    });
  }
  if (!best) return null;
  const path = track.paths[best.pi];
  const n = path.pts.length;
  const a = path.pts[best.i], b = path.pts[(best.i + 1) % n];
  const t = best.t;
  let tx = a.tx + (b.tx - a.tx) * t, tz = a.tz + (b.tz - a.tz) * t;
  const hl = Math.hypot(tx, tz) || 1; tx /= hl; tz /= hl;
  const rx = -tz, rz = tx;
  let s;
  if (path.closed) s = (best.i + t) * path.step;
  else {
    let sa = a.s, sb = b.s;
    if (sb < sa - track.length / 2) sb += track.length;
    s = wrapS(sa + (sb - sa) * t, track.length);
  }
  out.path = path; out.pathIndex = best.pi; out.i = best.i; out.t = t; out.s = s;
  out.lat = (x - best.px) * rx + (z - best.pz) * rz;
  out.dist = best.d; out.x = best.px; out.y = best.py; out.z = best.pz;
  out.w = a.w + (b.w - a.w) * t;
  out.tx = tx; out.tz = tz; out.rx = rx; out.rz = rz;
  out.bank = a.bank + (b.bank - a.bank) * t;
  out.m = a.m + (b.m - a.m) * t;
  out.limit = out.w / 2 + out.m;
  return out;
}

// ------------------------------------------------------------------ race progress

function makeCheckpoints(L, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(i * L / count);
  return out;
}

// Progress tracker for one racer. Call update(s) every physics step with the racer's
// lap distance. Laps only count when every checkpoint sector was passed in order, so
// driving backwards over the line or cutting across the map never counts.
export class Progress {
  constructor(track, laps) {
    this.track = track;
    this.laps = laps;
    this.L = track.length;
    this.n = track.checkpoints.length;
    this.reset();
  }
  reset(startS = null) {
    this.lap = 0;            // completed laps
    this.sector = this.n - 1; // the grid sits just behind the line, in the last sector
    this.s = startS == null ? this.L - 1 : startS;
    this.finished = false;
    this.lapStarted = false;  // true once the racer crossed the line for the first time
    this.lapTimes = [];
    this.wrong = 0;           // seconds spent driving the wrong way
  }
  sectorOf(s) { return Math.min(this.n - 1, Math.floor(s / this.L * this.n)); }
  // Returns 'start' on the first crossing of the line, 'lap' when a lap was completed,
  // else null. Moving forward one or two sectors counts (two covers jumps and respawns);
  // anything else (backwards, or cutting across the map) is ignored.
  update(s) {
    const L = this.L, n = this.n;
    let ds = s - this.s;
    if (ds < -L / 2) ds += L; else if (ds > L / 2) ds -= L;
    this.s = s;
    this.ds = ds;
    const sec = this.sectorOf(s);
    const fwd = (sec - this.sector + n) % n;
    if (fwd < 1 || fwd > 2) return null;
    const crossed = sec < this.sector; // wrapped past the line
    this.sector = sec;
    if (!crossed) return null;
    if (!this.lapStarted) { this.lapStarted = true; return 'start'; }
    this.lap++;
    return 'lap';
  }
  // Continuous race distance (metres), used to sort positions. s is read relative to the
  // current sector so driving backwards over the line does not jump a lap.
  distance() {
    const L = this.L;
    const centre = (this.sector + 0.5) * L / this.n;
    let d = this.s - centre;
    if (d > L / 2) d -= L; else if (d < -L / 2) d += L;
    const s = centre + d;
    return (this.lapStarted ? this.lap * L : -L) + s;
  }
}
