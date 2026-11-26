// Drift! - car physics ("raycast vehicle" on a Rapier rigid body), tuned for drifting.
// (Started from Driver Online USA's vehicle.js.)
// Each wheel is a ray from the body down to the ground with a spring and damper (suspension).
// Tyres push the car with a grip curve that peaks at a small slide angle and drops off after it.
// The rear tyres drop off more than the fronts, so once the tail is out it stays out while you
// hold the throttle and countersteer. The handbrake locks the rear wheels to start a drift.
// Engine torque curve + gearbox (automatic or manual) + brakes + air drag.
//
// Drift assists (each can be switched off in Settings):
//   countersteer - the front wheels turn toward where the car is going by themselves
//   angleHold    - stops the car spinning past ~55 degrees and keeps a held angle steady
//   throttleHelp - while sliding, the throttle pushes the car along and the rear grips a bit less
//
// Car space: forward = -Z, right = +X, up = +Y; the body's origin is the model's origin
// (on the ground, between the wheels).
import { RAPIER, GROUPS } from './physics.js';
import { clamp } from '../core/util.js';

const RHO = 1.2;
// grip by surface: road/lots, grass, dirt (fields, farm track), sand (beach), rock
const SURFACE_GRIP = { road: 1, building: 1, ground: 0.78, dirt: 0.72, sand: 0.66, rock: 0.85 };
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
  // extra steering lock while sliding (drift cars get much more lock than road cars)
  s.driftLock = ((s.driftLockDeg || (s.type === 'Formula' ? 30 : s.type === 'Truck' ? 42 : 54)) * Math.PI) / 180;
  // gripCar: 0 = drift car (most cars), 1 = grip demon (the F1 car; the supercars are 0.7). Grip cars keep their
  // rear grip once sliding (they straighten themselves), get no power-oversteer or slide helpers, and AWD
  // ones send more power to the front.
  s.gripCar = clamp(s.gripCar || 0, 0, 1);
  s.frontSplit = s.drive === 'awd' ? (s.frontSplit ?? 0.12 + 0.3 * s.gripCar) : 0; // AWD drift setup: mostly rear
  s.rearC = s.rearSlideC || 1.72 - 0.55 * s.gripCar;  // how much rear grip drops once sliding (higher = slides more)
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

/**
 * Side grip curve: 0 at no slide, peak 1 at about 10 degrees, then dropping off.
 * c = 1.45 (fronts) keeps ~0.8 when fully sideways; c = 1.62 (rears) keeps ~0.65.
 */
const STAB_ANGLE = 9, STAB_DAMP = 2.5;   // grip cars' stability control (per radian of slide / of extra spin)

