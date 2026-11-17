// TURBO TOWN - arcade kart physics. Pure JavaScript (no three.js), fixed time step.
//
// The kart is a point on the ground (bottom centre) with a velocity, a heading (yaw) and
// a small collision radius. On the ground its velocity is split into forward and sideways
// parts on the ground plane: the engine works on the forward part and grip removes the
// sideways part (low grip = sliding). Drifting is a controlled arc that starts by itself
// when a player holds a turn at speed (autoDrift below), charges sparks (3 tiers) while
// the turn is held, and gives a boost when the steering is let go.
import { deriveKart } from '../shared/karts.js';
import { SURF, SURF_PROPS } from '../shared/surfaces.js';
import { pointAt, clamp } from '../shared/track-math.js';

export const GRAVITY = 30;
const SNAP = 0.45;          // stay on the ground if it is this close below
const STEP_UP = 0.7;        // climb steps up to this height
const TAKEOFF_VN = 3.6;     // leave the ground when moving away from it this fast
export const DRIFT_MIN = 9; // m/s needed to drift
const GRIP = 11;            // sideways grip rate on road
const COAST = 4.5;
const BOOST_BASE = 28.6;     // shared part of every kart's boost speed (m/s)
const REVERSE_ACCEL = 12;
const REVERSE_MAX = 8.5;
const RADIUS = 0.85;
// Drifts no longer charge boosts (kept so older imports still work).
export const TIER_AT = [0, 1, 2, 3];
export const DRIFT_BASE = 0.75, DRIFT_STEER = 0.35; // drift turn = driftTurn x (base + steer x into-turn)

export function createKart(def, opts = {}) {
  const p = deriveKart(def);
  return {
    id: opts.id ?? 0, def, p,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0,
    px: 0, py: 0, pz: 0, pyaw: 0,              // previous step (for render interpolation)
    grounded: false, nx: 0, ny: 1, nz: 0, snx: 0, sny: 1, snz: 0, surf: SURF.ROAD, lastGroundSurf: SURF.ROAD,
    steer: 0, input: { throttle: 0, steer: 0, drift: false, item: false, back: false },
    prevDrift: false,
    drift: { on: false, dir: 0, charge: 0, tier: 0, t: 0 },
    hop: { on: false, dir: 0 },
    driftVis: 0,                                  // smoothed visual drift angle
    boostT: 0, boostMul: 1, boostKind: '', padCool: 0,
    spinT: 0, spinDir: 1, spinAngle: 0, recoverT: 0,
    slowT: 0, slowMul: 1, slickT: 0, invulnT: 0,
    airT: 0, canTrick: false, trick: false, trickT: 0, trickSpin: 0,
    respawnT: 0, rescue: false, lastGood: null, inWater: false,
    speed: 0, yawRate: 0, lateral: 0, offroad: false, wallT: 0,
    speedScale: opts.speedScale ?? 1, frozen: true, time: 0,
    radius: RADIUS, near: {}, events: [],
  };
}

function ev(k, type, v = 0) { k.events.push({ type, v }); }

export function giveBoost(k, mul, seconds, kind) {
  if (k.boostT <= 0 || mul >= k.boostMul) k.boostMul = mul;
  k.boostT = Math.max(k.boostT, seconds);
  k.boostKind = kind;
}

// Spin-out from a hit. Heavy karts spin for less time; Rocket Kart recovers faster.
export function spinOut(k, seconds = 1.1, dir = 1) {
  const t = seconds * (1 - k.p.hitResist) / k.p.recovery;
  k.spinT = Math.max(k.spinT, t);
  k.spinDir = dir || 1;
  k.drift.on = false; k.drift.charge = 0; k.drift.tier = 0;
  k.boostT = 0;
  ev(k, 'spin', t);
}

function surfProps(k, surf) {
  const b = SURF_PROPS[surf] || SURF_PROPS[0];
  const P = k.p;
  let speed = b.speed, accel = b.accel, grip = b.grip, handling = b.handling;
  if (b.offroad) {
    speed = 1 - (1 - speed) * (1 - P.offroad);
    accel = 1 - (1 - accel) * (1 - P.offroad);
  }
  if (b.slippery) {
    grip = grip + (1 - grip) * P.slipGrip * 0.75;
    handling = handling + (1 - handling) * P.slipGrip * 0.6;
  }
  if (k.slickT > 0) { grip *= 0.3; handling *= 0.6; }
  _sp.speed = speed; _sp.accel = accel; _sp.grip = grip; _sp.handling = handling; _sp.offroad = !!b.offroad;
  return _sp;
}
const _sp = { speed: 1, accel: 1, grip: 1, handling: 1, offroad: false };
const _g = {};

