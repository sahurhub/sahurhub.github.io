// Player profile: money, mowers, upgrades, places, cosmetics, career, daily streak, stats.
// Shared by the game (guest saves) and the server (account saves): same rules everywhere.
import { MOWERS, UPGRADE_IDS, MAX_UPGRADE, upgradeCost, upgradeApplies } from './mowers.js';
import { LEVELS, LEVEL_IDS } from './levels.js';
import { COSMETIC_KINDS } from './cosmetics.js';
import { WEATHER, payJob } from './rules.js';
import { PATTERN_IDS } from './patterns.js';
import { UserError, dayBefore } from './rng.js';
import { makeOffers, makeReview, REP_CHANGE, tierFor, LEVEL_REP } from './career.js';
import { streakMult } from './daily.js';

export const PROFILE_VERSION = 1;
const blankUp = () => ({ speed: 0, width: 0, fuel: 0, catcher: 0 });

export function newProfile() {
  const p = {
    v: PROFILE_VERSION, money: 0, earned: 0,
    mowers: { push: { up: blankUp() } },
    levels: ['back-garden'],
    cos: { paint: ['red'], hat: ['none'], outfit: ['casual'], pet: ['none'] },
    eq: { mower: 'push', paint: 'red', hat: 'none', outfit: 'casual', pet: 'none' },
    career: { rep: 0, jobs: 0, reviews: [], offers: [], seed: 1 },
    daily: { last: null, streak: 0, bestStreak: 0, scores: {} },
    stats: { jobs: 0, area: 0, time: 0, stars: 0, perfect: 0, hits: 0, dumped: 0, patterns: 0, best: {}, plays: {} },
    created: Date.now(),
  };
  p.career.offers = makeOffers(p);
  return p;
}

// Fill in anything missing (old saves, admin edits) and drop unknown ids.
export function fixProfile(p) {
  const d = newProfile();
  if (!p || typeof p !== 'object') return d;
  const num = (v, def = 0) => (Number.isFinite(v) ? v : def);
  const out = { ...d, ...p };
  out.money = Math.max(0, Math.floor(num(p.money)));
  out.earned = Math.max(0, Math.floor(num(p.earned)));
  out.mowers = {};
  for (const [id, m] of Object.entries(p.mowers || {})) if (MOWERS[id]) {
    const up = blankUp();
    for (const k of UPGRADE_IDS) up[k] = Math.max(0, Math.min(MAX_UPGRADE, Math.floor(num(m && m.up && m.up[k]))));
    out.mowers[id] = { up };
  }
  if (!out.mowers.push) out.mowers.push = { up: blankUp() };
  out.levels = [...new Set(['back-garden', ...(Array.isArray(p.levels) ? p.levels : []).filter((id) => LEVELS[id])])];
  out.cos = {};
  for (const [kind, table] of Object.entries(COSMETIC_KINDS)) {
    const list = (p.cos && Array.isArray(p.cos[kind]) ? p.cos[kind] : []).filter((id) => table[id]);
    const free = Object.keys(table).filter((id) => table[id].price === 0);
    out.cos[kind] = [...new Set([...free, ...list])];
  }
  out.eq = { ...d.eq, ...(p.eq || {}) };
  if (!out.mowers[out.eq.mower]) out.eq.mower = 'push';
  for (const kind of Object.keys(COSMETIC_KINDS)) if (!out.cos[kind].includes(out.eq[kind])) out.eq[kind] = d.eq[kind];
  out.career = { ...d.career, ...(p.career || {}) };
  out.career.rep = Math.max(0, Math.min(100, num(out.career.rep)));
  out.career.jobs = Math.max(0, Math.floor(num(out.career.jobs)));
  out.career.reviews = Array.isArray(out.career.reviews) ? out.career.reviews.slice(-30) : [];
  out.career.seed = Math.max(1, Math.floor(num(out.career.seed, 1)));
  if (!Array.isArray(out.career.offers) || out.career.offers.length !== 3 || out.career.offers.some((o) => !o || !LEVELS[o.level])) out.career.offers = makeOffers(out);
  out.daily = { ...d.daily, ...(p.daily || {}) };
  out.daily.streak = Math.max(0, Math.floor(num(out.daily.streak)));
  if (!out.daily.scores || typeof out.daily.scores !== 'object') out.daily.scores = {};
  out.stats = { ...d.stats, ...(p.stats || {}) };
  if (!out.stats.best || typeof out.stats.best !== 'object') out.stats.best = {};
  if (!out.stats.plays || typeof out.stats.plays !== 'object') out.stats.plays = {};
  out.v = PROFILE_VERSION;
  return out;
}

function spend(p, cost) {
  if (p.money < cost) throw new UserError(`You need $${cost.toLocaleString('en-GB')} for that.`);
  p.money -= cost;
}

// kind: mower | level | paint | hat | outfit | pet
export function buy(p, kind, id) {
  if (kind === 'mower') {
    const m = MOWERS[id];
    if (!m) throw new UserError('Unknown mower.');
    if (p.mowers[id]) throw new UserError('You already own that mower.');
    spend(p, m.price);
    p.mowers[id] = { up: blankUp() };
    return p;
  }
  if (kind === 'level') {
    const L = LEVELS[id];
    if (!L) throw new UserError('Unknown place.');
    if (p.levels.includes(id)) throw new UserError('You already have that place.');
    spend(p, L.price);
    p.levels.push(id);
    return p;
  }
  const table = COSMETIC_KINDS[kind];
  if (!table || !table[id]) throw new UserError('Unknown item.');
  if (p.cos[kind].includes(id)) throw new UserError('You already own that.');
  spend(p, table[id].price);
  p.cos[kind].push(id);
  p.eq[kind] = id;
  return p;
}

