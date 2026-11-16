// TURBO TOWN - items in a race: boxes, the roulette, using items, rockets, splashes and
// trails, hits and shields, and how computer drivers use items.
// Pure game logic (no drawing) so the online server can run the same rules.
import { ITEMS, ITEM_TUNING as TU, rollItem, MYSTERY_EFFECTS } from '../shared/items.js';
import { pointAt, wrapS, angleDiff } from '../shared/track-math.js';
import { giveBoost, spinOut } from '../physics/kart-physics.js';

export class ItemSystem {
  constructor(race, rnd = Math.random) {
    this.race = race;
    this.track = race.track;
    this.rnd = rnd;
    this.boxes = [];
    this.rockets = [];
    this.freezes = [];
    this.hazards = race.hazards = [];
    this.trail = [];
    this.nextId = 1;
    for (const row of this.track.def.itemBoxes || []) {
      const path = row.path ? this.track.paths.find((p) => p.id === row.path) : this.track.main;
      if (!path) continue;
      const s = row.path ? path.length * (row.f ?? 0.5) : row.s;
      const p = pointAt(path, s);
      for (const lat of row.lats || [0]) {
        const x = p.x + p.rx * lat, z = p.z + p.rz * lat;
        const g = race.world.ground(x, p.y + 4, z);
        this.boxes.push({ id: this.boxes.length, x, y: (g ? g.y : p.y) + 1.1, z, active: true, t: 0 });
      }
    }
    for (const r of race.racers) {
      r.item = null; r.roulette = 0; r.itemCharges = 0; r.prevItemBtn = false;
      r.kart.shield = false; r.kart.shieldT = 0; r.kart.rainbowT = 0; r.kart.trailT = 0; r.kart.frozenT = 0;
    }
  }

  emit(type, racer, extra) { this.race.emit(type, racer, extra); }

  step(dt) {
    const race = this.race;
    const t = race.time;
    // boxes come back after a while
    for (const b of this.boxes) if (!b.active && t >= b.t) { b.active = true; this.emit('boxBack', null, { box: b.id }); }
    for (const r of race.racers) {
      const k = r.kart;
      // timers
      if (k.shieldT > 0) { k.shieldT -= dt; if (k.shieldT <= 0) { k.shield = false; this.emit('shieldEnd', r); } }
      if (k.rainbowT > 0) k.rainbowT -= dt;
      if (k.frozenT > 0) k.frozenT -= dt;
      if (k.trailT > 0) {
        k.trailT -= dt;
        if (k.grounded && (!r._trailNext || t >= r._trailNext)) {
          r._trailNext = t + 0.09;
          this.trail.push({ x: k.x - Math.sin(k.yaw) * 1.2, y: k.y + 0.05, z: k.z - Math.cos(k.yaw) * 1.2, t, owner: r.index });
        }
      }
      if (race.state === 'countdown') continue;
      // pick up boxes
      if (k.respawnT <= 0) {
        for (const b of this.boxes) {
          if (!b.active) continue;
          const dx = b.x - k.x, dz = b.z - k.z, dy = b.y - 1.1 - k.y;
          if (dx * dx + dz * dz < TU.boxRadius * TU.boxRadius && Math.abs(dy) < 2.2) {
            b.active = false; b.t = t + TU.boxRespawn;
            this.emit('boxHit', r, { box: b.id });
            if (!r.item && r.roulette <= 0 && !r.finished) {
              r.roulette = TU.roulette;
              r.rouletteItem = rollItem(r.place, race.racers.length, this.rnd);
              this.emit('roulette', r, { item: r.rouletteItem });
            }
          }
        }
      }
      if (r.roulette > 0) {
        r.roulette -= dt;
        if (r.roulette <= 0) { r.item = r.rouletteItem; r.itemCharges = 1; this.emit('itemGot', r, { item: r.item }); }
      }
      // use (rising edge of the item button)
      const btn = !!k.input.item;
      if (btn && !r.prevItemBtn && r.item && race.state !== 'countdown' && k.respawnT <= 0 && !r.finished) this.use(r);
      r.prevItemBtn = btn;
    }
    this.stepRockets(dt);
    this.stepFreezes(dt);
    this.stepHazards(dt);
    this.stepTrail(dt);
    this.stepRainbow();
  }

