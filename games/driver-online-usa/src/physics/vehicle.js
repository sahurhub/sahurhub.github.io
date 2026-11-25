// Driver Online USA - car physics ("raycast vehicle" on a Rapier rigid body).
// Each wheel is a ray from the body down to the ground with a spring and damper (suspension).
// Tyres push the car with a grip curve that peaks at a small slide angle and drops off a bit
// after it, so a car that is already sliding keeps sliding until you catch it (sim-cade).
// The handbrake locks the rear wheels and cuts their side grip, which makes starting a drift easy.
// Engine torque curve + gearbox (automatic or manual) + brakes + air drag.
//
// Car space: forward = -Z, right = +X, up = +Y; the body's origin is the model's origin
// (on the ground, between the wheels).
import { RAPIER, GROUPS } from './physics.js';
import { clamp } from '../core/util.js';

const RHO = 1.2;
const L_UP = 0.22;          // how far above the wheel centre the suspension ray starts
const SAG = 0.075;          // how much the springs compress under the car's weight

export function deriveSpec(spec) {
  const s = { ...spec };
  s.mass = s.mass || 1500;
  s.powerW = (s.powerKw || 200) * 1000;
  s.torque = s.torqueNm || 350;
  s.idle = s.idleRpm || 850;
  s.redline = s.redline || 6800;
  s.maxRpm = s.maxRpm || s.redline + 200;
  s.gears = s.gears && s.gears.length ? s.gears : [3.6, 2.2, 1.5, 1.15, 0.92, 0.75];
  s.final = s.final || 3.5;
  s.reverseRatio = s.reverse || 3.3;
  s.drive = s.drive || 'rwd';
  s.topSpeed = s.topSpeed || 60;          // m/s
  s.grip = s.grip || 1;
  s.brake = s.brake || 1;
  s.steerMax = ((s.steer || 34) * Math.PI) / 180;
  s.cgHeight = s.cgHeight || 0.5;
  s.crr = 0.013;
  // drag so the car tops out at its real top speed at full power
  s.cdA = Math.max(0.35, (s.powerW * 0.88 / s.topSpeed - s.crr * s.mass * 9.81) / (0.5 * RHO * s.topSpeed ** 2));
  s.clA = s.downforce || 0.25;
  return s;
}

/** Engine torque (Nm) at rpm, full throttle. */
function torqueAt(s, rpm) {
  const t = clamp(rpm / s.redline, 0, 1.1);
  let f = t < 0.55 ? 0.62 + (0.38 * t) / 0.55 : 1 - 0.5 * ((t - 0.55) / 0.45) ** 2;
  let tq = s.torque * f;
  const w = (Math.max(rpm, 1) * Math.PI) / 30;
  tq = Math.min(tq, s.powerW / w); // never more than the power figure
  return tq;
}

/** Side grip curve: 0 at no slide, peak ~1 at about 11 degrees, ~0.8 when sliding sideways. */
function lateralCurve(a) {
  return Math.sin(1.5 * Math.atan(9 * a));
}

