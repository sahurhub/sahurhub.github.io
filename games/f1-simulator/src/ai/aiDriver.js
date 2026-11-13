// AI driver. Drives the same Vehicle model as the player through steering / throttle / brake.
//  - follows the racing line with a look-ahead (pure pursuit) steering law plus yaw damping
//  - brakes and accelerates to a speed profile computed for its own car and skill
//  - keeps a safe gap to the car in front, pulls out to overtake only when the pass can be
//    finished before the next corner, holds its lane when side by side and gives way when it
//    is on the outside going into a corner
//  - slows down when it is off the ideal line, when its tyres are cold, hot or worn
//  - has a reaction time at the start and makes occasional mistakes (based on consistency)
import { clamp, approach, lerp } from '../core/math.js';
import { computeSpeedProfile, finishLine } from '../track/racingLine.js';
import { profileCar } from '../physics/vehicle.js';

/** Global calibration: how much of the theoretical grip a 100%-difficulty top driver uses. */
export const AI_TUNING = { gripCal: 0.885 };

const tmp = { x: 0, z: 0, psi: 0 };
const CAR_LEN = 5.6;

export class AIDriver {
  constructor({ veh, track, line, ratings, difficulty = 80, rng = Math.random }) {
    this.veh = veh;
    this.track = track;
    this.line = line;
    this.rng = rng;
    this.ratings = ratings;
    const base = 0.80 + 0.195 * (difficulty / 100);
    this.gripUse = clamp((base + (ratings.racePace - 90) * 0.002) * AI_TUNING.gripCal, 0.5, 1.0);
    const car = profileCar(veh.p);
    this.profile = computeSpeedProfile(track, line, car, this.gripUse);
    // speed possible when forced to run parallel to the track edge instead of on the ideal line
    if (!track._centreLine) track._centreLine = finishLine(track, new Float32Array(track.n));
    this.profileCL = computeSpeedProfile(track, track._centreLine, car, this.gripUse);
    this.dOff = 0;            // current lateral offset from the racing line (m)
    this.feel = 1;            // how much of the car's normal grip the driver senses (0..1)
    this.reaction = 0.16 + rng() * 0.22 + (100 - ratings.consistency) * 0.004;
    this.aggr = ratings.aggression / 100;
    this.mistakeT = 20 + rng() * 60;
    this.mistake = 0;
    this.stuckT = 0;
    this.passCar = null;
    this.passSide = 0;
  }

  /** Distance (m) to the next real corner on the racing line, and which way it turns. */
  _corner(s) {
    const tr = this.track, k = this.line.kappa;
    for (let m = 0; m < 420; m += 8) {
      const c = k[tr.idx(s + m)];
      if (Math.abs(c) > 1 / 115) { this.cornerDist = m; this.cornerSign = Math.sign(c); return; }
    }
    this.cornerDist = 420; this.cornerSign = 0;
  }

