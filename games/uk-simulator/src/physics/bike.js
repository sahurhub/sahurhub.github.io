// UK Simulator - two-wheeler physics: pushbike, e-bike, Kukirin e-scooters, motor scooter, dirt bike.
// The rider is part of the rigid body (standing riders sit higher). A rider "balance controller"
// steers the front wheel like a real rider: to lean into a turn it first steers the other way
// (counter-steering), then holds the steering angle that balances the lean at that speed.
// Tyres push sideways from slip angle and from camber (lean). Throttle and brakes pitch the bike
// (wheelies, stoppies), the rider can shift weight, bunny hop, crash and fall off.
import { VehicleBody, suspend, v3, G } from './vehicle-base.js';
import { Tyre } from './tyre.js';
import { Engine, CvtEngine, Motor, Battery, Rider } from './drivetrain.js';

const SUB = 4;

export function defaultBikeTune(spec) {
  return { power: 1, grip: 1, springF: 1, springR: 1, damper: 1, brakePower: 1, assist: spec.kind === 'escooter' ? 0.55 : 0.45, steerGain: 1, wobble: 1, battery: 1, autoGears: true, mass: 0 };
}

export class Bike extends VehicleBody {
  constructor(spec, physics, world, pose, tune = defaultBikeTune(spec), upgrades = {}) {
    super(spec, physics, world, { ...pose, y: pose.y + 0.1 }, tune);
    this.upgrades = upgrades;
    const pw = tune.power * (1 + 0.05 * (upgrades.speed || 0));
    if (spec.engine && spec.engine.kind === 'cvt') this.engine = new CvtEngine(spec.engine, { power: pw });
    else if (spec.engine) { this.engine = new Engine(spec.engine, spec.gearbox, { power: pw }); this.engine.auto = tune.autoGears; }
    if (spec.battery) this.battery = new Battery(spec.battery, { battery: tune.battery * (1 + 0.15 * (upgrades.battery || 0)) });
    if (spec.motor) { this.motor = new Motor(spec.motor, this.battery, { power: pw }); this.motor.speedUp = upgrades.speed || 0; }
    if (spec.pedal) this.rider = new Rider(spec.rider);
    this.wheels = spec.wheels.map((wd, k) => this.makeWheel(wd, k));
    this.steer = 0; this.lean = 0; this.leanRate = 0; this.pitch = 0;
    this.crashed = false; this.crashReason = ''; this.crashTime = 0;
    this.wobble = 0; this.wobblePhase = 0; this.weight = 0; this.footDown = 1;
    this.hopCooldown = 0; this.slideTime = 0;
    this.brakeLight = 0;
    this.applyTune();
  }

  makeWheel(wd, k) {
    const spec = this.spec;
    const s = wd.front ? spec.susp.front : spec.susp.rear;
    const camber = spec.kind === 'escooter' ? 0.55 : spec.pedal ? 0.75 : 0.95;
    const tyre = new Tyre(wd.r, wd.w, spec.tyre, { loadNominal: spec.mass * G / 2, camberStiff: camber, peakAngle: 0.14, relaxLat: 0.25 });
    const wm = spec.pedal ? 1.6 : spec.kind === 'escooter' ? (wd.front && spec.motor.wheel !== 'both' ? 2.2 : 4.5) : 7;
    return { def: wd, idx: k, front: wd.front, s, tyre, r: wd.r, I: 0.8 * wm * wd.r * wd.r, omega: 0, spin: 0, x: 0, xv: 0, len: 0, load: 0, contact: false, mount: [0, 0, 0], travel: s.travel, k: s.k, preload: 0, bump: s.bump, rebound: s.rebound, fx: 0, fy: 0, steer: 0 };
  }

  applyTune() {
    const t = this.tune, spec = this.spec, up = this.upgrades;
    this.extraMass = t.mass || 0;
    this.baseCom = spec.com.slice();
    this.setMass(this.baseCom);
    const zF = spec.wheels[0].pos[2], zR = spec.wheels[1].pos[2], wb = zF - zR;
    const frontFrac = (spec.com[2] - zR) / wb;
    for (const w of this.wheels) {
      const s = w.s;
      w.k = s.k * (w.front ? t.springF : t.springR) * (1 + 0.08 * (up.suspension || 0));
      w.bump = s.bump * t.damper; w.rebound = s.rebound * t.damper;
      w.travel = s.travel * (1 + 0.1 * (up.suspension || 0));
      const Fs = this.mass * G * (w.front ? frontFrac : 1 - frontFrac);
      let x0 = Fs / w.k;
      w.preload = 0;
      if (x0 > w.travel * 0.55) { w.preload = Fs - w.k * w.travel * 0.4; x0 = w.travel * 0.4; }
      w.mount = [0, w.def.pos[1] + w.travel - x0, w.def.pos[2]];
      w.x = x0;
      w.tyre.spec = { ...spec.tyre, mu: spec.tyre.mu * t.grip * (1 + 0.04 * (up.tyres || 0)) };
    }
    this.wb = wb;
    this.brakeScale = t.brakePower * (1 + 0.06 * (up.brakes || 0));
  }