const v3 = () => ({ x: 0, y: 0, z: 0 });
function rot(q, x, y, z, out) {
  // rotate (x,y,z) by quaternion q
  const ix = q.w * x + q.y * z - q.z * y, iy = q.w * y + q.z * x - q.x * z, iz = q.w * z + q.x * y - q.y * x, iw = -q.x * x - q.y * y - q.z * z;
  out.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
  out.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
  out.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
  return out;
}
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export class Vehicle {
  /**
   * geo = { wheels: [{ key: 'FL'|'FR'|'RL'|'RR', x, y, z, r }], box: { minX, maxX, minY, maxY, minZ, maxZ } }
   */
  constructor(physics, spec, geo, pose) {
    this.ph = physics;
    this.spec = deriveSpec(spec);
    const s = this.spec;
    this.geo = geo;
    const b = geo.box;
    const len = b.maxZ - b.minZ, wid = b.maxX - b.minX;
    const wheelBottom = Math.min(...geo.wheels.map((w) => w.y - w.r));
    const bottom = wheelBottom + 0.2, top = Math.min(b.maxY, bottom + 1.25);
    const hx = wid / 2 - 0.04, hy = Math.max(0.25, (top - bottom) / 2), hz = len / 2 - 0.05;
    this.halfExtents = { x: hx, y: hy, z: hz };
    this.colliderY = (top + bottom) / 2;
    this.colliderZ = (b.maxZ + b.minZ) / 2;

    const body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pose.x, pose.y, pose.z)
        .setRotation(pose.q || { x: 0, y: Math.sin((pose.h || 0) / 2), z: 0, w: Math.cos((pose.h || 0) / 2) })
        .setLinearDamping(0.01).setAngularDamping(0.25).setCcdEnabled(true).setCanSleep(false));
    const col = physics.world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(hx - 0.1, hy - 0.1, hz - 0.1, 0.1)
        .setTranslation(0, this.colliderY, this.colliderZ)
        .setDensity(0).setFriction(0.25).setRestitution(0.08)
        .setCollisionGroups(GROUPS.car)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(s.mass * 6),
      body);
    physics.tag(col, { kind: 'me' });
    // weight and how it is spread (a box, a bit concentrated toward the middle)
    const m = s.mass, L = len * 0.85, W = wid * 0.9, H = 1.2;
    const wx = geo.wheels.reduce((a, w) => a + w.x, 0) / geo.wheels.length;
    this.com = { x: wx, y: s.cgHeight, z: (geo.wheels[0].z + geo.wheels[2].z) / 2 + (s.comShift || 0) };
    body.setAdditionalMassProperties(m, this.com, { x: (m / 12) * (H * H + L * L) * 0.8, y: (m / 12) * (W * W + L * L) * 0.8, z: (m / 12) * (W * W + H * H) * 0.8 }, { x: 0, y: 0, z: 0, w: 1 }, true);
    this.body = body;
    this.col = col;

    // springs: the car rests with each wheel at its modelled height
    const perWheel = (m * 9.81) / 4;
    this.k = (perWheel / SAG) * (s.springs || 1); // stiffer springs for cars with lots of downforce
    const crit = 2 * Math.sqrt(this.k * (m / 4));
    this.cBump = crit * 0.32;
    this.cRebound = crit * 0.5;
    this.antiRoll = this.k * 0.55;
    this.wheels = geo.wheels.map((w) => ({
      key: w.key, front: w.key[0] === 'F', left: w.key[1] === 'L', r: w.r,
      hp: { x: w.x, y: w.y + L_UP, z: w.z }, // suspension top point (car space)
      s0: L_UP + SAG, len: L_UP + SAG, comp: 0, prevComp: 0,
      grounded: false, spin: 0, omega: 0, steer: 0, slip: 0, slide: 0, load: 0,
      driven: s.drive === 'awd' || (s.drive === 'fwd' ? w.key[0] === 'F' : w.key[0] === 'R'),
      contact: v3(), normal: { x: 0, y: 1, z: 0 }, surface: 'road',
    }));
    this.nDriven = this.wheels.filter((w) => w.driven).length || 1;

    // engine and gearbox
    this.gear = 1; this.rpm = s.idle; this.shiftT = 0; this.clutch = 1;
    this.steerInput = 0; this.steerAngle = 0;
    this.throttle = 0; this.brakeIn = 0; this.handbrake = false;
    this.reverseHold = 0;
    this.manual = false;
    this.airT = 0;
    this.speed = 0; this.vLong = 0; this.slipMax = 0; this.driftAngle = 0;
    this.tmp = { a: v3(), b: v3(), c: v3(), d: v3(), e: v3(), f: v3(), g: v3(), h: v3() };
    // check the gears reach top speed before the redline
    const topGearSpeed = (s.redline * Math.PI / 30) * this.wheels[2].r / (s.gears[s.gears.length - 1] * s.final);
    if (topGearSpeed < s.topSpeed * 1.03) s.final *= topGearSpeed / (s.topSpeed * 1.03);
  }

  destroy() { this.ph.remove(this.body); this.body = null; }

  setGhost(on) { this.col.setCollisionGroups(on ? GROUPS.carGhost : GROUPS.car); }

  /** Put the car somewhere, standing still. */
  place(x, y, z, heading, q) {
    const b = this.body;
    b.setTranslation({ x, y, z }, true);
    b.setRotation(q || { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of this.wheels) { w.omega = 0; w.comp = 0; w.prevComp = 0; }
    this.gear = 1; this.rpm = this.spec.idle; this.steerAngle = 0;
  }

  /** inp = { throttle 0..1, brake 0..1, steer -1..1 (right +), handbrake, gearUp, gearDown } */
  step(dt, inp) {
    const s = this.spec, b = this.body, T = this.tmp;
    const pos = b.translation(), q = b.rotation(), lin = b.linvel(), ang = b.angvel();
    const right = rot(q, 1, 0, 0, T.a), up = rot(q, 0, 1, 0, T.b), fwd = rot(q, 0, 0, -1, T.c);
    const com = rot(q, this.com.x, this.com.y, this.com.z, T.h); com.x += pos.x; com.y += pos.y; com.z += pos.z;
    const speed = Math.hypot(lin.x, lin.y, lin.z);
    const vLong = dot(lin, fwd);
    this.speed = speed; this.vLong = vLong;

    // ---- inputs, reverse and gears ------------------------------------------------
    let throttle = clamp(inp.throttle || 0, 0, 1), brake = clamp(inp.brake || 0, 0, 1);
    if (this.gear === -1) { const t = throttle; throttle = brake; brake = t; } // in reverse, S drives and W brakes
    if (this.gear !== -1 && vLong < 0.8 && inp.brake > 0.5 && !(inp.throttle > 0.1)) {
      this.reverseHold += dt; if (this.reverseHold > 0.25) { this.gear = -1; this.reverseHold = 0; }
    } else if (this.gear === -1 && vLong > -0.8 && inp.throttle > 0.5 && !(inp.brake > 0.1)) {
      this.reverseHold += dt; if (this.reverseHold > 0.15) { this.gear = 1; this.reverseHold = 0; }
    } else this.reverseHold = 0;
    this.throttle = throttle; this.brakeIn = brake; this.handbrake = !!inp.handbrake;

    // steering gets lighter with speed, but you can always counter-steer a slide
    const rearSlide = Math.max(Math.abs(this.wheels[2].slide), Math.abs(this.wheels[3].slide));
    const speedLimit = s.steerMax / (1 + Math.max(0, Math.abs(vLong) - 4) / 20);
    const maxNow = speedLimit + (s.steerMax - speedLimit) * clamp((rearSlide - 0.12) / 0.3, 0, 1);
    const target = clamp(inp.steer || 0, -1, 1);
    const rate = Math.abs(target) > Math.abs(this.steerInput) && Math.sign(target) === Math.sign(this.steerInput || target) ? 3.2 : 6;
    this.steerInput += clamp(target - this.steerInput, -rate * dt, rate * dt);
    this.steerAngle = this.steerInput * maxNow;

    // ---- engine ---------------------------------------------------------------------
    this.shiftT = Math.max(0, this.shiftT - dt);
    const nG = s.gears.length;
    const ratio = this.gear === -1 ? s.reverseRatio * s.final : this.gear > 0 ? s.gears[this.gear - 1] * s.final : 0;
    const rDrive = this.wheels.find((w) => w.driven).r;
    // engine speed from the driven wheels (they may be spinning faster than the car moves)
    let wheelOmega = 0; for (const w of this.wheels) if (w.driven) wheelOmega += Math.abs(w.omega); wheelOmega /= this.nDriven;
    const rpmWheels = (wheelOmega * ratio * 30) / Math.PI;
    let rpm;
    if (ratio === 0) rpm = s.idle + throttle * (s.redline - s.idle) * 0.9;
    else if (rpmWheels < s.idle * 1.6) rpm = Math.max(s.idle, rpmWheels) + throttle * (s.redline * 0.42 - s.idle) * clamp(1 - rpmWheels / (s.idle * 1.6), 0, 1);
    else rpm = rpmWheels;
    this.rpm += (Math.min(rpm, s.maxRpm) - this.rpm) * clamp(dt * 18, 0, 1);
    const limiter = this.rpm >= s.maxRpm - 30;
    let engineTq = this.shiftT > 0 || limiter ? 0 : torqueAt(s, Math.max(this.rpm, s.idle)) * throttle;
    // engine braking when off the throttle
    if (throttle < 0.05 && ratio !== 0 && this.rpm > s.idle * 1.2) engineTq = -s.torque * 0.12 * (this.rpm / s.redline);
    let driveForce = (engineTq * ratio * 0.88) / rDrive;
    if (this.gear === -1) driveForce = -driveForce;

    // gear changes
    if (!this.manual || inp.autoOverride) {
      if (this.gear >= 1 && this.shiftT <= 0) {
        const upAt = s.redline * (0.6 + 0.3 * throttle);
        if (this.rpm > upAt && this.gear < nG && rpmWheels > s.idle * 1.5) { this.gear++; this.shiftT = 0.22; }
        else if (this.gear > 1) {
          const lower = (wheelOmega * s.gears[this.gear - 2] * s.final * 30) / Math.PI;
          if (lower < s.redline * (0.5 + 0.25 * throttle) && this.rpm < s.redline * 0.45) { this.gear--; this.shiftT = 0.18; }
        }
      }
    } else if (this.gear >= 1) {
      if (inp.gearUp && this.gear < nG) { this.gear++; this.shiftT = 0.15; }
      if (inp.gearDown && this.gear > 1) { this.gear--; this.shiftT = 0.12; }
    }

    // ---- wheels -----------------------------------------------------------------------
    const hp = T.d, vp = T.e, fw = T.f, rw = T.g;
    let grounded = 0;
    const brakeTotal = s.mass * 9.81 * 1.15 * s.brake * brake;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      rot(q, w.hp.x, w.hp.y, w.hp.z, hp); hp.x += pos.x; hp.y += pos.y; hp.z += pos.z;
      const maxLen = w.s0 + w.r;
      const hit = this.ph.castRayNormal(hp.x, hp.y, hp.z, -up.x, -up.y, -up.z, maxLen, GROUPS.wheelRay, b);
      w.steer = w.front ? this.steerAngle : 0;
      if (!hit) {
        w.grounded = false; w.len = w.s0; w.prevComp = 0; w.comp = 0; w.load = 0; w.slide = 0; w.slip = 0;
        // wheels in the air: driven ones spin up with the throttle, others slow down
        if (w.driven) w.omega += ((driveForce / this.nDriven) * w.r / 18) * dt; w.omega *= 0.99;
        if (this.handbrake && !w.front) w.omega = 0;
        w.spin += w.omega * dt;
        continue;
      }
      grounded++;
      const dist = hit.timeOfImpact !== undefined ? hit.timeOfImpact : hit.toi;
      const n = hit.normal;
      w.grounded = true;
      w.len = Math.max(0, dist - w.r);
      w.comp = w.s0 - w.len;
      w.contact.x = hp.x - up.x * dist; w.contact.y = hp.y - up.y * dist; w.contact.z = hp.z - up.z * dist;
      w.normal.x = n.x; w.normal.y = n.y; w.normal.z = n.z;
      const info = this.ph.colliderInfo.get(hit.collider.handle);
      w.surface = info ? info.kind : 'road';
      // suspension
      const compVel = (w.comp - w.prevComp) / dt;
      w.prevComp = w.comp;
      let fs = this.k * w.comp + (compVel > 0 ? this.cBump : this.cRebound) * compVel;
      if (w.len < 0.03) fs += (0.03 - w.len) * this.k * 8; // bump stop
      fs = Math.max(0, fs);
      w.load = fs;
      // velocity of the tyre's contact patch
      const rx = w.contact.x - com.x, ry = w.contact.y - com.y, rz = w.contact.z - com.z;
      vp.x = lin.x + ang.y * rz - ang.z * ry; vp.y = lin.y + ang.z * rx - ang.x * rz; vp.z = lin.z + ang.x * ry - ang.y * rx;
      // tyre directions on the ground
      const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
      fw.x = fwd.x * cs + right.x * sn; fw.y = fwd.y * cs + right.y * sn; fw.z = fwd.z * cs + right.z * sn;
      const fn = dot(fw, n); fw.x -= n.x * fn; fw.y -= n.y * fn; fw.z -= n.z * fn;
      const fl = Math.hypot(fw.x, fw.y, fw.z) || 1; fw.x /= fl; fw.y /= fl; fw.z /= fl;
      rw.x = fw.y * n.z - fw.z * n.y; rw.y = fw.z * n.x - fw.x * n.z; rw.z = fw.x * n.y - fw.y * n.x; // fw x n
      const vL = dot(vp, fw), vS = dot(vp, rw);
      const surfaceGrip = w.surface === 'ground' ? 0.78 : w.surface === 'dirt' ? 0.72 : 1;
      const mu = 1.05 * s.grip * surfaceGrip;
      const cap = mu * fs;
      // forward / backward
      let fx = 0;
      const locked = this.handbrake && !w.front;
      if (w.driven) fx += driveForce / this.nDriven;
      if (brakeTotal > 0) fx -= Math.sign(vL) * brakeTotal * (w.front ? 0.32 : 0.18) * clamp(Math.abs(vL) * 2, 0, 1);
      if (locked) fx = -Math.sign(vL) * cap * 0.85 * clamp(Math.abs(vL), 0, 1);
      fx -= vL * s.crr * fs * 0.05; // rolling resistance
      // hold still on slopes when braking / idle at a standstill
      if (Math.abs(vL) < 0.6 && (brake > 0.1 || locked || (throttle < 0.05 && Math.abs(driveForce) < 1))) fx = -vL * s.mass * 2.2 / 4;
      let spinning = false;
      if (Math.abs(fx) > cap) { fx = Math.sign(fx) * cap * 0.96; spinning = !locked; }
      // sideways
      const slideAngle = Math.atan2(vS, Math.max(Math.abs(vL), 2.5));
      w.slide = slideAngle;
      let fy = -cap * lateralCurve(Math.abs(slideAngle)) * Math.sign(slideAngle);
      if (Math.abs(vL) < 3) fy = clamp(fy - vS * s.mass * 0.6 * (1 - Math.abs(vL) / 3), -cap, cap); // no creeping when slow
      const fxShare = Math.abs(fx) / Math.max(1, cap);
      const capY = cap * Math.sqrt(Math.max(0.04, 1 - 0.72 * fxShare * fxShare));
      fy = clamp(fy, -capY, capY);
      if (locked) fy *= 0.36;
      // apply at the contact patch, raised toward the body so the car doesn't roll over too easily
      const lift = 0.55;
      const px = w.contact.x + (com.x - w.contact.x) * 0, py = w.contact.y + (com.y - w.contact.y) * lift, pz = w.contact.z + (com.z - w.contact.z) * 0;
      b.applyImpulseAtPoint({
        x: (up.x * fs + fw.x * fx + rw.x * fy) * dt,
        y: (up.y * fs + fw.y * fx + rw.y * fy) * dt,
        z: (up.z * fs + fw.z * fx + rw.z * fy) * dt,
      }, { x: px, y: py, z: pz }, true);
      // wheel spin for drawing and the engine
      const rolling = vL / w.r;
      if (locked) w.omega = 0;
      else if (spinning && w.driven) { const tgt = rolling + Math.sign(fx) * (6 + 14 * throttle); w.omega += (tgt - w.omega) * clamp(dt * 8, 0, 1); }
      else w.omega += (rolling - w.omega) * clamp(dt * 30, 0, 1);
      w.spin += w.omega * dt;
      w.slip = Math.max(Math.abs(slideAngle) > 0.18 ? (Math.abs(vS) - 1.2) / 6 : 0, spinning ? throttle * 0.8 : 0, locked && Math.abs(vL) > 2 ? 0.7 : 0, 0);
      w.slip = clamp(w.slip, 0, 1) * clamp(speed / 3, 0, 1);
    }

    // anti-roll bars: the side that is pressed down more gets pushed back up, the other side down
    for (const [a, c] of [[0, 1], [2, 3]]) {
      const wa = this.wheels[a], wc = this.wheels[c];
      if (!wa.grounded && !wc.grounded) continue;
      const f = (wa.comp - wc.comp) * this.antiRoll;
      for (const [w, sign] of [[wa, 1], [wc, -1]]) {
        rot(q, w.hp.x, w.hp.y, w.hp.z, hp); hp.x += pos.x; hp.y += pos.y; hp.z += pos.z;
        b.applyImpulseAtPoint({ x: up.x * f * sign * dt, y: up.y * f * sign * dt, z: up.z * f * sign * dt }, hp, true);
      }
    }

    // air drag and a little downforce
    const drag = 0.5 * RHO * s.cdA * speed;
    const down = 0.5 * RHO * s.clA * vLong * vLong;
    b.applyImpulse({ x: (-lin.x * drag - up.x * down) * dt, y: (-lin.y * drag - up.y * down) * dt, z: (-lin.z * drag - up.z * down) * dt }, true);

    // in the air: calm the spinning so jumps land nicely
    if (grounded === 0) { this.airT += dt; b.setAngularDamping(this.airT > 0.15 ? 1.6 : 0.25); }
    else if (this.airT) { this.airT = 0; b.setAngularDamping(0.25); }
    this.grounded = grounded;

    // a few numbers for the HUD, sounds and camera
    this.slipMax = Math.max(...this.wheels.map((w) => w.slip));
    const vS2 = dot(lin, right);
    this.driftAngle = speed > 4 ? Math.atan2(vS2, Math.abs(vLong)) : 0;
  }

  /** World transform of the body (for drawing). */
  pose() { return { p: this.body.translation(), q: this.body.rotation() }; }

  /** Upside down or on its side? */
  upsideDown() {
    const q = this.body.rotation();
    const up = rot(q, 0, 1, 0, this.tmp.a);
    return up.y < 0.35;
  }
}
