// Money, upgrades, finished jobs and best times. Saved in this browser (localStorage, wrapped in try/catch
// by core/store.js). Pay = base + speed bonus + "no missed spots" bonus.
import { store } from '../core/store.js';
import { SAVE_KEY, FLAGS } from '../config.js';
import { UPGRADES, COLORS } from './upgrades.js';
import { JOBS } from './jobs.js';

export const REPLAY_SHARE = 0.7;   // a job you have finished before pays 70% of its base
export const SPEED_SHARE = 0.4;    // full speed bonus (40% of base) at half the par time
export const SPOTS_SHARE = 0.25;   // every object finished: +25% of base

function fresh() {
  return {
    v: 1, money: 0,
    up: { tank: 0, pressure: 0, nozzle: 0, hose: 0, surface: 0, detergent: 0 },
    color: 'blue', colors: ['blue'],
    done: {}, best: {}, plays: {},
    tutorial: false,
    stats: { earned: 0, jobs: 0, litres: 0 },
  };
}

export function loadProfile() {
  const p = fresh();
  const s = store.json(SAVE_KEY, null);
  if (s && typeof s === 'object') {
    if (Number.isFinite(s.money)) p.money = Math.max(0, Math.floor(s.money));
    if (s.up && typeof s.up === 'object') for (const k of Object.keys(p.up)) p.up[k] = Math.max(0, Math.min(UPGRADES[k].prices.length, Math.floor(s.up[k] || 0)));
    if (Array.isArray(s.colors)) p.colors = [...new Set(['blue', ...s.colors.filter((c) => COLORS.some((x) => x.id === c))])];
    if (p.colors.includes(s.color)) p.color = s.color;
    for (const j of JOBS) {
      if (s.done && s.done[j.id]) p.done[j.id] = true;
      if (s.best && Number.isFinite(s.best[j.id])) p.best[j.id] = s.best[j.id];
      if (s.plays && Number.isFinite(s.plays[j.id])) p.plays[j.id] = s.plays[j.id];
    }
    p.tutorial = !!s.tutorial;
    if (s.stats && typeof s.stats === 'object') for (const k of Object.keys(p.stats)) if (Number.isFinite(s.stats[k])) p.stats[k] = s.stats[k];
  }
  if (FLAGS.rich) p.money = Math.max(p.money, 100000);
  return p;
}

export function saveProfile(p) { store.setJson(SAVE_KEY, p); }
export function resetProfile() { store.del(SAVE_KEY); return fresh(); }

export function unlocked(p, job) {
  const i = JOBS.indexOf(job);
  return i <= 0 || !!p.done[JOBS[i - 1].id];
}

export function nextJob(p) {
  return JOBS.find((j) => unlocked(p, j) && !p.done[j.id]) || null;
}

// result = { time, allDone }
export function jobPay(p, job, result) {
  const repeat = !!p.done[job.id];
  const base = Math.round(job.pay * (repeat ? REPLAY_SHARE : 1));
  let speed = 0;
  if (result.time <= job.par) speed = Math.round(job.pay * SPEED_SHARE * Math.min(1, 0.25 + 0.75 * (job.par - result.time) / (job.par * 0.5)));
  const spots = result.allDone ? Math.round(job.pay * SPOTS_SHARE) : 0;
  return { base, speed, spots, total: base + speed + spots, repeat };
}

// pays the job and records it. Returns { pay, newBest, firstTime }
export function finishJob(p, job, result) {
  const pay = jobPay(p, job, result);
  const firstTime = !p.done[job.id];
  const best = p.best[job.id];
  const newBest = best == null || result.time < best;
  p.money += pay.total;
  p.done[job.id] = true;
  if (newBest) p.best[job.id] = Math.round(result.time * 10) / 10;
  p.plays[job.id] = (p.plays[job.id] || 0) + 1;
  p.stats.earned += pay.total;
  p.stats.jobs += 1;
  p.stats.litres += Math.round(result.litres || 0);
  saveProfile(p);
  return { pay, newBest, firstTime };
}

export function upgradePrice(p, key) {
  const u = UPGRADES[key], lv = p.up[key] || 0;
  return lv < u.prices.length ? u.prices[lv] : null;
}

export function buyUpgrade(p, key) {
  const price = upgradePrice(p, key);
  if (price == null) return { ok: false, msg: 'Already maxed out.' };
  if (p.money < price) return { ok: false, msg: 'Not enough money yet.' };
  p.money -= price;
  p.up[key] = (p.up[key] || 0) + 1;
  saveProfile(p);
  return { ok: true };
}

export function buyColor(p, id) {
  const c = COLORS.find((x) => x.id === id);
  if (!c) return { ok: false, msg: 'Unknown colour.' };
  if (!p.colors.includes(id)) {
    if (p.money < c.price) return { ok: false, msg: 'Not enough money yet.' };
    p.money -= c.price;
    p.colors.push(id);
  }
  p.color = id;
  saveProfile(p);
  return { ok: true };
}
