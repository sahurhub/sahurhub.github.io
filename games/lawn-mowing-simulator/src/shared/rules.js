// Scoring, pay and limits (shared by the game and the server, so both get the same numbers).
import { clamp } from './rng.js';

export const RULES = {
  VERSION: 1,
  SAMPLE_DT: 0.1,          // the path is recorded 10 times a second (job time)
  CLIP_L_PER_M2: 0.8,      // litres of clippings per square metre of thick grass
  STATION_R: 1.7,          // how close to the compost bin / fuel stand you must stop
  EMPTY_TIME: 1.2,         // seconds to empty the catcher
  REFUEL_TIME: 1.5,        // seconds to refuel / recharge
  DECK_HALF_LEN: 0.16,
  EDGE_MARGIN: 0.12,       // grass this close to solid things is left alone (not counted)
  AUTO_DONE: 0.995,        // the job finishes by itself at this coverage (shown as 100%)
  FINISH_MIN: 0.85,        // "Finish job" button appears from here
  MAX_JOB_S: 1800,         // 30 minutes
  PATTERN_DONE: 0.99,
};

export const WEATHER = {
  sunny: { name: 'Sunny', grip: 1, speed: 1, pay: 1 },
  rain: { name: 'Rain', grip: 0.38, speed: 0.92, pay: 1.25 },
  evening: { name: 'Evening', grip: 0.85, speed: 1, pay: 1.1 },
};

export const CHALLENGES = {
  standard: { name: 'Standard job', desc: 'Cut the lawn. Quick, tidy and careful earns the most.' },
  timed: { name: 'Beat the clock', desc: 'A shorter timer. Run out of time and the job fails.' },
  perfect: { name: 'No missed patches', desc: 'Every last bit of grass must be cut (100%).' },
  pattern: { name: 'Mow the pattern', desc: 'Cut only the shape shown on the lawn.' },
};

// Expected time for a decent player (seconds).
export function parTime(level, grid, stats, weather = 'sunny') {
  const w = WEATHER[weather] || WEATHER.sunny;
  const area = grid.area;
  const rate = stats.width * stats.speed * w.speed * 0.55; // m2 per second with turns and overlap
  const clip = area * RULES.CLIP_L_PER_M2 * (level.clip || 1);
  const trips = Number.isFinite(stats.catcher) ? Math.max(0, Math.ceil(clip / stats.catcher) - 1) : 0;
  const refuels = stats.fuel > 0 ? Math.max(0, Math.ceil((area / rate) / stats.fuel) - 1) : 0;
  return Math.round(area / rate + trips * 22 + refuels * 20 + 15);
}

export function timeLimit(par, challenge) {
  if (challenge === 'timed') return Math.max(60, Math.round(par * 1.35));
  return Math.min(RULES.MAX_JOB_S, Math.max(150, Math.round(par * 2.6)));
}

// Penalty points -> money for this level.
export function penaltyMoney(level, pen) {
  return Math.round(pen * (0.4 + level.basePay / 400));
}

// result fields: coverage, neat, time, par, limit, pen, challenge, (pattern: acc, wrong)
export function scoreJob(r) {
  const speedF = clamp(1.6 - 0.6 * (r.time / Math.max(1, r.par)), 0, 1);
  let score, stars, parts;
  if (r.challenge === 'pattern') {
    const pat = clamp((r.acc || 0) - 1.5 * (r.wrong || 0), 0, 1);
    score = Math.max(0, Math.round(800 * pat + 200 * speedF - r.pen * 0.6));
    stars = pat >= 0.92 && score >= 800 ? 3 : pat >= 0.8 ? 2 : pat >= 0.6 ? 1 : 0;
    parts = { pattern: Math.round(pat * 800), speed: Math.round(speedF * 200), penalties: -Math.round(r.pen * 0.6) };
  } else {
    const coverF = Math.pow(clamp((r.coverage - 0.8) / 0.2, 0, 1), 1.3);
    const neatF = clamp((r.neat - 0.3) / 0.6, 0, 1);
    score = Math.max(0, Math.round(500 * coverF + 250 * speedF + 250 * neatF - r.pen * 0.6));
    stars = r.coverage < RULES.FINISH_MIN ? 0 : score >= 820 && r.coverage >= 0.98 ? 3 : score >= 620 ? 2 : 1;
    parts = { coverage: Math.round(coverF * 500), speed: Math.round(speedF * 250), neat: Math.round(neatF * 250), penalties: -Math.round(r.pen * 0.6) };
  }
  let failed = null;
  if (r.challenge === 'timed' && r.time > r.limit + 0.5) failed = 'Out of time';
  if (r.challenge === 'perfect' && r.coverage < RULES.AUTO_DONE) failed = 'Some patches were missed';
  if (failed) stars = 0;
  return { score, stars, parts, failed };
}

// mult = { weather, mode (1 free, 1.5 daily...), offer (career), settings (admin money multiplier), rep (career tier) }
export function payJob(level, res, mult = {}) {
  const base = level.basePay;
  let pay = res.stars === 0 ? base * 0.15 : base * (0.55 + 0.45 * res.score / 1000) * [0, 1, 1.25, 1.6][res.stars];
  pay *= (WEATHER[mult.weather] || WEATHER.sunny).pay;
  pay *= (mult.mode || 1) * (mult.offer || 1) * (mult.rep || 1);
  const compost = Math.round((res.dumped || 0) * 0.04);
  const penalty = penaltyMoney(level, res.pen || 0);
  const total = Math.max(0, Math.round((pay + compost) * (mult.settings || 1) - penalty));
  return { total, base: Math.round(pay), compost, penalty };
}
