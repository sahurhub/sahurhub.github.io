// Race session: owns every car on track, runs the start procedure, counts laps, keeps the
// timing screens (lap, sector, gaps), works out positions and builds the final classification.
import { clamp, makeRng } from '../core/math.js';
import { Vehicle, makeSpec, PHYSICS_DT } from '../physics/vehicle.js';
import { AIDriver } from '../ai/aiDriver.js';

const MARK = 100; // metres between timing markers used for gaps
const tmp = { x: 0, z: 0, psi: 0 };
const CIRC = [1.75, 0, -1.75];
const CR = 0.92;

function ratingsOf(season, d) {
  const o = {};
  season.driverFields.forEach((f, i) => (o[f] = d.r[i]));
  return o;
}

export class RaceSession {
  /**
   * @param o { track, line, regs, season, mode: 'race'|'timetrial'|'practice', laps, difficulty,
   *            playerDriverId, playerGrid ('pole'|'mid'|'back'|number), assists, compound, seed }
   */
  constructor(o) {
    this.o = o;
    this.track = o.track;
    this.line = o.line;
    this.regs = o.regs;
    this.season = o.season;
    this.mode = o.mode || 'race';
    this.laps = o.laps || 5;
    this.rng = makeRng(o.seed || (Date.now() & 0xffffff));
    this.time = 0;          // seconds since lights out (negative before)
    this.clock = 0;         // seconds since the session object was created
    this.state = 'grid';    // grid -> racing -> finished
    this.lights = 0;        // number of red lights lit (0..5)
    this.events = [];       // { t, text, type }
    this.sub = 0;
    this.fastest = null;    // { car, time }
    this.cars = [];
    this.order = [];
    this.nMark = Math.floor(this.track.length / MARK);
    this._build();
  }

  _build() {
    const { season, regs, track, o } = this;
    const teams = Object.fromEntries(season.teams.map((t) => [t.id, t]));
    let entries;
    if (this.mode === 'race') {
      entries = season.drivers.map((d) => ({ d, score: 0 }));
      for (const e of entries) {
        const r = ratingsOf(season, e.d);
        e.score = teams[e.d.team].perf * 100 + r.qualifying * 0.12 + (this.rng() - 0.5) * 1.2;
      }
      entries.sort((a, b) => b.score - a.score);
      const pi = entries.findIndex((e) => e.d.id === o.playerDriverId);
      if (pi >= 0) {
        const [pe] = entries.splice(pi, 1);
        const n = entries.length;
        let slot = o.playerGrid;
        if (slot === 'pole') slot = 0;
        else if (slot === 'back') slot = n;
        else if (slot === 'mid' || slot == null) slot = Math.floor(n / 2);
        entries.splice(clamp(slot, 0, n), 0, pe);
      }
    } else {
      entries = season.drivers.filter((d) => d.id === o.playerDriverId).map((d) => ({ d }));
    }
    const m = track.meta;
    const poleLeft = (m.gridPoleSide || 'left') === 'left';
    entries.forEach((e, k) => {
      const d = e.d, team = teams[d.team];
      const isPlayer = d.id === o.playerDriverId;
      const spec = makeSpec(regs, { perf: team.perf, compound: o.compound || 'soft', fuel: o.fuel });
      const veh = new Vehicle(spec);
      const ratings = ratingsOf(season, d);
      const car = {
        id: d.id, driver: d, team, isPlayer, veh, ratings,
        ctl: { steer: 0, throttle: 0, brake: 0, shift: 0, aero: true, boost: false },
        ai: null, grid: k + 1, pos: k + 1,
        lapsDone: 0, crossed: false, lapStart: 0, lastLap: null, bestLap: null,
        sector: 0, sectorStart: 0, curSectors: [null, null, null], bestSectors: [null, null, null], lastSectors: [null, null, null],
        lapInvalid: false, prevS: 0, progress: 0, finished: false, finishTime: null,
        gapAhead: null, gapLeader: null, passT: [], markNext: 0, near: [], topSpeed: 0,
        offTime: 0, resets: 0,
      };
      if (this.mode === 'race') {
        const s = track.length - (m.gridFirstSlotM || 8) - k * (m.gridSpacingM || 8);
        const side = (k % 2 === 0) === poleLeft ? 1 : -1;
        track.posAt(s, side * 2.7, tmp);
        veh.reset(tmp.x, tmp.z, tmp.psi, 0);
      } else {
        // flying start out of the last corner
        const s = track.length - 420;
        track.posAt(s, this.line.off[track.idx(s)], tmp);
        veh.reset(tmp.x, tmp.z, tmp.psi, 62);
      }
      track.locate(veh.x, veh.z, -1, veh.loc);
      car.prevS = veh.loc.s;
      if (isPlayer) {
        Object.assign(veh.assist, { steer: true }, o.assists || {});
        this.player = car;
      } else {
        veh.assist = { tc: 2, abs: 1, steer: true, autoGear: true, autoAero: true };
        car.ai = new AIDriver({ veh, track, line: this.line, ratings, difficulty: o.difficulty ?? 80, rng: this.rng });
        car.ai.car = car;
      }
      this.cars.push(car);
    });
    this.order = this.cars.slice();
    if (this.mode === 'race') {
      this.time = -(3.0 + 5 * 1.0 + 0.4 + this.rng() * 2.2);
      this.lightsOutIn = -this.time;
    } else {
      this.time = 0;
      this.state = 'racing';
    }
    this._updateOrder();
  }

