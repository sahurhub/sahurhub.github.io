// TURBO TOWN - cosmetics: paints, wheels, accessories, titles, profile frames and boost
// colours. Reaching a level unlocks everything at or below it. Cosmetics never change how
// a kart drives.
export const PAINTS = [
  { id: 'p_classic', name: 'Factory', colors: null, level: 1 },
  { id: 'p_sky', name: 'Sky Blue', colors: ['#4fc3ff', '#ffffff'], level: 1 },
  { id: 'p_mint', name: 'Mint Fizz', colors: ['#7bed9f', '#ff6fa8'], level: 1 },
  { id: 'p_sunny', name: 'Sunny Day', colors: ['#ffd32a', '#ff7a3d'], level: 2 },
  { id: 'p_bubblegum', name: 'Bubblegum', colors: ['#ff8fd0', '#ffffff'], level: 3 },
  { id: 'p_grape', name: 'Grape Soda', colors: ['#9b5cff', '#ffd32a'], level: 4 },
  { id: 'p_lime', name: 'Lime Zest', colors: ['#a3e635', '#2b2560'], level: 5 },
  { id: 'p_cherry', name: 'Cherry Pop', colors: ['#ff3d5a', '#ffe0ea'], level: 6 },
  { id: 'p_ocean', name: 'Ocean Wave', colors: ['#1e90ff', '#7fe0ff'], level: 7 },
  { id: 'p_tangerine', name: 'Tangerine', colors: ['#ff9f43', '#ffffff'], level: 8 },
  { id: 'p_peach', name: 'Peachy', colors: ['#ffb38a', '#ff6f91'], level: 9 },
  { id: 'p_galaxy', name: 'Galaxy', colors: ['#3d2c8d', '#ff6fd0'], level: 11 },
  { id: 'p_candy', name: 'Candy Stripe', colors: ['#ffffff', '#ff3d5a'], level: 13 },
  { id: 'p_forest', name: 'Forest Friend', colors: ['#2ed573', '#ffd32a'], level: 15 },
  { id: 'p_gold', name: 'Golden', colors: ['#ffc93c', '#fff6c8'], level: 18 },
  { id: 'p_rainbow', name: 'Rainbow Dream', colors: ['#ff5cf0', '#5cf2ff'], level: 22 },
];

export const WHEELS = [
  { id: 'wheel_std', name: 'Standard', level: 1 },
  { id: 'wheel_slick', name: 'Slick', level: 3 },
  { id: 'wheel_chunky', name: 'Chunky', level: 5 },
  { id: 'wheel_star', name: 'Star', level: 8 },
  { id: 'wheel_flower', name: 'Flower', level: 11 },
  { id: 'wheel_retro', name: 'Retro', level: 14 },
];

export const ACCS = [
  { id: null, name: 'None', level: 1 },
  { id: 'acc_flag', name: 'Flag', level: 2 },
  { id: 'acc_antenna', name: 'Antenna Ball', level: 4 },
  { id: 'acc_balloon', name: 'Heart Balloon', level: 6 },
  { id: 'acc_wing', name: 'Mini Wing', level: 9 },
  { id: 'acc_star', name: 'Spring Star', level: 12 },
];

// Car bodies (looks only). null = the standard F1 body. Models are in assets/models/skins.glb.
export const SKINS = [
  { id: null, name: 'Standard F1', level: 1 },
  { id: 'skin_mp425', name: 'MP4/25', level: 1 },
  { id: 'skin_mp425_sponsor', name: 'MP4/25 Sponsors', level: 1, fixed: true },
];

export const TITLES = [
  { id: 'Rookie', level: 1 }, { id: 'Speedy', level: 3 }, { id: 'Drift Star', level: 5 }, { id: 'Item Wizard', level: 7 },
  { id: 'Shortcut Sleuth', level: 10 }, { id: 'Turbo Champ', level: 14 }, { id: 'Cup Collector', level: 18 }, { id: 'Legend', level: 25 },
];

export const FRAMES = [
  { id: 'frame_basic', name: 'Simple', level: 1, colors: ['#ffffff', '#ffffff'] },
  { id: 'frame_flower', name: 'Flowers', level: 4, colors: ['#ff8fd0', '#7bed9f'] },
  { id: 'frame_star', name: 'Stars', level: 7, colors: ['#ffd32a', '#ff9f43'] },
  { id: 'frame_wave', name: 'Waves', level: 10, colors: ['#4fc3ff', '#7fe0ff'] },
  { id: 'frame_gold', name: 'Gold', level: 15, colors: ['#ffc93c', '#fff1b0'] },
  { id: 'frame_rainbow', name: 'Rainbow', level: 25, colors: ['#ff5cf0', '#5cf2ff'] },
];

export const BOOSTS = [
  { id: 'fx_classic', name: 'Classic Flame', level: 1, colors: ['#ffb03b', '#fff6a8'] },
  { id: 'fx_bubble', name: 'Bubble Blue', level: 6, colors: ['#5cf2ff', '#ffffff'] },
  { id: 'fx_candy', name: 'Candy Pink', level: 12, colors: ['#ff5cf0', '#ffd0f4'] },
  { id: 'fx_leaf', name: 'Leafy Green', level: 16, colors: ['#3ddc84', '#d8ffb0'] },
  { id: 'fx_rainbow', name: 'Rainbow', level: 20, colors: ['rainbow', '#ffffff'] },
];

export const CATALOG = { paints: PAINTS, wheels: WHEELS, accs: ACCS, skins: SKINS, titles: TITLES, frames: FRAMES, boosts: BOOSTS };

// everything unlocked at a level
export function unlockedAt(level) {
  const out = {};
  for (const [k, list] of Object.entries(CATALOG)) out[k] = list.filter((c) => c.level <= level).map((c) => c.id);
  return out;
}

// items that newly unlock when going from level a to level b
export function newUnlocks(a, b) {
  const out = [];
  for (const [kind, list] of Object.entries(CATALOG)) for (const c of list) if (c.level > a && c.level <= b && c.id) out.push({ kind, id: c.id, name: c.name || c.id });
  return out;
}

export function paintColors(id, kartDef) {
  const p = PAINTS.find((x) => x.id === id);
  return (p && p.colors) || kartDef.colors;
}
