// Deliveries: job boards, job generation, the active job (pickup -> drop-offs), rewards,
// fragile damage, timers, Golden Drop events, special missions and time trials.
import * as THREE from 'three';
import {
  JOB_TYPES, RARITIES, RARITY_BY_ID, PACKAGE_NAMES, PAY, DISTRICTS, DISTRICT_ORDER, VEHICLES, VEHICLE_BY_ID,
  JOBS_PER_DISTRICT, JOB_REFRESH, STREAK_BONUS, STREAK_MAX, EVENT, SPECIAL_MISSIONS, TIME_TRIALS, CITY, vehicleStats,
} from './config.js';
import { rng, weightedPick, clamp, fmtMoney, fmtDist } from './utils.js';
import { findPath, pathLength, districtAt, gx } from './cityLayout.js';
import { Marker, PoiIcon } from './markers.js';
import { assets } from './assets.js';

let jobSeq = 1;
const TYPE_WEIGHT = { standard: 40, express: 18, fragile: 14, multi: 10, heavy: 11, longhaul: 6, premium: 5 };

export class JobSystem {
  constructor(game) {
    this.g = game;
    this.L = game.layout;
    this.boards = {};
    this.active = null;
    this.trial = null;
    this.event = null;
    this.eventTimer = 200;
    this.rand = rng((Date.now() & 0xffffff) ^ 0x5eed);
    this.markers = [];
    this.pickupStack = null;
    this.waypoint = null;
    // index buildings
    this.byDistrict = {};
    for (const b of this.L.buildings) {
      (this.byDistrict[b.district] ||= { pickup: [], drop: [] });
      if (b.role === 'pickup' || b.role === 'both') this.byDistrict[b.district].pickup.push(b);
      if (b.role === 'drop' || b.role === 'both') this.byDistrict[b.district].drop.push(b);
    }
    this.boardIcons = this.L.pois.jobBoards.map(jb => new PoiIcon(game.scene, 'job', jb.x, 5.2, jb.z, 2.6));
    this.trialIcons = TIME_TRIALS.map(t => {
      const n = t.nodes[0];
      return new PoiIcon(game.scene, 'trial', gx(n[0]), 4.5, gx(n[1]), 2.4);
    });
  }

  // ---------------------------------------------------------------- generation
  bestOwned() {
    const eco = this.g.eco;
    let top = 7.8 * this.g.player.speedMult, cap = eco.capacityOf('walk');
    for (const id of Object.keys(this.g.profile.owned)) {
      const st = vehicleStats(VEHICLE_BY_ID[id], eco.custom(id).upgrades);
      top = Math.max(top, st.top); cap = Math.max(cap, st.capacity);
    }
    return { top, cap };
  }
  // cheapest vehicle whose base capacity fits
  requiredVehicle(units) {
    if (units <= 1) return VEHICLE_BY_ID.walk;
    if (units <= 2 && this.g.eco.hasEquip('courierbag')) return VEHICLE_BY_ID.walk;
    return VEHICLES.find(v => v.id !== 'walk' && v.capacity >= units) || VEHICLES[VEHICLES.length - 1];
  }
  topFor(units) {
    // fastest owned vehicle that can carry `units`, else the required vehicle's base speed
    const eco = this.g.eco;
    let best = 0;
    if (eco.capacityOf('walk') >= units) best = 7.8 * this.g.player.speedMult;
    for (const id of Object.keys(this.g.profile.owned)) {
      const st = vehicleStats(VEHICLE_BY_ID[id], eco.custom(id).upgrades);
      if (st.capacity >= units) best = Math.max(best, st.top);
    }
    if (!best) best = this.requiredVehicle(units).top || 7.8;
    return best;
  }
  rollRarity(r, district, premium = false, boost = 0) {
    const luck = (this.g.eco.hasEquip('charm') ? 0.35 : 0) + DISTRICT_ORDER.indexOf(district) * 0.12 + boost + this.g.profile.level * 0.01;
    const list = premium ? RARITIES.slice(2) : RARITIES;
    return weightedPick(r, list, x => x.weight * Math.pow(1 + luck, RARITY_BY_ID[x.id].index));
  }
  pickDrop(r, fromDistrict, minDist, near) {
    const unlocked = this.g.eco.unlockedDistricts();
    let pool = [];
    const ds = near ? [fromDistrict, ...unlocked.filter(d => d !== fromDistrict)] : unlocked;
    for (let tries = 0; tries < 30; tries++) {
      const d = near ? (r() < 0.75 ? fromDistrict : r.pick(unlocked)) : r.pick(ds);
      pool = (this.byDistrict[d] || { drop: [] }).drop;
      if (!pool.length) continue;
      const b = r.pick(pool);
      if (minDist(b)) return b;
    }
    return null;
  }