  /** Give the player's car to the AI (used for demos and automated tests). */
  autopilot(on, difficulty = 100) {
    const car = this.player;
    if (!on) { car.ai = null; return; }
    Object.assign(car.veh.assist, { tc: 2, abs: 1, steer: true, autoGear: true, autoAero: true });
    car.ai = new AIDriver({ veh: car.veh, track: this.track, line: this.line, ratings: car.ratings, difficulty, rng: this.rng });
    car.ai.car = car;
  }

  say(text, type = 'info') {
    this.events.push({ t: this.clock, text, type });
  }

  /** One physics step for the whole field. */
  step(dt = PHYSICS_DT) {
    this.clock += dt;
    this.time += dt;
    const racing = this.state !== 'grid';
    if (this.state === 'grid') {
      const toGo = -this.time;
      const lit = this.lightsOutIn - toGo - 3.0;
      this.lights = toGo <= 0 ? 0 : clamp(Math.floor(lit) + 1, 0, 5);
      if (toGo <= 0) {
        this.state = 'racing';
        this.lights = 0;
        this.time = 0;
        this.say('Lights out', 'start');
      }
    }
    const sub = this.sub++;
    const aiTick = sub % 8 === 0;
    if (aiTick) this._neighbours();
    for (const car of this.cars) {
      const c = car.ctl, veh = car.veh;
      if (car.ai && aiTick) car.ai.update(dt * 8, c, car.near, this.mode !== 'race' ? 1e9 : this.state === 'grid' ? -1 : this.time);
      veh.parked = !racing;
      if (car.finished && car.ai == null && car.coast) { c.throttle = 0; c.brake = 0.25; }
      veh.step(dt, c, this.track);
      if (racing) this._timing(car);
      if (car.ai && car.ai.stuckT > 3.5) this.resetCar(car);
    }
    if (sub % 2 === 0) this._collide();
    if (aiTick) {
      this._updateOrder();
      if (this.state === 'racing' && this.mode === 'race') this._checkFinish();
    }
  }