export function stepKart(k, world, dt) {
  const P = k.p, inp = k.input;
  k.px = k.x; k.py = k.y; k.pz = k.z; k.pyaw = k.yaw;
  k.time += dt;

  // ------------------------------------------------ timers
  if (k.boostT > 0) { k.boostT -= dt; if (k.boostT <= 0) { k.boostT = 0; k.boostMul = 1; } }
  if (k.spinT > 0) { k.spinT -= dt; k.spinAngle += k.spinDir * dt * 13; if (k.spinT <= 0) { k.spinT = 0; k.spinAngle = 0; k.recoverT = 1.2; } }
  if (k.recoverT > 0) k.recoverT -= dt;
  if (k.slowT > 0) { k.slowT -= dt; if (k.slowT <= 0) k.slowMul = 1; }
  if (k.slickT > 0) k.slickT -= dt;
  if (k.invulnT > 0) k.invulnT -= dt;
  if (k.padCool > 0) k.padCool -= dt;
  if (k.trickT > 0) { k.trickT -= dt; k.trickSpin = (1 - Math.max(0, k.trickT) / 0.5) * Math.PI * 2; } else k.trickSpin = 0;
  if (k.wallT > 0) k.wallT -= dt;

  if (k.respawnT > 0) { stepRespawn(k, world, dt); return; }

  // ------------------------------------------------ input
  const control = !(k.spinT > 0 || k.frozen);
  const want = control ? clamp(inp.steer, -1, 1) : 0;
  const rate = (k.steer !== 0 && Math.sign(want) !== Math.sign(k.steer)) ? 22 : 13; // snappy
  k.steer += clamp(want - k.steer, -rate * dt, rate * dt);
  // drifting comes from the steering alone (same rule for players and computer drivers)
  inp.drift = autoDrift(k, control ? inp.steer : 0, control ? inp.throttle : 0, k.ad || (k.ad = { holdT: 0, dir: 0, relT: 0, oppT: 0 }), dt);
  const pressed = false;

  const sp = surfProps(k, k.surf);
  k.offroad = k.grounded && sp.offroad;

  if (k.grounded) groundStep(k, world, dt, sp, pressed, control);
  else airStep(k, dt, pressed, control);

  // ------------------------------------------------ move
  k.x += k.vx * dt; k.y += k.vy * dt; k.z += k.vz * dt;

  resolveGround(k, world);
  resolveEdges(k, world);
  resolveObstacles(k, world);
  waterAndFalls(k, world);

  // visuals: smoothed ground normal and drift angle
  const a = 1 - Math.exp(-dt * (k.grounded ? 14 : 3));
  const tnx = k.grounded ? k.nx : 0, tny = k.grounded ? k.ny : 1, tnz = k.grounded ? k.nz : 0;
  k.snx += (tnx - k.snx) * a; k.sny += (tny - k.sny) * a; k.snz += (tnz - k.snz) * a;
  // the kart swings well sideways while drifting (about 30-45 degrees, more when steering in)
  const rel = k.drift.on ? clamp(k.steer * k.drift.dir, -1, 1) : 0;
  const dv = k.drift.on ? k.drift.dir * -(0.5 + 0.28 * rel) : 0;
  k.driftVis += (dv - k.driftVis) * (1 - Math.exp(-dt * 12));
}

