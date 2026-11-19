// UK Simulator - engines, gearboxes, clutches, electric motors, batteries and pedal power.
// Each power source answers one question per physics sub-step: "given how fast the driven
// wheels are turning, how much torque reaches them?" and keeps its own state (rpm, gear,
// clutch, battery charge, rider stamina).

const RPM = 60 / (2 * Math.PI);

function interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) { const a = table[i - 1], b = table[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  }
  return table[table.length - 1][1];
}

// ---------------------------------------------------------------- petrol / diesel engine + gearbox
export class Engine {
  constructor(eng, box, tune = {}) {
    this.e = eng; this.box = box;
    this.powerScale = tune.power ?? 1;
    this.rpm = eng.idle;
    this.gear = 1;                 // 0 = neutral, -1 = reverse, 1.. = forward
    this.auto = box.auto;
    this.shiftTimer = 0;
    this.clutch = 0;               // 0 = open .. 1 = locked
    this.throttle = 0;
    this.torqueOut = 0;
    this.damage = 0;               // 0..1 power loss from crashes
    this.stalled = false;
    this.limiterCut = 0;
  }

  get ratio() {
    if (this.gear === 0) return 0;
    if (this.gear < 0) return -this.box.reverse * this.box.final;
    return this.box.ratios[this.gear - 1] * this.box.final * (this.lowRange ? this.box.low || 1 : 1);
  }

  engineTorque(rpm, throttle) {
    const full = interp(this.e.torque, rpm) * this.powerScale * (1 - 0.6 * this.damage);
    const drag = (this.e.brakeTorque || 10) * (0.35 + 0.65 * rpm / this.e.redline);
    return throttle * full - (1 - throttle) * drag;
  }

  shift(dir) {
    if (this.shiftTimer > 0) return;
    const n = this.box.ratios.length;
    const g = Math.max(this.box.reverse ? -1 : 0, Math.min(n, this.gear + dir));
    if (g !== this.gear) { this.gear = g; this.shiftTimer = this.box.shiftTime; }
  }