  makeJob(district, r, forcedType = null) {
    const eco = this.g.eco;
    const lv = this.g.profile.level;
    const types = Object.keys(JOB_TYPES).filter(t => eco.jobTypeUnlocked(t) && (t !== 'longhaul' || eco.unlockedDistricts().length > 1));
    const type = forcedType || weightedPick(r, types, t => TYPE_WEIGHT[t]);
    const pickups = (this.byDistrict[district] || { pickup: [] }).pickup;
    if (!pickups.length) return null;
    const pickup = r.pick(pickups);
    const best = this.bestOwned();
    const unlocked = eco.unlockedDistricts();
    let drops = [];
    const far = (b, m) => Math.hypot(b.door.x - pickup.door.x, b.door.z - pickup.door.z) > m;
    if (type === 'multi') {
      const n = r.int(2, Math.min(4, 2 + Math.floor(lv / 6)));
      for (let k = 0; k < n; k++) {
        const d = this.pickDrop(r, district, b => far(b, 100) && !drops.includes(b), true);
        if (d) drops.push(d);
      }
      if (drops.length < 2) return null;
      // visit in a sensible order (nearest next)
      const ordered = [];
      let cx = pickup.door.x, cz = pickup.door.z;
      while (drops.length) {
        drops.sort((a, b) => Math.hypot(a.door.x - cx, a.door.z - cz) - Math.hypot(b.door.x - cx, b.door.z - cz));
        const nx = drops.shift();
        ordered.push(nx); cx = nx.door.x; cz = nx.door.z;
      }
      drops = ordered;
    } else if (type === 'longhaul') {
      const others = unlocked.filter(d => d !== district);
      const d = this.pickDrop(r, others.length ? r.pick(others) : district, b => far(b, 450), false);
      if (!d) return null;
      drops = [d];
    } else {
      const d = this.pickDrop(r, district, b => far(b, 130), true);
      if (!d) return null;
      drops = [d];
    }
    // units
    let units = 1;
    if (type === 'heavy') units = r.int(3, Math.max(4, Math.min(best.cap + 4, 6 + lv)));
    else if (type === 'multi') units = drops.length;
    else if (r() < 0.45 && best.cap > 1) units = r.int(1, Math.max(1, Math.round(best.cap * 0.85)));
    if (type === 'premium') units = Math.max(1, Math.min(units, 4));
    if (type === 'fragile') units = Math.min(units, Math.max(1, Math.round(best.cap * 0.5)));
    const rarity = type === 'premium' ? this.rollRarity(r, district, true) : this.rollRarity(r, district);
    // route length (pickup -> drops)
    let len = 0, px = pickup.door.x, pz = pickup.door.z;
    for (const d of drops) {
      len += pathLength(px, pz, findPath(this.L, px, pz, d.door.x, d.door.z));
      px = d.door.x; pz = d.door.z;
    }
    const req = this.requiredVehicle(units);
    const top = this.topFor(units);
    const vRef = clamp(top * 0.62, 4.6, 17);
    let time = 28 + len / vRef + drops.length * 12;
    if (type === 'express') time *= 0.68;
    if (type === 'premium') time *= 0.8;
    if (type === 'heavy') time *= 1.15;
    if (eco.hasEquip('watch')) time *= 1.15;
    const job = {
      id: jobSeq++, type, rarity: rarity.id, district, units,
      pickup: pickup.id, drops: drops.map(d => d.id),
      distance: len, time: Math.round(time), required: req.id,
      name: this.packageName(r, pickup, type),
      fragile: type === 'fragile',
    };
    job.reward = this.computeReward(job);
    job.xp = this.computeXP(job);
    return job;
  }

