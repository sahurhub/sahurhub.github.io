// Player profile + economy rules. Every money / XP change goes through here so a server could
// own these calls later (each method validates and returns {ok, error}).
import {
  SAVE_VERSION, START_MONEY, VEHICLES, VEHICLE_BY_ID, UPGRADE_STATS, UPGRADE_MAX, UPGRADE_FREE_MAX, upgradeCost,
  PAINTS, WHEELS, ACCESSORIES, COSMETICS, EQUIPMENT, GARAGE_UPGRADES, DISTRICTS, DISTRICT_ORDER, xpForLevel, MAX_LEVEL,
  levelUpReward, SHIRT_COLORS, PANTS_COLORS, COLOR_PRICE, vehicleStats, JOB_TYPES, SPECIAL_MISSIONS, TIME_TRIALS,
} from './config.js';
import { todayKey } from './utils.js';

export function createProfile() {
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    money: START_MONEY,
    xp: 0,
    level: 1,
    owned: {},                    // vehicleId -> {upgrades, paint, wheels, accessories}
    equipped: 'walk',
    districts: { downtown: true },
    garage: {},
    cosmetics: { owned: ['cap'], equipped: { hat: 'cap', face: null, back: null }, shirts: ['#ff7a1f'], pants: ['#2f3f5c'], shirt: '#ff7a1f', pantsColor: '#2f3f5c' },
    equipment: [],
    stats: { deliveries: 0, earned: 0, distance: 0, legendary: 0, epicPlus: 0, rarePlus: 0, perfectFragile: 0, expressFast: 0,
      bestStreak: 0, upgrades: 0, maxedStat: 0, trialsGold: 0, specials: 0, events: 0, heavy: 0, multi: 0, premium: 0,
      express: 0, fragile: 0, failed: 0 },
    streak: 0,
    achievements: {},
    daily: null,
    login: { last: null, streak: 0, claimed: null },
    specials: {},
    trials: {},
    tutorial: { step: 0, done: false },
    player: null,
    time: 9,
  };
}

export function migrateProfile(p) {
  if (!p || typeof p !== 'object') return createProfile();
  const base = createProfile();
  const out = { ...base, ...p };
  out.stats = { ...base.stats, ...(p.stats || {}) };
  out.cosmetics = { ...base.cosmetics, ...(p.cosmetics || {}) };
  out.cosmetics.equipped = { ...base.cosmetics.equipped, ...((p.cosmetics || {}).equipped || {}) };
  out.login = { ...base.login, ...(p.login || {}) };
  out.tutorial = { ...base.tutorial, ...(p.tutorial || {}) };
  out.districts = { downtown: true, ...(p.districts || {}) };
  for (const [id, v] of Object.entries(out.owned)) {
    if (!VEHICLE_BY_ID[id]) { delete out.owned[id]; continue; }
    out.owned[id] = { upgrades: {}, paint: 'stock', wheels: 'standard', accessories: [], paints: ['stock'], wheelSets: ['standard'], accOwned: [], ...v };
  }
  if (out.equipped !== 'walk' && !out.owned[out.equipped]) out.equipped = 'walk';
  out.version = SAVE_VERSION;
  return out;
}

export class Economy {
  constructor(profile, events) {
    this.p = profile;
    this.events = events;
  }
  get money() { return this.p.money; }
  get level() { return this.p.level; }

  earn(amount, source = 'delivery', countStat = true) {
    amount = Math.round(amount);
    if (amount <= 0) return 0;
    this.p.money += amount;
    if (countStat) this.p.stats.earned += amount;
    this.events.emit('money', { amount, source, total: this.p.money });
    return amount;
  }
  spend(amount, what) {
    amount = Math.round(amount);
    if (this.p.money < amount) return false;
    this.p.money -= amount;
    this.events.emit('spend', { amount, what, total: this.p.money });
    return true;
  }

  addXP(n, source = 'delivery') {
    n = Math.round(n);
    if (n <= 0) return;
    this.p.xp += n;
    this.events.emit('xp', { amount: n, source });
    while (this.p.level < MAX_LEVEL && this.p.xp >= xpForLevel(this.p.level)) {
      this.p.xp -= xpForLevel(this.p.level);
      this.p.level++;
      const reward = levelUpReward(this.p.level);
      this.p.money += reward;
      this.events.emit('levelup', { level: this.p.level, reward, unlocks: unlocksAtLevel(this.p.level) });
    }
  }
  xpProgress() {
    const need = xpForLevel(this.p.level);
    return { xp: this.p.xp, need, frac: this.p.level >= MAX_LEVEL ? 1 : Math.min(1, this.p.xp / need) };
  }

