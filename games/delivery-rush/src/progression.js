// Achievements, daily missions, daily login rewards. Listens to game events.
import { ACHIEVEMENTS, DAILY_TEMPLATES, dailyReward, LOGIN_REWARDS, RARITY_BY_ID } from './config.js';
import { rng, hashStr, todayKey, daysBetween } from './utils.js';

export class Progression {
  constructor(game) {
    this.g = game;
    const ev = game.events;
    ev.on('job:complete', e => this.onDelivery(e));
    ev.on('money', e => { if (e.source !== 'achievement' && e.source !== 'daily' && e.source !== 'login' && e.source !== 'levelup') this.bump('earned', e.amount); });
    ev.on('purchase', () => this.check());
    ev.on('district', () => this.check());
    ev.on('levelup', () => this.check());
    ev.on('trial:end', () => this.check());
  }
  get p() { return this.g.profile; }

  init() {
    this.ensureDaily();
    this.updateLogin();
    this.check(true);
  }

  // ---------------------------------------------------------------- achievements
  statValue(stat) {
    const p = this.p;
    if (stat === 'level') return p.level;
    if (stat === 'vehiclesOwned') return Object.keys(p.owned).length;
    if (stat === 'districts') return Object.values(p.districts).filter(Boolean).length;
    return p.stats[stat] || 0;
  }
  check(silent = false) {
    for (const a of ACHIEVEMENTS) {
      if (this.p.achievements[a.id]) continue;
      if (this.statValue(a.stat) >= a.goal) {
        this.p.achievements[a.id] = { at: Date.now() };
        this.g.eco.earn(a.reward, 'achievement', false);
        if (!silent) this.g.events.emit('achievement', a);
      }
    }
  }
  achievementList() {
    return ACHIEVEMENTS.map(a => ({ ...a, done: !!this.p.achievements[a.id], progress: Math.min(a.goal, this.statValue(a.stat)) }));
  }

  // ---------------------------------------------------------------- daily missions
  ensureDaily() {
    const today = todayKey();
    const d = this.p.daily;
    if (d && d.date === today) return;
    const r = rng(hashStr(today + ':' + (this.p.createdAt || 0)));
    const lv = this.p.level;
    const pool = DAILY_TEMPLATES.filter(t => !t.level || lv >= t.level);
    const picks = [];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    const rw = dailyReward(lv);
    this.p.daily = {
      date: today,
      missions: picks.map((t, i) => ({ id: t.id, goal: t.goal(lv), progress: 0, claimed: false, money: Math.round(rw.money * (0.8 + i * 0.25)), xp: Math.round(rw.xp * (0.8 + i * 0.25)) })),
    };
  }
  bump(stat, amount = 1, isMax = false) {
    this.ensureDaily();
    for (const m of this.p.daily.missions) {
      const t = DAILY_TEMPLATES.find(x => x.id === m.id);
      if (!t || t.stat !== stat || m.claimed) continue;
      const before = m.progress;
      m.progress = isMax ? Math.max(m.progress, amount) : m.progress + amount;
      m.progress = Math.min(m.progress, m.goal);
      if (before < m.goal && m.progress >= m.goal) this.g.events.emit('daily:done', { text: t.text(m.goal) });
    }
  }
  dailyList() {
    this.ensureDaily();
    return this.p.daily.missions.map((m, i) => {
      const t = DAILY_TEMPLATES.find(x => x.id === m.id);
      return { ...m, index: i, text: t ? t.text(m.goal) : m.id };
    });
  }
  claimDaily(i) {
    const m = this.p.daily && this.p.daily.missions[i];
    if (!m) return { ok: false, error: 'Unknown mission' };
    if (m.claimed) return { ok: false, error: 'Already claimed' };
    if (m.progress < m.goal) return { ok: false, error: 'Not finished yet' };
    m.claimed = true;
    this.g.eco.earn(m.money, 'daily', false);
    this.g.eco.addXP(m.xp, 'daily');
    return { ok: true, money: m.money, xp: m.xp };
  }

  onDelivery(e) {
    const job = e.job;
    this.bump('deliveries');
    if (RARITY_BY_ID[job.rarity].index >= 2) this.bump('rarePlus');
    if (job.type === 'express') this.bump('express');
    if (job.type === 'fragile') this.bump('fragile');
    if (job.type === 'heavy') this.bump('heavy');
    this.bump('streakNow', e.streak, true);
    this.check();
  }
  addDistance(m) {
    this.p.stats.distance += m;
    this.bump('distance', m);
  }

  // ---------------------------------------------------------------- login rewards
  updateLogin() {
    const today = todayKey();
    const L = this.p.login;
    if (L.last === today) return;
    if (L.last && daysBetween(L.last, today) === 1) L.streak = (L.streak % LOGIN_REWARDS.length) + 1;
    else L.streak = 1;
    L.last = today;
  }
  loginReward() {
    const L = this.p.login;
    const mult = LOGIN_REWARDS[Math.max(0, (L.streak - 1) % LOGIN_REWARDS.length)];
    return Math.round((150 + 30 * this.p.level) * mult / 10) * 10;
  }
  canClaimLogin() { return this.p.login.claimed !== todayKey(); }
  claimLogin() {
    if (!this.canClaimLogin()) return { ok: false, error: 'Come back tomorrow' };
    const amt = this.loginReward();
    this.p.login.claimed = todayKey();
    this.g.eco.earn(amt, 'login', false);
    return { ok: true, money: amt, day: this.p.login.streak };
  }
}