  /**
   * @param c     control object to fill
   * @param near  [{ ds, d, v, car }] other cars close by (ds > 0 = ahead of me)
   * @param sinceGo seconds since lights out (negative = still on the grid)
   */
  update(dt, c, near, sinceGo) {
    const v = this.veh, tr = this.track, loc = v.loc, line = this.line;
    if (loc.i < 0) return;
    c.shift = 0; c.aero = true;
    if (sinceGo < this.reaction) {
      c.throttle = 0; c.brake = 1; c.steer = 0; c.boost = false;
      return;
    }
    const sp = v.speed;
    const myD = loc.d;
    const li = loc.i;

    // ---- traffic ---------------------------------------------------------------------------
    this._corner(loc.s);
    const dCorner = this.cornerDist, cSign = this.cornerSign;
    const tCorner = dCorner / Math.max(sp, 10);
    let vLimit = Infinity, wantD = null, attacking = false, passSeen = false;
    for (let k = 0; k < near.length; k++) {
      const o = near[k];
      const lat = o.d - myD;                 // > 0: the other car is on my left
      const absLat = Math.abs(lat);
      // the car I am in the middle of passing
      if (this.passCar === o.car) {
        passSeen = true;
        if (o.ds < -(CAR_LEN + 1.5) || o.ds > 45 || (dCorner < 45 && o.ds > 3)) this.passCar = null;
        else {
          const room = this.passSide > 0 ? tr.wl[li] - 1.1 - o.d : tr.wr[li] - 1.1 + o.d;
          if (room < 2.0 && o.ds > 2) this.passCar = null;
          else { wantD = o.d + this.passSide * 2.4; attacking = true; }
        }
      }
      if (o.ds > CAR_LEN && o.ds < 110 && absLat < 1.9 && this.passCar !== o.car) {
        // a car ahead in my lane: overtake it or follow at a safe speed
        const gap = o.ds - CAR_LEN;
        const closing = sp - o.v;
        let started = false;
        if (!this.passCar && closing > 0.6 - this.aggr * 0.5 && gap < 26 && dCorner > 70) {
          const need = (o.ds + 7) / Math.max(closing, 0.5);
          if (need < tCorner * (0.6 + this.aggr * 0.25)) {
            const roomL = tr.wl[li] - 1.1 - o.d, roomR = tr.wr[li] - 1.1 + o.d;
            const pref = cSign || 1;
            const side = (pref > 0 ? roomL : roomR) > 2.4 ? pref : roomL > 2.4 ? 1 : roomR > 2.4 ? -1 : 0;
            if (side !== 0) { this.passCar = o.car; this.passSide = side; wantD = o.d + side * 2.4; attacking = true; started = true; passSeen = true; }
          }
        }
        if (!started) {
          // fastest speed from which I could still slow to his speed in the gap I have
          const vSafe = Math.sqrt(o.v * o.v + 2 * 13 * Math.max(gap - 3, 0));
          if (vSafe < vLimit) vLimit = vSafe;
          if (gap < 3 && o.v - 0.5 < vLimit) vLimit = o.v - 0.5;
        }
      } else if (Math.abs(o.ds) <= CAR_LEN + 0.6 && absLat < 2.7) {
        // side by side: keep to my half of the road
        const mySide = lat > 0 ? -1 : 1;
        const lim = o.d + mySide * 2.35;
        wantD = wantD == null ? lim : mySide > 0 ? Math.max(wantD, lim) : Math.min(wantD, lim);
        // on the outside going into a corner and not clearly ahead: give the place up
        if (dCorner < 95 && cSign !== 0 && mySide !== cSign && o.ds > -3.2) {
          if (o.v - 2.5 < vLimit) vLimit = o.v - 2.5;
        }
      }
    }
    if (this.passCar && !passSeen) this.passCar = null;

    // ---- lateral target ---------------------------------------------------------------------
    const look = 4.5 + sp * 0.26;
    const iT = tr.idx(loc.s + look);
    const lineD = line.off[iT];
    const target = wantD == null ? 0 : clamp(wantD, -(tr.wr[li] - 1.05), tr.wl[li] - 1.05) - line.off[li];
    this.dOff = approach(this.dOff, target, (wantD == null ? 1.3 : 2.6) * dt);
    const dT = clamp(lineD + this.dOff, -(tr.wr[iT] - 1.05), tr.wl[iT] - 1.05);
    tr.posAt(loc.s + look, dT, tmp);
    const dx = tmp.x - v.x, dz = tmp.z - v.z;
    const sn = Math.sin(v.psi), cs = Math.cos(v.psi);
    const fwd = dx * sn + dz * cs, left = dx * cs - dz * sn;
    const eta = Math.atan2(left, Math.max(fwd, 0.5));
    let delta = Math.atan((2 * v.L * Math.sin(eta)) / Math.hypot(dx, dz));
    // yaw damping: steer against any rotation the line does not ask for (catches slides early)
    const kHere = line.kappa[tr.idx(loc.s + look * 0.35)];
    delta += 0.07 * (sp * kHere - v.r);
    c.steer = clamp(delta / (v.lockNow || v.p.steerLock), -1, 1);

    // ---- speed -----------------------------------------------------------------------------
    if (this.mistakeT > 0) this.mistakeT -= dt;
    else {
      this.mistake = 1.2 + this.rng() * 0.8;
      this.mistakeT = 25 + this.rng() * (30 + this.ratings.consistency * 1.6);
    }
    let pace = 1;
    if (this.mistake > 0) { this.mistake -= dt; pace = 1.03; }
    // The driver feels how much grip the tyres have right now (cold, overheated or worn tyres
    // have less) and slows down to match. Corner speed scales with the square root of grip.
    // (the weaker axle decides: hot rear tyres mean oversteer even if the fronts are fine)
    const gNow = Math.min(v.gripF[0] + v.gripF[1], v.gripF[2] + v.gripF[3]) / 2;
    this.feel += (Math.sqrt(clamp(gNow, 0.5, 1)) - this.feel) * Math.min(1, dt * 2);
    // Aim at the speed wanted a moment ahead, so braking starts on time instead of late.
    const iV = tr.idx(loc.s + sp * 0.16), iN = tr.idx(loc.s + sp * 0.05);
    let vT = Math.min(this.profile[iV], this.profile[iN] + 1.5);
    // off the ideal line the corner is tighter: blend toward the lane-following speed
    const off01 = clamp(Math.abs(this.dOff) / 1.6, 0, 1);
    if (off01 > 0) vT = lerp(vT, Math.min(vT, this.profileCL[iV] * 1.04, this.profileCL[iN] * 1.04 + 1.5), off01);
    vT *= pace * this.feel;
    if (vT > vLimit) vT = Math.max(vLimit, 0);
    const err = vT - sp;
    if (err > -0.4) {
      c.throttle = clamp(0.2 + err * 0.5, 0, 1);
      c.brake = 0;
    } else {
      c.throttle = 0;
      c.brake = clamp((-err - 0.3) * 0.85, 0, 1);
    }
    // Friction circle: the more grip cornering is using, the less is left for throttle or brakes.
    const p = v.p;
    const capLat = p.mu * this.gripUse * (9.81 + (0.6125 * p.aero.clA * sp * sp) / (p.mass + v.fuel));
    const use = Math.min(1, Math.abs(v.ayF) / capLat);
    const spare = Math.sqrt(1 - use * use);
    c.throttle = Math.min(c.throttle, 0.12 + spare * 1.1);
    c.brake = Math.min(c.brake, 0.08 + spare * 1.15);
    // sliding: come off the throttle until the car is pointing the right way again
    const slide = Math.abs(v.vy) / Math.max(sp, 6);
    if (slide > 0.09) c.throttle *= clamp(1 - (slide - 0.09) * 9, 0, 1);
    const soc = p.engine.batteryMj ? v.battery / (p.engine.batteryMj * 1e6) : 0;
    c.boost = attacking && soc > 0.35 && err > 2;

    // ---- stuck detection (spun, in the gravel, against a wall) -----------------------------
    if (sp < 2.5 && sinceGo > 4 && vLimit > 4) this.stuckT += dt;
    else this.stuckT = 0;
  }
}