export function upgrade(p, mowerId, stat) {
  const m = p.mowers[mowerId];
  if (!m) throw new UserError('You do not own that mower.');
  if (!UPGRADE_IDS.includes(stat) || !upgradeApplies(mowerId, stat)) throw new UserError('That upgrade does not fit this mower.');
  const cost = upgradeCost(mowerId, stat, m.up[stat]);
  if (cost == null) throw new UserError('That is already fully upgraded.');
  spend(p, cost);
  m.up[stat]++;
  return p;
}

export function equip(p, slot, id) {
  if (slot === 'mower') {
    if (!p.mowers[id]) throw new UserError('You do not own that mower.');
    p.eq.mower = id;
    return p;
  }
  if (!COSMETIC_KINDS[slot]) throw new UserError('Unknown slot.');
  if (!p.cos[slot].includes(id)) throw new UserError('You do not own that.');
  p.eq[slot] = id;
  return p;
}

// Check a job request against the profile and return the job settings.
// req = { mode: free|pattern|career|daily, level, mower, weather, pattern, offerId }
export function jobSetup(p, req, daily) {
  const mode = req.mode;
  const mower = req.mower && p.mowers[req.mower] ? req.mower : p.eq.mower;
  const up = { ...(p.mowers[mower] || { up: blankUp() }).up };
  if (mode === 'free' || mode === 'pattern') {
    if (!p.levels.includes(req.level)) throw new UserError('You have not unlocked that place yet.');
    const weather = WEATHER[req.weather] ? req.weather : 'sunny';
    if (mode === 'pattern') {
      if (!LEVELS[req.level].patternOk) throw new UserError('Pattern mode is not available here.');
      const pattern = PATTERN_IDS.includes(req.pattern) ? req.pattern : PATTERN_IDS[0];
      return { mode, level: req.level, mower, up, weather, kind: 'pattern', pattern, mult: { mode: 1 } };
    }
    return { mode, level: req.level, mower, up, weather, kind: 'standard', pattern: null, mult: { mode: 1 } };
  }
  if (mode === 'career') {
    const offer = p.career.offers.find((o) => o.id === req.offerId);
    if (!offer) throw new UserError('That job offer has gone.');
    if (!offer.isNew && !p.levels.includes(offer.level)) throw new UserError('You have not unlocked that place yet.');
    const tier = tierFor(p.career.rep);
    return { mode, level: offer.level, mower, up, weather: offer.weather, kind: offer.kind, pattern: offer.pattern, offerId: offer.id, mult: { mode: 1, offer: offer.mult, rep: tier.mult } };
  }
  if (mode === 'daily') {
    if (!daily) throw new UserError('No daily challenge today.');
    return {
      mode, level: daily.level, mower: daily.mower, up: blankUp(), weather: daily.weather, kind: daily.kind,
      pattern: daily.pattern, date: daily.date, mult: { mode: daily.mult },
    };
  }
  throw new UserError('Unknown mode.');
}

// Apply a checked result to the profile. ctx = { settingsMult, today }
export function applyJob(p, job, res, ctx = {}) {
  const L = LEVELS[job.level];
  const out = { pay: null, review: null, unlocked: null, streak: null, best: false };
  const mult = { ...job.mult, weather: job.weather, settings: ctx.settingsMult || 1 };
  if (job.mode === 'daily') {
    const first = p.daily.last !== job.date && res.stars > 0;
    let streak = p.daily.streak;
    if (first) streak = p.daily.last === dayBefore(job.date) ? streak + 1 : 1;
    mult.mode = (job.mult.mode || 1.5) * (first ? streakMult(streak) : 0.4);
    if (first) { p.daily.last = job.date; p.daily.streak = streak; p.daily.bestStreak = Math.max(p.daily.bestStreak || 0, streak); out.streak = streak; }
    const prev = p.daily.scores[job.date] || 0;
    if (res.score > prev) p.daily.scores[job.date] = res.score;
    const keys = Object.keys(p.daily.scores).sort();
    while (keys.length > 14) delete p.daily.scores[keys.shift()];
  }
  out.pay = payJob(L, res, mult);
  p.money += out.pay.total;
  p.earned += out.pay.total;
  const s = p.stats;
  s.jobs++; s.area += res.area || 0; s.time += res.time || 0; s.stars += res.stars; s.dumped += res.dumped || 0;
  s.hits += res.pen > 0 ? 1 : 0;
  if (res.challenge !== 'pattern' && res.coverage >= 0.995) s.perfect++;
  if (res.challenge === 'pattern' && res.stars > 0) s.patterns++;
  s.plays[job.level] = (s.plays[job.level] || 0) + 1;
  if (res.score > (s.best[job.level] || 0)) { s.best[job.level] = res.score; out.best = true; }
  if (job.mode === 'career') {
    const c = p.career;
    const offer = c.offers.find((o) => o.id === job.offerId) || { customer: 'Customer', level: job.level };
    const rv = makeReview(res, offer, `${c.seed}:${c.jobs}`);
    c.rep = Math.max(0, Math.min(100, c.rep + REP_CHANGE[rv.stars]));
    c.jobs++;
    c.reviews.push({ ...rv, at: Date.now() });
    c.reviews = c.reviews.slice(-30);
    out.review = rv;
    if (offer.isNew && res.stars > 0 && !p.levels.includes(offer.level)) { p.levels.push(offer.level); out.unlocked = offer.level; }
    c.seed++;
    c.offers = makeOffers(p);
  }
  return out;
}

// Refresh career offers (costs nothing, at most once per job)
export function newOffers(p) {
  p.career.seed++;
  p.career.offers = makeOffers(p);
  return p;
}

export function levelUnlockedByRep(p, id) { return p.career.rep >= (LEVEL_REP[id] || 0); }