  packageName(r, pickup, type) {
    if (type === 'fragile') return r.pick(PACKAGE_NAMES.fragile);
    if (type === 'heavy') return r.pick(PACKAGE_NAMES.heavy);
    const key = { restaurant: 'restaurant', shop: 'shop', office: 'office', tower: 'office', mall: 'mall', supermarket: 'supermarket', warehouse: 'warehouse', factory: 'factory', terminal: 'terminal', apartment: 'shop' }[pickup.type] || 'shop';
    return r.pick(PACKAGE_NAMES[key]);
  }

  computeReward(job, base = null) {
    const rar = RARITY_BY_ID[job.rarity];
    const t = JOB_TYPES[job.type] || JOB_TYPES.standard;
    const lv = this.g.profile.level;
    const units = job.units || 1;
    let r = (PAY.base + job.distance * PAY.perMeter) * rar.mult * t.mult * DISTRICTS[job.district].mult
      * (1 + PAY.unitExtra * (units - 1)) * (1 + PAY.levelBonus * (lv - 1)) * PAY.global;
    if (base) r = base;
    return Math.round(r / 5) * 5;
  }
  computeXP(job) {
    const rar = RARITY_BY_ID[job.rarity];
    const t = JOB_TYPES[job.type] || JOB_TYPES.standard;
    return Math.round((14 + job.distance * 0.025 + (job.units - 1) * 2.5 + rar.xp + t.xp) * (1 + 0.035 * this.g.profile.level));
  }

  refreshBoard(district, force = false) {
    const now = this.g.clock;
    const b = this.boards[district];
    if (b && !force && now < b.refreshAt) return b;
    const r = rng((Math.floor(now) * 7919 + DISTRICT_ORDER.indexOf(district) * 104729 + this.rand.int(0, 1e6)) >>> 0);
    const jobs = [];
    const lv = this.g.profile.level;
    // make sure the first jobs a new player sees are doable on foot
    for (let tries = 0; jobs.length < JOBS_PER_DISTRICT && tries < 40; tries++) {
      const forced = lv < 2 && jobs.length < 3 ? 'standard' : null;
      const j = this.makeJob(district, r, forced);
      if (!j) continue;
      if (lv < 2 && jobs.length < 3) { j.units = 1; j.required = 'walk'; j.reward = this.computeReward(j); j.xp = this.computeXP(j); }
      jobs.push(j);
    }
    jobs.sort((a, b) => a.reward - b.reward);
    this.boards[district] = { jobs, refreshAt: now + JOB_REFRESH };
    return this.boards[district];
  }
  allJobs() {
    const out = [];
    for (const d of this.g.eco.unlockedDistricts()) out.push(...this.refreshBoard(d).jobs);
    return out;
  }
  findJob(id) {
    for (const b of Object.values(this.boards)) { const j = b.jobs.find(x => x.id === id); if (j) return j; }
    if (this.event && this.event.job.id === id) return this.event.job;
    return null;
  }

  // ---------------------------------------------------------------- accept / cancel
  accept(id) {
    if (this.active) return { ok: false, error: 'Finish or cancel your current job first' };
    if (this.trial) return { ok: false, error: 'Finish the time trial first' };
    const job = this.findJob(id);
    if (!job) return { ok: false, error: 'That job is gone' };
    for (const b of Object.values(this.boards)) b.jobs = b.jobs.filter(j => j.id !== id);
    this.start(job);
    return { ok: true };
  }
  start(job) {
    const B = this.L.buildings;
    this.active = {
      job, state: 'pickup', dropIndex: 0, timeLeft: job.time, health: 100, late: false,
      pickupB: B[job.pickup], dropBs: job.drops.map(i => B[i]), carried: 0, started: this.g.clock,
    };
    this.spawnPickupVisuals();
    this.g.events.emit('job:accepted', job);
    this.updateMarkers();
  }
  cancel(reason = 'cancelled') {
    if (!this.active) return;
    const job = this.active.job;
    this.clearJobVisuals();
    this.active = null;
    this.g.setCargo(0);
    this.g.player.carrying = null;
    this.g.profile.streak = 0;
    if (reason !== 'cancelled') this.g.profile.stats.failed++;
    this.g.events.emit('job:failed', { job, reason });
    this.updateMarkers();
  }