function groundStep(k, world, dt, sp, pressed, control) {
  const P = k.p, inp = k.input;
  const nx = k.nx, ny = k.ny, nz = k.nz;
  // forward and right on the ground plane
  const hx = Math.sin(k.yaw), hz = Math.cos(k.yaw);
  const hd = hx * nx + hz * nz;
  let fx = hx - nx * hd, fy = -ny * hd, fz = hz - nz * hd;
  let fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let rx = fy * nz - fz * ny, ry = fz * nx - fx * nz, rz = fx * ny - fy * nx;
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  let vf = k.vx * fx + k.vy * fy + k.vz * fz;
  let vl = k.vx * rx + k.vy * ry + k.vz * rz;

  // ------------------------------------------------ engine
  let top = P.top * sp.speed * k.speedScale;
  if (k.slowT > 0) top *= k.slowMul;
  if (k.drift.on) top *= 0.97; // drifting costs a little speed and never gives a boost
  const boosting = k.boostT > 0;
  let thr = control ? inp.throttle : 0;
  const accelBonus = k.recoverT > 0 ? P.recovery : 1;
  if (boosting) {
    // boosts ignore most of the off-road penalty (that is what makes shortcuts work)
    // boost speed is only half tied to the kart's own top speed, so slower karts that
    // drift a lot can keep up with the fast ones
    const btop = Math.max(top, (P.top + BOOST_BASE) * 0.5 * k.speedScale * k.boostMul * (sp.offroad ? 0.9 : 1) * (k.slowT > 0 ? k.slowMul : 1));
    if (vf < btop) vf = Math.min(btop, vf + 48 * dt);
    top = btop;
  } else if (thr > 0) {
    if (vf < top) {
      const f = Math.max(0.12, 1 - 0.78 * Math.pow(Math.max(0, vf) / top, 2));
      vf = Math.min(top, vf + P.accel * sp.accel * f * thr * accelBonus * dt);
    }
  }
  if (thr < 0) {
    if (vf > 0.5) vf = Math.max(0, vf - P.brake * dt);
    else vf = Math.max(-REVERSE_MAX, vf - REVERSE_ACCEL * -thr * dt);
  } else if (thr === 0 && !boosting) {
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), COAST * dt);
  }
  if (!boosting && vf > top) vf = Math.max(top, vf - (sp.offroad ? 24 : 10) * dt);
  if (k.spinT > 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 15 * dt);
  vf -= GRAVITY * 0.5 * fy * dt; // roll down hills, slow down going up

  // ------------------------------------------------ steering
  const sAbs = Math.abs(vf);
  const hi = clamp((sAbs / P.top - 0.82) / 0.18, 0, 1.4);
  const instab = (1 - P.stability) * hi;
  let yawRate = 0;
  if (k.drift.on) {
    // a drift turns tighter than normal steering: that is what it is for
    const rel = k.steer * k.drift.dir;
    yawRate = -k.drift.dir * P.driftTurn * (DRIFT_BASE + DRIFT_STEER * rel) * Math.sqrt(sp.handling) * Math.min(1, sAbs / 12);
  } else {
    // normal steering gets wider at speed, so sharp corners at full speed need a drift
    const turnF = Math.min(1, sAbs / 5) * (1 - 0.4 * Math.min(1, sAbs / P.top));
    yawRate = -k.steer * P.turn * turnF * sp.handling * (vf < -0.2 ? -1 : 1);
  }
  yawRate *= 1 + 0.7 * instab; // wobbly karts steer a bit sharper at top speed (no shaking)
  k.yaw += yawRate * dt;
  k.yawRate = yawRate;
  // turning hard at speed scrubs speed off, more for karts with weak handling
  if (!k.drift.on && vf > 8) vf -= Math.abs(yawRate) * vf * P.scrub * dt;

  // ------------------------------------------------ grip
  let grip = GRIP * sp.grip * (k.drift.on ? 0.3 : 1) * (1 - 0.4 * instab);
  if (k.spinT > 0) grip *= 0.5;
  const vl0 = vl;
  vl *= Math.exp(-grip * dt);
  // in a drift the sideways slide turns back into forward speed, so drifting through a
  // corner keeps nearly all its speed (arcade feel, not a speed penalty)
  if (k.drift.on && vf > 0) vf = Math.sqrt(vf * vf + (vl0 * vl0 - vl * vl) * 0.92);
  k.lateral = vl;

  k.vx = fx * vf + rx * vl; k.vy = fy * vf + ry * vl; k.vz = fz * vf + rz * vl;
  k.speed = vf;

  // ------------------------------------------------ drift
  // the slide starts straight away (no hop), in the direction of the steering
  const d = k.drift;
  if (d.on) {
    if (!inp.drift) endDrift(k, true);
    else if (vf < DRIFT_MIN * 0.75 || k.spinT > 0) endDrift(k, false);
    else chargeDrift(k, dt, sp);
  } else if (inp.drift && control && Math.abs(k.steer) > 0.5 && vf > DRIFT_MIN) {
    startDrift(k, Math.sign(k.steer));
  }

  // ------------------------------------------------ special ground
  if (k.surf === SURF.BOOST && k.padCool <= 0) { giveBoost(k, 1.36, 1.1, 'pad'); k.padCool = 0.4; ev(k, 'boostPad'); }
}

