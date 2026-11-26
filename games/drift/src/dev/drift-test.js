// Drift! - handling tests (this PC only). Drives set manoeuvres on the flat test world
// (?offline&testworld) by stepping the physics directly, and records the drift angle.
// In the console:  const T = await import('/client/src/dev/drift-test.js'); T.all()
const deg = (r) => Math.round((r * 180) / Math.PI);

function game() { return window.__game; }

/** Run one manoeuvre. script(t, veh) returns the controls. Returns samples every `every` s. */
export function run(script, { seconds = 8, speed0 = 0, every = 0.25, x = 350, z = 520, h = 0 } = {}) {
  const G = game(), veh = G.car.veh, ph = G.physics;
  veh.place(x, 0.6, z, h);
  const dt = 1 / 60;
  // settle on the springs, then give the starting speed
  for (let i = 0; i < 30; i++) { veh.step(dt, {}); ph.world.step(ph.events); }
  if (speed0) {
    const fx = -Math.sin(h), fz = -Math.cos(h);
    veh.body.setLinvel({ x: fx * speed0, y: 0, z: fz * speed0 }, true);
    for (const w of veh.wheels) w.omega = speed0 / w.r;
  }
  const out = [];
  let next = 0, maxB = 0, sumB = 0, nB = 0, spun = false, prevSt = veh.steerAngle, maxJump = 0, turned = 0;
  for (let i = 0; i < seconds * 60; i++) {
    const t = i * dt;
    veh.step(dt, script(t, veh));
    maxJump = Math.max(maxJump, Math.abs(veh.steerAngle - prevSt)); prevSt = veh.steerAngle;
    turned += veh.body.angvel().y * dt;
    ph.world.step(ph.events);
    ph.events.drainContactForceEvents(() => {});
    const b = Math.abs(veh.beta);
    if (b > maxB) maxB = b;
    if (b > 0.35) { sumB += b; nB++; }
    const lin = veh.body.linvel(), fwdx = 0;
    void fwdx;
    if (veh.vLong < -1) spun = true;
    if (t >= next) {
      next += every;
      out.push(`${t.toFixed(2)}s b=${deg(veh.beta)} v=${veh.speed.toFixed(1)} g=${veh.gear} st=${deg(veh.steerAngle)} yr=${veh.body.angvel().y.toFixed(2)}`);
      void lin;
    }
  }
  // how long the car stayed above 20 degrees
  // maxJump = biggest change of the front wheel angle in one 1/60 s step (degrees); turned = total rotation (degrees)
  return { log: out, maxDeg: deg(maxB), driftSec: +(nB / 60).toFixed(2), avgDeg: nB ? deg(sumB / nB) : 0, spun, endSpeed: +veh.speed.toFixed(1), maxJump: deg(maxJump), turned: deg(turned) };
}

const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

