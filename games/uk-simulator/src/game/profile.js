// UK Simulator - the player's progress (money, XP, vehicles, upgrades, paint, records, daily
// challenge). Signed in with a SahurHub Chat account, the server holds it and decides every
// payment (so nobody can give themselves money). As a guest it is kept in this browser only.
import { FLAGS } from '../config.js';
import { VEHICLES } from '../shared/vehicles.js';
import { newProfile, levelFromXp, upgradePrice, PAINT_PRICE, MAX_UPGRADE, repairPrice, dailyChallenge, dailyReward, ukDate, eventReward, applyUnlocks, levelOk } from '../shared/rules.js';
import { defaultTune } from '../physics/car.js';
import { defaultBikeTune } from '../physics/bike.js';

const KEY = 'uksim.profile', SKEY = 'uksim.settings', TKEY = 'uksim.tunes';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { if (FLAGS.nosave) return; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};

export class Profile {
  constructor(game) { this.g = game; this.online = false; this.saveTimer = null; }

  async load() {
    this.data = applyUnlocks(store.get(KEY) || newProfile());
    this.settings = { quality: null, units: 'mph', volume: 0.7, timeMode: 'cycle', hour: 12.5, assists: true, ...(store.get(SKEY) || {}) };
    this.tunes = store.get(TKEY) || {};
    this.checkDaily();
  }

  get level() { return levelFromXp(this.data.xp); }
  vehicle(id) { return this.data.owned[id] || null; }
  owns(id) { return !!this.data.owned[id]; }

  tuneFor(id) {
    const spec = VEHICLES[id];
    const def = spec.kind === 'car' ? defaultTune(spec) : defaultBikeTune(spec);
    return { ...def, ...(this.tunes[id] || {}) };
  }
  saveTune(id, tune) { this.tunes[id] = tune; store.set(TKEY, this.tunes); }

  saveSettings() { store.set(SKEY, this.settings); }
  save() { if (!this.online) store.set(KEY, this.data); else this.g.net.send('prefs', { current: this.data.current }); }
  saveSoon() { this.save(); }

  // the server sends the whole profile after every change it makes
  fromServer(p) {
    this.online = true;
    const settings = this.data ? this.data.settings : {};
    this.data = applyUnlocks({ ...p, settings });
    this.checkDaily();
    this.g.hud.refresh();
    this.g.menu.refreshIfOpen();
  }
  goOffline() { this.online = false; this.data = store.get(KEY) || newProfile(); this.g.hud.refresh(); }

  // ------------------------------------------------------------------ spending
  async buyVehicle(id) {
    const v = VEHICLES[id];
    if (this.owns(id)) throw new Error('You already own it.');
    if (!levelOk(this.level, v.level)) throw new Error(`Reach level ${v.level} first.`);
    if (this.online) return this.fromServer(await this.g.net.request('buyVehicle', { id }));
    if (this.data.money < v.price) throw new Error('Not enough money yet.');
    this.data.money -= v.price;
    this.data.owned[id] = { upgrades: {}, paint: 'blue', paints: ['blue'], damage: 0 };
    this.save();
  }

  async buyUpgrade(id, kind) {
    const own = this.vehicle(id);
    if (!own) throw new Error('Buy the vehicle first.');
    const lvl = (own.upgrades[kind] || 0) + 1;
    if (lvl > MAX_UPGRADE) throw new Error('Already fully upgraded.');
    if (this.online) return this.fromServer(await this.g.net.request('buyUpgrade', { id, kind }));
    const price = upgradePrice(id, kind, lvl);
    if (this.data.money < price) throw new Error('Not enough money yet.');
    this.data.money -= price;
    own.upgrades[kind] = lvl;
    this.save();
  }

  async buyPaint(id, paint) {
    const own = this.vehicle(id);
    if (!own) throw new Error('Buy the vehicle first.');
    if (own.paints.includes(paint)) { own.paint = paint; if (this.online) return this.fromServer(await this.g.net.request('setPaint', { id, paint })); this.save(); return; }
    if (this.online) return this.fromServer(await this.g.net.request('buyPaint', { id, paint }));
    if (this.data.money < PAINT_PRICE) throw new Error('Not enough money yet.');
    this.data.money -= PAINT_PRICE;
    own.paints.push(paint); own.paint = paint;
    this.save();
  }

  async repair(id, damage) {
    if (this.online) return this.fromServer(await this.g.net.request('repair', { id, damage }));
    const price = repairPrice(id, damage);
    if (this.data.money < price) throw new Error('Not enough money for the garage.');
    this.data.money -= price;
    this.save();
  }

  // ------------------------------------------------------------------ earning (guests only; the server pays signed-in players)
  awardLocal(ev, result, vehicleId) {
    const r = eventReward(ev, result, vehicleId);
    this.data.money += r.money;
    const before = this.level;
    this.data.xp += r.xp;
    const rec = this.data.records[ev.id];
    if (r.medal && (!rec || (result.time && result.time < rec.time) || (result.score && result.score > (rec.score || 0)))) this.data.records[ev.id] = { time: result.time, score: result.score, medal: r.medal, vehicle: vehicleId };
    if (r.medal) this.addDaily('medals', 1);
    this.data.stats.events++;
    this.save();
    if (this.level > before) this.g.hud.levelUp(this.level);
    return r;
  }

  // ------------------------------------------------------------------ daily challenge
  checkDaily() {
    const today = ukDate();
    const d = this.data.daily || (this.data.daily = { day: '', done: false, streak: 0, progress: 0 });
    if (d.day !== today) {
      // keep the streak only if yesterday's was done
      const y = ukDate(Date.now() - 86400000);
      d.streak = d.day === y && d.done ? d.streak : 0;
      d.day = today; d.done = false; d.progress = 0;
    }
    this.daily = dailyChallenge(today);
  }

  addDaily(track, amount) {
    if (this.online) return; // the server counts it from your driving
    const d = this.data.daily;
    if (!this.daily || d.done || this.daily.track !== track) return;
    d.progress += amount;
    if (d.progress >= this.daily.goal) {
      d.done = true; d.streak++;
      const r = dailyReward(d.streak);
      this.data.money += r.money; this.data.xp += r.xp;
      this.g.hud.toast(`Daily challenge done! +£${r.money}, +${r.xp} XP (streak ${d.streak})`, 'good');
      this.save();
    }
  }
}
