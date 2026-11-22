// Simple, believable mower movement: acceleration, turning (spin-on-the-spot or car-like),
// slopes changing speed, sliding on wet grass, and bumping into things.
import { slopeAlong, solidDist, solidBounds } from '../shared/levels.js';
import { WEATHER } from '../shared/rules.js';
import { angleDiff } from '../shared/rng.js';

export class MowerBody {
  constructor(stats, level) {
    this.S = stats;
    this.L = level;
    // broad-phase data for solids
    this.solids = level.solids.map((s) => {
      const b = solidBounds(s);
      return { s, cx: (b[0] + b[2]) / 2, cz: (b[1] + b[3]) / 2, r: Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 };
    });
    this.reset(level.spawn.x, level.spawn.z, level.spawn.h);
  }

  reset(x, z, h) {
    this.x = x; this.z = z; this.h = h;
    this.vx = 0; this.vz = 0; this.yawRate = 0; this.vf = 0;
    this.steerVis = 0; this.wheelSpin = 0; this.lapL = 0; this.lapR = 0;
    this.radius = Math.max(...this.S.circles.map((c) => Math.abs(c.z) + c.r));
  }

  // inp = { throttle, steer, brake }; env = { weather, slow (0..1 multiplier), fragile: Map }
  // returns events: [{ type: 'solid', s, speed, nx, nz } | { type: 'fragile', f, speed }]
  step(dt, inp, env) {
    const S = this.S, W = WEATHER[env.weather] || WEATHER.sunny;
    const events = [];
    // ---- turning
    const fwdSpeed = this.vf;
    let targetYaw;
    if (S.turn.pivot) {
      targetYaw = -inp.steer * S.turn.yaw * (1 - 0.3 * Math.min(1, Math.abs(fwdSpeed) / S.speed));
    } else {
      const v = fwdSpeed;
      targetYaw = (-inp.steer * v) / S.turn.radius;
      targetYaw = Math.max(-S.turn.yaw, Math.min(S.turn.yaw, targetYaw));
    }
    this.yawRate += (targetYaw - this.yawRate) * Math.min(1, dt * (S.turn.pivot ? 9 : 7));
    this.h += this.yawRate * dt;
    if (this.h > Math.PI) this.h -= Math.PI * 2; else if (this.h < -Math.PI) this.h += Math.PI * 2;
    this.steerVis += (inp.steer - this.steerVis) * Math.min(1, dt * 8);
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    const rx = -fz, rz = fx; // the mower's right-hand side
    // ---- speed along the heading
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    const slope = slopeAlong(this.L, this.x, this.z, fx, fz);
    let vmax = S.speed * W.speed * (env.slow ?? 1) * Math.max(0.45, Math.min(1.25, 1 - slope * 2.2));
    let vrev = S.reverse * W.speed * (env.slow ?? 1);
    const thr = inp.throttle;
    const target = thr > 0 ? thr * vmax : thr < 0 ? thr * vrev : 0;
    let acc;
    if (inp.brake) acc = 7;
    else if (thr !== 0 && Math.sign(target) === Math.sign(vf || target) && Math.abs(target) > Math.abs(vf)) acc = S.accel * (W.grip < 0.6 ? 0.8 : 1);
    else acc = thr === 0 ? 3.2 : 5;
    const want = inp.brake ? 0 : target;
    if (vf < want) vf = Math.min(want, vf + acc * dt); else vf = Math.max(want, vf - acc * dt);
    vf -= slope * 9.8 * 0.12 * dt; // a little roll downhill
    // ---- sideways grip (low on wet grass = slides)
    const grip = S.grip * W.grip / (W.grip < 0.6 ? S.wetSlip : 1);
    const side = slopeAlong(this.L, this.x, this.z, rx, rz);
    vl -= side * 9.8 * 0.25 * dt;
    vl *= Math.exp(-grip * dt);
    this.vx = fx * vf + rx * vl;
    this.vz = fz * vf + rz * vl;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.vf = vf;
    this.vl = vl;
    // ---- collisions with solid things (two or more circles along the mower)
    for (let iter = 0; iter < 2; iter++) {
      for (const c of S.circles) {
        const cx = this.x + fx * c.z, cz = this.z + fz * c.z;
        for (const b of this.solids) {
          if ((b.cx - cx) ** 2 + (b.cz - cz) ** 2 > (b.r + c.r + 0.2) ** 2) continue;
          const d = solidDist(b.s, cx, cz) - c.r;
          if (d >= 0) continue;
          const e = 0.01;
          let nx = solidDist(b.s, cx + e, cz) - solidDist(b.s, cx - e, cz);
          let nz = solidDist(b.s, cx, cz + e) - solidDist(b.s, cx, cz - e);
          const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
          this.x -= nx * d; this.z -= nz * d;
          const vn = this.vx * nx + this.vz * nz;
          if (vn < 0) {
            this.vx -= nx * vn * 1.25; this.vz -= nz * vn * 1.25;
            if (iter === 0) events.push({ type: 'solid', s: b.s, speed: -vn, nx, nz });
          }
        }
      }
    }
    // ---- knock-over obstacles (they don't stop you)
    if (env.fragile) for (const f of env.fragile.values()) {
      if (f.down) continue;
      for (const c of S.circles) {
        const cx = this.x + fx * c.z, cz = this.z + fz * c.z;
        const dx = f.def.x - cx, dz = f.def.z - cz;
        if (dx * dx + dz * dz < (f.def.r + c.r) ** 2) {
          const l = Math.hypot(dx, dz) || 1;
          events.push({ type: 'fragile', f, speed: Math.hypot(this.vx, this.vz), dx: dx / l, dz: dz / l });
          this.vx *= 0.8; this.vz *= 0.8;
          break;
        }
      }
    }
    // keep inside the level area whatever happens
    const [x0, z0, x1, z1] = this.L.bounds;
    this.x = Math.max(x0 + 0.3, Math.min(x1 - 0.3, this.x));
    this.z = Math.max(z0 + 0.3, Math.min(z1 - 0.3, this.z));
    // ---- visuals
    this.vf = this.vx * fx + this.vz * fz;
    this.wheelSpin += this.vf * dt;
    const track = 0.6;
    // turning left (yawRate > 0) = the right-hand wheel goes faster
    this.lapL = this.vf - this.yawRate * track; this.lapR = this.vf + this.yawRate * track;
    return events;
  }

  speed() { return Math.hypot(this.vx, this.vz); }
}

export { angleDiff };