export const tests = {
  // switch: drift left, then steer right to swing into a right-hand drift, hold it, then left again
  transition: () => run((t) => ({
    throttle: t < 1 ? 0.6 : t < 1.4 ? 0 : 1,
    steer: t < 1 ? 0 : t < 1.5 ? -1 : t < 2.6 ? -0.2 : t < 3.4 ? 1 : t < 4.6 ? 0.2 : t < 5.4 ? -1 : -0.2,
    handbrake: t >= 1.05 && t < 1.4,
  }), { speed0: 20, seconds: 7 }),
  // 360: 15 m/s, handbrake and full lock with the throttle on, keep holding the steering
  spin360: () => run((t) => ({ throttle: t > 0.3 ? 1 : 0.5, steer: -1, handbrake: t < 0.6 }), { speed0: 15, seconds: 4 }),
  // committed 360: flick, then keep the steering held INTO the drift on the throttle
  commit360: () => run((t) => ({ throttle: t < 0.4 ? 0.7 : t < 0.8 ? 0 : 1, steer: t >= 0.4 ? -1 : 0, handbrake: t >= 0.45 && t < 0.8 }), { speed0: 20, seconds: 5 }),
  // tapping into the drift (0.2 s on, 0.3 s off): a deeper drift, should NOT spin
  tapInto: () => run((t) => ({ throttle: t < 0.4 ? 0.7 : t < 0.8 ? 0 : 1, steer: t >= 0.4 && t < 0.9 ? -1 : t >= 0.9 && (t % 0.5) < 0.2 ? -1 : 0, handbrake: t >= 0.45 && t < 0.8 }), { speed0: 20, seconds: 6 }),
  // 360 holding the handbrake the whole time
  spin360hb: () => run(() => ({ throttle: 1, steer: -1, handbrake: true }), { speed0: 15, seconds: 4 }),
  // keyboard style: flick with the handbrake, then HOLD the key toward the corner at full throttle
  keyHoldIn: () => run((t) => ({
    throttle: t < 1 ? 0.6 : t < 1.4 ? 0 : 1,
    steer: t >= 1 ? -1 : 0,
    handbrake: t >= 1.05 && t < 1.4,
  }), { speed0: 20, seconds: 7 }),
  // what most players do: flick, then countersteer BY HAND (hold the opposite key) on the throttle
  manualCounter: () => run((t) => ({
    throttle: t < 1 ? 0.6 : t < 1.4 ? 0 : 1,
    steer: t >= 1 && t < 1.5 ? -1 : t >= 1.6 ? 1 : 0,
    handbrake: t >= 1.05 && t < 1.4,
  }), { speed0: 20, seconds: 7 }),
  // tapping the opposite key on and off (0.25 s each) to hold the drift
  tapCounter: () => run((t) => ({
    throttle: t < 1 ? 0.6 : t < 1.4 ? 0 : 1,
    steer: t >= 1 && t < 1.5 ? -1 : t >= 1.6 && Math.floor(t / 0.25) % 2 === 0 ? 1 : 0,
    handbrake: t >= 1.05 && t < 1.4,
  }), { speed0: 20, seconds: 7 }),
  // keyboard style: flick, then steer the other way at 3.5 s
  keySteerOut: () => run((t) => ({
    throttle: t < 1 ? 0.6 : t < 1.4 ? 0 : 1,
    steer: t >= 1 && t < 1.5 ? -1 : t >= 3.5 ? 1 : 0,
    handbrake: t >= 1.05 && t < 1.4,
  }), { speed0: 20, seconds: 5.5 }),
  // 20 m/s, flick left with the handbrake, then throttle with hands off (assists countersteer)
  handbrakeHandsOff: () => run((t) => ({
    throttle: t < 1 ? 0.6 : t < 1.4 ? 0 : 0.85,
    steer: t >= 1 && t < 1.5 ? -1 : 0,
    handbrake: t >= 1.05 && t < 1.4,
  }), { speed0: 20, seconds: 7 }),
  // 20 m/s, handbrake flick then hold a little steer into the drift (left) with throttle
  handbrakeHoldIn: () => run((t) => ({
    throttle: t < 1 ? 0.6 : t < 1.4 ? 0 : 0.9,
    steer: t >= 1 && t < 1.5 ? -1 : t >= 1.5 ? -0.35 : 0,
    handbrake: t >= 1.05 && t < 1.4,
  }), { speed0: 20, seconds: 7 }),
  // handbrake drift, then lift off the throttle at 4 s: the car should straighten up within ~1 s
  exit: () => run((t) => ({
    throttle: t < 1 ? 0.6 : t < 1.4 ? 0 : t < 4 ? 0.85 : 0,
    steer: t >= 1 && t < 1.5 ? -1 : 0,
    handbrake: t >= 1.05 && t < 1.4,
  }), { speed0: 20, seconds: 6.5 }),
  // power over: 15 m/s in 2nd, full lock left and full throttle, then let go of the steering
  powerOver: () => run((t) => ({ throttle: 1, steer: t < 1.2 ? -1 : 0 }), { speed0: 15, seconds: 6 }),
  // donut from standstill
  donut: () => run(() => ({ throttle: 1, steer: -1 }), { seconds: 6 }),
  // plain cornering without trying to drift (should grip, not slide): ~0.8 g
  gentleCorner: () => run((t) => ({ throttle: 0.4, steer: t > 1 ? -0.2 : 0 }), { speed0: 18, seconds: 5 }),
  // harder cornering, past the grip limit: may slide, must not spin with assists on
  hardCorner: () => run((t) => ({ throttle: 0.5, steer: t > 1 ? -0.5 : 0 }), { speed0: 22, seconds: 5 }),
};

export function all(assists) {
  const G = game();
  if (assists) Object.assign(G.car.veh.assists, assists);
  const res = {};
  for (const [k, fn] of Object.entries(tests)) {
    const r = fn();
    res[k] = `${r.avgDeg}/${r.maxDeg} ${r.driftSec}s v${r.endSpeed} jump${r.maxJump} turned${r.turned}${r.spun ? ' SPUN' : ''}`;
  }
  return res;
}
