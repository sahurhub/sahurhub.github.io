// TURBO TOWN - the 16 cars (real race cars with their own liveries; the first 8 keep the old
// kart ids, the 8 added on 2026-11-28 are named after the car).
// Shared by the game and the server (pure data).
// Stats are 1-10. Every kart trades something away; none is best at everything.
//   speed     top speed            accel   acceleration
//   handling  turning              drift   drift turn + charge speed
//   braking   brakes               weight  mass in bumps, hit resistance
//   offroad   less slowdown on grass, sand, mud and snow
//   grip      grip on slippery ground (ice, water, wet)
// Extra traits: stability (0-1, low = twitchy at top speed), recovery (shorter spin-outs,
// faster pick-up after hits and boosts).
export const KARTS = [
  {
    id: 'starter', name: 'Rookie F1', price: 0, level: 1,
    blurb: 'A friendly little F1 car. Balanced and easy to drive.',
    stats: { speed: 6, accel: 6, handling: 6, drift: 6, braking: 6, weight: 5, offroad: 5, grip: 5 },
    stability: 0.9, recovery: 1.0, colors: ['#ff8000', '#e8f6ff'],
  },
  {
    id: 'breeze', name: 'McLaren MP4/6', price: 300, level: 2,
    blurb: 'The 1991 champion. Light and nimble: corners like a dream, but not the fastest.',
    stats: { speed: 5, accel: 7, handling: 10, drift: 7, braking: 8, weight: 2, offroad: 6, grip: 5 },
    stability: 1.0, recovery: 1.0, colors: ['#e8102e', '#ffffff'],
  },
  {
    id: 'drifter', name: 'Red Bull RB9', price: 600, level: 3,
    blurb: 'The 2013 champion, born to slide. Best drifts and great handling, lower top speed.',
    stats: { speed: 5, accel: 6, handling: 8, drift: 10, braking: 6, weight: 4, offroad: 4, grip: 4 },
    stability: 0.95, recovery: 1.0, colors: ['#1e2a5a', '#e10600'],
  },
  {
    id: 'frost', name: 'Mercedes W02', price: 900, level: 4,
    blurb: 'The 2011 Silver Arrow. Balanced, quick off the line and amazing on ice and water.',
    stats: { speed: 6, accel: 8, handling: 6, drift: 5, braking: 6, weight: 5, offroad: 5, grip: 10 },
    stability: 0.9, recovery: 1.0, colors: ['#c4c9cf', '#00a19c'],
  },
  {
    id: 'rocket', name: 'McLaren MP4/23', price: 1200, level: 5,
    blurb: 'The 2008 champion. Huge acceleration and quick recovery, but wobbly at top speed.',
    stats: { speed: 7, accel: 10, handling: 5, drift: 5, braking: 4, weight: 4, offroad: 4, grip: 4 },
    stability: 0.45, recovery: 1.5, colors: ['#b8bec6', '#e10600'],
  },
  {
    id: 'speedster', name: 'Red Bull RB16B', price: 1600, level: 6,
    blurb: 'The 2021 champion. The fastest on a straight, but slow to get going and hard to turn.',
    stats: { speed: 10, accel: 3, handling: 3, drift: 5, braking: 5, weight: 6, offroad: 3, grip: 5 },
    stability: 0.8, recovery: 0.9, colors: ['#1b1f3b', '#ffcc00'],
  },
  {
    id: 'hauler', name: 'Peugeot 9X8 Evo', price: 2000, level: 7,
    blurb: 'A Le Mans hypercar: big, heavy and steady. Shrugs off bumps and hits, slow to speed up and turn.',
    stats: { speed: 8, accel: 4, handling: 3, drift: 4, braking: 7, weight: 10, offroad: 8, grip: 7 },
    stability: 1.0, recovery: 0.8, colors: ['#c8ccc4', '#d7e021'],
  },
  {
    id: 'thunder', name: 'McLaren MP4/25', price: 2600, level: 9,
    blurb: 'Fast with strong acceleration, but hard to control. For experts.',
    stats: { speed: 9, accel: 7, handling: 4, drift: 5, braking: 5, weight: 6, offroad: 3, grip: 3 },
    stability: 0.4, recovery: 1.0, colors: ['#a9b0b8', '#e10600'],
  },
  // added 2026-11-28, cheapest first; prices follow the measured ratings below
  {
    id: 'at01', name: 'AlphaTauri AT01', price: 2900, level: 10,
    blurb: 'The 2020 Monza winner. Quick in a straight line and easy to drive.',
    stats: { speed: 8, accel: 7, handling: 7, drift: 6, braking: 6, weight: 5, offroad: 5, grip: 5 },
    stability: 0.85, recovery: 1.0, colors: ['#1b2a4a', '#ffffff'],
  },
  {
    id: 'porsche919', name: 'Porsche 919 Hybrid', price: 3400, level: 11,
    blurb: 'A Le Mans winner with a hybrid kick. Heavy and planted: shrugs off hits and bumps.',
    stats: { speed: 9, accel: 9, handling: 6, drift: 5, braking: 8, weight: 9, offroad: 5, grip: 7 },
    stability: 1.0, recovery: 0.9, colors: ['#e8eaed', '#d5001c'],
  },
  {
    id: 'r26', name: 'Renault R26', price: 3700, level: 12,
    blurb: 'The 2006 champion. Rockets off the line and gets back up to speed in a flash.',
    stats: { speed: 8, accel: 9, handling: 7, drift: 7, braking: 7, weight: 5, offroad: 4, grip: 5 },
    stability: 0.8, recovery: 1.1, colors: ['#1e5aa8', '#ffcc00'],
  },
  {
    id: 'f2004', name: 'Ferrari F2004', price: 4400, level: 13,
    blurb: 'The 2004 champion that won almost every race. Fast, sharp and hard to beat.',
    stats: { speed: 9, accel: 9, handling: 8, drift: 7, braking: 8, weight: 4, offroad: 4, grip: 5 },
    stability: 0.85, recovery: 1.1, colors: ['#dc0000', '#ffffff'],
  },
  {
    id: 'mcl35m', name: 'McLaren MCL35M', price: 5000, level: 14,
    blurb: 'The 2021 Monza winner. Slippery and fast, steady at top speed.',
    stats: { speed: 9, accel: 7, handling: 8, drift: 6, braking: 7, weight: 5, offroad: 4, grip: 6 },
    stability: 0.9, recovery: 1.0, colors: ['#ff8000', '#1e88e5'],
  },
  {
    id: 'bolide', name: 'Bugatti Bolide', price: 5800, level: 16,
    blurb: 'A 1,600 horsepower track hypercar. The fiercest speed and acceleration, a handful in the bends.',
    stats: { speed: 10, accel: 10, handling: 6, drift: 6, braking: 9, weight: 7, offroad: 5, grip: 7 },
    stability: 0.75, recovery: 1.0, colors: ['#1c1c1c', '#00b3ff'],
  },
  {
    id: 'mcl39', name: 'McLaren MCL39', price: 6600, level: 18,
    blurb: 'The 2025 champion. Brilliant in the corners and quick everywhere.',
    stats: { speed: 10, accel: 9, handling: 9, drift: 8, braking: 8, weight: 5, offroad: 4, grip: 7 },
    stability: 0.95, recovery: 1.0, colors: ['#ff8000', '#111111'],
  },
  {
    id: 'rb19', name: 'Red Bull RB19', price: 8000, level: 20,
    blurb: 'The most dominant F1 car ever: 21 wins from 22 races. The best car in the game.',
    stats: { speed: 10, accel: 10, handling: 9, drift: 9, braking: 9, weight: 5, offroad: 5, grip: 7 },
    stability: 1.0, recovery: 1.1, colors: ['#1b1f3b', '#e10600'],
  },];