  spawnPickupVisuals() {
    const a = this.active;
    const p = a.pickupB.door;
    const rar = RARITY_BY_ID[a.job.rarity];
    const grp = new THREE.Group();
    const n = Math.min(a.job.units, 6);
    for (let i = 0; i < n; i++) {
      const box = assets.clone('props/package', true) || new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ name: 'box' }));
      box.traverse(o => { if (o.isMesh && o.material.name === 'box') { o.material.color.set(rar.color); if (rar.glow) { o.material.emissive = new THREE.Color(rar.color); o.material.emissiveIntensity = rar.glow * 0.4; } } if (o.isMesh) o.castShadow = true; });
      box.position.set((i % 3 - 1) * 0.55, Math.floor(i / 3) * 0.5, 0);
      box.rotation.y = (i * 0.7) % 0.5;
      grp.add(box);
    }
    const back = 1.4;   // slightly towards the building
    grp.position.set(p.x - Math.sin(p.ry) * back, CITY.curb, p.z - Math.cos(p.ry) * back);
    grp.rotation.y = p.ry;
    this.g.scene.add(grp);
    this.pickupStack = grp;
    // shop owner at the door
    this.owner = this.g.npcs.spawnStatic('owner', p.x - Math.sin(p.ry) * 2.2 + Math.cos(p.ry) * 1.4, p.z - Math.cos(p.ry) * 2.2 - Math.sin(p.ry) * 1.4, p.ry, 'wave');
  }
  spawnCustomer() {
    const a = this.active;
    if (this.customer) this.g.npcs.release(this.customer);
    const d = a.dropBs[a.dropIndex].door;
    this.customer = this.g.npcs.spawnStatic('customer', d.x - Math.sin(d.ry) * 1.6, d.z - Math.cos(d.ry) * 1.6, d.ry, 'wave');
  }
  clearJobVisuals() {
    if (this.pickupStack) { this.pickupStack.removeFromParent(); this.pickupStack = null; }
    if (this.owner) { this.g.npcs.release(this.owner); this.owner = null; }
    if (this.customer) { this.g.npcs.release(this.customer, true); this.customer = null; }
  }

  // ---------------------------------------------------------------- interaction
  // called by the game with the player position; returns a prompt {text, action} or null
  prompt(pos, inVehicle, speed) {
    const a = this.active;
    const reach = inVehicle ? 8 : 3.6;
    if (a) {
      if (a.state === 'pickup') {
        const d = a.pickupB.door;
        if (Math.hypot(pos.x - d.x, pos.z - d.z) < reach) {
          if (inVehicle && speed > 3) return { text: 'Stop to collect', action: null };
          const cap = this.g.currentCapacity();
          if (cap < a.job.units) return { text: `Needs ${a.job.units} cargo space (yours: ${cap}). Use a bigger vehicle.`, action: null, warn: true };
          return { text: `Collect ${a.job.units > 1 ? a.job.units + ' x ' : ''}${a.job.name}`, action: () => this.collect() };
        }
      } else if (a.state === 'deliver') {
        const d = a.dropBs[a.dropIndex].door;
        if (Math.hypot(pos.x - d.x, pos.z - d.z) < reach) {
          if (inVehicle && speed > 3) return { text: 'Stop to deliver', action: null };
          if (!inVehicle && !this.g.player.carrying && !this.g.cargoNearby(pos, 25)) return { text: 'Bring the parcel (your vehicle is too far away)', action: null, warn: true };
          return { text: `Deliver to ${a.dropBs[a.dropIndex].name}`, action: () => this.deliver() };
        }
      }
    }
    if (this.event && !this.event.taken && !a && !this.trial) {
      const b = this.event.building.door;
      if (Math.hypot(pos.x - b.x, pos.z - b.z) < reach) {
        if (inVehicle && speed > 3) return { text: 'Stop to grab the Golden Drop', action: null };
        return { text: 'Grab the Golden Drop!', action: () => this.takeEvent() };
      }
    }
    if (!a && !this.trial) {
      for (const t of TIME_TRIALS) {
        const n = t.nodes[0];
        const x = gx(n[0]), z = gx(n[1]);
        if (Math.hypot(pos.x - x, pos.z - z) < (inVehicle ? 9 : 4)) {
          if (!this.g.eco.isUnlocked(t.district) || this.g.profile.level < t.level) return { text: `${t.name}: needs level ${t.level} and the ${DISTRICTS[t.district].name} district`, action: null, warn: true };
          return { text: `Start time trial: ${t.name}`, action: () => this.startTrial(t.id) };
        }
      }
    }
    return null;
  }

  collect() {
    const a = this.active;
    if (!a || a.state !== 'pickup') return;
    const rar = RARITY_BY_ID[a.job.rarity];
    if (this.pickupStack) { this.pickupStack.removeFromParent(); this.pickupStack = null; }
    if (this.owner) { this.g.npcs.setAnim(this.owner, 'cheer'); const o = this.owner; setTimeout(() => this.g.npcs.release(o), 2500); this.owner = null; }
    a.state = 'deliver';
    a.dropIndex = 0;
    a.carried = a.job.units;
    this.g.loadCargo(a.job.units, rar.color, rar.glow);
    this.spawnCustomer();
    this.g.events.emit('job:pickup', a.job);
    this.updateMarkers();
  }

  deliver() {
    const a = this.active;
    if (!a || a.state !== 'deliver') return;
    const job = a.job;
    const drop = a.dropBs[a.dropIndex];
    const isLast = a.dropIndex >= a.dropBs.length - 1;
    const perDrop = Math.max(1, Math.round(job.units / a.dropBs.length));
    a.carried = isLast ? 0 : Math.max(0, a.carried - perDrop);
    const rar = RARITY_BY_ID[job.rarity];
    this.g.loadCargo(a.carried, rar.color, rar.glow);
    if (this.customer) { this.g.npcs.setAnim(this.customer, 'cheer'); const c = this.customer; setTimeout(() => this.g.npcs.release(c, true), 2600); this.customer = null; }
    this.g.events.emit('job:drop', { job, drop, index: a.dropIndex, last: isLast });
    if (!isLast) {
      a.dropIndex++;
      this.spawnCustomer();
      this.updateMarkers();
      return;
    }
    this.complete(drop);
  }

  complete(drop) {
    const a = this.active;
    const job = a.job;
    const p = this.g.profile;
    const eco = this.g.eco;
    let pay = job.reward;
    const parts = [{ label: 'Base pay', value: job.reward }];
    const frac = a.timeLeft / job.time;
    if (job.type === 'express' || job.type === 'premium' || job.special) {
      const bonus = Math.round(job.reward * 0.5 * clamp(frac, 0, 1));
      if (bonus > 0) { pay += bonus; parts.push({ label: 'Speed bonus', value: bonus }); }
    } else if (a.late) {
      const pen = -Math.round(pay * 0.25);
      pay += pen; parts.push({ label: 'Late', value: pen });
    }
    if (job.fragile) {
      const pen = -Math.round(pay * (1 - a.health / 100));
      if (pen) { pay += pen; parts.push({ label: `Condition ${Math.round(a.health)}%`, value: pen }); }
    }
    const streakMult = STREAK_BONUS * Math.min(p.streak, STREAK_MAX);
    if (streakMult > 0) { const s = Math.round(pay * streakMult); pay += s; parts.push({ label: `Streak x${p.streak}`, value: s }); }
    if (eco.hasEquip('badge')) { const s = Math.round(pay * 0.1); pay += s; parts.push({ label: 'Negotiator Badge', value: s }); }
    let xp = job.xp;
    if (eco.hasEquip('clipboard')) xp = Math.round(xp * 1.15);
    eco.earn(pay, 'delivery');
    eco.addXP(xp);
    p.streak++;
    p.stats.bestStreak = Math.max(p.stats.bestStreak, p.streak);
    p.stats.deliveries++;
    const ri = RARITY_BY_ID[job.rarity].index;
    if (ri >= 2) p.stats.rarePlus++;
    if (ri >= 3) p.stats.epicPlus++;
    if (ri >= 4) p.stats.legendary++;
    if (job.type === 'express') { p.stats.express++; if (frac >= 0.5) p.stats.expressFast++; }
    if (job.type === 'fragile') { p.stats.fragile++; if (a.health >= 99.5) p.stats.perfectFragile++; }
    if (job.type === 'heavy') p.stats.heavy++;
    if (job.type === 'multi') p.stats.multi++;
    if (job.type === 'premium') p.stats.premium++;
    if (job.event) p.stats.events++;
    if (job.special) { p.specials[job.special] = true; p.stats.specials++; }
    this.clearJobVisuals();
    this.active = null;
    this.g.setCargo(0);
    this.g.player.carrying = null;
    this.g.events.emit('job:complete', { job, pay, xp, parts, drop, streak: p.streak });
    this.updateMarkers();
  }

  // fragile damage from impacts (speed in m/s of the hit)
  impact(speed) {
    const a = this.active;
    if (!a || !a.job.fragile || a.state !== 'deliver') return;
    if (speed < 2.2) return;
    const dmg = (speed - 2.2) * 7 * (this.g.eco.hasEquip('bubblewrap') ? 0.65 : 1);
    a.health = Math.max(0, a.health - dmg);
    this.g.events.emit('job:damage', { health: a.health, dmg });
    if (a.health <= 0) this.cancel('broken');
  }

  // ---------------------------------------------------------------- events (Golden Drop)
  spawnEvent() {
    const unlocked = this.g.eco.unlockedDistricts();
    const d = this.rand.pick(unlocked);
    const pool = (this.byDistrict[d] || { pickup: [] }).pickup;
    if (!pool.length) return;
    const b = this.rand.pick(pool);
    const p = this.g.player.pos;
    if (Math.hypot(b.door.x - p.x, b.door.z - p.z) < 120) return;     // not right on top of the player
    const drop = this.pickDrop(this.rand, d, x => Math.hypot(x.door.x - b.door.x, x.door.z - b.door.z) > 250, false);
    if (!drop) return;
    const job = { id: jobSeq++, type: 'premium', rarity: 'legendary', district: d, units: 1, pickup: b.id, drops: [drop.id], event: true,
      name: 'Golden Drop', fragile: false, required: 'walk' };
    job.distance = pathLength(b.door.x, b.door.z, findPath(this.L, b.door.x, b.door.z, drop.door.x, drop.door.z));
    job.time = Math.round(40 + job.distance / clamp(this.bestOwned().top * 0.6, 5, 16));
    job.reward = Math.round(this.computeReward({ ...job, type: 'standard' }) * EVENT.rewardMult / 5) * 5;
    job.xp = this.computeXP(job) * 2;
    this.event = { job, building: b, timeLeft: EVENT.duration, taken: false };
    this.event.marker = new Marker(this.g.scene, { color: '#f2c94c', icon: 'event', height: 60, radius: 3.2 }).set(b.door.x, CITY.curb, b.door.z);
    this.g.events.emit('event:start', this.event);
  }
  takeEvent() {
    const e = this.event;
    if (!e || this.active) return;
    e.taken = true;
    e.marker.dispose();
    this.event = null;
    this.start(e.job);
    this.collect();
  }

  // ---------------------------------------------------------------- special missions
  startSpecial(id) {
    const s = SPECIAL_MISSIONS.find(x => x.id === id);
    if (!s) return { ok: false, error: 'Unknown mission' };
    if (this.active || this.trial) return { ok: false, error: 'Finish your current job first' };
    if (this.g.profile.level < s.level) return { ok: false, error: `Requires level ${s.level}` };
    if (this.g.profile.specials[id]) return { ok: false, error: 'Already completed' };
    const r = rng(0xabc ^ id.length * 977);
    const unlocked = this.g.eco.unlockedDistricts();
    if (s.from.district !== 'any' && !unlocked.includes(s.from.district)) return { ok: false, error: `Unlock ${DISTRICTS[s.from.district].name} first` };
    if (s.to.district !== 'any' && !unlocked.includes(s.to.district)) return { ok: false, error: `Unlock ${DISTRICTS[s.to.district].name} first` };
    const roleMatch = (b, role) => role === 'any' ? (b.role === 'drop' || b.role === 'both')
      : role === 'office' ? (b.type === 'office' || b.type === 'tower') : b.type === role;
    const fromPool = this.L.buildings.filter(b => b.district === s.from.district && roleMatch(b, s.from.role));
    if (!fromPool.length) return { ok: false, error: 'No pickup found' };
    const pickup = r.pick(fromPool);
    const drops = [];
    const count = s.to.count || 1;
    const dists = s.to.district === 'any' ? unlocked : [s.to.district];
    for (let k = 0; k < count; k++) {
      const d = dists[k % dists.length];
      const pool = this.L.buildings.filter(b => b.district === d && roleMatch(b, s.to.role) && !drops.includes(b) && b !== pickup);
      if (pool.length) drops.push(r.pick(pool));
    }
    if (!drops.length) return { ok: false, error: 'No destination found' };
    let len = 0, px = pickup.door.x, pz = pickup.door.z;
    for (const d of drops) { len += pathLength(px, pz, findPath(this.L, px, pz, d.door.x, d.door.z)); px = d.door.x; pz = d.door.z; }
    const job = { id: jobSeq++, type: s.type, rarity: s.rarity, district: pickup.district, units: s.units, pickup: pickup.id, drops: drops.map(d => d.id),
      distance: len, time: Math.round(s.time * (this.g.eco.hasEquip('watch') ? 1.15 : 1)), reward: s.reward, xp: s.xp, name: s.name, special: s.id,
      fragile: s.type === 'fragile', required: this.requiredVehicle(s.units).id };
    this.start(job);
    return { ok: true };
  }

  // ---------------------------------------------------------------- time trials
  startTrial(id) {
    const t = TIME_TRIALS.find(x => x.id === id);
    if (!t || this.active || this.trial) return;
    const pts = t.nodes.map(n => ({ x: gx(n[0]), z: gx(n[1]) }));
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const medals = [len / 15 + 5, len / 11 + 5, len / 8 + 5].map(Math.round);
    this.trial = { def: t, pts, index: 1, time: 0, countdown: 3, medals, len };
    this.trial.marker = new Marker(this.g.scene, { color: '#e5383b', icon: 'trial', height: 18, radius: 7 });
    this.updateTrialMarker();
    this.g.events.emit('trial:start', this.trial);
  }
  updateTrialMarker() {
    const tr = this.trial;
    const p = tr.pts[tr.index];
    tr.marker.set(p.x, 0.05, p.z);
  }
  cancelTrial() {
    if (!this.trial) return;
    this.trial.marker.dispose();
    this.trial = null;
    this.g.events.emit('trial:end', { cancelled: true });
  }
  updateTrial(dt, pos) {
    const tr = this.trial;
    if (tr.countdown > 0) {
      const before = Math.ceil(tr.countdown);
      tr.countdown -= dt;
      if (Math.ceil(tr.countdown) !== before) this.g.events.emit('trial:tick', Math.max(0, Math.ceil(tr.countdown)));
      return;
    }
    tr.time += dt;
    const p = tr.pts[tr.index];
    if (Math.hypot(pos.x - p.x, pos.z - p.z) < 10) {
      tr.index++;
      this.g.events.emit('trial:checkpoint', { index: tr.index - 1, total: tr.pts.length - 1 });
      if (tr.index >= tr.pts.length) {
        const medal = tr.time <= tr.medals[0] ? 0 : tr.time <= tr.medals[1] ? 1 : tr.time <= tr.medals[2] ? 2 : -1;
        const prev = this.g.profile.trials[tr.def.id] || { best: null, medal: -1 };
        let reward = 0;
        // paid once per medal improvement (the difference to the medal you already had)
        if (medal >= 0 && (prev.medal < 0 || medal < prev.medal)) {
          reward = tr.def.reward[medal] - (prev.medal >= 0 ? tr.def.reward[prev.medal] : 0);
        }
        const best = prev.best == null ? tr.time : Math.min(prev.best, tr.time);
        this.g.profile.trials[tr.def.id] = { best, medal: prev.medal < 0 ? medal : (medal < 0 ? prev.medal : Math.min(prev.medal, medal)) };
        if (medal === 0) this.g.profile.stats.trialsGold = Math.max(this.g.profile.stats.trialsGold, 1);
        if (reward > 0) { this.g.eco.earn(reward, 'trial'); this.g.eco.addXP(Math.round(reward / 8), 'trial'); }
        tr.marker.dispose();
        this.trial = null;
        this.g.events.emit('trial:end', { def: tr.def, time: tr.time, medal, reward, best, medals: tr.medals });
        return;
      }
      this.updateTrialMarker();
    }
  }

  // ---------------------------------------------------------------- markers + update
  currentTarget() {
    const a = this.active;
    if (this.trial) { const p = this.trial.pts[this.trial.index]; return p ? { x: p.x, z: p.z, kind: 'trial' } : null; }
    if (a) {
      const b = a.state === 'pickup' ? a.pickupB : a.dropBs[a.dropIndex];
      return { x: b.door.x, z: b.door.z, kind: a.state, name: b.name };
    }
    if (this.waypoint) return { ...this.waypoint, kind: 'waypoint' };
    return null;
  }
  updateMarkers() {
    for (const m of this.markers) m.dispose();
    this.markers = [];
    const a = this.active;
    if (a) {
      const b = a.state === 'pickup' ? a.pickupB : a.dropBs[a.dropIndex];
      const m = new Marker(this.g.scene, { color: a.state === 'pickup' ? '#2f80ed' : '#27ae60', icon: a.state === 'pickup' ? 'pickup' : 'drop' });
      m.set(b.door.x, CITY.curb, b.door.z);
      this.markers.push(m);
    } else if (this.waypoint && !this.trial) {
      const m = new Marker(this.g.scene, { color: '#e94f9a', icon: 'waypoint', height: 30 });
      m.set(this.waypoint.x, this.L.heightAt(this.waypoint.x, this.waypoint.z), this.waypoint.z);
      this.markers.push(m);
    }
  }
  setWaypoint(x, z) {
    this.waypoint = x == null ? null : { x, z };
    this.updateMarkers();
  }

  update(dt) {
    const g = this.g;
    const pos = g.player.vehicle ? { x: g.player.vehicle.x, z: g.player.vehicle.z } : g.player.pos;
    for (const m of this.markers) m.update(dt, g.camera.position);
    for (const i of this.boardIcons) i.update(g.camera.position);
    this.trialIcons.forEach((ic, k) => { ic.update(g.camera.position); if (this.trial || this.active) ic.setVisible(false); else ic.setVisible(g.eco.isUnlocked(TIME_TRIALS[k].district) && ic.sprite.visible); });
    if (this.trial) { this.trial.marker.update(dt, g.camera.position); this.updateTrial(dt, pos); }
    const a = this.active;
    if (a) {
      a.timeLeft -= dt;
      if (a.timeLeft <= 0 && !a.late) {
        const strict = a.job.type === 'express' || a.job.type === 'premium' || a.job.event || a.job.special;
        if (strict) { this.cancel('late'); return; }
        a.late = true;
        g.events.emit('job:late', a.job);
      }
      if (this.pickupStack) this.pickupStack.children.forEach((c, i) => { c.position.y = Math.floor(i / 3) * 0.5 + Math.abs(Math.sin(g.clock * 2 + i)) * 0.04; });
    } else if (this.waypoint && Math.hypot(pos.x - this.waypoint.x, pos.z - this.waypoint.z) < 8) {
      this.setWaypoint(null);
      g.events.emit('waypoint:reached');
    }
    // golden drop events
    if (this.event) {
      this.event.timeLeft -= dt;
      this.event.marker.update(dt, g.camera.position);
      if (this.event.timeLeft <= 0) { this.event.marker.dispose(); this.event = null; g.events.emit('event:end'); }
    } else if (g.profile.level >= 3) {
      this.eventTimer -= dt;
      if (this.eventTimer <= 0) {
        this.eventTimer = this.rand.range(EVENT.interval[0], EVENT.interval[1]);
        this.spawnEvent();
      }
    }
  }

  describe(job) {
    const B = this.L.buildings;
    const p = B[job.pickup], d = B[job.drops[job.drops.length - 1]];
    return {
      pickup: p.name, drop: job.drops.length > 1 ? `${job.drops.length} stops` : d.name,
      dist: fmtDist(job.distance), reward: fmtMoney(job.reward), districtFrom: DISTRICTS[p.district].name,
      districtTo: DISTRICTS[d.district].name,
    };
  }
}

export { districtAt };
