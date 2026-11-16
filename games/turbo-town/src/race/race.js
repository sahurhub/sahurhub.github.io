// TURBO TOWN - race manager: grid, countdown (with a start boost for good timing),
// fixed-step physics for every racer, lap counting, positions, wrong way and finish.
import { createKart, stepKart, collideKarts, giveBoost } from '../physics/kart-physics.js';
import { Progress } from '../shared/track-math.js';
import { OVERTAKE_COOLDOWN, OVERTAKE_MAX } from '../shared/rules.js';
import { ItemSystem, aiItemPolicy } from '../items/item-system.js';

export const COUNTDOWN = 3.0; // seconds of 3-2-1 before GO

export class Race {
  // opts: { track, world, grid, laps, racers: [{ def, name, isPlayer, driver, controller }] }
  constructor(opts) {
    this.track = opts.track;
    this.world = opts.world;
    this.laps = opts.laps || 3;
    this.mode = opts.mode || 'race';
    this.state = 'countdown';
    this.countdown = opts.countdown ?? COUNTDOWN;
    this.time = 0;          // race clock, starts at GO
    this.events = [];       // { type, racer, ... } for UI/audio
    this.finishOrder = [];
    this.racers = opts.racers.map((r, i) => {
      const kart = createKart(r.def, { id: i, speedScale: r.speedScale ?? 1 });
      const slot = opts.grid[i] || opts.grid[opts.grid.length - 1];
      // standing on the road from the start (the intro runs before any physics step)
      kart.x = kart.px = slot.x; kart.y = kart.py = slot.y; kart.z = kart.pz = slot.z;
      kart.yaw = kart.pyaw = slot.yaw;
      kart.grounded = true; kart.gy = slot.y;
      const gr = opts.world && opts.world.ground(slot.x, slot.y + 0.7, slot.z);
      if (gr) { kart.nx = kart.snx = gr.nx; kart.ny = kart.sny = gr.ny; kart.nz = kart.snz = gr.nz; kart.y = kart.py = kart.gy = gr.y; }
      kart.frozen = true;
      const progress = new Progress(this.track, this.laps);
      return {
        index: i, name: r.name, isPlayer: !!r.isPlayer, def: r.def, driver: r.driver, kart, progress,
        controller: r.controller || null, finished: false, finishTime: 0, place: i + 1,
        lapStart: 0, lapTimes: [], bestLap: 0, wrongT: 0, throttleAt: null, data: r.data || {}, stats: {}, shortcuts: new Set(),
        remote: !!r.remote,
        item: null,
      };
    });
    this.player = this.racers.find((r) => r.isPlayer) || null;
    this.hazards = [];
    // items (not in Time Trials or no-item races)
    this.items = opts.items === false ? null : new ItemSystem(this);
    if (this.items) for (const r of this.racers) if (r.controller && r.controller.ai) r.controller.ai.itemPolicy = aiItemPolicy;
    this.emit('count', null, { n: Math.ceil(this.countdown) });
  }

  emit(type, racer, extra = {}) { this.events.push({ type, racer, ...extra }); }

  step(dt) {
    if (this.state === 'countdown') {
      const before = this.countdown;
      this.countdown -= dt;
      // note when each racer first pressed the accelerator (start boost / stall)
      for (const r of this.racers) {
        if (r.controller) r.controller(r, this, dt);
        if (r.kart.input.throttle > 0.5 && r.throttleAt == null) r.throttleAt = this.countdown;
        if (r.kart.input.throttle <= 0.5) r.throttleAt = null;
      }
      const ca = Math.ceil(this.countdown);
      if (ca !== Math.ceil(before) && ca > 0 && ca <= 3) this.emit('count', null, { n: ca });
      if (this.countdown <= 0) this.go();
      for (const r of this.racers) { r.kart.px = r.kart.x; r.kart.py = r.kart.y; r.kart.pz = r.kart.z; r.kart.pyaw = r.kart.yaw; r.kart.time += dt; }
      return;
    }
    if (this.state === 'racing' || this.state === 'finished') this.time += dt;
    this.world.updateMovers(this.time);
    for (const r of this.racers) if (r.controller && !r.remote) r.controller(r, this, dt);
    for (const r of this.racers) {
      if (r.remote) continue; // other players' karts are moved by the network code
      const ev = r.kart.events, from = ev.length;
      stepKart(r.kart, this.world, dt);
      for (let i = from; i < ev.length; i++) {
        r.stats[ev[i].type] = (r.stats[ev[i].type] || 0) + 1;
        if (ev[i].type === 'driftStart') r.stats.drifts = (r.stats.drifts || 0) + 1;
      }
    }
    collideKarts(this.racers.map((r) => r.kart));
    for (const r of this.racers) this.track_(r, dt);
    this.rank();
    if (this.items) this.items.step(dt);
  }