function lateralCurve(a, c = 1.45) {
  return Math.sin(c * Math.atan(9 * a));
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
    this.yawI = (m / 12) * (W * W + L * L) * 0.8;
    // drift assists (main.js copies the player's settings in here)
    this.assists = { countersteer: true, angleHold: true, throttleHelp: true };
    this.beta = 0; this.csAngle = 0; this.pathYaw = null; this.pathRate = 0; this.drifting = false;
    this.visSteer = 0; // front wheel angle for DRAWING only (see updateVisualSteer)
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
    this.gear = 1; this.rpm = this.spec.idle; this.steerAngle = 0; this.steerInput = 0;
    // forget the drift state (path turn rate, last drift direction), or the assists push the new pose
    this.beta = 0; this.pathYaw = null; this.pathRate = 0; this.driftDir = 0; this.straightT = 0; this.visSteer = 0;
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

    // drift angle: how far the car points away from where it is going (right = +).
    // Positive means the car is moving to the right of where its nose points.
    const vSide = dot(lin, right);
    const A = this.assists;
    const forwardMove = vLong > 1.5;
    const beta = speed > 3 && forwardMove ? Math.atan2(vSide, Math.abs(vLong)) : 0;
    // the full drift angle (0..180 degrees: past 90 the car is going backwards) - the assists use this
    const betaFull = speed > 3 ? Math.atan2(vSide, vLong) : 0;
    const ba = clamp(betaFull, -1.75, 1.75);
    this.beta = beta;
    // how fast the direction of travel is turning (the angle hold keeps the car turning with it)
    const pathYaw = Math.atan2(-lin.x, -lin.z);
    if (this.pathYaw !== null && speed > 3) {
      let d = pathYaw - this.pathYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.pathRate += (d / dt - this.pathRate) * clamp(dt * 12, 0, 1);
    } else this.pathRate = 0;
    this.pathYaw = pathYaw;

    // steering gets lighter with speed, but you get the full drift lock once the tail slides
    const rearSlide = Math.max(Math.abs(this.wheels[2].slide), Math.abs(this.wheels[3].slide), Math.abs(beta));
    const speedLimit = s.steerMax / (1 + Math.max(0, Math.abs(vLong) - 4) / 26);
    const maxNow = speedLimit + (s.driftLock - speedLimit) * clamp((rearSlide - 0.1) / 0.3, 0, 1);
    const target = clamp(inp.steer || 0, -1, 1);
    const rate = Math.abs(target) > Math.abs(this.steerInput) && Math.sign(target) === Math.sign(this.steerInput || target) ? 4.2 : 7;
    this.steerInput += clamp(target - this.steerInput, -rate * dt, rate * dt);
    const direct = this.steerInput * maxNow;
    // auto countersteer: once the car slides, the front wheels turn toward where the car is going by
    // themselves (a bit less than all the way, so the drift keeps going). Your steering stays in
    // charge: countersteering by hand uses whichever is bigger (never both added together), steering
    // toward the corner takes some countersteer away for more angle, and the wheels never point much
    // past the direction of travel. The assist fades in and out smoothly with the drift angle, so a
    // switch from one direction to the other is clean (nothing jumps as the car passes straight).
    let angle = direct;
    // 360s: the assists help up to 90 degrees, then fade out completely by 100 degrees (the user's
    // choice), so nothing stops the car going all the way round. Holding the steering toward the
    // corner for ~1/3 s ("committing") also lifts the 55-degree angle-hold limit.
    const into = -this.steerInput * Math.sign(betaFull);
    this.intoT = into > 0.6 ? (this.intoT || 0) + dt : Math.max(0, (this.intoT || 0) - 3 * dt);
    const release = clamp((Math.abs(betaFull) - 1.571) / 0.175, 0, 1);      // fades out from 90 to 100 degrees
    this.assistRelease = release;
    // off while the handbrake is held (you steer freely to throw the car in), back on over ~0.25 s after
    this.hbFade = inp.handbrake ? 0 : Math.min(1, (this.hbFade ?? 1) + dt * 4);
    if (A.countersteer && speed > 5 && Math.abs(betaFull) < 1.75 && this.hbFade > 0) {
      // fades in with the drift angle, and with speed (11-18 mph), so it never switches on with a snap
      const w = clamp((Math.abs(ba) - 0.04) / 0.14, 0, 1) * clamp((speed - 5) / 3, 0, 1) * this.hbFade * (1 - release);
      if (w > 0) {
        const sb = Math.sign(ba);
        const k = 0.84 + 0.18 * (1 - clamp(throttle / 0.6, 0, 1));   // off the throttle: catch it a little more
        const cs = ba * k;
        let a = direct * sb > 0 ? sb * Math.max(cs * sb, direct * sb) : cs + direct;
        // on the throttle the limit sits just inside the direction of travel, so a tap of countersteer
        // keeps a shallow drift going; lifting off lets you catch it. HOLDING the countersteer key
        // opens the limit up, so the car swings across into a drift the other way (a transition).
        this.counterT = this.steerInput * sb > 0.6 ? (this.counterT || 0) + dt : Math.max(0, (this.counterT || 0) - 2 * dt);
        const capOut = ba * sb + 0.08 - 0.11 * clamp(throttle / 0.7, 0, 1) + 0.24 * clamp((this.counterT - 0.22) / 0.3, 0, 1);
        if (a * sb > capOut) a = sb * capOut;
        angle = direct + (a - direct) * w;
      }
    }
    this.steerAngle = clamp(angle, -s.driftLock, s.driftLock);

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

    // gear changes. The automatic shifts on ROAD speed, not wheel speed, so spinning or locked
    // rear wheels in a drift don't make it hunt between gears; it holds its gear on the handbrake.
    if (!this.manual || inp.autoOverride) {
      const groundOmega = Math.abs(vLong) / rDrive;
      const rpmGround = (groundOmega * ratio * 30) / Math.PI;
      if (this.gear >= 1 && this.shiftT <= 0 && !inp.handbrake) {
        const upAt = s.redline * (0.6 + 0.3 * throttle);
        if (this.rpm > upAt && rpmGround > upAt * 0.9 && this.gear < nG && rpmWheels > s.idle * 1.5) { this.gear++; this.shiftT = 0.22; }
        else if (this.gear > 1) {
          const lower = (groundOmega * s.gears[this.gear - 2] * s.final * 30) / Math.PI;
          if (lower < s.redline * (0.5 + 0.25 * throttle) && rpmGround < s.redline * 0.45) { this.gear--; this.shiftT = 0.18; }
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
    // sliding with the throttle on: the rears let go a little more (throttle help)
    const driftAmt = clamp((Math.abs(beta) - 0.12) / 0.2, 0, 1);
    this.drifting = driftAmt > 0.3 && speed > 6;
    // the throttle takes a little side grip off the rear above ~18 mph (easier power oversteer; not at walking pace)
    const loose = 1 - s.gripCar;
    const rearLoose = (1 - 0.06 * loose * throttle * clamp((speed - 8) / 10, 0, 1)) * (A.throttleHelp ? 1 - 0.1 * loose * driftAmt * throttle : 1);
    const share = (w) => s.drive === 'awd' ? (w.front ? s.frontSplit : 1 - s.frontSplit) / 2 : 1 / this.nDriven;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      rot(q, w.hp.x, w.hp.y, w.hp.z, hp); hp.x += pos.x; hp.y += pos.y; hp.z += pos.z;
      const maxLen = w.s0 + w.r;
      const hit = this.ph.castRayNormal(hp.x, hp.y, hp.z, -up.x, -up.y, -up.z, maxLen, GROUPS.wheelRay, b);
      w.steer = w.front ? this.steerAngle : 0;
      if (!hit) {
        w.grounded = false; w.len = w.s0; w.prevComp = 0; w.comp = 0; w.load = 0; w.slide = 0; w.slip = 0; w.lat = 0;
        // wheels in the air: driven ones spin up with the throttle, others slow down
        if (w.driven) w.omega += ((driveForce * share(w)) * w.r / 18) * dt; w.omega *= 0.99;
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
      // the ground heightfield is everything (roads are painted onto it): ask the map what is here
      if (w.surface === 'ground' && this.ph.groundKind) w.surface = this.ph.groundKind(w.contact.x, w.contact.z);
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
      const surfaceGrip = SURFACE_GRIP[w.surface] ?? 1;
      const mu = 1.05 * s.grip * surfaceGrip;
      const cap = mu * fs;
      // forward / backward
      let fx = 0;
      const locked = this.handbrake && !w.front;
      if (w.driven) fx += driveForce * share(w);
      // grip cars have traction control: the driven tyres never spin up, so the throttle can't kick the tail out
      if (w.driven && s.gripCar > 0 && fx > 0) fx = Math.min(fx, cap * (1 - 0.35 * s.gripCar));
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
      let fy = -cap * (w.front ? lateralCurve(Math.abs(slideAngle)) : lateralCurve(Math.abs(slideAngle), s.rearC) * rearLoose) * Math.sign(slideAngle);
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
      // sideways sliding only (for tyre marks and smoke: not wheelspin or braking in a straight line)
      w.lat = clamp(Math.abs(slideAngle) > 0.2 ? (Math.abs(vS) - 1.5) / 5 : 0, 0, 1) * clamp(speed / 4, 0, 1);
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

    // ---- grip cars: stability control pulls the car back in line with where it is going -------
    // (weaker while the handbrake is held, so you can still swing it round a hairpin)
    if (s.gripCar > 0 && grounded >= 3 && speed > 4 && Math.abs(betaFull) < 2.6) {
      const hb = this.handbrake ? 0.35 : 1;
      const tqS = (-Math.sign(betaFull) * Math.min(Math.abs(betaFull), 0.8) * STAB_ANGLE - (ang.y - this.pathRate) * STAB_DAMP) * this.yawI * s.gripCar * hb;
      b.applyTorqueImpulse({ x: up.x * tqS * dt, y: up.y * tqS * dt, z: up.z * tqS * dt }, true);
    }

    // ---- drift assists that act on the whole car ------------------------------------------
    if (grounded >= 3 && speed > 6 && Math.abs(betaFull) < 1.75) {
      const ab = Math.abs(betaFull);
      // angle hold: don't spin past ~55 degrees unless you commit (hold the steering toward the corner),
      // and keep a held angle steady by turning the car with its path (only the part of the spin that
      // differs from the path is damped). All of it fades out between 90 and 100 degrees, for 360s.
      if (A.angleHold && this.assistRelease < 1) {
        let tq = 0;
        const lim = 0.96;
        const committed = this.intoT > 0.35;
        if (ab > lim && !committed) tq -= Math.sign(betaFull) * (ab - lim) * this.yawI * 22;
        // only resist the car rotating further into the slide; straightening up is always free
        const rel = ang.y - this.pathRate;
        const intoSlide = Math.sign(rel) === Math.sign(betaFull) ? 1 : 0; // beta > 0 (nose left of path) grows with +yaw
        if (ab > 0.18) tq -= rel * this.yawI * 0.8 * clamp((ab - 0.18) / 0.3, 0, 1) * (0.3 + 0.7 * intoSlide);
        tq *= 1 - this.assistRelease;
        if (tq) b.applyTorqueImpulse({ x: up.x * tq * dt, y: up.y * tq * dt, z: up.z * tq * dt }, true);
      }
      // throttle help: the throttle keeps the car moving along its slide instead of scrubbing speed
      if (A.throttleHelp && driftAmt > 0 && throttle > 0.05 && speed < s.topSpeed * 0.6) {
        const push = s.mass * 1.7 * throttle * driftAmt * (1 - s.gripCar) / speed;
        b.applyImpulse({ x: lin.x * push * dt, y: 0, z: lin.z * push * dt }, true);
      }
    }

    // 360s: when you COMMIT (hold the steering toward the corner for ~1/3 s on the throttle, above ~13 mph),
    // the spin is kept going until the car has come all the way round (a real car tends to stop rotating
    // once it travels backwards). Letting go of the steering, or completing the turn, ends it.
    if (A.angleHold) {
      const dirNow = -Math.sign(this.steerInput);                      // steering left = turning left = +yaw
      if (!this.spin && s.gripCar < 0.5 && this.intoT > 0.35 && Math.abs(beta) > 0.8 && speed > 6 && throttle > 0.3) {
        this.spin = { dir: dirNow, turned: 0 };
      }
      if (this.spin) {
        const sp = this.spin;
        const holding = Math.abs(this.steerInput) > 0.6 && dirNow === sp.dir;
        sp.turned += ang.y * sp.dir * dt;
        if (!holding || sp.turned > 5.9 || speed < 3 || grounded < 3) this.spin = null;
        else {
          const yr = ang.y * sp.dir;
          const tq = sp.dir * this.yawI * 12 * clamp(2.4 - yr, 0, 2.4);
          b.applyTorqueImpulse({ x: up.x * tq * dt, y: up.y * tq * dt, z: up.z * tq * dt }, true);
        }
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
    this.updateVisualSteer(dt);
  }

  /**
   * Front wheel angle for drawing only (the physics uses steerAngle). In a drift the wheels stay
   * turned against the slide; steering into the turn just eases that angle a little instead of
   * swinging the wheels across to the other side. Outside a drift it's the real angle.
   */
  updateVisualSteer(dt) {
    const a = this.steerAngle, b = this.beta;
    const wd = clamp((Math.abs(b) - 0.1) / 0.15, 0, 1) * clamp((this.speed - 4) / 4, 0, 1);
    let vis = a;
    if (wd > 0) {
      const sb = Math.sign(b);
      const cs = Math.abs(b) * 0.85;          // what a natural countersteer looks like at this angle
      const ac = a * sb;                       // how far the real wheels point to the countersteer side
      const d = ac >= 0 ? a : sb * Math.max(cs * 0.55, cs + ac * 0.3);
      vis = a + (d - a) * wd;
    }
    this.visSteer += (vis - this.visSteer) * clamp(dt * 14, 0, 1);
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