// Automatic drifting (there is no drift button), the same for every kart: holding a turn
// at speed for AUTO_HOLD seconds puts the kart into a drift (a big sideways slide that
// turns tighter); holding the turn keeps it drifting; letting go (or steering the other
// way for a moment) ends it. There is no boost at the end. st is a small state object.
export const AUTO_HOLD = 1.0;
const AUTO_SPEED = 12, AUTO_GRACE = 0.15, AUTO_OPPOSITE = 0.25;
export function autoDrift(k, steer, throttle, st, dt) {
  const d = k.drift;
  const dir = Math.abs(steer) > 0.55 ? Math.sign(steer) : 0;
  if (d.on) {
    if (throttle <= 0) return false;
    if (dir === d.dir) { st.relT = 0; st.oppT = 0; return true; }
    if (dir === -d.dir) { st.oppT = (st.oppT || 0) + dt; return st.oppT < AUTO_OPPOSITE; }
    st.relT = (st.relT || 0) + dt; // short taps keep the slide going (to widen the line)
    return st.relT < AUTO_GRACE;
  }
  st.relT = 0; st.oppT = 0;
  if (dir && k.grounded && throttle > 0 && k.speed > AUTO_SPEED && k.spinT <= 0 && !k.frozen) {
    if (dir === st.dir) st.holdT += dt; else { st.dir = dir; st.holdT = dt; }
    return st.holdT >= AUTO_HOLD;
  }
  st.dir = 0; st.holdT = 0;
  return false;
}

function startDrift(k, dir) {
  const d = k.drift;
  d.on = true; d.dir = dir; d.charge = 0; d.tier = 0; d.t = 0;
  ev(k, 'driftStart', dir);
}

function chargeDrift(k, dt) {
  k.drift.t += dt; // how long this drift has lasted (no charge, no boost)
}

function endDrift(k) {
  const d = k.drift;
  ev(k, 'driftEnd');
  d.on = false; d.charge = 0; d.tier = 0; d.t = 0;
}

function airStep(k, dt, pressed, control) {
  const P = k.p, inp = k.input;
  k.airT += dt;
  k.vy -= GRAVITY * dt;
  if (control) k.yaw += -k.steer * P.turn * 0.5 * dt; // air control
  const drag = Math.exp(-0.05 * dt);
  k.vx *= drag; k.vz *= drag;
  // real jumps (ramps, bounce pads, big bumps) do a trick by themselves; landing it boosts
  if (k.canTrick && !k.trick && k.airT > 0.22 && control) {
    k.trick = true; k.trickT = 0.5;
    ev(k, 'trick');
  }
  // keep a drift going over small bumps, but not through big jumps
  if (k.drift.on && k.airT > 0.6 && !k.hop.on) endDrift(k, false);
  k.speed = k.vx * Math.sin(k.yaw) + k.vz * Math.cos(k.yaw);
}

function resolveGround(k, world) {
  const g = world.ground(k.x, k.y + STEP_UP, k.z, _g);
  if (!g) { k.gy = k.y - 30; if (k.grounded) { k.grounded = false; k.airT = 0; k.canTrick = false; } return; }
  k.gy = g.y;
  const gap = k.y - g.y;
  const vn = k.vx * g.nx + k.vy * g.ny + k.vz * g.nz;
  if (k.grounded) {
    if (gap < SNAP && vn < TAKEOFF_VN) stick(k, g, vn);
    else {
      k.grounded = false; k.airT = 0;
      k.canTrick = (vn >= TAKEOFF_VN && k.speed > 8) || k.lastGroundSurf === SURF.RAMP;
      if (k.lastGroundSurf === SURF.RAMP) { k.vy += 1.5; ev(k, 'ramp'); }
    }
  } else if (gap <= 0) {
    land(k, g, vn);
  }
}