  get comHeight() { return this.com[1]; }

  // controls: throttle, brake, steer (-1..1, right +), rearBrake, leanBack, leanFwd, hop (pressed), sprint
  step(dt, c) {
    const spec = this.spec, t = this.tune;
    this.readState(dt);
    const v = this.speed, vAbs = Math.abs(v);
    // lean (right +) and pitch (nose up +) from the body orientation
    this.lean = Math.atan2(-this.right[1], this.up[1]);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, this.fwd[1])));
    // turning about the forward axis lifts the left side (x is left), i.e. leans right
    this.leanRate = v3.dot(this.ang, this.fwd);
    const yawRate = v3.dot(this.ang, this.up);
    if (this.hopCooldown > 0) this.hopCooldown -= dt;
    // ---- crash checks
    if (!this.crashed) {
      const anyContact = this.wheels.some((w) => w.contact);
      if (Math.abs(this.lean) > 1.15) this.crash(vAbs > 3 ? 'You came off!' : 'You fell over');
      else if (this.pitch > 1.25) this.crash('Looped the wheelie!');
      else if (this.pitch < -1.0) this.crash('Over the handlebars!');
      else if (this.drowned) this.crash('Into the water!');
      // low side: tyres sliding while leaned over
      const sliding = this.wheels.some((w) => w.contact && w.tyre.sliding > 0.55);
      this.slideTime = sliding && Math.abs(this.lean) > 0.45 && vAbs > 4 ? this.slideTime + dt : 0;
      if (this.slideTime > 0.35) this.crash('Lost the front!');
      if (!anyContact) this.airTime += dt; else { if (this.airTime > 0.45 && (Math.abs(this.lean) > 0.65 || Math.abs(this.pitch - this.groundPitch()) > 0.9)) this.crash('Bad landing!'); this.airTime = 0; }
    } else this.crashTime += dt;
    // ---- rider weight shift (moves the centre of mass)
    const wTarget = this.crashed ? 0 : (c.leanBack || 0) - (c.leanFwd || 0);
    this.weight += (wTarget - this.weight) * Math.min(1, dt * 6);
    const shift = -this.weight * (spec.rider && spec.rider.standing ? 0.12 : 0.17);
    const comZ = this.baseCom[2] + shift, comY = this.baseCom[1] - Math.abs(this.weight) * 0.04;
    if (Math.abs(comZ - this.com[2]) > 0.004) this.setMass([0, comY, comZ]);
    // ---- balance controller -> steering angle
    // never ask for more lean than the tyres can hold on this surface (tan(lean) = grip used)
    let muNow = 2;
    for (const w of this.wheels) if (w.contact && w.grip) muNow = Math.min(muNow, w.tyre.spec.mu * w.grip.mu);
    if (muNow > 1.5) muNow = 0.8;
    const maxLean = Math.min(spec.balance.maxLean, Math.atan(muNow * 0.78));
    const leanAllow = maxLean * Math.max(0.15, Math.min(1, (vAbs - 0.8) / 7));
    // walking pace: the rider just points the bars where they want to go (and keeps it upright);
    // riding speed: the rider balances by steering (a quick, small counter-steer to lean in)
    const blend = Math.max(0, Math.min(1, (vAbs - 2.0) / 4.0));
    const Lw = this.wb, hc = this.comHeight;
    const vv = Math.max(vAbs, 1.5);
    const direct = c.steer * spec.steer.max * 0.85;
    const directLean = Math.max(-maxLean, Math.min(maxLean, Math.atan(vv * vv * Math.tan(direct) / (G * Lw)) * 0.9));
    const target = this.crashed ? 0 : (c.steer * leanAllow) * blend + directLean * (1 - blend);
    let steer = 0;
    if (!this.crashed) {
      const eq = Math.atan(Lw * G * Math.tan(this.lean) / (vv * vv));
      const wn2 = 14 * t.steerGain, zeta = 5.0 * t.steerGain;
      const kp = wn2 * hc * Lw / Math.max(vv * vv, 4), kd = zeta * hc * Lw / Math.max(vv * vv, 4);
      const correction = Math.max(-0.4, Math.min(0.4, kp * (this.lean - target) + kd * this.leanRate));
      const balance = eq + correction;
      steer = balance * blend + direct * (1 - blend);
      if (v < -0.3) steer = -direct * 0.5; // going backwards: wheel the other way
      // speed wobble on e-scooters at high speed
      const wob = spec.balance.wobble;
      if (wob) {
        // grows above the wobble speed, mostly kicked off by bumps (potholes, kerbs, drain
        // covers); calms down when you brake or slow down
        const over = (vAbs - wob.speed) / wob.speed;
        const bumps = this.wheels.reduce((s, w) => s + Math.max(0, Math.abs(w.xv) - 0.25), 0);
        const grow = over > 0 ? Math.max(0, over - 0.1) * 1.6 * wob.gain * t.wobble + bumps * over * 4 * t.wobble : -1.5;
        this.wobble = Math.max(0, Math.min(0.25, this.wobble + (grow - (c.brake > 0.2 ? 3 : 0) - 0.5) * dt * 0.25));
        this.wobblePhase += dt * 2 * Math.PI * (6.5 + vAbs * 0.05);
        steer += Math.sin(this.wobblePhase) * this.wobble;
        if (this.wobble > 0.2 && vAbs > wob.speed) this.crash('Speed wobble!');
      }
    }
    const maxSteer = spec.steer.max;
    steer = Math.max(-maxSteer, Math.min(maxSteer, steer));
    const rate = spec.steer.rate * dt;
    this.steer += Math.max(-rate, Math.min(rate, -steer - this.steer)); // positive steer angle = left (around +y)
    this.wheels[0].steer = this.steer;
    // ---- stabilising "rider" torque: strong when stopped (feet down), gentle assist when moving
    const slow = Math.max(0, Math.min(1, (3.0 - vAbs) / 2.5));
    this.footDown = this.crashed ? 0 : (vAbs < 1.0 && c.throttle < 0.1 ? 1 : 0);
    const assist = this.crashed ? 0 : Math.max(t.assist * 0.6, slow) * (this.footDown ? 2.5 : 1);
    if (assist > 0) {
      const m = this.mass, h = this.comHeight;
      // + at walking pace the rider also leans their body into the turn against the outward pull
      const latRight = -v * yawRate;
      const tq = assist * m * G * h * (2.2 * (target - this.lean) - 0.6 * this.leanRate) + m * h * latRight * (1 - blend) * 0.6;
      const f = this.fwd;
      this.body.applyTorqueImpulse({ x: f[0] * tq * dt, y: f[1] * tq * dt, z: f[2] * tq * dt }, true);
    }
    // ---- suspension + contacts
    for (const w of this.wheels) suspend(this, w, dt, w);
    const up = this.up;
    for (const w of this.wheels) {
      if (!w.contact) { w.load = 0; continue; }
      w.load = Math.max(0, w.F);
      const n = w.hit.normal;
      const cs = Math.cos(w.steer || 0), sn = Math.sin(w.steer || 0);
      const hf = [this.fwd[0] * cs - this.right[0] * sn, this.fwd[1] * cs - this.right[1] * sn, this.fwd[2] * cs - this.right[2] * sn];
      const dn = v3.dot(hf, n);
      w.f = v3.norm([hf[0] - n[0] * dn, hf[1] - n[1] * dn, hf[2] - n[2] * dn]);
      w.sd = v3.cross(n, w.f, [0, 0, 0]);
      // contact patch moves sideways as the tyre leans
      w.p = w.hit.point;
      const vel = this.velAt(w.p, [0, 0, 0]);
      w.vLong = v3.dot(vel, w.f); w.vLat = v3.dot(vel, w.sd);
      w.surf = this.surface(w.p[0], w.p[1], w.p[2], w.hit.kind);
      w.grip = this.grip(w.surf, spec.tyre.offroad);
      w.camber = -(this.lean - Math.atan2(-v3.dot(n, this.right), v3.dot(n, this.up)));
    }
    this.kerbCheck(dt);
    // ---- power: pedals, motor, engine
    const front = this.wheels[0], rear = this.wheels[1];
    let throttle = this.crashed ? 0 : c.throttle;
    const brake = this.crashed ? 0.6 : c.brake;
    // rider reflexes (part of the balance help): ease the front brake when the back wheel
    // lifts (stoppie / going over the bars) and ease the throttle when the front lifts,
    // unless you are deliberately shifting your weight for a wheelie or stoppie
    const statF = this.mass * G * (this.baseCom[2] - spec.wheels[1].pos[2]) / this.wb, statR = this.mass * G - statF;
    let frontBrakeScale = 1;
    if (t.assist > 0 && !this.crashed) {
      if (brake > 0.05 && !(c.leanFwd > 0.5)) { const k = rear.contact ? rear.load / (statR * 0.3) : 0; frontBrakeScale = Math.max(0.12, Math.min(1, k)); }
      if (throttle > 0.05 && !(c.leanBack > 0.5)) { const k = front.contact ? front.load / (statF * 0.12) : 0; throttle *= Math.max(0.1, Math.min(1, k)); }
      // and roll off when the back tyre spins up
      const rs = rear.contact ? rear.tyre.slipRatio : 0;
      if (rs > 0.15 && vAbs > 0.3) this.spinCut = Math.max(0.2, (this.spinCut ?? 1) - (rs - 0.15) * dt * 20); else this.spinCut = Math.min(1, (this.spinCut ?? 1) + dt * 2.5);
      throttle *= this.spinCut;
    }
    const h = dt / SUB;
    for (const w of this.wheels) { w.sfx = 0; w.sfy = 0; }
    let pedalForce = 0;
    if (this.rider) pedalForce = this.rider.update(dt, throttle, vAbs, c.sprint);
    for (let s = 0; s < SUB; s++) {
      let tRear = pedalForce * rear.r, tFront = 0;
      if (this.motor) {
        const om = this.spec.motor.wheel === 'both' ? (front.omega + rear.omega) / 2 : rear.omega;
        const tm = this.motor.update(h, throttle, om, rear.r, brake, this.rider ? this.rider.watts : 0);
        if (this.spec.motor.wheel === 'both') { tRear += tm / 2; tFront += tm / 2; } else tRear += tm;
      }
      if (this.engine) {
        const e = this.engine.update(h, throttle, rear.omega, vAbs, false, brake);
        tRear += e.torque;
        rear.extraI = e.inertia;
      }
      for (const w of this.wheels) {
        let fx = 0, fy = 0;
        if (w.contact && w.load > 0) {
          [fx, fy] = w.tyre.forces(w.vLong, w.vLat, w.omega, w.load, w.grip, h, w.camber);
          const rr = w.grip.rr * w.load + w.grip.sink * w.load * Math.min(1, Math.abs(w.vLong));
          fx -= Math.sign(w.vLong) * Math.min(Math.abs(w.vLong) * 40, rr);
        }
        const td = w.front ? tFront : tRear;
        const iEff = w.I + (w.front ? 0 : rear.extraI || 0);
        const before = w.omega;
        w.omega += (td - fx * w.r) / iEff * h;
        let tb = (w.front ? spec.brakes.front * brake * frontBrakeScale : spec.brakes.rear * Math.max(brake * 0.7, c.rearBrake || 0)) * this.brakeScale;
        if (spec.brakes.abs && brake > 0.1 && w.tyre.slipRatio < -0.15 && Math.abs(w.vLong) > 2) tb *= 0.3;
        const dOm = tb / iEff * h;
        if (Math.abs(w.omega) <= dOm) w.omega = 0; else w.omega -= Math.sign(w.omega) * dOm;
        // gyroscopic / reaction: speeding up or braking a wheel in the air pitches the bike
        if (!w.contact) { const tq = (w.omega - before) * iEff * 0.5; const r = this.right; this.body.applyTorqueImpulse({ x: r[0] * tq, y: r[1] * tq, z: r[2] * tq }, true); }
        w.sfx += fx; w.sfy += fy;
      }
    }
    for (const w of this.wheels) {
      w.spin += w.omega * dt;
      if (!w.contact) { w.fx = w.fy = 0; continue; }
      const fx = w.sfx / SUB, fy = w.sfy / SUB;
      w.fx = fx; w.fy = fy;
      const p = w.p, F = w.load * dt;
      this.impulse(up[0] * F, up[1] * F, up[2] * F, p[0], p[1], p[2]);
      this.impulse(w.f[0] * fx * dt, w.f[1] * fx * dt, w.f[2] * fx * dt, p[0], p[1], p[2]);
      this.impulse(w.sd[0] * fy * dt, w.sd[1] * fy * dt, w.sd[2] * fy * dt, p[0], p[1], p[2]);
    }
    // ---- air control: rider shifts weight to pitch the bike in the air
    const air = !front.contact && !rear.contact;
    if (air && !this.crashed) {
      // torque about the right-pointing axis lifts the nose (lean back = weight > 0)
      const r = this.right, k = this.mass * 1.4 * this.weight * dt * 9;
      this.body.applyTorqueImpulse({ x: r[0] * k, y: r[1] * k, z: r[2] * k }, true);
    }
    // ---- bunny hop / jump
    if (c.hop && !this.crashed && front.contact && rear.contact && this.hopCooldown <= 0) {
      const jv = spec.kind === 'escooter' ? 1.9 : spec.pedal ? 2.3 : 2.6;
      this.impulse(up[0] * this.mass * jv, up[1] * this.mass * jv, up[2] * this.mass * jv, this.comW[0], this.comW[1], this.comW[2]);
      const r = this.right, k = this.mass * 0.25;
      this.body.applyTorqueImpulse({ x: r[0] * k, y: r[1] * k, z: r[2] * k }, true);
      this.hopCooldown = 0.6;
    }
    // ---- yaw damping (tyre self-aligning; keeps low-speed handling calm)
    if (!this.crashed && (front.contact || rear.contact)) {
      const yd = -yawRate * this.mass * 0.03 * dt;
      this.body.applyTorqueImpulse({ x: up[0] * yd, y: up[1] * yd, z: up[2] * yd }, true);
    }
    const a = spec.aero;
    this.aero(dt, a.cd, a.area);
    this.brakeLight = brake > 0.05 ? 1 : 0;
    this.airborne = air;
  }

  groundPitch() {
    // slope under the bike (to judge landings)
    const f = this.fwd;
    const h1 = this.world.heightAt(this.pos[0] + f[0], this.pos[2] + f[2]), h0 = this.world.heightAt(this.pos[0] - f[0], this.pos[2] - f[2]);
    return Math.atan2(h1 - h0, 2);
  }

  // small wheels and kerbs: a step taller than about half the wheel radius stops the wheel dead
  kerbCheck(dt) {
    if (this.crashed) return;
    const v = this.speed;
    if (Math.abs(v) < 1.2) return;
    for (const w of this.wheels) {
      if (!w.contact) continue;
      const dir = Math.sign(v);
      const ax = w.p[0] + w.f[0] * w.r * 0.95 * dir, az = w.p[2] + w.f[2] * w.r * 0.95 * dir;
      const top = w.p[1] + w.r * 1.2;
      const hit = this.probe(ax, top, az, 0, -1, 0, w.r * 1.5);
      if (!hit) continue;
      const step = hit.point[1] - w.p[1];
      if (step > w.r * 0.55 && step < 0.6) {
        const vAbs = Math.abs(v);
        // stop the wheel hard; pitch forward
        const J = -this.mass * v * 0.55;
        this.impulse(w.f[0] * J, w.f[1] * J, w.f[2] * J, w.p[0], w.p[1] + w.r, w.p[2]);
        if (vAbs > (this.spec.pedal ? 3.5 : 2.6)) this.crash(w.front ? 'Kerb strike!' : 'Back wheel hit the kerb');
        return;
      }
    }
  }

  crash(reason) {
    if (this.crashed) return;
    this.crashed = true; this.crashReason = reason; this.crashTime = 0; this.wobble = 0;
    if (this.onCrash) this.onCrash(reason);
  }

  recover(x, y, z, heading) {
    this.reset(x, y + 0.2, z, heading);
    this.crashed = false; this.crashReason = ''; this.slideTime = 0; this.airTime = 0; this.wobble = 0; this.steer = 0;
    for (const w of this.wheels) { w.omega = 0; w.tyre.reset(); }
  }

  get rpm() { return this.engine ? this.engine.rpm : this.motor ? Math.abs(this.wheels[1].omega) * 60 / (2 * Math.PI) : this.rider ? this.rider.cadence : 0; }
  get gear() { return this.engine ? this.engine.gear : this.motor ? this.motor.mode : 0; }

  telemetry() {
    return {
      speed: this.speed, rpm: this.rpm, gear: this.gear, lean: this.lean, pitch: this.pitch, steer: this.steer, wobble: this.wobble, g: this.lastAccel, damage: this.damage,
      battery: this.battery ? this.battery.charge : null, watts: this.motor ? this.motor.watts : this.rider ? this.rider.watts : 0, stamina: this.rider ? this.rider.stamina : null,
      wheels: this.wheels.map((w) => ({ load: w.load, x: w.x, slip: w.tyre.slipRatio, angle: w.tyre.slipAngle, fx: w.fx, fy: w.fy, surface: w.surf ? w.surf.surface : -1, omega: w.omega, contact: w.contact, camber: w.camber })),
    };
  }
}