  _timing(car) {
    const veh = car.veh, L = this.track.length, s = veh.loc.s, t = this.time;
    const prev = car.prevS;
    if (veh.kph > car.topSpeed) car.topSpeed = veh.kph;
    // track limits: all four wheels off the track
    if (veh.offWheels === 4) { car.offTime += PHYSICS_DT; if (car.crossed && !car.lapInvalid) { car.lapInvalid = true; if (car.isPlayer) this.say('Track limits: lap time deleted', 'warn'); } }
    // start/finish line
    if (prev > L * 0.75 && s < L * 0.25) {
      const frac = (L - prev) / Math.max(L - prev + s, 1e-6);
      const tc = t - PHYSICS_DT * (1 - frac);
      if (!car.crossed) {
        car.crossed = true;
        if (this.mode !== 'race') { car.lapStart = tc; car.sectorStart = tc; }
      } else {
        const lapT = tc - car.lapStart;
        car.curSectors[2] = tc - car.sectorStart;
        car.lapsDone++;
        car.lastLap = lapT;
        car.lastValid = !car.lapInvalid;
        car.lastSectors = car.curSectors.slice();
        if (!car.lapInvalid) {
          for (let k = 0; k < 3; k++) if (car.curSectors[k] != null && (car.bestSectors[k] == null || car.curSectors[k] < car.bestSectors[k])) car.bestSectors[k] = car.curSectors[k];
          if (car.bestLap == null || lapT < car.bestLap) { car.bestLap = lapT; car.newBest = this.clock; }
          if (!this.fastest || lapT < this.fastest.time) {
            this.fastest = { car, time: lapT };
            if (this.mode === 'race' && car.lapsDone > 1) this.say(`Fastest lap: ${car.driver.name}`, 'purple');
          }
        }
        car.lapStart = tc; car.sectorStart = tc;
        if (this.finishing && !car.finished) { car.finished = true; car.finishTime = tc; }
      }
      if (this.mode === 'race' && !car.crossedOnce) { car.crossedOnce = true; }
      car.sector = 0;
      car.curSectors = [null, null, null];
      car.lapInvalid = false;
      veh.newLap();
    } else if (prev < L * 0.25 && s > L * 0.75 && car.crossed) {
      // drove backwards over the line
      car.lapInvalid = true;
    }
    // overtake mode: within 1 s of the car ahead at the detection point earns it for the
    // following lap, usable from the activation point (Parabolica exit at Monza)
    const meta = this.track.meta;
    if (meta.overtakeDetectionS != null && this.mode === 'race') {
      const det = meta.overtakeDetectionS, act = meta.overtakeActivationS ?? det;
      const crossed = (a, b, x) => (a <= b ? a < x && b >= x : a < x || b >= x);
      if (crossed(prev, s, det)) {
        veh.overtakeAvail = false;
        let gapT = Infinity;
        for (const o of car.near) if (o.ds > 0 && o.v > 1) gapT = Math.min(gapT, o.ds / Math.max(veh.speed, 1));
        car.otEarned = car.lapsDone >= 1 && gapT < 1.0;
      }
      if (car.otEarned && crossed(prev, s, act)) {
        veh.overtakeAvail = true; car.otEarned = false;
        if (car.isPlayer) this.say('Overtake mode available', 'start');
      }
    }
    // sectors
    const sec = this.track.sectorOf(s);
    if (sec !== car.sector && sec === car.sector + 1 && car.crossed) {
      car.curSectors[car.sector] = t - car.sectorStart;
      car.sectorStart = t;
      car.sector = sec;
    }
    // gap markers
    const lapsForProgress = car.crossed ? car.lapsDone : -1;
    const sRel = car.crossed || this.mode !== 'race' ? s : s - L;
    car.progress = (car.crossed ? car.lapsDone : 0) * L + (car.crossed ? s : s - L);
    const abs = Math.floor(car.progress / MARK);
    while (car.markNext <= abs) { car.passT[car.markNext] = t; car.markNext++; }
    car.prevS = s;
  }

  _updateOrder() {
    if (this.mode !== 'race') { this.order = this.cars; return; }
    const ord = this.cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return b.lapsDone - a.lapsDone || a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    const leader = ord[0];
    ord.forEach((car, k) => {
      car.pos = k + 1;
      if (k === 0) { car.gapAhead = null; car.gapLeader = 0; return; }
      const gap = (other) => {
        if (car.finished && other.finished) return car.lapsDone === other.lapsDone ? car.finishTime - other.finishTime : null;
        const m = car.markNext - 1;
        if (m < 0 || other.passT[m] == null) return null;
        return car.passT[m] - other.passT[m];
      };
      car.gapAhead = gap(ord[k - 1]);
      car.gapLeader = gap(leader);
      car.lapsDown = Math.floor((leader.progress - car.progress) / this.track.length);
    });
    this.order = ord;
  }

  _checkFinish() {
    const leader = this.order[0];
    if (!this.finishing && leader.lapsDone >= this.laps) {
      this.finishing = true;
      leader.finished = true;
      leader.finishTime = leader.lapStart;
      this.say('Chequered flag', 'flag');
      this.winner = leader;
    }
    if (this.finishing) {
      if (this.player && this.player.finished && !this.playerDoneAt) this.playerDoneAt = this.clock;
      if (this.cars.every((c) => c.finished) || (this.playerDoneAt && this.clock - this.playerDoneAt > 12)) this.state = 'finished';
    }
  }

  /**
   * Cars still on their last lap when the session closes are classified by their measured gap
   * to the winner (the same thing as letting them drive to the line).
   */
  _settle() {
    if (this.settled || !this.winner) return;
    this.settled = true;
    for (const car of this.cars) {
      if (car.finished) continue;
      const down = Math.floor((this.winner.progress - car.progress) / this.track.length);
      if (down <= 0 && car.gapLeader != null) {
        car.finished = true;
        car.lapsDone = this.laps;
        car.finishTime = this.winner.finishTime + car.gapLeader;
      } else car.lapsDown = Math.max(1, down);
    }
    this._updateOrder();
  }

  /** Final (or current) classification. */
  classification() {
    if (this.state === 'finished') this._settle();
    const pts = this.regs.sporting.points;
    return this.order.map((car, k) => ({
      pos: k + 1, car, driver: car.driver, team: car.team, laps: car.lapsDone,
      time: car.finished ? car.finishTime : null,
      gap: k === 0 ? null : car.gapLeader, lapsDown: car.lapsDown || 0,
      best: car.bestLap, grid: car.grid, points: pts[k] || 0, finished: car.finished,
      fastest: this.fastest && this.fastest.car === car,
    }));
  }

