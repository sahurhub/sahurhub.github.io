// TURBO TOWN - achievements and daily challenges (shared). The server checks them against
// the stats it keeps, and pays each achievement once.
export const ACHIEVEMENTS = [
  { id: 'first_race', name: 'Off We Go', desc: 'Finish your first race', coins: 50, test: (s) => s.races >= 1 },
  { id: 'first_win', name: 'Winner!', desc: 'Win a race', coins: 100, test: (s) => s.wins >= 1 },
  { id: 'wins_10', name: 'Winning Streak', desc: 'Win 10 races', coins: 250, test: (s) => s.wins >= 10 },
  { id: 'overtakes_50', name: 'Passing Lane', desc: 'Make 50 overtakes', coins: 150, test: (s) => s.overtakes >= 50 },
  { id: 'overtakes_250', name: 'Overtake Ace', desc: 'Make 250 overtakes', coins: 400, test: (s) => s.overtakes >= 250 },
  { id: 'races_25', name: 'Road Regular', desc: 'Finish 25 races', coins: 200, test: (s) => s.races >= 25 },
  { id: 'gp_win', name: 'Cup Champion', desc: 'Win a Grand Prix', coins: 200, test: (s) => s.gpWins >= 1 },
  { id: 'all_gold', name: 'Golden Garage', desc: 'Win gold in every cup', coins: 1000, test: (s, p) => ['spring', 'summer', 'autumn', 'winter'].every((c) => p.cups[c] && p.cups[c].trophy === 'gold') },
  { id: 'online_race', name: 'Racing Friends', desc: 'Finish an online race', coins: 100, test: (s) => s.onlineRaces >= 1 },
  { id: 'online_win', name: 'Online Hero', desc: 'Win an online race', coins: 250, test: (s) => s.onlineWins >= 1 },
  { id: 'karts_4', name: 'Collector', desc: 'Own 4 karts', coins: 150, test: (s, p) => p.karts.length >= 4 },
  { id: 'karts_8', name: 'Full Garage', desc: 'Own all 8 karts', coins: 600, test: (s, p) => p.karts.length >= 8 },
  { id: 'records_8', name: 'Time Traveller', desc: 'Set a Time Trial on all 8 maps', coins: 300, test: (s, p) => Object.keys(p.records || {}).length >= 8 },
  { id: 'level_10', name: 'Rising Star', desc: 'Reach level 10', coins: 200, test: (s, p, lv) => lv >= 10 },
];

// Daily challenges: three each day, picked from this list by date and player.
export const DAILY_POOL = [
  { id: 'd_finish3', name: 'Finish 3 races', goal: 3, stat: 'races', coins: 60 },
  { id: 'd_win1', name: 'Win a race', goal: 1, stat: 'wins', coins: 80 },
  { id: 'd_over10', name: 'Make 10 overtakes', goal: 10, stat: 'overtakes', coins: 70 },
  { id: 'd_items8', name: 'Use 8 items', goal: 8, stat: 'items', coins: 50 },
  { id: 'd_podium2', name: 'Finish in the top 3 twice', goal: 2, stat: 'podiums', coins: 70 },
  { id: 'd_drift6', name: 'Charge 6 rainbow drift boosts', goal: 6, stat: 'turbo3', coins: 70 },
  { id: 'd_online1', name: 'Finish an online race', goal: 1, stat: 'onlineRaces', coins: 90 },
  { id: 'd_tt1', name: 'Set a Time Trial time', goal: 1, stat: 'ttRuns', coins: 50 },
];

export function dayKey(t = Date.now()) { return new Date(t).toISOString().slice(0, 10); }

export function dailyFor(uid, day = dayKey()) {
  let h = 2166136261;
  const str = uid + ':' + day;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const pool = [...DAILY_POOL];
  const out = [];
  while (out.length < 3 && pool.length) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}
