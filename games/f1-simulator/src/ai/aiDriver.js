// AI driver. Drives the same Vehicle model as the player through steering / throttle / brake.
//  - follows the racing line with a look-ahead (pure pursuit) steering law plus yaw damping
//  - brakes and accelerates to a speed profile computed for its own car and skill
//  - each driver has a fixed personality from their ratings (never random from moment to
//    moment): how readily they attack, how hard they defend, and whether they let a clearly
//    faster car through
//  - keeps a safe gap to the car in front, pulls out to overtake only when the pass can be
//    finished before the next corner, holds its lane when side by side and gives way when it
//    is on the outside going into a corner
//  - moves off the racing line to let a faster car by (always when about to be lapped)
//  - slows down when off the ideal line and when its tyres are cold, hot or worn
//  - has a reaction time at the start and makes occasional small mistakes (running a little
//    wide, braking a touch late) based on its consistency rating
import { clamp, approach, lerp, wrapPi } from '../core/math.js';
import { computeSpeedProfile, finishLine } from '../track/racingLine.js';
import { profileCar } from '../physics/vehicle.js';

/** Global calibration: how much of the theoretical grip a 100%-difficulty top driver uses. */
export const AI_TUNING = { gripCal: 0.885 };

const tmp = { x: 0, z: 0, psi: 0 };
const CAR_LEN = 5.6;
const LANE = 2.1;          // lateral gap (m) below which another car is in my lane
const SEP = 2.4;           // closest lateral spacing (m) kept to a car beside me
const START_HOLD_M = 160;  // metres past the start line before leaving the grid column
const MOVING = 8;          // m/s: slower than this a car is an obstacle to drive round, not a rival

export class AIDriver {
  constructor({ veh, track, line, ratings, difficulty = 80, rng = Math.random }) {
    this.veh = veh;
    this.track = track;
    this.line = line;
    this.rng = rng;
    this.ratings = ratings;
    this.car = null;          // the session's car record (set by the session)
    const base = 0.80 + 0.195 * (difficulty / 100);
    this.gripUse = clamp((base + (ratings.racePace - 90) * 0.002) * AI_TUNING.gripCal, 0.5, 1.0);
    const car = profileCar(veh.p);
    this.profile = computeSpeedProfile(track, line, car, this.gripUse);
    // speed possible when forced to run parallel to the track edge instead of on the ideal line
    if (!track._centreLine) track._centreLine = finishLine(track, new Float32Array(track.n));
    this.profileCL = computeSpeedProfile(track, track._centreLine, car, this.gripUse);
    // ---- personality (fixed for the whole race) -------------------------------------------
    const r01 = (v) => clamp((v - 70) / 28, 0, 1);
    this.aggr = clamp(ratings.aggression / 100, 0, 1);
    this.attack = clamp(0.55 * r01(ratings.overtaking) + 0.45 * this.aggr, 0, 1);   // goes for gaps
    this.defend = clamp(0.5 * r01(ratings.defending) + 0.5 * this.aggr, 0, 1);      // covers the inside
    this.yields = this.defend < 0.72;      // lets a clearly faster car through rather than fight it
    this.followGap = lerp(4.5, 1.8, this.aggr);                                        // metres kept behind a car
    this.dOff = 0;            // current lateral offset from the racing line (m)
    this.feel = 1;            // how much of the car's normal grip the driver senses (0..1)
    this.reaction = 0.16 + rng() * 0.22 + (100 - ratings.consistency) * 0.004;
    // mistakes: rare for consistent drivers, a small error rather than a burst of speed
    this.mistakeEvery = 70 + ratings.consistency * 2.4;
    this.mistakeT = this.mistakeEvery * (0.5 + rng());
    this.mistake = 0;
    this.mistakeSide = 1;
    this.stuckT = 0;
    this.passCar = null;
    this.passSide = 0;
    this.defendSide = 0;
    this.defendT = 0;
    this.yieldSide = 0;
    this.chaseT = new Map();  // how long each car behind has been closing on us
    this.gridD = null;        // lateral position on the grid (race starts keep this lane at first)
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
      if (sinceGo < 0 && this.gridD == null) this.gridD = loc.d;
      c.throttle = 0; c.brake = 1; c.steer = 0; c.boost = false;
      return;
    }
    const sp = v.speed;
    const myD = loc.d;
    const li = loc.i;
    const me = this.car;

