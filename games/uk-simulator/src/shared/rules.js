// UK Simulator - money, levels, upgrades, rewards and the daily challenge.
// Shared by the game and the server (the server decides what is actually paid).
import { VEHICLES, STARTER_VEHICLES, VEHICLE_ORDER } from './vehicles.js';

// The user's choice (2026-11-19): for now everything is unlocked for everyone - every vehicle is
// owned, every event is open from level 1, upgrades and paint cost nothing. Set to false to bring
// back normal progression (the game and the server both follow this switch).
export const UNLOCK_ALL = true;

export const START_MONEY = 1000;
export const MAX_UPGRADE = 5;
export const UPGRADES = {
  speed: { name: 'Power', desc: '+5% power and top speed per level' },
  battery: { name: 'Battery', desc: '+15% battery capacity per level (electric only)', electric: true },
  suspension: { name: 'Suspension', desc: 'Stiffer springs, more travel and damping' },
  tyres: { name: 'Tyres', desc: '+4% grip per level' },
  brakes: { name: 'Brakes', desc: '+6% braking per level' },
};
export const PAINTS = [
  { id: 'blue', hex: 0x2b5fa8, name: 'Deep blue' }, { id: 'red', hex: 0xb3201c, name: 'Race red' }, { id: 'white', hex: 0xe8e8e4, name: 'Frozen white' },
  { id: 'black', hex: 0x151517, name: 'Black' }, { id: 'silver', hex: 0xa9adb1, name: 'Silver' }, { id: 'green', hex: 0x1e5a3a, name: 'British racing green' },
  { id: 'yellow', hex: 0xe8b81c, name: 'Yellow' }, { id: 'orange', hex: 0xe0661a, name: 'Orange' }, { id: 'purple', hex: 0x5a2f8a, name: 'Purple' },
  { id: 'teal', hex: 0x1f8a8a, name: 'Teal' }, { id: 'pink', hex: 0xd86a9a, name: 'Pink' }, { id: 'grey', hex: 0x4a4f55, name: 'Graphite' },
];
export const PAINT_PRICE = UNLOCK_ALL ? 0 : 150;

// is something that needs `required` level open to a player at `level`?
export function levelOk(level, required) { return UNLOCK_ALL || level >= (required || 1); }

// give every vehicle to a profile while everything is unlocked (old saves included)
export function applyUnlocks(p) {
  if (!UNLOCK_ALL || !p) return p;
  for (const id of VEHICLE_ORDER) if (!p.owned[id]) p.owned[id] = { upgrades: {}, paint: 'blue', paints: ['blue'], damage: 0 };
  return p;
}

// level from total XP: level L needs 150 (L-1)^2 + 100 (L-1) XP
export function levelFromXp(xp) { let L = 1; while (xpForLevel(L + 1) <= xp && L < 99) L++; return L; }
export function xpForLevel(L) { return 150 * (L - 1) * (L - 1) + 100 * (L - 1); }

export function upgradePrice(vehicleId, kind, toLevel) {
  if (UNLOCK_ALL) return 0;
  const v = VEHICLES[vehicleId];
  const base = Math.max(400, v.price);
  return Math.round(Math.max(60, base * 0.07 * toLevel) / 10) * 10;
}

export function repairPrice(vehicleId, damage) {
  const v = VEHICLES[vehicleId];
  return Math.round(Math.min(1, damage) * Math.max(40, v.price * 0.08));
}

export function newProfile(name = 'Guest') {
  return {
    v: 1, name, money: START_MONEY, xp: 0,
    owned: Object.fromEntries((UNLOCK_ALL ? VEHICLE_ORDER : STARTER_VEHICLES).map((id) => [id, { upgrades: {}, paint: 'blue', paints: ['blue'], damage: 0 }])),
    current: 'kukirinG2',
    records: {},             // event id -> best { time, score, medal }
    daily: { day: '', done: false, streak: 0, progress: 0 },
    stats: { distance: 0, deliveries: 0, jumps: 0, crashes: 0, events: 0, topSpeed: 0 },
    settings: {},
  };
}

// reference average speeds (m/s) used for medal times, by event mode and vehicle class
const REF = { car: 13.5, bike: 7.5, escooter: 9.5, offroad: 9, any: 10 };
export function vehicleClass(id) { const v = VEHICLES[id]; return v.kind === 'car' && !v.handlebar ? 'car' : v.kind === 'escooter' ? 'escooter' : v.handlebar || id === 'dirtbike' ? 'offroad' : 'bike'; }

