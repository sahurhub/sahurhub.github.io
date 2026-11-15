// TURBO TOWN - items: names, odds by race position and effect numbers. Shared by the game
// (single player) and the server (online races, where the server decides everything).
export const ITEMS = {
  speed:   { id: 'speed', name: 'Speed Burst', color: '#ffb02e', desc: 'A big burst of speed.' },
  shield:  { id: 'shield', name: 'Bubble Shield', color: '#5fd0ff', desc: 'Blocks one hit.' },
  sticky:  { id: 'sticky', name: 'Sticky Splash', color: '#ff6fd0', desc: 'Leaves a slippery splash behind you.' },
  rocket:  { id: 'rocket', name: 'Target Rocket', color: '#ff4757', desc: 'Chases the racer just ahead and spins them out.' },
  trail:   { id: 'trail', name: 'Turbo Trail', color: '#ffd32a', desc: 'Leaves a glowing trail that boosts whoever rides it.' },
  spring:  { id: 'spring', name: 'Spring Jump', color: '#3ddc84', desc: 'Bounces you high over trouble.' },
  freeze:  { id: 'freeze', name: 'Freeze Pop', color: '#9fe8ff', desc: 'Freezes the racer ahead so they slow down.' },
  mystery: { id: 'mystery', name: 'Mystery Box', color: '#a55eea', desc: 'Something special happens!' },
};
export const ITEM_IDS = Object.keys(ITEMS);

// Odds (weights) for the front, middle and back of the race. A racer's odds blend between
// these rows by how far back they are, so leaders get modest or defensive items and the
// back gets comeback items. Nothing targets the leader from far away: skill still wins.
const ODDS = {
  front: { speed: 14, shield: 30, sticky: 34, rocket: 10, trail: 6, spring: 6, freeze: 0, mystery: 0 },
  mid:   { speed: 20, shield: 14, sticky: 18, rocket: 20, trail: 10, spring: 8, freeze: 8, mystery: 2 },
  back:  { speed: 26, shield: 6, sticky: 4, rocket: 18, trail: 14, spring: 6, freeze: 14, mystery: 12 },
};

// place 1..n of n racers -> item odds { id: weight }
export function itemOdds(place, n) {
  if (n <= 1) return { ...ODDS.mid, rocket: 0, freeze: 0 }; // alone: no one to target
  const f = (place - 1) / (n - 1); // 0 = leader, 1 = last
  const out = {};
  for (const id of ITEM_IDS) {
    const a = f < 0.5 ? ODDS.front[id] : ODDS.mid[id];
    const b = f < 0.5 ? ODDS.mid[id] : ODDS.back[id];
    const t = f < 0.5 ? f * 2 : (f - 0.5) * 2;
    out[id] = a + (b - a) * t;
  }
  if (place === 1) { out.rocket = Math.min(out.rocket, 6); out.freeze = 0; }
  return out;
}

export function rollItem(place, n, rnd = Math.random) {
  const odds = itemOdds(place, n);
  let total = 0;
  for (const id of ITEM_IDS) total += odds[id];
  let r = rnd() * total;
  for (const id of ITEM_IDS) { r -= odds[id]; if (r <= 0) return id; }
  return 'speed';
}

export const MYSTERY_EFFECTS = ['rainbow', 'bubbleBoost', 'tripleBurst', 'snowGlobe'];

// numbers used by both the game and the server
export const ITEM_TUNING = {
  boxRespawn: 3.5,      // seconds before a broken box comes back
  boxRadius: 1.9,       // pickup distance
  roulette: 1.4,        // seconds of the roulette spin
  speedMul: 1.42, speedTime: 1.8,
  shieldTime: 18,
  stickyRadius: 1.9, stickyLife: 22, stickySpin: 0.9,
  rocketSpeed: 46, rocketLife: 9, rocketHitRadius: 1.6, rocketSpin: 1.25, rocketHome: 30,
  trailTime: 4, trailMul: 1.22, trailSegLife: 3.2, trailBoost: 0.55,
  springUp: 15, springForward: 1.25,
  freezeTime: 2.6, freezeMul: 0.55, freezeRange: 90,
  rainbowTime: 5, rainbowMul: 1.32,
  snowGlobeTime: 2.2, snowGlobeMul: 0.75,
};