    // ---- traffic ---------------------------------------------------------------------------
    this._corner(loc.s);
    const dCorner = this.cornerDist, cSign = this.cornerSign;
    const tCorner = dCorner / Math.max(sp, 10);
    let vLimit = Infinity, wantD = null, attacking = false, passSeen = false, pushing = false, beside = false;
    let threat = null;                      // the faster car closing from behind, if any
    let lo = -Infinity, hi = Infinity;      // lateral room left by the cars around me
    const yawMe = Math.sin(wrapPi(v.psi - tr.psi[li]));   // my angle to the track (sine, + = pointing left)
    if (this.defendT > 0) this.defendT -= dt;
    for (let k = 0; k < near.length; k++) {
      const o = near[k];
      const lat = o.d - myD;                 // > 0: the other car is on my left
      const absLat = Math.abs(lat);
      // Never steer across into a car that is beside me, or just ahead / behind in the next
      // lane (a car straight behind me in my lane is its own driver's problem). Allow for where
      // it is heading in the next moment and for both cars being angled in a corner (an angled
      // car takes up more of the road's width).
      const overlap = Math.abs(o.ds) < CAR_LEN + 0.3;
      const diag = Math.abs(o.ds) <= CAR_LEN + 2.5 && absLat >= LANE;
      if ((overlap || diag) && absLat < 5.5) {
        const ov = o.car && o.car.veh;
        const yawO = ov && ov.loc.i >= 0 ? Math.sin(wrapPi(ov.psi - tr.psi[ov.loc.i])) : 0;
        // how fast we are closing sideways (m/s, + = it moves left relative to me); two cars
        // following the same curve move sideways together, so only the difference counts
        const relV = o.v * yawO - sp * yawMe;
        // two cars angled differently need more room (their noses or tails swing out)
        const sep = Math.min(SEP + 1.75 * Math.abs(yawO - yawMe), 3.2);
        const bound = lat > 0 ? o.d + Math.min(relV, 0) * 0.3 - sep : o.d + Math.max(relV, 0) * 0.3 + sep;
        if (lat > 0) hi = Math.min(hi, bound); else lo = Math.max(lo, bound);
        // squeezed towards the edge by a car that is level or ahead: back out of it rather
        // than be pushed off the track
        const squeezed = lat > 0 ? bound < -(tr.wr[li] - 1.3) : bound > tr.wl[li] - 1.3;
        if (squeezed && o.ds > -1.5 && o.v > MOVING && o.v - 1.5 < vLimit) vLimit = o.v - 1.5;
      }
      // the car I am in the middle of passing
      if (this.passCar === o.car) {
        passSeen = true;
        const obstacle = o.v < MOVING;       // a stopped or crawling car: just get round it
        if (o.ds < -(CAR_LEN + 1.5) || o.ds > 45 || (dCorner < 45 && o.ds > 3 && !obstacle)) this.passCar = null;
        else {
          const room = this.passSide > 0 ? tr.wl[li] - 1.1 - o.d : tr.wr[li] - 1.1 + o.d;
          if (room < 2.0 && o.ds > 2) this.passCar = null;
          else { wantD = o.d + this.passSide * 2.4; attacking = true; }
        }
      }
      if (o.ds > CAR_LEN && o.ds < 110 && absLat < LANE && this.passCar !== o.car) {
        // a car ahead in my lane: overtake it or follow at a safe speed
        const gap = o.ds - CAR_LEN;
        const closing = sp - o.v;
        if (gap < 30) pushing = true;
        let started = false;
        const keen = 0.9 - this.attack * 0.8;          // closing speed needed before trying
        if (!this.passCar && o.v < MOVING && gap < 40 && sinceGo > 8) {
          // stopped or crawling car in my way (spun, stuck): steer round it on the side with room
          const roomL = tr.wl[li] - 1.1 - o.d, roomR = tr.wr[li] - 1.1 + o.d;
          const side = roomL >= roomR ? (roomL > 2.2 ? 1 : 0) : (roomR > 2.2 ? -1 : 0);
          if (side !== 0) { this.passCar = o.car; this.passSide = side; wantD = o.d + side * 2.4; attacking = true; started = true; passSeen = true; }
        }
        if (!this.passCar && closing > keen && gap < 26 && dCorner > 70) {
          const need = (o.ds + 7) / Math.max(closing, 0.5);
          if (need < tCorner * (0.55 + this.attack * 0.35)) {
            const roomL = tr.wl[li] - 1.1 - o.d, roomR = tr.wr[li] - 1.1 + o.d;
            const pref = cSign || 1;
            const side = (pref > 0 ? roomL : roomR) > 2.4 ? pref : roomL > 2.4 ? 1 : roomR > 2.4 ? -1 : 0;
            if (side !== 0) { this.passCar = o.car; this.passSide = side; wantD = o.d + side * 2.4; attacking = true; started = true; passSeen = true; }
          }
        }
        if (!started) {
          // fastest speed from which I could still slow to his speed in the gap I have (if he is
          // braking, expect him to keep braking for a moment rather than hold today's speed)
          const oBrake = o.car ? Math.min(o.car.veh.axF, 0) : 0;
          const vLead = Math.max(o.v + oBrake * 0.35, 0);
          const vSafe = Math.sqrt(vLead * vLead + 2 * 13 * Math.max(gap - this.followGap, 0));
          if (vSafe < vLimit) vLimit = vSafe;
          if (gap < 3 && o.v - 0.5 < vLimit) vLimit = o.v - 0.5;
        }
      } else if (Math.abs(o.ds) <= CAR_LEN + 0.6 && absLat < 2.7) {
        // side by side: keep to my half of the road (the room limits above do the steering)
        const mySide = lat > 0 ? -1 : 1;
        beside = true;
        // on the outside going into a corner and not clearly ahead: give the place up
        if (dCorner < 95 && cSign !== 0 && mySide !== cSign && o.ds > -3.2 && o.v > MOVING) {
          if (o.v - 2.5 < vLimit) vLimit = o.v - 2.5;
        }
      } else if (o.ds < -CAR_LEN && o.ds > -60 && o.car) {
        // a car behind: is it clearly faster? Either it is catching me quickly, or it has been
        // sitting right behind me for a while and its lap times are better than mine.
        const closing = o.v - sp;
        const rec = this.chaseT.get(o.car) || { t: 0, close: 0 };
        rec.t = closing > 0.7 && o.ds > -40 ? rec.t + dt : Math.max(0, rec.t - dt * 0.35);
        rec.close = o.ds > -16 ? rec.close + dt : Math.max(0, rec.close - dt);
        this.chaseT.set(o.car, rec);
        const quicker = o.car.bestLap && (!me || !me.bestLap || o.car.bestLap < me.bestLap - 0.2);
        const lapping = me && o.car.lapsDone > me.lapsDone;
        if (lapping || rec.t > 0.6 || (rec.close > 4 && quicker)) {
          if (!threat || o.ds > threat.ds) threat = { ...o, lapping, stuck: rec.close, quicker: quicker || rec.t > 1.5 };
        }
      }
    }
    if (this.passCar && !passSeen) this.passCar = null;