  // ---------------------------------------------------------------- using items

  use(r) {
    const k = r.kart, id = r.item;
    r.itemCharges--;
    if (r.itemCharges <= 0) r.item = null;
    r.stats.itemUse = (r.stats.itemUse || 0) + 1;
    this.emit('itemUse', r, { item: id });
    switch (id) {
      case 'speed': giveBoost(k, TU.speedMul, TU.speedTime, 'item'); break;
      case 'shield': k.shield = true; k.shieldT = TU.shieldTime; break;
      case 'sticky': {
        const x = k.x - Math.sin(k.yaw) * 2.6, z = k.z - Math.cos(k.yaw) * 2.6;
        const g = this.race.world.ground(x, k.y + 1.5, z);
        this.hazards.push({ id: this.nextId++, kind: 'sticky', x, y: g ? g.y : k.y, z, r: TU.stickyRadius, born: this.race.time, owner: r.index, active: true });
        break;
      }
      case 'rocket': this.fireRocket(r); break;
      case 'trail': k.trailT = TU.trailTime; giveBoost(k, TU.trailMul, TU.trailTime, 'trail'); break;
      case 'spring': {
        k.vy += TU.springUp; k.grounded = false; k.canTrick = true; k.airT = 0;
        giveBoost(k, TU.springForward, 0.9, 'spring');
        break;
      }
      case 'freeze': this.fireFreeze(r); break;
      case 'mystery': this.mystery(r); break;
      default: break;
    }
  }

  ahead(r) {
    // the racer one place ahead (not already finished)
    return this.race.racers.find((o) => o.place === r.place - 1 && !o.finished && o.kart.respawnT <= 0) || null;
  }

  fireRocket(r) {
    const k = r.kart;
    const target = this.ahead(r);
    this.rockets.push({ id: this.nextId++, owner: r.index, target: target ? target.index : -1, s: (k.near && k.near.s) || 0,
      lat: (k.near && k.near.lat) || 0, x: k.x, y: k.y + 0.8, z: k.z, life: TU.rocketLife, homing: false, yaw: k.yaw });
  }

  fireFreeze(r) {
    let target = this.ahead(r);
    if (target && target.progress.distance() - r.progress.distance() > TU.freezeRange) target = null;
    if (!target) { this.emit('itemFizzle', r, { item: 'freeze' }); return; }
    this.freezes.push({ id: this.nextId++, owner: r.index, target: target.index, x: r.kart.x, y: r.kart.y + 1, z: r.kart.z, t: 0 });
  }

  mystery(r) {
    const k = r.kart;
    const fx = MYSTERY_EFFECTS[Math.floor(this.rnd() * MYSTERY_EFFECTS.length)];
    this.emit('mystery', r, { effect: fx });
    if (fx === 'rainbow') { k.rainbowT = TU.rainbowTime; k.invulnT = TU.rainbowTime; giveBoost(k, TU.rainbowMul, TU.rainbowTime, 'rainbow'); }
    else if (fx === 'bubbleBoost') { k.shield = true; k.shieldT = TU.shieldTime; giveBoost(k, TU.speedMul, TU.speedTime, 'item'); }
    else if (fx === 'tripleBurst') { r.item = 'speed'; r.itemCharges = 3; }
    else {
      for (const o of this.race.racers) if (o !== r && !o.finished) { o.kart.slowT = TU.snowGlobeTime; o.kart.slowMul = TU.snowGlobeMul; o.kart.frozenT = TU.snowGlobeTime; }
    }
  }

  // ---------------------------------------------------------------- hits