  // wheelOmega: average driven wheel speed (rad/s); returns torque at the driven wheels (N m)
  // and the extra inertia the engine adds to them while the clutch is locked.
  update(dt, throttle, wheelOmega, speed, wantReverse, brake) {
    const e = this.e, box = this.box;
    this.throttle = throttle;
    // automatic gearbox
    if (this.auto && this.shiftTimer <= 0) {
      const n = box.ratios.length;
      if (wantReverse && speed < 1.0 && this.gear >= 0 && box.reverse) { this.gear = -1; this.shiftTimer = box.shiftTime; }
      else if (!wantReverse && this.gear <= 0 && (throttle > 0.05 || speed > 1)) { this.gear = 1; this.shiftTimer = box.shiftTime * 0.5; }
      else if (this.gear > 0) {
        const up = e.redline * (0.62 + 0.33 * throttle), down = e.idle + (e.redline - e.idle) * (0.18 + 0.22 * throttle);
        const rpmIn = Math.abs(wheelOmega * this.ratio) * RPM;
        if (rpmIn > up && this.gear < n) this.shift(1);
        else if (this.gear > 1) {
          const lower = box.ratios[this.gear - 2] * box.final;
          const rpmLower = Math.abs(wheelOmega * lower) * RPM;
          if (rpmIn < down && rpmLower < e.redline * 0.9) this.shift(-1);
        }
      }
    }
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    const shifting = this.shiftTimer > 0;
    const ratio = this.ratio;
    // gearbox input speed (signed: positive when the wheels turn the way this gear drives them)
    const inRpm = wheelOmega * ratio * RPM;
    const rpmWheels = Math.abs(inRpm);
    // auto clutch: slips while pulling away (holding the revs up in the engine's torque band),
    // locks once the wheels can keep the engine above idle
    if (!this.peakRpm) { let best = e.torque[0]; for (const p of e.torque) if (p[1] > best[1]) best = p; this.peakRpm = Math.max(best[0], e.idle + 1500); }
    const launchRpm = e.idle + (this.peakRpm - e.idle) * (0.35 + 0.55 * throttle);
    let clutchTarget;
    if (shifting || ratio === 0) clutchTarget = 0;
    else if (rpmWheels > e.idle * 1.1) clutchTarget = 1;
    else clutchTarget = Math.max(0, Math.min(1, (this.rpm - e.idle * 1.05) / (launchRpm - e.idle * 1.05)));
    if (brake > 0.5 && rpmWheels < e.idle) clutchTarget = 0;
    this.clutch += (clutchTarget - this.clutch) * Math.min(1, dt * (clutchTarget > this.clutch ? 6 : 20));
    const thr = shifting ? 0 : throttle;
    // rev limiter
    // (cuts the fuel until the revs have dropped back below the limiter)
    if (this.rpm > e.limiter) this.limiterCut = 0.06;
    else if (this.limiterCut > 0 && this.rpm > e.limiter - 250) this.limiterCut = Math.max(this.limiterCut, dt * 2);
    if (this.limiterCut > 0) this.limiterCut -= dt;
    const thrEff = this.limiterCut > 0 ? 0 : Math.max(thr, this.rpm < e.idle ? 0.25 * (e.idle - this.rpm) / e.idle + 0.08 : 0);
    let wheelTorque = 0, extraInertia = 0;
    if (this.clutch > 0.98 && ratio !== 0) {
      // locked: the engine turns with the wheels
      this.rpm = Math.max(e.idle * 0.6, rpmWheels);
      const te = this.engineTorque(this.rpm, thrEff);
      wheelTorque = te * ratio * box.efficiency;
      extraInertia = e.inertia * ratio * ratio;
    } else {
      // slipping clutch: friction torque between engine and gearbox
      const te = this.engineTorque(this.rpm, thrEff);
      const cap = interp(e.torque, e.redline * 0.6) * 1.4 * this.clutch;
      const slip = this.rpm - inRpm;
      const tc = Math.max(-cap, Math.min(cap, slip * 0.5));
      // internal friction grows with engine speed (rad/s)
      const omegaE = this.rpm / RPM + (te - tc - e.friction * (this.rpm / RPM)) / e.inertia * dt;
      this.rpm = Math.max(e.idle * 0.5, Math.min(e.limiter + 200, omegaE * RPM));
      wheelTorque = tc * ratio * box.efficiency;
    }
    this.torqueOut = wheelTorque;
    return { torque: wheelTorque, inertia: extraInertia };
  }
}

// ---------------------------------------------------------------- scooter CVT (twist and go)
export class CvtEngine {
  constructor(eng, tune = {}) {
    this.e = eng; this.rpm = eng.idle; this.powerScale = tune.power ?? 1; this.damage = 0; this.throttle = 0; this.gear = 1; this.auto = true;
    this.torqueOut = 0;
  }
  get ratio() { return this.curRatio || this.e.cvtLow; }
  shift() {}
  update(dt, throttle, wheelOmega, speed) {
    const e = this.e;
    this.throttle = throttle;
    // the CVT holds the engine near its power peak under throttle and changes ratio with speed
    const targetRpm = throttle > 0.05 ? e.idle + (8000 - e.idle) * Math.min(1, 0.35 + throttle) : e.idle;
    const ratioNeeded = Math.abs(wheelOmega) > 0.5 ? (targetRpm / RPM) / Math.abs(wheelOmega) : e.cvtLow;
    this.curRatio = Math.max(e.cvtHigh, Math.min(e.cvtLow, ratioNeeded));
    const rpmWheels = Math.abs(wheelOmega) * this.curRatio * RPM;
    this.rpm += ((Math.max(rpmWheels, throttle > 0.05 ? Math.min(targetRpm, e.clutchIn + 1500 * throttle) : e.idle)) - this.rpm) * Math.min(1, dt * 8);
    // centrifugal clutch bites above clutchIn rpm
    const bite = Math.max(0, Math.min(1, (this.rpm - e.clutchIn) / 1200));
    const te = interp(e.torque, this.rpm) * throttle * this.powerScale * (1 - 0.6 * this.damage);
    const t = te * this.curRatio * e.efficiency * bite - (throttle < 0.05 ? 2.5 * Math.sign(wheelOmega) * Math.min(1, Math.abs(wheelOmega)) : 0);
    this.torqueOut = t;
    return { torque: t, inertia: 0 };
  }
}