function stick(k, g, vn) {
  // follow the ground and keep the speed (so ramps and hills do not eat speed)
  const s0 = Math.hypot(k.vx, k.vy, k.vz);
  k.vx -= g.nx * vn; k.vy -= g.ny * vn; k.vz -= g.nz * vn;
  const s1 = Math.hypot(k.vx, k.vy, k.vz);
  if (s1 > 1e-3 && vn < 0) { const f = s0 / s1; k.vx *= f; k.vy *= f; k.vz *= f; }
  k.y = g.y;
  k.nx = g.nx; k.ny = g.ny; k.nz = g.nz;
  setSurface(k, g.surf);
}

function land(k, g, vn) {
  const impact = -vn;
  k.vx -= g.nx * vn; k.vy -= g.ny * vn; k.vz -= g.nz * vn;
  k.y = g.y;
  k.nx = g.nx; k.ny = g.ny; k.nz = g.nz;
  k.grounded = true;
  setSurface(k, g.surf);
  if (impact > 2.5 || k.airT > 0.35) ev(k, 'land', impact);
  if (k.trick) {
    k.trick = false;
    giveBoost(k, 1.22, 0.65, 'trick');
    ev(k, 'trickBoost');
  }
  k.canTrick = false;
  if (k.hop.on) {
    k.hop.on = false;
    const dir = k.hop.dir || (Math.abs(k.steer) > 0.25 ? Math.sign(k.steer) : 0);
    const fwd = k.vx * Math.sin(k.yaw) + k.vz * Math.cos(k.yaw);
    if (k.input.drift && dir && fwd > DRIFT_MIN && !k.drift.on && k.spinT <= 0) startDrift(k, dir);
  }
  k.airT = 0;
}

function setSurface(k, surf) {
  k.surf = surf;
  k.lastGroundSurf = surf;
  if (surf === SURF.BOUNCE) {
    k.vx += k.nx * 15; k.vy += k.ny * 15; k.vz += k.nz * 15;
    k.grounded = false; k.airT = 0; k.canTrick = true;
    ev(k, 'bounce');
  }
}

function resolveEdges(k, world) {
  const n = world.edge(k.x, k.y, k.z, k.radius, k.near);
  if (!n || n.inside) return;
  k.x -= n.ox * n.excess; k.z -= n.oz * n.excess;
  const vOut = k.vx * n.ox + k.vz * n.oz;
  if (vOut > 0) {
    k.vx -= n.ox * vOut * 1.3; k.vz -= n.oz * vOut * 1.3;
    const scrub = 1 - Math.min(0.4, vOut * 0.035);
    k.vx *= scrub; k.vz *= scrub;
    if (vOut > 2.5 && k.wallT <= 0) { ev(k, 'wall', vOut); k.wallT = 0.25; }
  }
}

function resolveObstacles(k, world) {
  world.nearObstacles(k.x, k.z, (o) => {
    if (k.y + 1.2 < o.y0 || k.y > o.y1) return;
    if (o.kind === 'mover' && k.invulnT > 0) return; // blinking karts pass through moving obstacles
    const dx = k.x - o.x, dz = k.z - o.z;
    const rr = o.r + k.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 1e-4;
    const ox = dx / d, oz = dz / d;
    k.x = o.x + ox * rr; k.z = o.z + oz * rr;
    const rvx = k.vx - (o.vx || 0), rvz = k.vz - (o.vz || 0);
    const vIn = -(rvx * ox + rvz * oz);
    if (vIn > 0) {
      k.vx += ox * vIn * (1 + o.bounce); k.vz += oz * vIn * (1 + o.bounce);
      const scrub = 1 - Math.min(0.5, vIn * 0.03);
      k.vx *= scrub; k.vz *= scrub;
      if (vIn > 2.5 && k.wallT <= 0) { ev(k, 'bonk', vIn); k.wallT = 0.25; }
      if (o.onHit) o.onHit(k, vIn);
      // moving obstacles knock karts into a spin (a shield or a flash of invulnerability stops it)
      if (o.kind === 'mover' && o.spin && vIn > 3 && k.spinT <= 0) {
        if (k.shield) { k.shield = false; ev(k, 'shieldPop'); }
        else spinOut(k, 0.9, Math.sign(Math.random() - 0.5));
        k.invulnT = 1.6;
      }
    }
  });
}

