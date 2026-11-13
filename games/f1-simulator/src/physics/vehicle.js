// Vehicle dynamics. One instance per car (player and AI use exactly the same model).
//
// Model summary (see docs/APPROXIMATIONS.md for what is simplified):
//  - rigid body on a flat plane: forward speed, sideways speed, yaw
//  - four wheels, each with its own load, spin speed, slip, temperature and wear
//  - combined-slip tyre curve (Pacejka-style "magic formula" shape) with load sensitivity
//  - load transfer from braking / accelerating / cornering, split by roll stiffness
//  - downforce and drag with active aero (straight mode) or DRS, and slipstream
//  - engine torque curve, gearbox, limited-slip differential, hybrid deploy and harvest
//  - assists: traction control, ABS, automatic gears, speed-sensitive steering lock
//
// Body axes: x forward, y left, yaw positive to the left. Wheel order: FL, FR, RL, RR.
import { clamp, lerp, lookup, approach, wrapPi } from '../core/math.js';
import { SURFACE_PROPS, SURF } from '../track/track.js';

const RHO = 1.225, G = 9.81, VMIN = 4;
export const PHYSICS_DT = 1 / 480;

/** Build the parameter set for one car from the season's regulations. */
export function makeSpec(regs, { perf = 1, compound = 'soft', fuel = null } = {}) {
  const p = JSON.parse(JSON.stringify(regs.physics));
  const tyre = regs.tyres.compounds[compound];
  const lack = 1 - perf;
  p.compound = compound;
  p.compoundData = tyre;
  p.mu = tyre.mu * (1 - 0.55 * lack);
  p.muRef = p.mu;
  p.powerScale = 1 - 0.5 * lack;
  p.aero.clA *= 1 - 1.0 * lack;
  if (p.aero.straight) p.aero.straight.clA *= 1 - 1.0 * lack;
  if (fuel != null) p.fuelStart = fuel;
  return p;
}

/** Simple description of a car for the racing-line speed solver. */
export function profileCar(p) {
  const e = p.engine;
  const st = p.aero.straight || p.aero;
  return {
    mass: p.mass + p.fuelStart,
    clA: p.aero.clA, cdA: p.aero.cdA,
    clAStraight: st.clA, cdAStraight: st.cdA,
    mu: p.mu,
    vMax: 104,
    driveForce(v) {
      const kph = v * 3.6;
      const k = kph < 285 ? 1 : 0;
      return ((e.iceKw + (e.mgukKw || 0) * k) * 1000 * p.powerScale * e.efficiency) / Math.max(v, 8);
    },
  };
}

export class Vehicle {
  constructor(spec) {
    this.p = spec;
    const p = spec;
    this.L = p.wheelbase;
    this.a = p.wheelbase * (1 - p.weightFront);
    this.b = p.wheelbase * p.weightFront;
    this.wx = [this.a, this.a, -this.b, -this.b];
    this.wy = [p.trackFront / 2, -p.trackFront / 2, p.trackRear / 2, -p.trackRear / 2];
    this.tanAp = Math.tan((p.tyre.peakSlipAngleDeg * Math.PI) / 180);
    this.kp = p.tyre.peakSlipRatio;
    this.C = p.tyre.shape;
    this.B = Math.tan(Math.PI / (2 * this.C));
    const f = () => new Float64Array(4);
    this.omega = f(); this.fz = f(); this.temp = f(); this.flash = f(); this.wear = f();
    this.slipR = f(); this.slipA = f(); this.fxw = f(); this.fyw = f(); this.gripF = f();
    this.wheelAngle = f(); this.absF = f(); this.driveT = f(); this.brakeT = f();
    this.surf = new Uint8Array(4);
    this.assist = { tc: 1, abs: 1, steer: false, autoGear: true, autoAero: true, stability: false };
    this.loc = { i: -1, s: 0, d: 0 };
    this.draft = 0;
    this.reset(0, 0, 0);
  }

