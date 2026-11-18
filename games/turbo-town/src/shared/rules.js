// TURBO TOWN - game rules shared by the game and the server (pure data + small helpers).

export const LAPS = 3;
// most racers in an online party (single-player races have 8: you + 7 computer racers)
export const MAX_RACERS = 12;

// Grand Prix points for 1st..8th
export const GP_POINTS = [15, 12, 10, 8, 6, 5, 4, 3];
// coins for finishing 1st..12th
export const FINISH_COINS = [100, 85, 75, 65, 55, 45, 35, 25, 20, 16, 13, 10];
export const OVERTAKE_COINS = 5;
export const OVERTAKE_COOLDOWN = 12;   // seconds before passing the same rival pays again
export const OVERTAKE_MAX = 20;        // most overtake coins in one race (x5 = 100)
// extra coins
export const BONUS = { win: 25, personalBest: 20, gpWin: 150, gpPodium: 60, shortcut: 10, cleanRace: 15 };
// XP per race: base by place plus a little per overtake
export const FINISH_XP = [60, 52, 46, 40, 35, 30, 26, 22, 20, 18, 16, 14];
export const XP_PER_OVERTAKE = 2;

// XP needed to go from level n to n+1 (quick at first, slower later)
export function xpForLevel(level) { return Math.round(120 + (level - 1) * 55 + Math.pow(level - 1, 1.6) * 10); }
export function levelFromXp(xp) {
  let lv = 1, need = xpForLevel(1), left = xp;
  while (left >= need && lv < 60) { left -= need; lv++; need = xpForLevel(lv); }
  return { level: lv, into: left, need };
}

export const DRIVERS = [
  { id: 'fox', name: 'Ziggy', animal: 'Fox', level: 1, color: '#ff8a3a' },
  { id: 'bunny', name: 'Bonnie', animal: 'Bunny', level: 1, color: '#ff6fa8' },
  { id: 'panda', name: 'Bao', animal: 'Panda', level: 1, color: '#2f2f45' },
  { id: 'frog', name: 'Hopper', animal: 'Frog', level: 1, color: '#6ddb4f' },
  { id: 'penguin', name: 'Pebble', animal: 'Penguin', level: 1, color: '#34408f' },
  { id: 'bear', name: 'Bruno', animal: 'Bear', level: 1, color: '#b8743f' },
  { id: 'cat', name: 'Mimi', animal: 'Cat', level: 1, color: '#b8a0ff' },
  { id: 'duck', name: 'Dot', animal: 'Duck', level: 1, color: '#ffd93b' },
];

export const MAP_INFO = [
  { id: 'blossom-valley', name: 'Blossom Valley', season: 'spring' },
  { id: 'mushroom-meadow', name: 'Mushroom Meadow', season: 'spring' },
  { id: 'tropical-splash', name: 'Tropical Splash', season: 'summer' },
  { id: 'sunburst-speedway', name: 'Sunburst Speedway', season: 'summer' },
  { id: 'pumpkin-patch', name: 'Pumpkin Patch', season: 'autumn' },
  { id: 'haunted-hollow', name: 'Haunted Hollow', season: 'autumn' },
  { id: 'frostbite-falls', name: 'Frostbite Falls', season: 'winter' },
  { id: 'candy-cane-kingdom', name: 'Candy Cane Kingdom', season: 'winter' },
];

// Each cup: its two seasonal maps and two guests from other seasons. Every map is at home
// in one cup and a guest in another.
// Order: home map, guest, home map, guest.
export const CUPS = [
  { id: 'spring', name: 'Spring Cup', maps: ['blossom-valley', 'sunburst-speedway', 'mushroom-meadow', 'frostbite-falls'], color: '#ff7ab8' },
  { id: 'summer', name: 'Summer Cup', maps: ['tropical-splash', 'pumpkin-patch', 'sunburst-speedway', 'candy-cane-kingdom'], color: '#ffb02e' },
  { id: 'autumn', name: 'Autumn Cup', maps: ['pumpkin-patch', 'mushroom-meadow', 'haunted-hollow', 'tropical-splash'], color: '#ff6b2c' },
  { id: 'winter', name: 'Winter Cup', maps: ['frostbite-falls', 'blossom-valley', 'candy-cane-kingdom', 'haunted-hollow'], color: '#4fc3ff' },
];
// Blossom Valley is open from the start so Single Race and Time Trials are never empty.
export const START_MAPS = ['blossom-valley'];

export const AI_DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'];

// Votes needed to pause an online race (count only players actually racing).
export function pauseVotesNeeded(activeRacePlayers) {
  return activeRacePlayers >= 2 ? Math.max(2, Math.ceil(activeRacePlayers / 2)) : 1;
}

// Shortest believable time for a 3-lap race on a map (used by the server to check
// single-player results): a perfect driver in the fastest kart with constant boosts.
export function minRaceSeconds(lapLength, laps = LAPS) {
  return (lapLength * laps) / 40; // 40 m/s average is impossible to beat
}
