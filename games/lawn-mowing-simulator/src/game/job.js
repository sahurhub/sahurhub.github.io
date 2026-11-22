// One mowing job. Runs the physics every frame (60 a second) and the official cutting
// simulation 10 times a second on the recorded path (rounded exactly like the server does it),
// so the percentage you see is the percentage the server will agree with.
import { JobSim } from '../shared/lawn.js';
import { shapeContains, distToSeg } from '../shared/levels.js';
import { RULES, parTime, timeLimit, penaltyMoney } from '../shared/rules.js';
import { mowerStats, MOWERS } from '../shared/mowers.js';
import { patternMask } from '../shared/patterns.js';
import { MowerBody } from '../mower/physics.js';

const SAMPLE_STEPS = 6; // 60 Hz physics / 10 Hz samples

export class Job {
  // cfg = job settings from the backend: { level, mower, up, weather, kind, pattern, mode, ticket, ... }
  constructor(cfg, world, hooks) {
    this.cfg = cfg;
    this.world = world;
    this.hooks = hooks;
    this.L = world.level;
    this.G = world.grid;
    this.M = MOWERS[cfg.mower];
    this.stats = mowerStats(cfg.mower, cfg.up);
    this.mp = cfg.mp || null; // multiplayer: { mode, slot, spawn, region, cut, limit }
    if (this.mp) {
      this.pattern = this.mp.region || null;
      this.sim = new JobSim(cfg.level, this.stats, { pattern: this.pattern, onlyPattern: !!this.mp.region, cut: this.mp.cut });
    } else {
      this.pattern = cfg.kind === 'pattern' && cfg.pattern ? patternMask(cfg.level, cfg.pattern) : null;
      this.sim = new JobSim(cfg.level, this.stats, { pattern: this.pattern });
    }
    const ground = world.ground;
    this.sim.onCut = (k, h) => ground.markCut(k, h);
    this.body = new MowerBody(this.stats, this.L);
    if (this.mp) this.body.reset(this.mp.spawn.x, this.mp.spawn.z, this.mp.spawn.h);
    this.par = parTime(this.L, this.G, this.stats, cfg.weather);
    this.limit = this.mp ? this.mp.limit : timeLimit(this.par, cfg.kind);
    this.path = []; this.resets = []; this.hits = [];
    this.steps = 0; this.time = 0;
    this.state = 'run';
    this.cool = new Map();
    this.inZone = new Map();
    this.visDirty = null;
    this.visLast = null;
    this.cutNow = 0;
    this.penaltyTotal = 0;
    this.pendingReset = false;
    this.events = [];
    // the first sample is the start position
    this.sample();
  }

  get coverage() {
    const s = this.sim;
    if (this.mp && !this.pattern && this.teamCount) return this.G.total ? this.teamCount() / this.G.total : 0;
    return this.pattern ? (s.patTotal ? s.patIn / s.patTotal : 0) : s.coverage;
  }
  get timeLeft() { return Math.max(0, this.limit - this.time); }

  resetToStart() {
    const sp = this.mp ? this.mp.spawn : this.L.spawn;
    this.body.reset(sp.x, sp.z, sp.h);
    this.pendingReset = true;
    this.visLast = null;
  }

  sample() {
    const b = this.body;
    let h = b.h;
    while (h > Math.PI) h -= Math.PI * 2;
    while (h < -Math.PI) h += Math.PI * 2;
    const xr = Math.round(b.x * 100), zr = Math.round(b.z * 100), hr = Math.round(h * 1000);
    const idx = this.path.length / 3;
    if (this.pendingReset && idx > 0) { this.resets.push(idx); this.sim.last = null; }
    this.pendingReset = false;
    this.path.push(xr, zr, hr);
    const before = this.sim.cutCount, trips = this.sim.trips, refuels = this.sim.refuels;
    this.sim.step(xr / 100, zr / 100, hr / 1000, RULES.SAMPLE_DT, true);
    this.cutNow = this.sim.cutCount - before;
    if (this.sim.trips > trips) this.events.push({ type: 'emptied' });
    if (this.sim.refuels > refuels) this.events.push({ type: 'refuelled' });
  }

  penalty(kind, id, pen, msg, key) {
    const now = this.time;
    if (this.cool.has(key) && now - this.cool.get(key) < 1.6) return;
    this.cool.set(key, now);
    this.hits.push(id != null ? { kind, id } : { kind });
    this.penaltyTotal += pen;
    this.hooks.penalty && this.hooks.penalty({ kind, pen, msg, money: penaltyMoney(this.L, pen) });
  }