  reset(x, z, psi, speed = 0) {
    const p = this.p;
    this.x = x; this.z = z; this.psi = psi;
    this.vx = speed; this.vy = 0; this.r = 0;
    this.steer = 0;
    this.gear = speed > 1 ? this._gearFor(speed) : 1;
    this.rpm = p.engine.idleRpm;
    this.shiftT = 0; this.gearCool = 0; this.revT = 0;
    this.aeroK = 0; this.aeroOpen = false;
    this.battery = (p.engine.batteryMj || 0) * 1e6 * 0.75;
    this.harvestLap = 0;
    this.fuel = p.fuelStart;
    this.axF = 0; this.ayF = 0;
    this.speed = Math.abs(speed); this.kph = this.speed * 3.6;
    this.throttle = 0; this.brake = 0;
    this.tcF = 1; this.tcActive = false; this.absActive = false; this.absRear = 1;
    this.smOpen = false; this.smArmed = false; this.wasInZone = false; this.inZone = false;
    this.y = 0; this.slopeF = 0; this.slopeL = 0;
    this.overtakeAvail = false; this.overtaking = false;
    this.dist = 0;
    this.offWheels = 0;
    this.wallHit = 0;
    this.deployKw = 0; this.harvestKw = 0;
    this.squeal = 0; this.lock = 0; this.spin = 0;
    this.pitch = 0; this.roll = 0; this.heave = 0; this.rumble = 0;
    const startTemp = 78;
    for (let i = 0; i < 4; i++) {
      this.omega[i] = speed / p.wheelRadius;
      this.temp[i] = startTemp; this.flash[i] = 0;
      this.gripF[i] = 1; this.absF[i] = 1;
      this.slipR[i] = 0; this.slipA[i] = 0;
    }
    this.loc.i = -1;
  }

  /** Fit new tyres (pit stop / session start). */
  fitTyres(compoundData, mu) {
    this.p.compoundData = compoundData;
    this.p.mu = mu;
    for (let i = 0; i < 4; i++) { this.wear[i] = 0; this.temp[i] = 78; this.flash[i] = 0; }
  }

  _gearFor(speed) {
    const p = this.p, r = p.gearbox.ratios;
    for (let g = 1; g <= r.length; g++) {
      const rpm = (speed / p.wheelRadius) * r[g - 1] * 9.5493;
      if (rpm < p.engine.shiftRpm * 0.97) return g;
    }
    return r.length;
  }