  /** Put a car back on the track where it is (used by R key and by stuck AI cars). */
  resetCar(car) {
    const veh = car.veh, tr = this.track;
    const keep = { battery: veh.battery, fuel: veh.fuel, wear: Array.from(veh.wear), temp: Array.from(veh.temp), harvestLap: veh.harvestLap };
    tr.locate(veh.x, veh.z, veh.loc.i, veh.loc);
    const s = veh.loc.s;
    tr.posAt(s, clamp(veh.loc.d, -(tr.wr[veh.loc.i] - 2), tr.wl[veh.loc.i] - 2), tmp);
    veh.reset(tmp.x, tmp.z, tmp.psi, 0);
    veh.battery = keep.battery; veh.fuel = keep.fuel; veh.harvestLap = keep.harvestLap;
    for (let i = 0; i < 4; i++) { veh.wear[i] = keep.wear[i]; veh.temp[i] = keep.temp[i]; }
    tr.locate(veh.x, veh.z, -1, veh.loc);
    car.prevS = veh.loc.s;
    car.resets++;
    if (car.ai) car.ai.stuckT = 0;
    if (car.crossed) car.lapInvalid = true;
  }

  _neighbours() {
    const cars = this.cars, tr = this.track, n = cars.length;
    for (const car of cars) { car.near.length = 0; car.veh.draft = 0; }
    for (let i = 0; i < n; i++) {
      const A = cars[i], sa = A.veh.loc.s;
      for (let j = i + 1; j < n; j++) {
        const B = cars[j];
        const ds = tr.delta(B.veh.loc.s, sa);
        if (ds > 115 || ds < -115) continue;
        // each car needs to know who is close behind and anyone up to ~110 m ahead
        if (ds > -30) A.near.push({ ds, d: B.veh.loc.d, v: B.veh.speed, car: B });
        if (ds < 30) B.near.push({ ds: -ds, d: A.veh.loc.d, v: A.veh.speed, car: A });
        const lat = Math.abs(A.veh.loc.d - B.veh.loc.d);
        if (lat < 1.6) {
          const back = ds > 0 ? A : B, gap = Math.abs(ds);
          if (gap > 4 && back.veh.speed > 40) {
            const dr = (1 - gap / 75) * (1 - lat / 1.6);
            if (dr > back.veh.draft) back.veh.draft = dr;
          }
        }
      }
    }
  }

  _collide() {
    const cars = this.cars, n = cars.length;
    for (let i = 0; i < n; i++) {
      const A = cars[i].veh;
      for (let j = i + 1; j < n; j++) {
        const B = cars[j].veh;
        const ex = B.x - A.x, ez = B.z - A.z;
        if (ex > 6.5 || ex < -6.5 || ez > 6.5 || ez < -6.5) continue;
        const sa = Math.sin(A.psi), ca = Math.cos(A.psi), sb = Math.sin(B.psi), cb = Math.cos(B.psi);
        let best = 0, bnx = 0, bnz = 0;
        for (let a = 0; a < 3; a++) {
          const ax = A.x + sa * CIRC[a], az = A.z + ca * CIRC[a];
          for (let b = 0; b < 3; b++) {
            const bx = B.x + sb * CIRC[b], bz = B.z + cb * CIRC[b];
            const dx = bx - ax, dz = bz - az;
            const d2 = dx * dx + dz * dz;
            if (d2 < 4 * CR * CR && d2 > 1e-6) {
              const d = Math.sqrt(d2), pen = 2 * CR - d;
              if (pen > best) { best = pen; bnx = dx / d; bnz = dz / d; }
            }
          }
        }
        if (best <= 0) continue;
        const h = best * 0.5;
        A.x -= bnx * h; A.z -= bnz * h; B.x += bnx * h; B.z += bnz * h;
        const avx = A.vx * sa + A.vy * ca, avz = A.vx * ca - A.vy * sa;
        const bvx = B.vx * sb + B.vy * cb, bvz = B.vx * cb - B.vy * sb;
        const vrel = (bvx - avx) * bnx + (bvz - avz) * bnz;
        if (vrel < 0) {
          const jn = -1.2 * vrel * 0.5;
          const nax = avx - bnx * jn, naz = avz - bnz * jn, nbx = bvx + bnx * jn, nbz = bvz + bnz * jn;
          A.vx = nax * sa + naz * ca; A.vy = nax * ca - naz * sa;
          B.vx = nbx * sb + nbz * cb; B.vy = nbx * cb - nbz * sb;
          A.contact = B.contact = Math.max(-vrel, 0.5);
        }
      }
    }
  }
}