  // one physics step (1/60 s)
  fixedStep(dt, inp) {
    if (this.state !== 'run') return;
    const b = this.body, sim = this.sim;
    let slow = sim.outOfFuel ? 0.35 : 1;
    // flower beds slow you down
    for (const zn of this.L.zones) if (zn.kind === 'bed' && shapeContains(zn.shape, b.x, b.z)) { slow *= 0.6; break; }
    const evs = b.step(dt, inp, { weather: this.cfg.weather, slow, fragile: this.world.fragile });
    for (const e of evs) {
      if (e.type === 'solid') {
        const s = e.s;
        if (e.speed > 0.8) this.hooks.bump && this.hooks.bump(e.speed);
        if (!s.pen || e.speed < (s.minSpeed || 0.35)) continue;
        if (s.obstacle != null) this.penalty('solid', s.obstacle, s.pen, s.msg, 's' + s.obstacle);
        else this.penalty(s.kind === 'water' ? 'water' : 'tree', null, s.pen, s.msg, 't' + Math.round(s.x * 10) + ',' + Math.round(s.z * 10));
      } else if (e.type === 'fragile') {
        if (this.world.knock(e.f.def.id, e.dx, e.dz, e.speed)) this.penalty('fragile', e.f.def.id, e.f.def.pen, e.f.def.msg, 'f' + e.f.def.id);
      }
    }
    // beds and hoses
    this.L.zones.forEach((zn, i) => {
      let inside = false;
      if (zn.kind === 'bed') inside = shapeContains(zn.shape, b.x, b.z);
      else for (let k = 0; k < zn.pts.length - 1 && !inside; k++) inside = distToSeg(b.x, b.z, zn.pts[k][0], zn.pts[k][1], zn.pts[k + 1][0], zn.pts[k + 1][1]) < zn.r;
      const was = this.inZone.get(i);
      if (inside && !was) this.penalty(zn.kind, null, zn.pen, zn.msg, 'z' + i);
      this.inZone.set(i, inside);
    });
    // instant visual cut (slightly narrower than the official deck so it never shows more than counts)
    this.visualCut(b.x, b.z, b.h);
    this.steps++;
    this.time += dt;
    if (this.steps % SAMPLE_STEPS === 0) this.sample();
    // finished? (in multiplayer the server decides; this is only a fallback)
    if (this.mp) { if (this.time >= this.limit + 8) this.end('time'); return; }
    if (this.time >= this.limit) this.end('time');
    else if (this.pattern ? this.coverage >= RULES.PATTERN_DONE : sim.coverage >= RULES.AUTO_DONE) this.end('done');
  }

  visualCut(x, z, h) {
    const sim = this.sim;
    if (!sim.canCut) { this.visLast = null; this.visN = 0; return; }
    const G = this.G, s = this.stats, ground = this.world.ground, d = ground.data;
    const hw = Math.max(0.05, s.width / 2 - G.cs * 1.2), hl = RULES.DECK_HALF_LEN * 0.8;
    const cx = x + Math.sin(h) * s.deck, cz = z + Math.cos(h) * s.deck;
    const from = this.visLast || [cx, cz, h];
    const dist = Math.hypot(cx - from[0], cz - from[1]);
    const n = Math.min(20, Math.max(1, Math.ceil(dist / 0.15)));
    let count = 0;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const px = from[0] + (cx - from[0]) * t, pz = from[1] + (cz - from[1]) * t;
      const sh = Math.sin(h), ch = Math.cos(h);
      const rad = Math.hypot(hw, hl);
      const i0 = Math.max(0, Math.floor((px - rad - G.x0) / G.cs)), i1 = Math.min(G.nx - 1, Math.floor((px + rad - G.x0) / G.cs));
      const j0 = Math.max(0, Math.floor((pz - rad - G.z0) / G.cs)), j1 = Math.min(G.nz - 1, Math.floor((pz + rad - G.z0) / G.cs));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = j * G.nx + i;
        if (!G.mow[c] || d[c * 4] >= 200) continue;
        const ox = G.x0 + (i + 0.5) * G.cs - px, oz = G.z0 + (j + 0.5) * G.cs - pz;
        const lat = ox * ch - oz * sh, lon = ox * sh + oz * ch;
        if (Math.abs(lat) > hw || Math.abs(lon) > hl) continue;
        d[c * 4] = 200;
        d[c * 4 + 1] = Math.round((sh * 0.5 + 0.5) * 255);
        d[c * 4 + 3] = Math.round((ch * 0.5 + 0.5) * 255);
        count++;
        const vd = this.visDirty;
        if (!vd) this.visDirty = [i, j, i, j];
        else { if (i < vd[0]) vd[0] = i; if (j < vd[1]) vd[1] = j; if (i > vd[2]) vd[2] = i; if (j > vd[3]) vd[3] = j; }
      }
    }
    this.visLast = [cx, cz, h];
    this.visN = count;
  }

  // changed texture area since the last call (sim + visual)
  takeDirty() {
    const a = this.sim.dirty, b = this.visDirty;
    this.sim.dirty = null; this.visDirty = null;
    if (!a) return b; if (!b) return a;
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  }

  takeEvents() { const e = this.events; this.events = []; return e; }

  // what the HUD should tell the player right now
  hint() {
    const s = this.sim;
    if (s.inStation === 'compost' && s.catcher > 0.5) return { text: 'Emptying the grass catcher...', prog: s.emptyT / RULES.EMPTY_TIME };
    if (s.inStation === 'fuel' && s.fuel < s.fuelMax - 1) return { text: this.M.engine === 'electric' ? 'Charging...' : 'Refuelling...', prog: s.fuelT / RULES.REFUEL_TIME };
    if (s.catcherFull) return { text: 'Catcher full! Stop at the compost bin to empty it.', warn: true };
    if (s.outOfFuel) return { text: this.M.engine === 'electric' ? 'Battery flat! Go to the charging stand.' : 'Out of fuel! Go to the fuel stand.', warn: true };
    if (Number.isFinite(s.catcherMax) && s.catcher / s.catcherMax > 0.85) return { text: 'Catcher nearly full - head to the compost bin soon.' };
    if (s.fuelMax > 0 && s.fuel / s.fuelMax < 0.15) return { text: this.M.engine === 'electric' ? 'Battery low - charging stand soon.' : 'Fuel low - fuel stand soon.' };
    return null;
  }

  end(reason) {
    if (this.state !== 'run') return;
    // make sure the last position is in the path
    if (this.steps % SAMPLE_STEPS !== 0) this.sample();
    this.state = 'done';
    this.endReason = reason;
    this.hooks.end && this.hooks.end(reason);
  }

  report() { return { path: this.path, resets: this.resets, hits: this.hits }; }
}
