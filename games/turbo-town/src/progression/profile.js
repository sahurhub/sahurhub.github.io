// TURBO TOWN - the player's profile.
//   ServerProfile: the real one. Lives on the Turbo Town server; every coin, kart and
//                  record is decided there. The game is online-only.
//   DevProfile:    a stand-in that only exists on localhost so the game can be tested
//                  without the server. Never used on the published site.
// Both offer the same methods to the rest of the game.
import { KART_BY_ID } from '../shared/karts.js';
import { START_MAPS, levelFromXp, CUPS } from '../shared/rules.js';
import { raceRewards, trophyFor, nextCup } from '../shared/rewards.js';
import { unlockedAt, newUnlocks, paintColors } from '../shared/cosmetics.js';
import { FLAGS } from '../config.js';
import { adminApply } from '../shared/admin.js';

class BaseProfile {
  get level() { return this.get().level || levelFromXp(this.get().xp).level; }
  hasKart(id) { return this.get().karts.includes(id); }
  canBuyKart(id) { const k = KART_BY_ID[id]; const p = this.get(); return !!k && !this.hasKart(id) && this.level >= k.level && p.coins >= k.price; }
  mapOpen(id) { return this.get().maps.includes(id); }
  cupOpen(id) { return this.get().cupsOpen.includes(id); }
  unlocked() { return this.get().unlocked || unlockedAt(this.level); }
  lookFor(kartId) {
    const def = KART_BY_ID[kartId] || KART_BY_ID.starter;
    const l = this.get().look[kartId] || {};
    return { paintId: l.paint || 'p_classic', paint: paintColors(l.paint || 'p_classic', def), wheels: l.wheels || 'wheel_std', acc: l.acc || null, skin: l.skin || null };
  }
}

// ------------------------------------------------------------------ server profile

export class ServerProfile extends BaseProfile {
  constructor(net, view, admin = false) {
    super();
    this.net = net;
    this.online = true;
    this.dev = false;
    this.data = view;
    this.admin = !!admin; // the server decides; it also checks every admin request
    net.on('welcome', (m) => { this.data = m.profile; this.admin = !!m.admin; });
    net.on('profile', (m) => { if (m.profile) this.data = m.profile; }); // changed by an admin
  }
  // ---- admin panel (the server refuses these for everyone except admins)
  async adminInfo() { return this.net.request('adminInfo'); }
  async adminFind(who) { return this.net.request('adminFind', { who }); }
  async adminAct(uid, action, value) {
    const out = await this.net.request('adminAct', { uid, action, value });
    if (!uid) this.data = out.profile; // it was for me
    return out;
  }
  async adminKick(uid) { return this.net.request('adminKick', { uid }); }
  get() { return this.data; }
  async refresh() { this.data = await this.net.request('profile'); return this.data; }
  async select(kart) { this.data = await this.net.request('select', { kart }); }
  async buyKart(id) { this.data = await this.net.request('buy', { kart: id }); }
  async setLook(kartId, look) { this.data = await this.net.request('look', { kart: kartId, look }); }
  async setStyle(style) { this.data = await this.net.request('style', style); }
  async startRace(cfg) {
    const res = await this.net.request('ticket', { mode: cfg.mode, map: cfg.map, aiCount: cfg.aiCount, difficulty: cfg.difficulty, kart: cfg.kart, cup: cfg.cup, race: cfg.race });
    return res.ticket;
  }
  async submitRace(r) { const out = await this.net.request('raceResult', r); this.data = out.profile; return out; }
  async submitTT(r) { const out = await this.net.request('ttResult', r, 20000); this.data = out.profile; return out; }
  async ghost(map) { return this.net.request('ghost', { map }); }
  async leaderboard(map) { return this.net.request('leaderboard', { map }); }
}

// ------------------------------------------------------------------ test stand-in

function emptyDev(name) {
  return {
    name, xp: 0, coins: 0, karts: ['starter'], kart: 'starter', driver: 'fox', look: {}, title: 'Rookie', frame: 'frame_basic', boost: 'fx_classic',
    maps: [...START_MAPS], cupsOpen: ['spring'], cups: {}, records: {}, ghosts: {}, achievements: {},
    stats: { races: 0, wins: 0, overtakes: 0, gpWins: 0 }, recent: [], daily: [], gpRun: null,
  };
}