export const KART_BY_ID = Object.fromEntries(KARTS.map((k) => [k.id, k]));

// How good each car is overall (1-100), measured on 2026-11-28: every car ran 3 laps alone
// with the same expert computer driver on Blossom Valley, Sunburst Speedway, Mushroom
// Meadow, Grand Prix Circuit and Haunted Hollow; each car's middle three results (time
// behind the fastest car on that map) give its rating (best car 98, slowest 45). Runs vary
// by about 1%, so cars a few points apart are close. Pickers list the cars in this order,
// weakest first. Re-measure if stats change.
export const KART_RATING = {
  drifter: 45, starter: 48, breeze: 54, speedster: 55, frost: 56, hauler: 60, at01: 66, thunder: 71,
  rocket: 73, porsche919: 77, r26: 77, f2004: 84, mcl35m: 89, bolide: 92, mcl39: 95, rb19: 98,
};
export const kartRating = (id) => KART_RATING[id] ?? 50;
// the cars from weakest to best (ties keep the list order)
export const KARTS_BY_RATING = KARTS.map((k, i) => ({ k, i })).sort((a, b) => kartRating(a.k.id) - kartRating(b.k.id) || a.i - b.i).map((o) => o.k);

// Turn 1-10 stats into physical values used by the kart physics.
export function deriveKart(def) {
  const s = def.stats;
  return {
    top: 26.6 + s.speed * 0.34,           // m/s (27.0 .. 30.0)
    scrub: 0.22 * (1 - s.handling / 10),  // speed lost when turning hard (weak handling loses more)
    accel: 8 + s.accel * 1.5,             // m/s^2 at low speed (9.5 .. 23)
    turn: 1.75 + s.handling * 0.12,       // rad/s at medium speed (snappy, go-kart like)
    driftTurn: 1.35 + s.drift * 0.07,     // rad/s while drifting
    driftCharge: 0.7 + s.drift * 0.06,    // charge speed multiplier (0.76 .. 1.3)
    driftBoost: 0.7 + s.drift * 0.05,     // how long a drift boost lasts (x 0.75 .. 1.2)
    brake: 15 + s.braking * 1.8,          // m/s^2
    mass: 0.7 + s.weight * 0.1,           // 0.8 .. 1.7
    offroad: s.offroad * 0.05,            // 0.15 .. 0.4 of the off-road penalty removed
    slipGrip: 0.18 + s.grip * 0.055,      // fraction of normal grip kept on ice (0.24 .. 0.73)
    hitResist: Math.max(0, (s.weight - 5) * 0.08), // shorter spin-outs for heavy karts
    stability: def.stability,
    recovery: def.recovery,
  };
}