    // ---- let a faster car by, or defend --------------------------------------------------
    // No letting cars by in the first-lap scramble (everyone's speed differs for a moment);
    // being lapped (blue flags) always counts.
    if (threat && !threat.lapping && me && me.lapsDone < 1) threat = null;
    if (threat && wantD == null && !attacking && !beside) {
      // a real straight: no corner close ahead AND no long fast curve here (Curva Grande is
      // flat out but still a corner; moving over there would put the car on the outside edge)
      let curvy = 0;
      for (let m = -20; m <= 140; m += 10) curvy = Math.max(curvy, Math.abs(line.kappa[tr.idx(loc.s + m)]));
      const straight = dCorner > 90 && curvy < 1 / 700;
      // even a stubborn defender stops fighting a car that has been all over it for a while
      const givesUp = !this.yields && threat.quicker && threat.stuck > 6 + 6 * this.defend;
      if (threat.lapping || ((this.yields || givesUp) && straight)) {
        // leave the faster car a clear way past. If it has already pulled out to one side,
        // go the other way; if it is right behind on the racing line, leave the line.
        if (!this.yieldSide) {
          const lineHere = line.off[li];
          if (Math.abs(threat.d - lineHere) > 1.4) this.yieldSide = threat.d > myD ? -1 : 1;
          else {
            const lo = line.off[tr.idx(loc.s + 60)];
            this.yieldSide = Math.abs(lo) > 0.8 ? -Math.sign(lo) : (Math.sign(myD - threat.d) || -(cSign || 1));
          }
        }
        const roomTo = this.yieldSide > 0 ? tr.wl[li] - 1.7 : -(tr.wr[li] - 1.7);
        this.gentle = true;
        // never move across into it: if it is already on the side I was heading for, hold here
        const onMySide = Math.sign(threat.d - myD) === this.yieldSide && Math.abs(threat.d - myD) < 3.2 && threat.ds > -14;
        wantD = onMySide ? myD : roomTo;
        // Once over to the side, ease off the throttle so the faster car can actually get by
        // (on a straight both cars would otherwise be flat out at the same speed).
        const aside = Math.abs(myD - wantD) < 0.9 || onMySide;
        if (aside && threat.ds > -30 && straight) vLimit = Math.min(vLimit, sp * 0.995);
        else if (threat.lapping) vLimit = Math.min(vLimit, sp * 0.99 + 0.1);
      } else if (!this.yields && dCorner < 260 && dCorner > 60 && threat.ds > -14 && cSign !== 0) {
        // one defensive move to the inside of the next corner, then hold it to the braking zone
        if (!this.defendSide && this.defendT <= 0) { this.defendSide = cSign; this.defendT = 4; }
        if (this.defendSide) {
          const inside = this.defendSide > 0 ? tr.wl[li] - 2.2 : -(tr.wr[li] - 2.2);
          wantD = clamp(inside, -(tr.wr[li] - 1.2), tr.wl[li] - 1.2);
        }
      }
    } else {
      this.yieldSide = 0;
    }
    if (dCorner > 300 || !threat) this.defendSide = 0;