  /**
   * Advance the car by dt seconds.
   * @param c controls: { steer -1..1 (left +), throttle 0..1, brake 0..1, shift (+1/-1, consumed), aero, boost }
   */
  step(dt, c, track) {
    const p = this.p, eng = p.engine;
    const omega = this.omega, fz = this.fz;
    const loc = track.locate(this.x, this.z, this.loc.i, this.loc);
    const mass = p.mass + this.fuel;
    let vx = this.vx, vy = this.vy, r = this.r;
    const speed = Math.hypot(vx, vy);
    const kph = speed * 3.6;
    const R = p.wheelRadius;

    let throttle = clamp(c.throttle, 0, 1), brake = clamp(c.brake, 0, 1);
    const parked = !!this.parked; // held on the grid before the start
    if (parked) { throttle = 0; brake = 1; if (this.gear < 1) this.gear = 1; }

    // ---- gearbox logic ---------------------------------------------------------------------
    const ratios = p.gearbox.ratios, nG = ratios.length;
    if (this.shiftT > 0) this.shiftT -= dt;
    if (this.gearCool > 0) this.gearCool -= dt;
    const wAxle = 0.5 * (omega[2] + omega[3]);
    if (parked) { /* no gear changes while held */ }
    else if (this.assist.autoGear) {
      if (this.gear >= 0) {
        if (vx < 1.0 && c.brake > 0.6 && c.throttle < 0.05) {
          this.revT += dt;
          if (this.revT > 0.6) { this.gear = -1; this.revT = 0; }
        } else this.revT = 0;
      } else if (c.throttle > 0.1 && vx > -1.5) this.gear = 1;
      if (this.gear < 0) { const t = throttle; throttle = brake; brake = t; }
      if (this.gear === 0) this.gear = 1;
      if (this.gear > 0 && this.gearCool <= 0) {
        const rpmNow = Math.abs(wAxle) * ratios[this.gear - 1] * 9.5493;
        if (rpmNow > eng.shiftRpm && this.gear < nG && throttle > 0.2) {
          this.gear++; this.shiftT = p.gearbox.shiftTime; this.gearCool = 0.14;
        } else if (this.gear > 1 && rpmNow * (ratios[this.gear - 2] / ratios[this.gear - 1]) < eng.shiftRpm * 0.8) {
          this.gear--; this.shiftT = p.gearbox.shiftTime; this.gearCool = 0.1;
        }
      }
    } else if (c.shift) {
      const want = this.gear + c.shift;
      if (want >= -1 && want <= nG) {
        let ok = true;
        if (c.shift < 0 && want > 0) {
          const rpmAfter = Math.abs(wAxle) * ratios[want - 1] * 9.5493;
          ok = rpmAfter < eng.maxRpm + 600;
        }
        if (want === -1 && vx > 2) ok = false;
        if (ok) { this.gear = want; this.shiftT = p.gearbox.shiftTime; }
      }
      c.shift = 0;
    }
    const gear = this.gear;
    const Gr = gear > 0 ? ratios[gear - 1] : gear < 0 ? -ratios[0] * 1.15 : 0;

    // ---- steering --------------------------------------------------------------------------
    const q = 0.5 * RHO * vx * vx;
    let lock = p.steerLock;
    if (this.assist.steer) {
      // Steering help: never turn the front wheels much further than the grip available right
      // now can use (depends on speed, downforce with the wings open or closed, tyre state).
      const clNow = p.aero.straight ? lerp(p.aero.clA, p.aero.straight.clA, this.aeroK) : p.aero.clA;
      const gAvg = (this.gripF[0] + this.gripF[1] + this.gripF[2] + this.gripF[3]) / 4;
      const aMax = 0.9 * p.mu * gAvg * (G + (q * clNow) / mass);
      lock = Math.min(lock, (this.L * aMax) / Math.max(speed * speed, 9) + 0.3 * this.tanAp);
    }
    this.lockNow = lock;
    this.steer = approach(this.steer, clamp(c.steer, -1, 1) * lock, 2.4 * dt);
    const steer = this.steer;

    // ---- aerodynamics: 2026 straight mode ---------------------------------------------------
    // Works like the FIA rules: only inside the circuit's straight mode zones. Automatic mode
    // opens the wings as the car crosses into a zone; manual mode opens them when the driver
    // presses the button inside a zone. Braking, leaving the zone or a big cornering load
    // (safety) closes them again, and they stay closed until the next zone.
    const st = p.aero.straight;
    const inZone = track.straightZone[loc.i] === 1;
    this.inZone = inZone;
    if (inZone && !this.wasInZone) this.smArmed = !!this.assist.autoAero;
    if (inZone && c.aeroPress) this.smArmed = true;
    c.aeroPress = false;
    if (!inZone) { this.smArmed = false; this.smOpen = false; }
    if (brake > 0.05 || Math.abs(this.ayF) > 25) { this.smOpen = false; this.smArmed = false; }
    if (this.smArmed && st && brake <= 0.05) { this.smOpen = true; this.smArmed = false; }
    this.wasInZone = inZone;
    const wantOpen = !!st && this.smOpen;
    this.aeroOpen = wantOpen;
    this.aeroK = approach(this.aeroK, wantOpen ? 1 : 0, dt / p.aero.switchTime);
    const ak = this.aeroK, draft = this.draft;
    const clA = (st ? lerp(p.aero.clA, st.clA, ak) : p.aero.clA) * (1 - 0.2 * draft);
    const cdA = (st ? lerp(p.aero.cdA, st.cdA, ak) : p.aero.cdA) * (1 - 0.3 * draft);
    const bal = st ? lerp(p.aero.balance, st.balance, ak) : p.aero.balance;
    const down = q * clA;
    const drag = q * cdA * Math.sign(vx);

    // ---- wheel loads -----------------------------------------------------------------------
    const W = mass * G;
    const dLong = (mass * this.axF * p.cgHeight) / this.L;
    const latF = ((mass * this.ayF * p.cgHeight) / p.trackFront) * p.rollStiffFront;
    const latR = ((mass * this.ayF * p.cgHeight) / p.trackRear) * (1 - p.rollStiffFront);
    const fzF = (W * p.weightFront + down * bal - dLong) / 2;
    const fzR = (W * (1 - p.weightFront) + down * (1 - bal) + dLong) / 2;
    fz[0] = Math.max(0, fzF - latF); fz[1] = Math.max(0, fzF + latF);
    fz[2] = Math.max(0, fzR - latR); fz[3] = Math.max(0, fzR + latR);

    // ---- engine, hybrid system -------------------------------------------------------------
    const rpmW = Math.abs(wAxle * Gr) * 9.5493;
    let rpm = Math.max(rpmW, eng.idleRpm);
    if ((gear === 1 || gear < 0) && throttle > 0.05 && rpmW < eng.launchRpm) {
      rpm = Math.max(rpmW, lerp(eng.idleRpm, eng.launchRpm, throttle));
    }
    if (gear === 0) rpm = lerp(eng.idleRpm, eng.maxRpm, throttle);
    const we = rpm * 0.104720;
    let tIce = Math.min(eng.peakTorqueNm * lookup(eng.torqueCurve, rpm), (eng.iceKw * 1000) / we) * p.powerScale;
    if (rpmW > eng.maxRpm) tIce = 0;
    let pK = 0, pClip = 0;
    const cap = (eng.batteryMj || 0) * 1e6;
    if (cap > 0 && gear > 0) {
      const soc = this.battery / cap;
      // Boost: the driver asks for full electric power now (normal speed taper).
      // Overtake mode: earned by being within 1 s at the detection point; while boosting it
      // keeps full electric power up to 337 km/h instead of 290 km/h.
      const boost = !!c.boost && soc > 0.03;
      const ot = boost && !!this.overtakeAvail;
      const fullTo = ot ? eng.overtakeFullToKph : eng.deployFullToKph;
      const zeroAt = ot ? eng.overtakeZeroAtKph : eng.deployZeroAtKph;
      this.overtaking = ot;
      const taper = kph <= fullTo ? 1 : kph >= zeroAt ? 0 : (zeroAt - kph) / (zeroAt - fullTo);
      const vCut = boost ? 500 : 215 + 150 * soc;
      const cutK = clamp((vCut + 15 - kph) / 30, 0, 1);
      if (throttle > 0.02 && this.battery > 0) pK = eng.mgukKw * 1000 * taper * cutK * throttle;
      if (throttle > 0.95 && !boost && kph > vCut + 15 && soc < 0.9 && this.harvestLap < eng.harvestPerLapMj * 1e6) {
        pClip = (eng.clipKw || 110) * 1000 * clamp((kph - vCut - 15) / 20, 0, 1);
      }
      this.boosting = boost && pK > 0;
    }
    let tDrive;
    if (throttle < 0.02) tDrive = -(eng.engineBrakeBase + eng.engineBrakePerRpm * rpm);
    else tDrive = tIce * throttle + (pK - pClip) / we;
    if (this.shiftT > 0 || gear === 0) tDrive = 0;
    let axleT = tDrive * Gr * eng.efficiency;
    const kShare = tDrive > 1 ? pK / we / tDrive : 0; // part of the drive torque that is electric

    // traction control (uses last step's rear slip)
    let tcActive = false;
    if (this.assist.tc > 0 && axleT * Math.sign(Gr || 1) > 0) {
      // Looks at the rear tyres' total slip: wheelspin AND sideways sliding. A tyre that is
      // already sliding sideways has nothing left for power, so the system backs the power off.
      const sg = Math.sign(Gr || 1);
      const r2 = Math.hypot(Math.max(this.slipR[2] * sg, 0) / this.kp, this.slipA[2] / this.tanAp);
      const r3 = Math.hypot(Math.max(this.slipR[3] * sg, 0) / this.kp, this.slipA[3] / this.tanAp);
      const sMax = Math.max(r2, r3);
      const target = this.assist.tc >= 2 ? 0.82 : 1.05;
      const want = clamp(1 - (sMax - target) / 0.55, 0.02, 1);
      this.tcF = want < this.tcF ? want : Math.min(want, this.tcF + dt * 7);
      tcActive = this.tcF < 0.97;
      axleT *= this.tcF;
    } else this.tcF = 1;
    this.tcActive = tcActive;

    // limited-slip differential
    const dW = omega[2] - omega[3];
    const lockMax = 500 + 0.3 * Math.abs(axleT);
    const lockT = clamp(p.diff.lock * dW, -lockMax, lockMax);
    this.driveT[2] = axleT / 2 - lockT;
    this.driveT[3] = axleT / 2 + lockT;

    // brakes (+ energy harvest on the rear axle)
    const bt = brake * p.brakes.maxTorque;
    this.brakeT[0] = this.brakeT[1] = (bt * p.brakes.bias) / 2;
    this.brakeT[2] = this.brakeT[3] = (bt * (1 - p.brakes.bias)) / 2;
    let pRegen = 0;
    if (cap > 0 && brake > 0.02 && wAxle > 5) {
      pRegen = Math.min(eng.regenKw * 1000, (this.brakeT[2] + this.brakeT[3]) * wAxle);
    }
    if (cap > 0) {
      const lim = eng.harvestPerLapMj * 1e6;
      let harvest = (pRegen + pClip) * 0.9;
      if (this.harvestLap >= lim) harvest = 0;
      // electric energy actually used = electric share of the power reaching the wheels
      const used = Math.min(pK, Math.max(0, (kShare * axleT * wAxle) / eng.efficiency));
      this.battery = clamp(this.battery + (harvest - used / 0.95) * dt, 0, cap);
      this.harvestLap += harvest * dt;
      this.deployKw = used / 1000; this.harvestKw = harvest / 1000;
    }
    // ABS works per front wheel, but both rear wheels share one setting (keeps the car straight).
    // The rear is held well below its peak slip so it keeps sideways grip while braking in a turn.
    if (this.assist.abs > 0 && brake > 0.02) {
      const worst = Math.min(this.slipR[2], this.slipR[3]);
      const want = clamp(1 - (-worst - 0.05) / 0.05, 0.04, 1);
      this.absRear = want < this.absRear ? want : Math.min(want, this.absRear + dt * 9);
    } else this.absRear = 1;
    // Stability control: if the rear starts to slide out, brake the outside front wheel (this
    // pulls the nose back) and take power away, the way road-car ESC does.
    let esc = false;
    if (this.assist.stability && speed > 10) {
      const taR = 0.5 * (this.slipA[2] + this.slipA[3]);   // > 0: rear is sliding to the left
      const ex = Math.abs(taR) / this.tanAp - 0.8;
      if (ex > 0) {
        const k = Math.min(1, ex / 0.8);
        this.brakeT[taR > 0 ? 0 : 1] += k * 3400;
        const cut = clamp(1 - ex * 1.3, 0.05, 1);
        if (this.driveT[2] + this.driveT[3] > 0) { this.driveT[2] *= cut; this.driveT[3] *= cut; }
        esc = true;
      }
    }
    this.escActive = esc;

    // ---- tyres and wheels ------------------------------------------------------------------
    const dPsi = wrapPi(this.psi - track.psi[loc.i]);
    const sD = Math.sin(dPsi), cD = Math.cos(dPsi);
    const N = track.n, ds = track.ds;
    const C = this.C, B = this.B, kp = this.kp, tanAp = this.tanAp;
    const ls = p.tyre.loadSensitivity, fz0 = p.tyre.loadNominal;
    const cd = p.compoundData;
    let sumFx = 0, sumFy = 0, Mz = 0, off = 0, squeal = 0, lockI = 0, spinI = 0, rumble = 0, absAct = false;
    for (let i = 0; i < 4; i++) {
      const dl = i < 2 ? steer : 0;
      const cs = Math.cos(dl), sn = Math.sin(dl);
      const vxi = vx - r * this.wy[i], vyi = vy + r * this.wx[i];
      const vxw = vxi * cs + vyi * sn, vyw = -vxi * sn + vyi * cs;

      // what is under this wheel
      const dWheel = loc.d + this.wx[i] * sD + this.wy[i] * cD;
      let iw = (loc.i + Math.round((this.wx[i] * cD - this.wy[i] * sD) / ds)) % N;
      if (iw < 0) iw += N;
      const sf = track.surfaceAt(iw, dWheel);
      this.surf[i] = sf;
      const sp = SURFACE_PROPS[sf];
      if (sf >= SURF.GRASS) off++;
      let Fz = fz[i];
      if (sp.bump > 0 && speed > 2) {
        const ph = Math.sin(this.dist * 6.2 + i * 1.9);
        Fz *= 1 + 0.22 * ph;
        rumble = Math.max(rumble, sf === SURF.KERB ? 1 : 0.6);
      }

      // tyre force
      const mu = p.mu * sp.grip * this.gripF[i] * clamp(1 - ls * (Fz / fz0 - 1), 0.72, 1.12);
      const vref = Math.max(Math.abs(vxw), VMIN);
      const sr = (omega[i] * R - vxw) / vref;
      const ta = vyw / vref;
      this.slipR[i] = sr; this.slipA[i] = ta;
      const sx = sr / kp, sy = ta / tanAp;
      const rho = Math.hypot(sx, sy);
      let Fx = 0, Fy = 0, dF = mu * Fz * C * B;
      if (rho > 1e-6) {
        const at = Math.atan(B * rho);
        const g = Math.sin(C * at);
        const F = mu * Fz * g;
        Fx = (F * sx) / rho;
        Fy = (-F * sy) / rho;
        const gp = (C * B * Math.cos(C * at)) / (1 + B * B * rho * rho);
        dF = mu * Fz * ((gp * sx * sx) / (rho * rho) + ((g / rho) * sy * sy) / (rho * rho));
        if (dF < 0) dF = 0;
      }
      this.fxw[i] = Fx; this.fyw[i] = Fy;
      let Frr = -sp.drag * Fz * clamp(vxw, -1, 1);
      if (sf === SURF.GRAVEL) Frr *= 1 + speed * 0.03;

      // wheel spin (linearly-implicit so it stays stable at any speed)
      const kw = ((dF / kp) * R) / vref;
      const I = i < 2 ? p.wheelInertia : p.wheelInertia + 0.5 * eng.inertia * Gr * Gr;
      const Td = i < 2 ? 0 : this.driveT[i];
      let absF = this.absF[i];
      if (i >= 2) absF = this.absRear;
      else if (this.assist.abs > 0 && brake > 0.02) {
        const want = clamp(1 - (-sr - 0.085) / 0.06, 0.04, 1);
        absF = want < absF ? want : Math.min(want, absF + dt * 9);
      } else absF = 1;
      if (absF < 0.95) absAct = true;
      this.absF[i] = absF;
      const Tb = this.brakeT[i] * absF;
      const Tfree = Td - R * Fx;
      const den = I + dt * R * kw;
      let w = omega[i];
      if (Tb > 0) {
        if (Math.abs(w) < 0.6 && Math.abs(Tfree) <= Tb) w = 0;
        else {
          const sgn = w !== 0 ? Math.sign(w) : Math.sign(Tfree);
          const wn = w + (dt * (Tfree - sgn * Tb)) / den;
          w = w !== 0 && Math.sign(wn) !== Math.sign(w) ? 0 : wn;
        }
      } else w += (dt * Tfree) / den;
      omega[i] = w;
      this.wheelAngle[i] += w * dt;

      // into body axes
      const fxb = (Fx + Frr) * cs - Fy * sn;
      const fyb = (Fx + Frr) * sn + Fy * cs;
      sumFx += fxb; sumFy += fyb;
      Mz += this.wx[i] * fyb - this.wy[i] * fxb;

      // temperature, wear
      const slipPow = Math.abs(Fx * (omega[i] * R - vxw)) + Math.abs(Fy * vyw);
      this.temp[i] += dt * (slipPow * 1.0e-4 - (this.temp[i] - 32) * (0.004 + 1.0e-4 * speed));
      this.flash[i] += dt * (slipPow * 5.0e-4 - this.flash[i] / 1.4);
      const tEff = this.temp[i] + 0.5 * Math.min(this.flash[i], 60);
      const xT = (tEff - cd.optTemp) / cd.window;
      const gT = clamp(1 - 0.1 * xT * xT, 0.72, 1);
      this.wear[i] = Math.min(1, this.wear[i] + dt * slipPow * 3.6e-8 * cd.wear * (1 + Math.max(0, xT) * 1.5));
      const wv = this.wear[i];
      this.gripF[i] = gT * Math.max(0.5, 1 - 0.1 * wv - (wv > 0.7 ? (wv - 0.7) * 1.2 : 0));

      // cues for sound / effects
      if (speed > 6) {
        squeal = Math.max(squeal, clamp((Math.abs(sy) - 0.85) / 0.8, 0, 1));
        if (sr < -0.35) lockI = Math.max(lockI, clamp(-sr, 0, 1));
        if (i >= 2 && sr > 0.3) spinI = Math.max(spinI, clamp(sr, 0, 1));
      }
    }
    this.absActive = absAct;
    this.offWheels = off;
    this.squeal = squeal; this.lock = lockI; this.spin = spinI; this.rumble = rumble;

    // ---- chassis ---------------------------------------------------------------------------
    sumFx -= drag;
    // gravity on hills and banking (track frame -> body frame)
    const gT = -G * track.grade[loc.i], gN = -G * track.bank[loc.i];
    sumFx += mass * (gT * cD + gN * sD);
    sumFy += mass * (-gT * sD + gN * cD);
    const ax = sumFx / mass, ay = sumFy / mass;
    vx += (ax + r * vy) * dt;
    vy += (ay - r * vx) * dt;
    r += (Mz / p.yawInertia) * dt;
    this.psi = wrapPi(this.psi + r * dt);
    const sp_ = Math.sin(this.psi), cp = Math.cos(this.psi);
    let Vx = vx * sp_ + vy * cp, Vz = vx * cp - vy * sp_;
    this.x += Vx * dt;
    this.z += Vz * dt;

    // ---- walls -----------------------------------------------------------------------------
    this.wallHit = 0;
    const li = loc.i;
    const limL = track.wallL[li] - 0.95, limR = track.wallR[li] - 0.95;
    const nx = track.nx[li], nz = track.nz[li];
    const dNow = (this.x - track.x[li]) * nx + (this.z - track.z[li]) * nz;
    let pen = 0, side = 0;
    if (dNow > limL) { pen = dNow - limL; side = 1; }
    else if (dNow < -limR) { pen = -limR - dNow; side = -1; }
    if (side !== 0) {
      this.x -= nx * pen * side;
      this.z -= nz * pen * side;
      const vn = (Vx * nx + Vz * nz) * side;
      if (vn > 0) {
        Vx -= nx * side * vn * 1.15;
        Vz -= nz * side * vn * 1.15;
        const scrub = 1 - Math.min(0.35, 0.03 * vn + 0.004);
        Vx *= scrub; Vz *= scrub;
        vx = Vx * sp_ + Vz * cp;
        vy = Vx * cp - Vz * sp_;
        r *= 0.6;
        this.wallHit = vn;
      }
    }
    this.vx = vx; this.vy = vy; this.r = r;

    // ---- bookkeeping -----------------------------------------------------------------------
    const f = 1 - Math.exp(-dt / 0.045);
    this.axF += (ax - this.axF) * f;
    this.ayF += (ay - this.ayF) * f;
    this.speed = Math.hypot(vx, vy);
    this.kph = this.speed * 3.6;
    this.dist += this.speed * dt;
    this.rpm += (Math.min(rpm, eng.maxRpm + 150) - this.rpm) * Math.min(1, dt * 30);
    this.throttle = throttle; this.brake = brake;
    this.fuel = Math.max(0, this.fuel - throttle * 0.021 * dt);
    this.pitch = -this.axF * 0.00033;
    this.roll = this.ayF * 0.00038;
    // where the car sits on the hills: road height under it and the slope along / across it
    const gi = track.grade[loc.i], bi = track.bank[loc.i];
    this.y = track.heightAt(loc.i, loc.d) + gi * (this.loc.s - loc.i * track.ds);
    this.slopeF = gi * cD + bi * sD;
    this.slopeL = -gi * sD + bi * cD;
    this.heave = -down * 2.2e-6;
    this.downforce = down;
  }

  /** Called when the car crosses the start line. */
  newLap() {
    this.harvestLap = 0;
  }
}