  go() {
    this.state = 'racing';
    this.time = 0;
    this.emit('go', null);
    for (const r of this.racers) {
      const k = r.kart;
      k.frozen = false;
      const t = r.throttleAt;
      if (t != null && t <= 1.05 && t >= 0.3) { giveBoost(k, 1.32, 1.1, 'start'); this.emit('startBoost', r); }
      else if (t != null && t > 1.75) { k.spinT = 0.7; k.spinDir = 0; this.emit('stall', r); }
    }
  }

  track_(r, dt) {
    const k = r.kart;
    if (!k.near || !k.near.path || k.respawnT > 0) return;
    // driving well into a shortcut counts as finding it
    if (k.near.path.id !== 'main' && k.near.i > 12 && !r.shortcuts.has(k.near.path.id)) { r.shortcuts.add(k.near.path.id); this.emit('shortcut', r, { id: k.near.path.id }); }
    const ev = r.progress.update(k.near.s);
    if (ev === 'lap' && !r.finished) {
      const lt = this.time - r.lapStart;
      r.lapTimes.push(lt);
      if (!r.bestLap || lt < r.bestLap) r.bestLap = lt;
      r.lapStart = this.time;
      this.emit('lap', r, { lap: r.progress.lap, time: lt });
      if (r.progress.lap >= this.laps) { if (!this.online && !this.practice) this.finish(r); } // online: the server says when you finish
      else if (r.progress.lap === this.laps - 1) this.emit('finalLap', r);
    } else if (ev === 'start') r.lapStart = this.time;
    // wrong way: moving backwards along the track for a while
    const backwards = r.progress.ds < -0.02 && k.speed > 4;
    r.wrongT = backwards ? r.wrongT + dt : Math.max(0, r.wrongT - dt * 2);
  }

  finish(r) {
    r.finished = true;
    r.finishTime = this.time;
    r.progress.finished = true;
    this.finishOrder.push(r);
    r.place = this.finishOrder.length;
    this.emit('finish', r, { place: r.place, time: r.finishTime });
    if (this.finishOrder.length === this.racers.length || (r.isPlayer && this.racers.length === 1)) this.state = 'done';
    else if (r.isPlayer) this.state = 'finished';
  }

  rank() {
    if (this.online) return; // places come from the server
    const live = this.racers.filter((r) => !r.finished);
    live.sort((a, b) => b.progress.distance() - a.progress.distance());
    const base = this.finishOrder.length;
    live.forEach((r, i) => { r.place = base + i + 1; });
    if (this.state === 'racing') this.overtakes();
  }

  // Legitimate overtakes (for coins): you must pass a rival who had been ahead of you for
  // a while, stay ahead for a moment, and the same rival only pays again after a cooldown.
  // Re-passing someone who just passed you back does not pay twice.
  overtakes() {
    const t = this.time;
    for (const r of this.racers) {
      if (r.finished || r.kart.respawnT > 0) continue;
      const ov = r.ov || (r.ov = { ahead: new Map(), pending: new Map(), paid: new Map(), count: 0 });
      for (const o of this.racers) {
        if (o === r) continue;
        const oAhead = o.place < r.place;
        if (oAhead) {
          if (!ov.ahead.has(o.index)) ov.ahead.set(o.index, t);
          ov.pending.delete(o.index);
          continue;
        }
        // o is behind r now; was o ahead long enough before?
        const since = ov.ahead.get(o.index);
        if (since != null) {
          ov.ahead.delete(o.index);
          if (t - since >= 1.5 && t > 3) ov.pending.set(o.index, t);
        }
        const p = ov.pending.get(o.index);
        if (p != null && t - p >= 1.0) {
          ov.pending.delete(o.index);
          const last = ov.paid.get(o.index);
          if ((last == null || t - last >= OVERTAKE_COOLDOWN) && ov.count < OVERTAKE_MAX) {
            ov.paid.set(o.index, t);
            ov.count++;
            this.emit('overtake', r, { rival: o, count: ov.count });
          }
        }
      }
    }
  }

  // racers in place order
  standings() { return [...this.racers].sort((a, b) => a.place - b.place); }

  takeEvents() { const e = this.events; this.events = []; return e; }
}