    // ---- small mistakes -------------------------------------------------------------------
    if (this.mistakeT > 0) this.mistakeT -= dt;
    else {
      this.mistake = 1.3 + this.rng() * 0.7;
      this.mistakeSide = this.rng() < 0.5 ? 1 : -1;
      this.mistakeT = this.mistakeEvery * (0.6 + this.rng() * 0.8);
    }
    let late = 1;
    if (this.mistake > 0) {
      this.mistake -= dt;
      late = 1.012;                                   // brakes a touch late...
      if (wantD == null) wantD = line.off[li] + this.mistakeSide * 0.9;   // ...and runs a little off line
    }

    // ---- lateral target ---------------------------------------------------------------------
    const look = 4.5 + sp * 0.26;
    const iT = tr.idx(loc.s + look);
    const lineD = line.off[iT];
    // Race start: keep to the grid column until the field has strung out, instead of everyone
    // sweeping across to the racing line at once.
    const hold = this.gridD != null && wantD == null && sinceGo < 9 && (!me || !me.crossed || loc.s < START_HOLD_M);
    let want = wantD != null ? wantD : hold ? this.gridD : null;
    const roomed = lo > -Infinity || hi < Infinity;
    const lineHere = line.off[li];
    if (roomed) {
      const base = want == null ? lineHere + this.dOff : want;
      const fit = lo <= hi ? clamp(base, lo, hi) : (lo + hi) / 2;
      if (want != null || Math.abs(fit - base) > 0.01) want = fit;
    }
    const target = want == null ? 0 : clamp(want, -(tr.wr[li] - 1.05), tr.wl[li] - 1.05) - lineHere;
    if (hold) this.dOff = target;
    else this.dOff = approach(this.dOff, target, (want == null ? 1.3 : this.gentle ? 1.5 : 2.6) * dt);
    this.gentle = false;
    let dT = hold ? lineHere + this.dOff : lineD + this.dOff;
    if (roomed) dT = lo <= hi ? clamp(dT, lo, hi) : (lo + hi) / 2;
    dT = clamp(dT, -(tr.wr[iT] - 1.05), tr.wl[iT] - 1.05);   // the track edge always wins
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
    // aggressive drivers push a little harder when they are in a fight (always, not randomly)
    const fight = pushing || attacking || (threat && !this.yields) ? 1 + 0.008 * this.aggr : 1;
    vT *= late * this.feel * fight;
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
    c.boost = (attacking && soc > 0.35 && err > 2) || (threat && !this.yields && soc > 0.5 && err > 2 && dCorner > 150);
    this.yielding = !!(threat && wantD != null && (threat.lapping || this.yields));
    this.dbg = { lo, hi, vLimit, vT, wantD, beside, hold };   // for test pages

    // ---- stuck detection (spun, in the gravel, against a wall) -----------------------------
    // (held up by traffic counts more slowly, so a jam that does not clear still gets reset)
    if (sp < 2.5 && sinceGo > 4) this.stuckT += vLimit > 4 ? dt : dt * 0.4;
    else this.stuckT = 0;
  }
}