export function eventAllows(ev, vehicleId) {
  const cls = vehicleClass(vehicleId), v = VEHICLES[vehicleId];
  if (ev.mode === 'any') return true;
  if (ev.mode === 'car') return v.kind === 'car' && !v.handlebar;
  if (ev.mode === 'bike') return v.kind !== 'car';
  if (ev.mode === 'offroad') return !v.road || cls === 'offroad';
  return true;
}

// medal times (seconds) for a timed event
export function medalTimes(ev, vehicleId) {
  const cls = vehicleClass(vehicleId);
  const ref = ev.mode === 'car' ? REF.car : ev.mode === 'offroad' ? REF.offroad : REF[cls] || REF.any;
  const len = (ev.length || estimateLength(ev)) * (ev.laps || 1);
  const gold = len / (ref * (ev.night ? 0.9 : 1));
  return { gold: Math.round(gold), silver: Math.round(gold * 1.18), bronze: Math.round(gold * 1.4) };
}

export function estimateLength(ev) {
  let L = 0, p = ev.start;
  for (const c of ev.cps) { L += Math.hypot(c[0] - p[0], c[1] - p[1]); p = c; }
  return L * 1.15;
}

// reward for finishing an event (the server recomputes this itself)
export function eventReward(ev, result, vehicleId) {
  const mult = ev.night ? 1.5 : 1;
  if (ev.type === 'race' || ev.type === 'timetrial' || ev.type === 'offroad') {
    const m = medalTimes(ev, vehicleId);
    const medal = result.time <= m.gold ? 'gold' : result.time <= m.silver ? 'silver' : result.time <= m.bronze ? 'bronze' : null;
    const km = ((ev.length || estimateLength(ev)) * (ev.laps || 1)) / 1000;
    const base = { gold: 260, silver: 170, bronze: 110 }[medal] || 40;
    return { medal, money: Math.round((base + 60 * km) * mult), xp: Math.round(({ gold: 120, silver: 80, bronze: 55 }[medal] || 20) * (1 + km * 0.3) * mult) };
  }
  if (ev.type === 'checkpoints') {
    const left = Math.max(0, ev.timeLimit - result.time);
    if (result.time > ev.timeLimit) return { medal: null, money: 0, xp: 10 };
    return { medal: left > ev.timeLimit * 0.3 ? 'gold' : left > ev.timeLimit * 0.12 ? 'silver' : 'bronze', money: Math.round(220 + left * 4), xp: 70 };
  }
  if (ev.type === 'stunt') {
    const air = result.air || 0, dist = result.dist || 0;
    if (air < ev.minAir) return { medal: null, money: 0, xp: 5 };
    return { medal: air > ev.minAir * 2 ? 'gold' : air > ev.minAir * 1.4 ? 'silver' : 'bronze', money: Math.round(air * 70 + dist * 4 + (result.clean ? 50 : 0)), xp: Math.round(25 + air * 20) };
  }
  if (ev.type === 'drift') {
    const s = result.score || 0;
    return { medal: s >= ev.target * 1.5 ? 'gold' : s >= ev.target ? 'silver' : s >= ev.target * 0.5 ? 'bronze' : null, money: Math.round(s / 18), xp: Math.round(20 + s / 120) };
  }
  if (ev.type === 'delivery') {
    const onTime = result.time <= result.par;
    return { medal: onTime ? 'gold' : null, money: Math.round(25 + result.dist * 0.045 + (onTime ? 30 : 0)), xp: Math.round(15 + result.dist * 0.015) };
  }
  return { medal: null, money: 0, xp: 0 };
}

// daily challenge: the same for everyone on a given UK date
const DAILY = [
  { id: 'deliver3', text: 'Make 3 deliveries', goal: 3, track: 'deliveries' },
  { id: 'escoot5', text: 'Ride 5 km on an e-scooter', goal: 5000, track: 'distance:escooter' },
  { id: 'bike3', text: 'Cycle 3 km on a pushbike or e-bike', goal: 3000, track: 'distance:bike' },
  { id: 'jump2', text: 'Land 2 stunt jumps', goal: 2, track: 'jumps' },
  { id: 'medal1', text: 'Win any medal in an event', goal: 1, track: 'medals' },
  { id: 'drive8', text: 'Drive 8 km in any car', goal: 8000, track: 'distance:car' },
  { id: 'offroad2', text: 'Ride 2 km off-road (grass, mud, sand or tracks)', goal: 2000, track: 'distance:offroad' },
];
export function ukDate(t = Date.now()) { return new Date(t).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); }
export function dailyChallenge(date = ukDate()) {
  let h = 0;
  for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { ...DAILY[h % DAILY.length], date };
}
export function dailyReward(streak) { const s = Math.min(7, streak); return { money: 400 + 100 * s, xp: 150 + 25 * s }; }