function waterAndFalls(k, world) {
  const w = world.water.length ? world.waterAt(k.x, k.z) : null;
  const wasIn = k.inWater;
  k.inWater = false;
  if (w && k.y < w.level - 0.05) {
    const g = world.ground(k.x, k.y + STEP_UP, k.z, _g);
    const depth = w.level - (g ? g.y : -100);
    if (w.deep && depth > 1.1) { startRespawn(k, world); return; }
    k.inWater = true;
    if (k.grounded && k.surf !== SURF.BOOST && k.surf !== SURF.SLIDE) k.surf = SURF.WATER;
    if (!wasIn) ev(k, 'splash', Math.abs(k.vy) + Math.abs(k.speed) * 0.2);
  }
  if (k.y < world.killY || (k.grounded && k.surf === SURF.DEEP)) { startRespawn(k, world); return; }
  // remember a safe spot on the track for respawns
  if (k.grounded && k.near && k.near.path && k.near.inside && Math.abs(k.near.lat) < k.near.w / 2 + 0.5 && !k.inWater) {
    const lg = k.lastGood || (k.lastGood = {});
    lg.pathIndex = k.near.pathIndex;
    lg.local = (k.near.i + k.near.t) * k.near.path.step;
    lg.lat = k.near.lat;
  }
}

export function startRespawn(k, world) {
  if (k.respawnT > 0) return;
  k.respawnT = 1.5;
  k.rescue = false;
  k.drift.on = false; k.drift.charge = 0; k.drift.tier = 0;
  k.boostT = 0; k.spinT = 0; k.spinAngle = 0; k.trick = false; k.hop.on = false;
  ev(k, 'fall');
}

function stepRespawn(k, world, dt) {
  k.respawnT -= dt;
  if (!k.rescue && k.respawnT < 0.9) {
    // lift back onto the road a little behind the last safe spot, facing the right way
    const track = world.track;
    const lg = k.lastGood || { pathIndex: 0, local: 0, lat: 0 };
    const path = track.paths[lg.pathIndex] || track.main;
    const local = path.closed ? lg.local - 6 : Math.max(0, lg.local - 6);
    const p = pointAt(path, local);
    const lat = clamp(lg.lat, -p.w / 4, p.w / 4);
    k.x = p.x + p.rx * lat; k.z = p.z + p.rz * lat;
    const g = world.ground(k.x, p.y + 3, k.z, _g);
    k.y = (g ? g.y : p.y) + 2.2;
    k.yaw = p.heading; k.pyaw = k.yaw;
    k.px = k.x; k.py = k.y; k.pz = k.z;
    k.vx = k.vy = k.vz = 0;
    k.rescue = true;
    ev(k, 'rescue');
  }
  if (k.rescue) {
    k.px = k.x; k.py = k.y; k.pz = k.z;
    if (k.respawnT <= 0) {
      k.respawnT = 0; k.rescue = false;
      k.grounded = false; k.airT = 0; k.invulnT = 1.5;
      ev(k, 'respawned');
    }
  }
  k.speed = 0;
}

// Bumps between karts: push apart by weight, bounce, and nudge sideways.
export function collideKarts(karts) {
  for (let i = 0; i < karts.length; i++) {
    const a = karts[i];
    if (a.respawnT > 0 || a.ghost) continue;
    for (let j = i + 1; j < karts.length; j++) {
      const b = karts[j];
      if (b.respawnT > 0 || b.ghost) continue;
      const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
      if (Math.abs(dy) > 1.4) continue;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-3;
      const nx = dx / d, nz = dz / d;
      const ma = a.p.mass, mb = b.p.mass, tot = ma + mb;
      const pen = rr - d;
      a.x -= nx * pen * (mb / tot); a.z -= nz * pen * (mb / tot);
      b.x += nx * pen * (ma / tot); b.z += nz * pen * (ma / tot);
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rv < 0) {
        const jimp = -(1 + 0.5) * rv / (1 / ma + 1 / mb);
        const extra = 1.6; // a little extra push so bumps feel bouncy
        a.vx -= (jimp / ma + extra * mb / tot) * nx; a.vz -= (jimp / ma + extra * mb / tot) * nz;
        b.vx += (jimp / mb + extra * ma / tot) * nx; b.vz += (jimp / mb + extra * ma / tot) * nz;
        if (-rv > 2) { a.events.push({ type: 'bump', v: -rv, other: b.id }); b.events.push({ type: 'bump', v: -rv, other: a.id }); }
      }
    }
  }
}
