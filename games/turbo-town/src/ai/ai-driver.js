// TURBO TOWN - computer drivers. They drive with exactly the same kart physics and inputs
// as players (throttle, steer, drift, item). Each one has its own lane habit, reactions and
// drift skill, so no two follow the same line:
//  - follows a racing line (outside - apex - outside) plus its own lane bias
//  - drifts through corners and releases for a boost (better drivers charge higher tiers)
//  - steers around karts ahead and around obstacles, aims for ramps and boost pads
//  - may take shortcuts (more likely when better, or when holding a speed item)
//  - makes mistakes (easier drivers more often), recovers when stuck or turned around
//  - a gentle catch-up so races stay close, but never enough to beat skill
import { pointAt, angleDiff, clamp, sDist } from '../shared/track-math.js';
import { DRIFT_MIN, TIER_AT, DRIFT_BASE, DRIFT_STEER } from '../physics/kart-physics.js';

export const DIFFICULTY = {
  easy:   { speed: 0.86, noise: 0.22, driftChance: 0.45, tier: 1, shortcut: 0.05, mistake: 0.10, start: 0.15, catchup: 0.07, items: 0.35, reaction: 0.5 },
  normal: { speed: 0.93, noise: 0.12, driftChance: 0.75, tier: 1, shortcut: 0.2, mistake: 0.05, start: 0.4, catchup: 0.05, items: 0.6, reaction: 0.3 },
  hard:   { speed: 0.985, noise: 0.06, driftChance: 0.92, tier: 2, shortcut: 0.45, mistake: 0.02, start: 0.7, catchup: 0.035, items: 0.85, reaction: 0.15 },
  expert: { speed: 1.02, noise: 0.03, driftChance: 1.0, tier: 3, shortcut: 0.8, mistake: 0.006, start: 0.9, catchup: 0.025, items: 1.0, reaction: 0.08 },
};

// ------------------------------------------------------------------ per-track data

export function prepareTrackAI(track, world) {
  if (track.ai) return track.ai;
  const out = { line: new Map(), obstacles: new Map() };
  for (const path of track.paths) {
    const n = path.pts.length;
    const at = (i) => path.pts[path.closed ? ((i % n) + n) % n : clamp(i, 0, n - 1)];
    const avg = (i, a, b) => { let s = 0; for (let k = a; k <= b; k++) s += at(i + k).curv; return s / (b - a + 1); };
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = at(i);
      const lim = Math.max(0, p.w / 2 - 1.3);
      raw[i] = clamp(160 * avg(i, -2, 6) - 150 * avg(i, 6, 14), -lim, lim);
    }
    const line = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -5; k <= 5; k++) { const j = path.closed ? (i + k + n) % n : clamp(i + k, 0, n - 1); s += raw[j]; c++; } line[i] = s / c; }
    out.line.set(path.id, line);
    out.obstacles.set(path.id, []);
  }
  // static obstacles that sit on (or near) a drivable corridor
  for (const o of world.obstacles) {
    let best = null, bd = Infinity;
    for (const path of track.paths) {
      for (let i = 0; i < path.pts.length; i++) {
        const p = path.pts[i];
        const d = (p.x - o.x) ** 2 + (p.z - o.z) ** 2;
        if (d < bd) { bd = d; best = { path, i, p }; }
      }
    }
    if (!best) continue;
    const { path, i, p } = best;
    const lat = (o.x - p.x) * p.rx + (o.z - p.z) * p.rz;
    if (Math.abs(lat) - o.r > p.w / 2 + p.m) continue;
    out.obstacles.get(path.id).push({ local: i * path.step, lat, r: o.r });
  }
  for (const list of out.obstacles.values()) list.sort((a, b) => a.local - b.local);
  track.ai = out;
  return out;
}

function lineAt(ai, path, local) {
  const line = ai.line.get(path.id);
  const n = line.length;
  let f = local / path.step;
  if (path.closed) f = ((f % n) + n) % n; else f = clamp(f, 0, n - 1);
  const i = Math.floor(f), t = f - i;
  const j = path.closed ? (i + 1) % n : Math.min(n - 1, i + 1);
  return line[i] + (line[j] - line[i]) * t;
}