export class DevProfile extends BaseProfile {
  constructor() {
    super();
    this.key = 'turbotown.devprofile.v2';
    this.online = false;
    this.dev = true;
    let p = null;
    if (!FLAGS.test) { try { p = JSON.parse(localStorage.getItem(this.key) || 'null'); } catch (e) { p = null; } }
    this.data = Object.assign(emptyDev('Tester'), p || {});
    this.decorate();
  }
  decorate() {
    const lv = levelFromXp(this.data.xp);
    Object.assign(this.data, { level: lv.level, into: lv.into, need: lv.need, unlocked: unlockedAt(lv.level) });
  }
  save() { this.decorate(); if (!FLAGS.test) { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* ignore */ } } }
  get() { return this.data; }
  async refresh() { return this.data; }
  // the admin panel works on this PC's test profile too (only for yourself)
  get admin() { return true; }
  async adminInfo() { return { local: true, online: [], parties: 0, races: 0, players: 0 }; }
  async adminFind() { throw new Error('Finding other players only works on the real server.'); }
  async adminAct(uid, action, value) {
    if (uid) throw new Error('Other players only exist on the real server.');
    let what;
    if (action === 'reset') { this.data = emptyDev(this.data.name); what = 'Progress reset to a new player'; } else what = adminApply(this.data, action, value);
    this.save();
    return { uid: 0, name: this.data.name, what, profile: this.data };
  }
  async adminKick() { throw new Error('Only on the real server.'); }
  async select(kart) { if (kart && this.hasKart(kart)) this.data.kart = kart; this.save(); }
  async buyKart(id) {
    if (!this.canBuyKart(id)) throw new Error('Not enough coins or level too low.');
    this.data.coins -= KART_BY_ID[id].price; this.data.karts.push(id); this.save();
  }
  async setLook(kartId, look) { this.data.look[kartId] = { ...(this.data.look[kartId] || {}), ...look }; this.save(); }
  async setStyle(style) { Object.assign(this.data, Object.fromEntries(Object.entries(style).filter(([, v]) => v != null))); this.save(); }
  async startRace(cfg) {
    if (cfg.mode === 'gp' && cfg.race === 0) this.data.gpRun = { cup: cfg.cup, race: 0 };
    return 'dev-' + Date.now();
  }
  pay(rw, extra = {}) {
    const before = this.level;
    this.data.coins += rw.coins; this.data.xp += rw.xp;
    this.data.recent = [...rw.lines.map((l) => l.label + ' +' + l.coins), ...this.data.recent].slice(0, 12);
    this.save();
    const after = this.level;
    return { ...rw, levelUp: after > before ? after : 0, unlocks: after > before ? newUnlocks(before, after) : [], ...extra, profile: this.data };
  }
  async submitRace(r) {
    const d = this.data;
    const unlockMaps = [], unlockCups = [];
    let gp = null, cup = null;
    if (r.mode === 'gp') {
      if (!d.maps.includes(r.map)) { d.maps.push(r.map); unlockMaps.push(r.map); }
      if (r.gpRace >= 3) {
        gp = { done: true, place: r.gpPlace };
        const nc = nextCup(r.cup);
        if (nc && !d.cupsOpen.includes(nc)) { d.cupsOpen.push(nc); unlockCups.push(nc); }
        const trophy = trophyFor(r.gpPlace);
        const old = d.cups[r.cup];
        if (!old || r.gpPlace < old.best) d.cups[r.cup] = { best: r.gpPlace, trophy };
        cup = { cup: r.cup, place: r.gpPlace, trophy };
      }
    }
    d.stats.races++; if (r.place === 1 && r.field > 1) d.stats.wins++; d.stats.overtakes += r.overtakes || 0;
    const rw = raceRewards({ mode: r.mode, place: r.place, racers: r.field, overtakes: r.overtakes, difficulty: r.difficulty, gp, clean: r.clean });
    return this.pay(rw, { unlockMaps, unlockCups, cup });
  }
  async submitTT(r) {
    const d = this.data;
    const rec = d.records[r.map] || {};
    const had = !!rec.total;
    const pb = !rec.total || r.total < rec.total, lapPb = !rec.lap || r.lap < rec.lap;
    if (pb) { rec.total = r.total; rec.kart = r.kart; d.ghosts[r.map] = r.ghost; rec.ghost = true; }
    if (lapPb) rec.lap = r.lap;
    d.records[r.map] = rec;
    const out = this.pay(raceRewards({ mode: 'tt', pb: pb && had }));
    return { ...out, pb, lapPb };
  }
  async ghost(map) { return this.data.ghosts[map] || null; }
  async leaderboard(map) {
    const rec = this.data.records[map];
    return { map, top: rec && rec.total ? [{ name: this.data.name, total: rec.total, lap: rec.lap, kart: rec.kart, me: true }] : [], mine: null, local: true };
  }
}

export { CUPS };
