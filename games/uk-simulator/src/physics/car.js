// UK Simulator - four-wheeled vehicle physics (cars, the Hilux, the quad bike).
// Per physics step (120 Hz): suspension rays per wheel with springs, dampers and anti-roll
// bars; tyre forces from the Pacejka model at each contact patch (lateral force applied at
// the axle's roll-centre height, so the body rolls, pitches, squats and dives realistically);
// wheel spin, engine, clutch, gearbox and differential integrated in 4 sub-steps (480 Hz);
// ABS, traction control, handbrake, speed-sensitive steering with Ackermann, aero.
import { VehicleBody, suspend, v3, G } from './vehicle-base.js';
import { Tyre } from './tyre.js';
import { Engine } from './drivetrain.js';

const SUB = 4;

export function defaultTune(spec) {
  return {
    power: 1, grip: 1, springF: 1, springR: 1, damper: 1, arbF: 1, arbR: 1, brakeBias: spec.brakes.bias, brakePower: 1,
    steerMax: 1, steerFalloff: 1, diffLock: spec.drive.lock ?? 0, abs: spec.brakes.abs, tc: spec.brakes.tc, autoGears: true,
    rideHeight: 0, downforce: 1, mass: 0,
  };
}

export class Car extends VehicleBody {
  constructor(spec, physics, world, pose, tune = defaultTune(spec), upgrades = {}) {
    super(spec, physics, world, { ...pose, y: pose.y + 0.15 }, tune);
    this.upgrades = upgrades;
    this.engine = new Engine(spec.engine, spec.gearbox, { power: tune.power * (1 + 0.05 * (upgrades.speed || 0)) });
    this.engine.auto = tune.autoGears;
    this.steer = 0; this.absState = [1, 1, 1, 1]; this.tcCut = 1; this.reverse = false; this.revTimer = 0;
    this.wheels = spec.wheels.map((wd, k) => this.makeWheel(wd, k));
    this.drivenIdx = this.wheels.map((w, k) => (w.driven ? k : -1)).filter((k) => k >= 0);
    this.brakeLight = 0; this.handbrake = 0;
    this.applyTune();
  }

  makeWheel(wd, k) {
    const spec = this.spec;
    const s = wd.front ? spec.susp.front : spec.susp.rear;
    const layout = spec.drive.layout;
    const driven = layout === 'AWD' || (layout === 'FWD' && wd.front) || (layout === 'RWD' && !wd.front);
    const tyre = new Tyre(wd.r, wd.w, spec.tyre, { loadNominal: spec.mass * G / 4, peakAngle: spec.tyre.mu > 1.05 ? 0.11 : 0.13 });
    const wm = Math.max(6, wd.r * wd.w * 260); // wheel + tyre mass (kg)
    return { def: wd, idx: k, front: wd.front, left: wd.left, driven, s, tyre, r: wd.r, I: 0.6 * wm * wd.r * wd.r, omega: 0, spin: 0, x: 0, xv: 0, len: 0, load: 0, contact: false, steer: 0, damage: 0, mount: [0, 0, 0], travel: s.travel, k: s.k, preload: 0, bump: s.bump, rebound: s.rebound, surf: null, fx: 0, fy: 0 };
  }