function curvAhead(path, local, a, b, step = 4) {
  let mx = 0, sum = 0, c = 0;
  for (let d = a; d <= b; d += step) {
    const cv = pointAt(path, local + d).curv;
    sum += cv; c++;
    if (Math.abs(cv) > Math.abs(mx)) mx = cv;
  }
  return { max: mx, avg: sum / c };
}

function nearestLocal(path, x, z, hint) {
  // search near the hint first (cheap), fall back to the whole path
  const n = path.pts.length;
  let best = 0, bd = Infinity;
  const from = hint != null ? Math.max(0, Math.floor(hint / path.step) - 15) : 0;
  const to = hint != null ? Math.min(n - 1, Math.floor(hint / path.step) + 25) : n - 1;
  for (let i = from; i <= to; i++) { const p = path.pts[i]; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best * path.step;
}

// ------------------------------------------------------------------ the driver

// Returns a controller function (racer, race, dt) that sets racer.kart.input.
export function createAI(difficulty = 'normal', rng = Math.random) {
  const D = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const me = {
    D, difficulty,
    laneBias: (rng() * 2 - 1) * 0.3,          // fraction of the half width
    aggression: rng(),
    route: 'main', routeLocal: 0, decided: new Map(),
    stuckT: 0, reverseT: 0, graceT: 0, revSteer: 1, offRouteT: 0, noiseT: 0, noise: 0, wobbleT: 0,
    drift: { want: false, cornerDir: 0, t: 0, holdTier: D.tier },
    pressAt: rng() < D.start ? 0.55 + rng() * 0.4 : (rng() < 0.4 ? 2.2 : 0.1),
    rng,
    itemPolicy: null, // set by the items module
  };

  const controller = (r, race, dt) => {
    const k = r.kart, inp = k.input;
    const track = race.track;
    const ai = prepareTrackAI(track, race.world);
    inp.item = false; inp.back = false;
    if (race.state === 'countdown') {
      inp.throttle = race.countdown < me.pressAt ? 1 : 0;
      inp.steer = 0; inp.drift = false;
      return;
    }
    const n = k.near;
    if (!n || !n.path || k.respawnT > 0) { inp.throttle = 1; inp.steer = 0; inp.drift = false; return; }
    k.speedScale = D.speed * catchup(r, race, D);

    // ------------------------------------------ route (main or a shortcut)
    let path = track.main, local = n.s;
    if (me.route !== 'main') {
      path = track.paths.find((p) => p.id === me.route) || track.main;
      local = me.routeLocal = nearestLocal(path, k.x, k.z, me.routeLocal);
      if (local > path.length - 10) me.route = 'main';
      if (path === track.main) me.route = 'main';
      // missed the way in (bumped, too fast, wrong side)? give up instead of turning back
      const sp = path.pts[Math.min(path.pts.length - 1, Math.round(local / path.step))];
      const off = Math.hypot(sp.x - k.x, sp.z - k.z) > sp.w / 2 + sp.m + 1.5;
      me.offRouteT = off ? (me.offRouteT || 0) + dt : 0;
      if (me.offRouteT > 1.0) { me.route = 'main'; me.offRouteT = 0; path = track.main; local = n.s; }
    } else {
      for (const sc of track.def.shortcuts || []) {
        const d = sDist(n.s, sc.from - 10, track.length);
        const lapKey = sc.id + ':' + r.progress.lap;
        if (d < 35 && d > 3 && !me.decided.has(lapKey)) {
          let p = D.shortcut;
          if (sc.surface && sc.surface !== 'road' && hasSpeedItem(r)) p = Math.min(1, p * 3 + 0.2);
          if (k.def.stats.handling < 5) p *= 0.5; // clumsy karts take the tight ways in less often
          me.decided.set(lapKey, rng() < p);
        }
        if (me.decided.get(lapKey) && d <= 3) { me.route = sc.id; me.routeLocal = 0; }
      }
    }

    const speed = k.speed;
    const sAbs = Math.max(0, speed);
    const look = 5.5 + sAbs * 0.34;
    const tgt = pointAt(path, local + look);
    const hw = tgt.w / 2;

    // ------------------------------------------ lateral target
    let lat = lineAt(ai, path, local + look) + me.laneBias * hw;
    // ramps and boost pads (main path only)
    if (path === track.main) {
      for (const rp of track.def.ramps || []) {
        const d = sDist(local, rp.s, track.length);
        if (d < 45) lat += (rp.lat - lat) * clamp(1 - (d - 8) / 37, 0, 1);
      }
      if (D.speed > 0.9) for (const bp of track.def.boostPads || []) {
        const d = sDist(local, bp.s, track.length);
        if (d < 35 && d > 2) lat += (bp.lat - lat) * 0.7 * clamp(1 - d / 35, 0, 1);
      }
    }
    // other karts ahead: pass on the side with more room
    for (const o of race.racers) {
      if (o === r || o.kart.respawnT > 0) continue;
      const ok = o.kart;
      const dx = ok.x - k.x, dz = ok.z - k.z;
      const fwd = dx * tgt.tx + dz * tgt.tz;
      if (fwd < -1 || fwd > 16) continue;
      const rel = (ok.x - tgt.x) * tgt.rx + (ok.z - tgt.z) * tgt.rz - lat;
      if (Math.abs(rel) > 2.5) continue;
      const room = rel > 0 ? (lat + hw) : (hw - lat);
      const dir = room > 2.5 ? (rel > 0 ? -1 : 1) : (rel > 0 ? 1 : -1);
      lat += dir * (2.6 - Math.abs(rel)) * (1 - fwd / 18) * (0.6 + 0.4 * me.aggression);
    }
    // static obstacles on this path
    for (const ob of ai.obstacles.get(path.id)) {
      let d = ob.local - local;
      if (path.closed) { if (d < -track.length / 2) d += track.length; else if (d > track.length / 2) d -= track.length; }
      if (d < 0 || d > 30) continue;
      const gap = ob.lat - lat;
      const need = ob.r + 1.8;
      if (Math.abs(gap) < need) {
        const room = hw - 0.9;
        const leftOk = ob.lat - need > -room, rightOk = ob.lat + need < room;
        let side = -Math.sign(gap || 1); // pass on the side we are already on
        if (side > 0 && !rightOk) side = -1;
        if (side < 0 && !leftOk) side = 1;
        lat = ob.lat + side * need;
      }
    }
    // hazards from items (set by the items module)
    if (race.hazards) for (const h of race.hazards) {
      if (!h.active) continue;
      const dx = h.x - k.x, dz = h.z - k.z;
      const fwd = dx * tgt.tx + dz * tgt.tz;
      if (fwd < 0 || fwd > 22) continue;
      const hl = (h.x - tgt.x) * tgt.rx + (h.z - tgt.z) * tgt.rz;
      if (Math.abs(hl - lat) < (h.r || 1.5) + 1.4 && rng() > D.reaction) lat = hl - Math.sign(hl - lat || 1) * ((h.r || 1.5) + 1.6);
    }
    // moving obstacles: steer to the side they are moving away from
    for (const m of race.world.moving) {
      const dx = m.x - k.x, dz = m.z - k.z;
      const fwd = dx * tgt.tx + dz * tgt.tz;
      if (fwd < 0 || fwd > 24) continue;
      const ml = (m.x - tgt.x) * tgt.rx + (m.z - tgt.z) * tgt.rz;
      const mv = m.vx * tgt.rx + m.vz * tgt.rz; // sideways speed of the obstacle
      const need = m.r + 1.8;
      if (Math.abs(ml - lat) < need + Math.abs(mv) * 0.5 && rng() > D.reaction * 0.5) {
        const dir = Math.abs(mv) > 0.5 ? -Math.sign(mv) : -Math.sign(ml - lat || 1);
        lat = ml + dir * (need + 0.5);
      }
    }
    // mistakes: now and then the driver wobbles or drifts wide
    me.noiseT -= dt;
    if (me.noiseT <= 0) { me.noiseT = 0.4 + rng() * 0.6; me.noise = (rng() * 2 - 1) * D.noise; }
    if (me.wobbleT > 0) me.wobbleT -= dt;
    else if (rng() < D.mistake * dt) me.wobbleT = 0.6 + rng() * 0.6;
    if (me.wobbleT > 0) lat += Math.sin(k.time * 7) * hw * 0.5;
    const lim = Math.max(0.5, hw - (path === track.main ? 1.0 : 0.6));
    lat = clamp(lat, -lim, lim);

    const tx = tgt.x + tgt.rx * lat, tz = tgt.z + tgt.rz * lat;
    const want = Math.atan2(tx - k.x, tz - k.z);
    const diff = angleDiff(want, k.yaw);

    // ------------------------------------------ speed
    const ca = curvAhead(path, local, 0, 26);
    const vAllowed = Math.sqrt(30 / Math.max(1e-3, Math.abs(ca.max))) * (0.9 + 0.1 * D.speed);
    inp.throttle = 1;
    if (sAbs > vAllowed + 3 && !k.drift.on) inp.throttle = -0.6;
    if (Math.abs(diff) > 1.2 && sAbs > 10) inp.throttle = 0;

    // ------------------------------------------ steering and drifting
    const dr = me.drift;
    const cNear = curvAhead(path, local, 4, 30, 6).avg;
    // Drifting is automatic (the physics drifts any kart that holds a turn long enough),
    // so the driver only steers. In a drift it picks the steer that holds the arc it needs;
    // when the corner opens up it eases off, and the drift ends by itself.
    if (k.drift.on) {
      const needYaw = -sAbs * pointAt(path, local + 8).curv + 1.8 * diff;
      const f = k.p.driftTurn * Math.min(1, sAbs / 12);
      const rel = ((-needYaw / k.drift.dir) / Math.max(0.1, f) - DRIFT_BASE) / DRIFT_STEER;
      inp.steer = clamp(rel * k.drift.dir, -1, 1);
      // computer drivers never flip a drift over (steering hard the other way would)
      if (Math.sign(inp.steer) === -k.drift.dir) inp.steer = Math.sign(inp.steer) * Math.min(Math.abs(inp.steer), 0.5);
      const ending = Math.abs(curvAhead(path, local, 2, 14, 4).avg) < 0.008 || Math.sign(cNear) !== k.drift.dir;
      const offLine = Math.abs(n.lat) > hw + 0.5 && path === track.main;
      if (ending || offLine) inp.steer = clamp(-diff * 2.6, -0.45, 0.45); // let the drift end
    } else {
      inp.steer = clamp(-diff * 2.6 + me.noise, -1, 1);
    }
    inp.drift = false;
    void dr;

    // ------------------------------------------ unstick
    // stuck = barely moving forward while not already reversing (and not just after it)
    if (me.graceT > 0) me.graceT -= dt;
    me.stuckT = me.reverseT <= 0 && me.graceT <= 0 && sAbs < 1.5 && k.spinT <= 0 ? me.stuckT + dt : 0;
    const facingBack = Math.cos(k.yaw - Math.atan2(tgt.tx, tgt.tz)) < -0.3;
    if (me.stuckT > 1.0 || (facingBack && sAbs < 4 && me.reverseT <= 0 && me.graceT <= 0)) {
      me.reverseT = facingBack ? 1.4 : 0.9; me.stuckT = 0;
      me.revSteer = diff > 0 ? -1 : 1; // back out turning the nose towards the target
    }
    if (me.reverseT > 0) {
      me.reverseT -= dt;
      inp.throttle = -1; inp.steer = me.revSteer; inp.drift = false;
      if (me.reverseT <= 0) me.graceT = 1.5;
    } else if (me.graceT > 0 && Math.abs(diff) > 1.2) {
      inp.steer = diff > 0 ? -1 : 1; inp.throttle = 0.7; // full lock to finish the turn
    }

    // ------------------------------------------ items
    if (me.itemPolicy) me.itemPolicy(r, race, me, dt);
  };
  controller.ai = me;
  return controller;
}

function hasSpeedItem(r) {
  const it = r.item;
  return it === 'speed' || it === 'trail';
}

// Gentle catch-up: drivers far behind the leading human go a little faster, drivers far
// ahead a little slower. Small enough that a good player still wins clearly.
function catchup(r, race, D) {
  const human = race.player;
  if (!human || human.finished) return 1;
  const gap = human.progress.distance() - r.progress.distance(); // + = AI behind the player
  const f = clamp(gap / 150, -1, 1);
  return 1 + f * D.catchup;
}

export { TIER_AT };