  // ---------------------------------------------------------------- vehicles
  owns(id) { return id === 'walk' || !!this.p.owned[id]; }
  custom(id) { return this.p.owned[id] || { upgrades: {} }; }
  capacityOf(id) {
    if (id === 'walk') return 1 + (this.hasEquip('courierbag') ? 1 : 0);
    return vehicleStats(VEHICLE_BY_ID[id], this.custom(id).upgrades).capacity;
  }
  buyVehicle(id) {
    const v = VEHICLE_BY_ID[id];
    if (!v || id === 'walk') return { ok: false, error: 'Unknown vehicle' };
    if (this.owns(id)) return { ok: false, error: 'Already owned' };
    if (this.p.level < v.level) return { ok: false, error: `Requires level ${v.level}` };
    if (!this.spend(v.price, 'vehicle:' + id)) return { ok: false, error: 'Not enough money' };
    this.p.owned[id] = { upgrades: {}, paint: 'stock', wheels: 'standard', accessories: [], paints: ['stock'], wheelSets: ['standard'], accOwned: [] };
    this.events.emit('purchase', { kind: 'vehicle', id });
    return { ok: true };
  }
  equipVehicle(id) {
    if (!this.owns(id)) return { ok: false, error: 'Not owned' };
    this.p.equipped = id;
    this.events.emit('equip', { id });
    return { ok: true };
  }
  upgradeCostFor(id, stat) {
    const lvl = (this.custom(id).upgrades[stat] || 0);
    if (lvl >= UPGRADE_MAX) return null;
    return upgradeCost(VEHICLE_BY_ID[id], lvl);
  }
  buyUpgrade(id, stat) {
    if (!this.p.owned[id]) return { ok: false, error: 'Not owned' };
    if (!UPGRADE_STATS.find(s => s.id === stat)) return { ok: false, error: 'Unknown upgrade' };
    const c = this.p.owned[id];
    const lvl = c.upgrades[stat] || 0;
    if (lvl >= UPGRADE_MAX) return { ok: false, error: 'Maxed out' };
    if (lvl >= UPGRADE_FREE_MAX && !this.p.garage.tuninglab) return { ok: false, error: 'Needs the Tuning Lab (Shop > Garage)' };
    const cost = upgradeCost(VEHICLE_BY_ID[id], lvl);
    if (!this.spend(cost, 'upgrade')) return { ok: false, error: 'Not enough money' };
    c.upgrades[stat] = lvl + 1;
    this.p.stats.upgrades++;
    if (lvl + 1 >= UPGRADE_MAX) this.p.stats.maxedStat = Math.max(this.p.stats.maxedStat, 1);
    this.events.emit('purchase', { kind: 'upgrade', id, stat, level: lvl + 1 });
    return { ok: true };
  }
  buyOrApplyPaint(id, paintId) {
    const c = this.p.owned[id];
    const paint = PAINTS.find(p => p.id === paintId);
    if (!c || !paint) return { ok: false, error: 'Unavailable' };
    if (!this.p.garage.paintbooth && paintId !== 'stock') return { ok: false, error: 'Needs the Paint Booth (Shop > Garage)' };
    c.paints ||= ['stock'];
    if (!c.paints.includes(paintId)) {
      if (!this.spend(paint.price, 'paint')) return { ok: false, error: 'Not enough money' };
      c.paints.push(paintId);
    }
    c.paint = paintId;
    this.events.emit('purchase', { kind: 'paint', id });
    return { ok: true };
  }
  buyOrApplyWheels(id, wheelId) {
    const c = this.p.owned[id];
    const w = WHEELS.find(x => x.id === wheelId);
    if (!c || !w) return { ok: false, error: 'Unavailable' };
    if (!this.p.garage.wheelbay && wheelId !== 'standard') return { ok: false, error: 'Needs the Wheel Bay (Shop > Garage)' };
    c.wheelSets ||= ['standard'];
    if (!c.wheelSets.includes(wheelId)) {
      if (!this.spend(w.price, 'wheels')) return { ok: false, error: 'Not enough money' };
      c.wheelSets.push(wheelId);
    }
    c.wheels = wheelId;
    this.events.emit('purchase', { kind: 'wheels', id });
    return { ok: true };
  }
  toggleAccessory(id, accId) {
    const c = this.p.owned[id];
    const a = ACCESSORIES.find(x => x.id === accId);
    if (!c || !a) return { ok: false, error: 'Unavailable' };
    if (!this.p.garage.workshop) return { ok: false, error: 'Needs the Accessory Workshop (Shop > Garage)' };
    c.accOwned ||= [];
    if (!c.accOwned.includes(accId)) {
      if (!this.spend(a.price, 'accessory')) return { ok: false, error: 'Not enough money' };
      c.accOwned.push(accId);
      c.accessories = [...new Set([...(c.accessories || []), accId])];
    } else {
      const on = (c.accessories || []).includes(accId);
      c.accessories = on ? c.accessories.filter(x => x !== accId) : [...(c.accessories || []), accId];
    }
    this.events.emit('purchase', { kind: 'accessory', id });
    return { ok: true };
  }