  // returns true if the hit landed
  hit(target, kind, spinSeconds) {
    const k = target.kart;
    if (k.respawnT > 0 || target.finished) return false;
    if (k.rainbowT > 0) { this.emit('hitBlocked', target, { kind }); return false; }
    if (k.shield) { k.shield = false; k.shieldT = 0; this.emit('shieldPop', target, { kind }); return false; }
    if (k.invulnT > 0) return false;
    spinOut(k, spinSeconds, this.rnd() < 0.5 ? 1 : -1);
    k.invulnT = 1.2;
    this.emit('itemHit', target, { kind });
    return true;
  }

  stepRockets(dt) {
    const racers = this.race.racers, main = this.track.main;
    for (const rk of this.rockets) {
      rk.life -= dt;
      const tg = rk.target >= 0 ? racers[rk.target] : null;
      const tk = tg && tg.kart;
      if (tk && !tg.finished) {
        const d = Math.hypot(tk.x - rk.x, tk.z - rk.z);
        if (d < TU.rocketHome) rk.homing = true;
      }
      if (rk.homing && tk) {
        // fly straight at the target
        const dx = tk.x - rk.x, dz = tk.z - rk.z, dy = tk.y + 0.7 - rk.y, d = Math.hypot(dx, dz) || 1;
        const sp = TU.rocketSpeed * 1.1;
        rk.x += dx / d * sp * dt; rk.z += dz / d * sp * dt; rk.y += dy * Math.min(1, dt * 6);
        rk.yaw = Math.atan2(dx, dz);
        if (d < TU.rocketHitRadius && Math.abs(dy) < 2.2) { this.hit(tg, 'rocket', TU.rocketSpin); rk.life = 0; this.emit('rocketBoom', null, { x: rk.x, y: rk.y, z: rk.z }); }
      } else {
        // follow the track, drifting towards the target's lane
        rk.s = wrapS(rk.s + TU.rocketSpeed * dt, this.track.length);
        const p = pointAt(main, rk.s);
        const wantLat = tk && tk.near ? Math.max(-p.w / 2, Math.min(p.w / 2, tk.near.lat)) : 0;
        rk.lat += (wantLat - rk.lat) * Math.min(1, dt * 2);
        rk.x = p.x + p.rx * rk.lat; rk.z = p.z + p.rz * rk.lat; rk.y = p.y + 0.9; rk.yaw = p.heading;
      }
      if (rk.life <= 0 && !rk.boomed) { rk.boomed = true; this.emit('rocketGone', null, { id: rk.id }); }
    }
    this.rockets = this.rockets.filter((r) => r.life > 0);
  }

  stepFreezes(dt) {
    const racers = this.race.racers;
    for (const f of this.freezes) {
      const tg = racers[f.target], tk = tg.kart;
      f.t += dt;
      const dx = tk.x - f.x, dz = tk.z - f.z, dy = tk.y + 1 - f.y, d = Math.hypot(dx, dz) || 1;
      const sp = 70;
      const step = Math.min(d, sp * dt);
      f.x += dx / d * step; f.z += dz / d * step; f.y += dy * Math.min(1, dt * 5) + Math.sin(f.t * 6) * 0.05;
      if (d < 1.5 || f.t > 3) {
        f.done = true;
        if (d < 1.5) {
          if (tk.rainbowT > 0) this.emit('hitBlocked', tg, { kind: 'freeze' });
          else if (tk.shield) { tk.shield = false; tk.shieldT = 0; this.emit('shieldPop', tg, { kind: 'freeze' }); }
          else { tk.slowT = TU.freezeTime; tk.slowMul = TU.freezeMul; tk.frozenT = TU.freezeTime; tk.drift.on = false; this.emit('frozen', tg); }
        }
      }
    }
    this.freezes = this.freezes.filter((f) => !f.done);
  }