// ---------------------------------------------------------------- battery
export class Battery {
  constructor(spec, tune = {}) {
    this.wh = spec.wh * (tune.battery ?? 1);
    this.volts = spec.volts;
    this.charge = 1; // 0..1
    this.usedWh = 0; this.regenWh = 0;
  }
  // power in watts (+ draw, - regen) for dt seconds
  drain(watts, dt) {
    const wh = watts * dt / 3600;
    this.charge = Math.max(0, Math.min(1, this.charge - wh / this.wh));
    if (wh > 0) this.usedWh += wh; else this.regenWh -= wh;
  }
  // voltage sag: a nearly flat pack gives less top speed and power
  get sag() { return 0.82 + 0.18 * Math.min(1, this.charge / 0.3); }
  get empty() { return this.charge <= 0.002; }
}

// ---------------------------------------------------------------- hub motor (e-scooters, e-bike)
export class Motor {
  constructor(spec, battery, tune = {}) {
    this.s = spec; this.bat = battery;
    this.powerScale = tune.power ?? 1;
    this.mode = 3;           // speed mode (scooters have 1-3, like the real ones)
    this.watts = 0; this.torqueOut = 0; this.damage = 0;
  }
  // omega: wheel spin (rad/s), r: wheel radius, throttle 0..1, regen 0..1 (brake lever)
  update(dt, throttle, omega, r, brake, pedalWatts = 0) {
    const s = this.s, bat = this.bat;
    const v = Math.abs(omega * r);
    const modeTop = s.cutoff * [0, 0.45, 0.7, 1][this.mode] * (1 + 0.05 * (this.speedUp || 0));
    let t = 0;
    if (!bat.empty && throttle > 0) {
      const peak = s.peakW * this.powerScale * bat.sag * (1 - 0.5 * this.damage);
      // constant torque at low speed, then constant power, fading to zero at the cut-off speed
      const fade = Math.max(0, Math.min(1, (modeTop - v) / (modeTop * 0.025 + 0.15)));
      const tMax = s.torque * this.powerScale;
      t = Math.min(tMax, peak / Math.max(0.5, Math.abs(omega))) * throttle * fade;
      // e-bike: assist is a multiple of the rider's pedalling power, legal limit 25 km/h
      if (s.assist) t = Math.min(t, (pedalWatts * s.assist) / Math.max(0.5, Math.abs(omega))) * (pedalWatts > 5 ? 1 : 0);
    }
    let elec = Math.abs(t * omega) / s.efficiency;
    // regenerative braking
    let regenT = 0;
    if (brake > 0.05 && s.regen && v > 1.5 && bat.charge < 0.999) {
      regenT = -Math.sign(omega) * Math.min(s.torque * s.regen * brake, (s.peakW * 0.4) / Math.max(1, Math.abs(omega)));
      elec -= Math.abs(regenT * omega) * 0.6;
    }
    this.watts = elec + 6; // + controller / lights
    bat.drain(this.watts, dt);
    this.torqueOut = t + regenT;
    return this.torqueOut;
  }
}

// ---------------------------------------------------------------- rider pedalling (bikes)
export class Rider {
  constructor(spec) {
    this.s = spec; this.stamina = 1; this.cadence = 0; this.watts = 0;
  }
  // returns pedalling force at the rear contact patch (N)
  update(dt, throttle, speed, sprint) {
    const s = this.s;
    let p = 0;
    if (throttle > 0.02) {
      const want = sprint && this.stamina > 0.05 ? s.sprintW : s.sustainW;
      p = want * throttle * (0.35 + 0.65 * Math.min(1, this.stamina * 2));
    }
    // stamina: drains above sustainable power, recovers below it
    const over = (p - s.sustainW) / (s.sprintW - s.sustainW);
    this.stamina = Math.max(0, Math.min(1, this.stamina - (over > 0 ? over * dt / 12 : -dt / 25 * (1 - p / s.sprintW))));
    this.watts = p;
    this.cadence = speed > 0.5 && throttle > 0.02 ? Math.min(110, 60 + speed * 3) : 0;
    return Math.min(s.maxForce, p / Math.max(1.2, speed));
  }
}