  applyTune() {
    const t = this.tune, spec = this.spec;
    const up = this.upgrades;
    const wb = spec.wheels[0].pos[2] - spec.wheels[2].pos[2];
    const zR = spec.wheels[2].pos[2];
    const com = [spec.com[0], spec.com[1] + t.rideHeight * 0.5, spec.com[2]];
    this.extraMass = t.mass || 0;
    this.setMass(com);
    const frontFrac = (com[2] - zR) / wb;
    for (const w of this.wheels) {
      const s = w.s;
      const kScale = (w.front ? t.springF : t.springR) * (1 + 0.08 * (up.suspension || 0));
      w.k = s.k * kScale;
      w.bump = s.bump * t.damper * (1 + 0.06 * (up.suspension || 0));
      w.rebound = s.rebound * t.damper * (1 + 0.06 * (up.suspension || 0));
      w.travel = s.travel;
      w.arb = (w.front ? s.arb * t.arbF : s.arb * t.arbR) + (s.solidAxle ? s.k * 3 : 0);
      w.rc = s.rollCentre || 0.1;
      const Fs = this.mass * G * (w.front ? frontFrac : 1 - frontFrac) / 2;
      let x0 = Fs / w.k;
      w.preload = 0;
      if (x0 > w.travel * 0.6) { w.preload = Fs - w.k * w.travel * 0.45; x0 = w.travel * 0.45; }
      // mount point: wheel centre at ride height + remaining travel
      w.mount = [w.def.pos[0], w.def.pos[1] + w.travel - x0 + t.rideHeight, w.def.pos[2]];
      w.x = x0;
      w.tyre.spec = { ...spec.tyre, mu: spec.tyre.mu * t.grip * (1 + 0.04 * (up.tyres || 0)) };
    }
    this.brakeTorque = spec.brakes.torque * t.brakePower * (1 + 0.06 * (up.brakes || 0));
    this.engine.powerScale = t.power * (1 + 0.05 * (up.speed || 0));
    this.engine.auto = t.autoGears;
  }