  stepHazards(dt) {
    const t = this.race.time;
    for (const h of this.hazards) {
      if (!h.active) continue;
      if (t - h.born > TU.stickyLife) { h.active = false; continue; }
      for (const r of this.race.racers) {
        if (r.index === h.owner && t - h.born < 0.9) continue;
        const k = r.kart;
        if (!k.grounded || k.respawnT > 0) continue;
        const dx = k.x - h.x, dz = k.z - h.z;
        if (dx * dx + dz * dz < (h.r + 0.5) ** 2 && Math.abs(k.y - h.y) < 1.2) {
          h.active = false;
          this.emit('splashed', r, { x: h.x, z: h.z });
          if (this.hit(r, 'sticky', TU.stickySpin)) k.slickT = 1.0;
          break;
        }
      }
    }
    this.race.hazards = this.hazards = this.hazards.filter((h) => h.active);
  }

  stepTrail() {
    const t = this.race.time;
    this.trail = this.trail.filter((s) => t - s.t < TU.trailSegLife);
    if (!this.trail.length) return;
    for (const r of this.race.racers) {
      const k = r.kart;
      if (!k.grounded || k.padCool > 0) continue;
      for (const s of this.trail) {
        if (t - s.t < 0.35 && s.owner === r.index) continue;
        const dx = k.x - s.x, dz = k.z - s.z;
        if (dx * dx + dz * dz < 2.2) {
          giveBoost(k, 1.26, TU.trailBoost, 'trailride');
          k.padCool = 0.3;
          if (s.owner !== r.index) this.emit('trailRide', r);
          break;
        }
      }
    }
  }

  // racers glowing with Rainbow Rush spin out anyone they touch
  stepRainbow() {
    const racers = this.race.racers;
    for (const r of racers) {
      if (r.kart.rainbowT <= 0) continue;
      for (const o of racers) {
        if (o === r) continue;
        const dx = o.kart.x - r.kart.x, dz = o.kart.z - r.kart.z;
        if (dx * dx + dz * dz < 4.4 && Math.abs(o.kart.y - r.kart.y) < 1.5) this.hit(o, 'rainbow', 1.0);
      }
    }
  }
}

// ------------------------------------------------------------------ computer drivers

// How computer drivers use items. Better drivers wait for the right moment.
export function aiItemPolicy(r, race, me, dt) {
  if (!r.item || race.state !== 'racing') return;
  const D = me.D, k = r.kart, rnd = me.rng;
  me.itemT = (me.itemT || 0) + dt;
  if (me.itemT < 0.6) return;
  const n = k.near;
  const items = race.items;
  const want = (p) => rnd() < p * dt * D.items * 2;
  const ahead = race.racers.find((o) => o.place === r.place - 1 && !o.finished);
  const behind = race.racers.find((o) => o.place === r.place + 1 && !o.finished);
  const gapAhead = ahead ? ahead.progress.distance() - r.progress.distance() : 1e9;
  const gapBehind = behind ? r.progress.distance() - behind.progress.distance() : 1e9;
  const curvy = n && n.path ? Math.abs(pointAt(n.path, (n.path.closed ? n.s : (n.i + n.t) * n.path.step) + 25).curv) > 0.02 : false;
  const incoming = items && items.rockets.some((rk) => rk.target === r.index && Math.hypot(rk.x - k.x, rk.z - k.z) < 25);
  let use = false;
  switch (r.item) {
    case 'speed': case 'trail': use = (!curvy && want(0.8)) || me.route !== 'main' || me.itemT > 9; break;
    case 'shield': use = incoming || want(0.4) || me.itemT > 6; break;
    case 'sticky': use = (gapBehind < 25 && want(1.5)) || (incoming && rnd() < D.items) || me.itemT > 10; break;
    case 'rocket': case 'freeze': use = (ahead && gapAhead < 110 && want(1.2)) || me.itemT > 12; break;
    case 'spring': use = (incoming && rnd() < D.items) || want(0.25) || me.itemT > 10; break;
    case 'mystery': use = true; break;
    default: use = true;
  }
  if (use) { k.input.item = true; me.itemT = 0; }
}

export { ITEMS, angleDiff };
