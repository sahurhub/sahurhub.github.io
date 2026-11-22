// Daily challenge: the same for everyone on a given (UTC) day. The server can override a day.
import { rng, hashStr, pick } from './rng.js';
import { LEVELS } from './levels.js';
import { PATTERN_IDS } from './patterns.js';

const SETUPS = [
  { level: 'back-garden', mowers: ['push', 'petrol', 'robot'] },
  { level: 'front-lawn', mowers: ['petrol', 'push', 'robot'] },
  { level: 'cottage-hill', mowers: ['petrol', 'rideon'] },
  { level: 'orchard', mowers: ['petrol', 'rideon'] },
  { level: 'village-park', mowers: ['rideon', 'zeroturn'] },
  { level: 'sports-field', mowers: ['zeroturn', 'rideon'] },
  { level: 'golf-course', mowers: ['zeroturn'] },
];

export function dailyFor(date) {
  const R = rng(hashStr('daily:' + date));
  const s = pick(R, SETUPS);
  const L = LEVELS[s.level];
  const kinds = ['standard', 'timed', 'perfect'];
  if (L.patternOk) kinds.push('pattern');
  const kind = pick(R, kinds);
  const weather = pick(R, ['sunny', 'sunny', 'rain', 'evening']);
  return {
    date, level: s.level, mower: pick(R, s.mowers), weather, kind,
    pattern: kind === 'pattern' ? pick(R, PATTERN_IDS) : null,
    mult: 1.5,
  };
}

// Check an admin-made daily challenge is sensible.
export function cleanDaily(d, date) {
  const base = dailyFor(date);
  if (!d || typeof d !== 'object') return base;
  const out = { ...base };
  if (LEVELS[d.level]) out.level = d.level;
  if (['push', 'petrol', 'robot', 'rideon', 'zeroturn'].includes(d.mower)) out.mower = d.mower;
  if (['sunny', 'rain', 'evening'].includes(d.weather)) out.weather = d.weather;
  if (['standard', 'timed', 'perfect', 'pattern'].includes(d.kind)) out.kind = d.kind;
  if (out.kind === 'pattern') out.pattern = PATTERN_IDS.includes(d.pattern) ? d.pattern : PATTERN_IDS[0];
  else out.pattern = null;
  if (out.kind === 'pattern' && !LEVELS[out.level].patternOk) out.kind = 'standard', out.pattern = null;
  const m = Number(d.mult);
  if (Number.isFinite(m) && m >= 1 && m <= 5) out.mult = m;
  out.custom = true;
  return out;
}

// streak bonus: +10% per day in a row after the first, up to +100%
export function streakMult(streak) {
  return 1 + Math.min(10, Math.max(0, streak - 1)) * 0.1;
}