  // controls: { throttle 0..1, brake 0..1, steer -1..1 (right +), handbrake 0..1, shiftUp, shiftDown }
  step(dt, c) {
    const spec = this.spec, t = this.tune;
    this.readState(dt);
    const v = this.speed, vAbs = Math.abs(v);
    // ---- reverse: hold brake when stopped
    let throttle = c.throttle, brake = c.brake;
    if (!this.reverse && vAbs < 0.6 && c.brake > 0.3 && c.throttle < 0.05) { this.revTimer += dt; if (this.revTimer > 0.35) { this.reverse = true; this.revTimer = 0; } }
    else if (this.reverse && (c.throttle > 0.1 && vAbs < 1.0 || v > 1.5)) { this.reverse = false; }
    else if (!(c.brake > 0.3)) this.revTimer = 0;
    if (this.reverse) { throttle = c.brake; brake = c.throttle; }
    if (c.shiftUp) this.engine.shift(1);
    if (c.shiftDown) this.engine.shift(-1);
    // ---- steering: less lock at speed, smooth rate, Ackermann
    const maxS = spec.steer.max * t.steerMax / (1 + spec.steer.speedFalloff * t.steerFalloff * vAbs * vAbs * 0.5);
    const target = -c.steer * maxS; // positive angle = turn left (around +y)
    const rate = spec.steer.rate * (c.steer === 0 ? 1.4 : 1) * dt;
    this.steer += Math.max(-rate, Math.min(rate, target - this.steer));
    const wbase = spec.wheels[0].pos[2] - spec.wheels[2].pos[2];
    const track = Math.abs(spec.wheels[0].pos[0] - spec.wheels[1].pos[0]);
    for (const w of this.wheels) {
      if (!w.front) { w.steer = 0; continue; }
      let a = this.steer;
      if (Math.abs(a) > 1e-4) {
        const R = wbase / Math.tan(Math.abs(a));
        const inner = (a > 0) === w.left; // turning left: left wheel is the inner one
        const ack = Math.atan(wbase / (R + (inner ? -track / 2 : track / 2))) * Math.sign(a);
        a = a + (ack - a) * spec.steer.ackermann;
      }
      w.steer = a + w.damage * 0.06 * (w.left ? 1 : -1);
    }
    // ---- suspension + contacts
    const contacts = [];
    for (const w of this.wheels) {
      const hit = suspend(this, w, dt, w);
      contacts.push(hit);
    }
    // anti-roll bars (per axle)
    for (let a = 0; a < 4; a += 2) {
      const L = this.wheels[a], Rw = this.wheels[a + 1];
      if (!L.arb) continue;
      const d = (L.contact ? L.x : 0) - (Rw.contact ? Rw.x : 0);
      if (L.contact) L.F += L.arb * d;
      if (Rw.contact) Rw.F -= Rw.arb * d;
    }
    // ---- tyre frames, contact velocities, surfaces
    const up = this.up;
    for (const w of this.wheels) {
      if (!w.contact) { w.load = 0; continue; }
      w.load = Math.max(0, w.F);
      const hit = w.hit;
      const n = hit.normal;
      // wheel heading: chassis forward turned by the steering angle around chassis up
      const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
      const hf = [this.fwd[0] * cs - this.right[0] * sn, this.fwd[1] * cs - this.right[1] * sn, this.fwd[2] * cs - this.right[2] * sn];
      // project onto the contact plane
      const dn = v3.dot(hf, n);
      w.f = v3.norm([hf[0] - n[0] * dn, hf[1] - n[1] * dn, hf[2] - n[2] * dn]);
      w.sd = v3.cross(n, w.f, [0, 0, 0]); // points to the left of the wheel
      w.p = hit.point;
      const vel = this.velAt(hit.point, [0, 0, 0]);
      w.vLong = v3.dot(vel, w.f); w.vLat = v3.dot(vel, w.sd);
      w.surf = this.surface(hit.point[0], hit.point[1], hit.point[2], hit.kind);
      w.grip = this.grip(w.surf, spec.tyre.offroad);
    }
    // ---- drivetrain + wheel spin in sub-steps
    const h = dt / SUB;
    const bias = t.brakeBias;
    let tcSlip = 0;
    for (const w of this.wheels) { w.sfx = 0; w.sfy = 0; }
    for (let s = 0; s < SUB; s++) {
      // driven wheel speed (average)
      let om = 0;
      for (const k of this.drivenIdx) om += this.wheels[k].omega;
      om /= this.drivenIdx.length;
      const thrEff = throttle * (t.tc ? this.tcCut : 1);
      const e = this.engine.update(h, thrEff, om, vAbs, this.reverse, brake);
      const share = 1 / this.drivenIdx.length;
      for (const w of this.wheels) {
        const tDrive = w.driven ? e.torque * share : 0;
        const iEff = w.I + (w.driven ? e.inertia * share : 0);
        let fx = 0, fy = 0;
        if (w.contact && w.load > 0) {
          [fx, fy] = w.tyre.forces(w.vLong, w.vLat, w.omega, w.load, w.grip, h);
          // rolling resistance and soft-ground drag
          const rr = w.grip.rr * w.load + w.grip.sink * w.load * Math.min(1, Math.abs(w.vLong));
          fx -= Math.sign(w.vLong) * Math.min(Math.abs(w.vLong) * 50, rr);
        }
        let torque = tDrive - fx * w.r;
        w.omega += torque / iEff * h;
        // brakes (ABS releases a locking wheel)
        let tb = this.brakeTorque * brake * (w.front ? bias : 1 - bias) / 2;
        if (t.abs && brake > 0.1 && w.contact && Math.abs(w.vLong) > 2) {
          const st = this.absState;
          if (w.tyre.slipRatio < -0.14) st[w.idx] = Math.max(0.15, st[w.idx] - h * 18); else st[w.idx] = Math.min(1, st[w.idx] + h * 10);
          tb *= st[w.idx];
        }
        if (!w.front) tb += spec.brakes.handbrake * (c.handbrake || 0);
        const dOm = tb / iEff * h;
        if (Math.abs(w.omega) <= dOm) w.omega = 0; else w.omega -= Math.sign(w.omega) * dOm;
        w.sfx += fx; w.sfy += fy;
        if (w.driven && w.contact) tcSlip = Math.max(tcSlip, this.reverse ? -w.tyre.slipRatio : w.tyre.slipRatio);
      }
      // differentials: pull the wheels on each axle (and the axles) towards the same speed
      const lock = this.tune.diffLock;
      for (let a = 0; a < 4; a += 2) {
        const L = this.wheels[a], Rw = this.wheels[a + 1];
        if (!L.driven) continue;
        const k = spec.drive.diff === 'spool' ? 1 : (spec.drive.rearLock && !L.front && this.diffLocked) ? 1 : lock * 0.25;
        if (k > 0) { const avg = (L.omega + Rw.omega) / 2; L.omega += (avg - L.omega) * k; Rw.omega += (avg - Rw.omega) * k; }
      }
      if (spec.drive.layout === 'AWD' && spec.drive.centre === 'locked') {
        const f = (this.wheels[0].omega + this.wheels[1].omega) / 2, r = (this.wheels[2].omega + this.wheels[3].omega) / 2;
        const avg = (f + r) / 2, df = avg - f, dr = avg - r;
        this.wheels[0].omega += df; this.wheels[1].omega += df; this.wheels[2].omega += dr; this.wheels[3].omega += dr;
      }
    }
    // traction control: cut power while the driven wheels spin
    // (proportional: trims power to hold the slip near the tyre's best grip instead of chopping it)
    const tcTarget = 0.1;
    if (tcSlip > tcTarget && vAbs > 0.3) this.tcCut = Math.max(0.3, this.tcCut - (tcSlip - tcTarget) * dt * 30); else this.tcCut = Math.min(1, this.tcCut + dt * 3);
    // ---- apply forces
    for (const w of this.wheels) {
      w.spin += w.omega * dt;
      if (!w.contact) { w.fx = w.fy = 0; continue; }
      const fx = w.sfx / SUB, fy = w.sfy / SUB;
      w.fx = fx; w.fy = fy;
      const p = w.p, n = w.hit.normal;
      // suspension along the chassis up axis at the contact point
      const F = w.load * dt;
      this.impulse(up[0] * F, up[1] * F, up[2] * F, p[0], p[1], p[2]);
      // longitudinal force at the contact patch; lateral force at roll-centre height
      this.impulse(w.f[0] * fx * dt, w.f[1] * fx * dt, w.f[2] * fx * dt, p[0], p[1], p[2]);
      const rc = w.rc;
      this.impulse(w.sd[0] * fy * dt, w.sd[1] * fy * dt, w.sd[2] * fy * dt, p[0] + up[0] * rc, p[1] + up[1] * rc, p[2] + up[2] * rc);
      // push back on whatever we are standing on (other cars)
      if (w.hit.kind === 'vehicle' && w.hit.owner && w.hit.owner !== this) w.hit.owner.impulse(-up[0] * F, -up[1] * F, -up[2] * F, p[0], p[1], p[2]);
    }
    // ---- aero, water
    const a = spec.aero;
    this.aero(dt, a.cd, a.area, a.clF * t.downforce, a.clR * t.downforce, spec.wheels[0].pos[2], spec.wheels[2].pos[2]);
    if (this.inWater > 0.6) this.engine.stalled = true;
    this.brakeLight = brake > 0.05 ? 1 : 0;
    this.airborne = this.wheels.every((w) => !w.contact);
    this.airTime = this.airborne ? this.airTime + dt : 0;
  }

  get rpm() { return this.engine.rpm; }
  get gear() { return this.reverse ? -1 : this.engine.gear; }

  telemetry() {
    return {
      speed: this.speed, rpm: this.engine.rpm, gear: this.gear, clutch: this.engine.clutch, throttle: this.engine.throttle, tc: this.tcCut,
      g: this.lastAccel, damage: this.damage,
      wheels: this.wheels.map((w) => ({ load: w.load, x: w.x, slip: w.tyre.slipRatio, angle: w.tyre.slipAngle, fx: w.fx, fy: w.fy, surface: w.surf ? w.surf.surface : -1, omega: w.omega, contact: w.contact, steer: w.steer })),
    };
  }
}