  // ---------------------------------------------------------------- character
  buyCosmetic(id) {
    const c = COSMETICS.find(x => x.id === id);
    if (!c) return { ok: false, error: 'Unknown item' };
    const cs = this.p.cosmetics;
    if (!cs.owned.includes(id)) {
      if (this.p.level < c.level) return { ok: false, error: `Requires level ${c.level}` };
      if (!this.spend(c.price, 'cosmetic')) return { ok: false, error: 'Not enough money' };
      cs.owned.push(id);
      cs.equipped[c.slot] = id;
    } else cs.equipped[c.slot] = cs.equipped[c.slot] === id ? null : id;
    this.events.emit('cosmetics', {});
    return { ok: true };
  }
  buyColor(kind, color) {
    const cs = this.p.cosmetics;
    const list = kind === 'shirt' ? cs.shirts : cs.pants;
    const pal = kind === 'shirt' ? SHIRT_COLORS : PANTS_COLORS;
    if (!pal.includes(color)) return { ok: false, error: 'Unknown colour' };
    if (!list.includes(color)) {
      if (!this.spend(COLOR_PRICE, 'colour')) return { ok: false, error: 'Not enough money' };
      list.push(color);
    }
    if (kind === 'shirt') cs.shirt = color; else cs.pantsColor = color;
    this.events.emit('cosmetics', {});
    return { ok: true };
  }
  hasEquip(id) { return this.p.equipment.includes(id); }
  buyEquipment(id) {
    const e = EQUIPMENT.find(x => x.id === id);
    if (!e) return { ok: false, error: 'Unknown item' };
    if (this.hasEquip(id)) return { ok: false, error: 'Already owned' };
    if (this.p.level < e.level) return { ok: false, error: `Requires level ${e.level}` };
    if (!this.spend(e.price, 'equipment')) return { ok: false, error: 'Not enough money' };
    this.p.equipment.push(id);
    this.events.emit('purchase', { kind: 'equipment', id });
    return { ok: true };
  }
  buyGarageUpgrade(id) {
    const g = GARAGE_UPGRADES.find(x => x.id === id);
    if (!g) return { ok: false, error: 'Unknown upgrade' };
    if (this.p.garage[id]) return { ok: false, error: 'Already owned' };
    if (this.p.level < g.level) return { ok: false, error: `Requires level ${g.level}` };
    if (!this.spend(g.price, 'garage')) return { ok: false, error: 'Not enough money' };
    this.p.garage[id] = true;
    this.events.emit('purchase', { kind: 'garage', id });
    return { ok: true };
  }
  isUnlocked(d) { return !!this.p.districts[d]; }
  unlockDistrict(id) {
    const d = DISTRICTS[id];
    if (!d) return { ok: false, error: 'Unknown district' };
    if (this.p.districts[id]) return { ok: false, error: 'Already unlocked' };
    if (this.p.level < d.level) return { ok: false, error: `Requires level ${d.level}` };
    if (!this.spend(d.cost, 'district')) return { ok: false, error: 'Not enough money' };
    this.p.districts[id] = true;
    this.events.emit('district', { id });
    return { ok: true };
  }
  unlockedDistricts() { return DISTRICT_ORDER.filter(d => this.p.districts[d]); }
  jobTypeUnlocked(t) { return this.p.level >= JOB_TYPES[t].level; }
}

// list of things that become available at a level (for the level-up screen)
export function unlocksAtLevel(level) {
  const out = [];
  for (const v of VEHICLES) if (v.level === level && v.price > 0) out.push({ kind: 'Vehicle', name: v.name });
  for (const d of Object.values(DISTRICTS)) if (d.level === level && d.cost > 0) out.push({ kind: 'District', name: d.name });
  for (const t of Object.values(JOB_TYPES)) if (t.level === level && level > 1) out.push({ kind: 'Job type', name: t.name });
  for (const e of EQUIPMENT) if (e.level === level && level > 1) out.push({ kind: 'Equipment', name: e.name });
  for (const g of GARAGE_UPGRADES) if (g.level === level) out.push({ kind: 'Garage', name: g.name });
  for (const s of SPECIAL_MISSIONS) if (s.level === level) out.push({ kind: 'Special mission', name: s.name });
  for (const t of TIME_TRIALS) if (t.level === level && level > 1) out.push({ kind: 'Time trial', name: t.name });
  for (const c of COSMETICS) if (c.level === level && level > 1) out.push({ kind: 'Cosmetic', name: c.name });
  return out;
}

export { todayKey };
