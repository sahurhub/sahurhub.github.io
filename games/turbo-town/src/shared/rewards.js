// TURBO TOWN - race rewards (shared). The server is the one that actually pays; the game
// uses the same rules to show what to expect.
import { FINISH_COINS, OVERTAKE_COINS, OVERTAKE_MAX, BONUS, FINISH_XP, XP_PER_OVERTAKE, CUPS } from './rules.js';

const DIFF_MUL = { easy: 0.8, normal: 1, hard: 1.15, expert: 1.3 };

// o: { mode: 'quick'|'single'|'gp'|'tt'|'online', place, racers (count), overtakes, difficulty,
//      pb (bool), gp: { done, place }, shortcuts (new ones found), clean }
export function raceRewards(o) {
  const lines = [];
  let xp = 0;
  const field = Math.max(1, o.racers || 1);
  const overtakes = Math.min(OVERTAKE_MAX, Math.max(0, Math.floor(o.overtakes || 0)));
  const place = Math.min(8, Math.max(1, Math.floor(o.place || 8)));
  const scale = o.mode === 'online' ? Math.min(1, 0.4 + 0.6 * ((field - 1) / 7)) : Math.min(1, 0.25 + 0.75 * ((field - 1) / 7)) * (DIFF_MUL[o.difficulty] || 1);
  if (o.mode !== 'tt') {
    const fc = Math.round(FINISH_COINS[place - 1] * scale);
    lines.push({ key: 'finish', label: 'Finished ' + ord(place), coins: fc });
    xp += Math.round(FINISH_XP[place - 1] * scale);
    if (overtakes) {
      lines.push({ key: 'overtakes', label: overtakes + ' overtake' + (overtakes > 1 ? 's' : ''), coins: overtakes * OVERTAKE_COINS });
      xp += overtakes * XP_PER_OVERTAKE;
    }
    if (place === 1 && field >= 4) lines.push({ key: 'win', label: 'Race win', coins: BONUS.win });
  } else {
    xp += 20;
  }
  if (o.pb) lines.push({ key: 'pb', label: 'New personal best', coins: BONUS.personalBest });
  if (o.shortcuts) lines.push({ key: 'shortcut', label: 'Found a new shortcut', coins: BONUS.shortcut * o.shortcuts });
  if (o.clean && o.mode !== 'tt' && field >= 4) lines.push({ key: 'clean', label: 'Clean race (no falls)', coins: BONUS.cleanRace });
  if (o.gp && o.gp.done) {
    if (o.gp.place === 1) lines.push({ key: 'gpwin', label: 'Grand Prix win', coins: BONUS.gpWin });
    else if (o.gp.place <= 3) lines.push({ key: 'gppodium', label: 'Grand Prix podium', coins: BONUS.gpPodium });
    xp += o.gp.place <= 3 ? 80 : 30;
  }
  const coins = lines.reduce((s, l) => s + l.coins, 0);
  return { lines, coins, xp };
}

export function trophyFor(place) { return place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : null; }

export function nextCup(id) {
  const i = CUPS.findIndex((c) => c.id === id);
  return i >= 0 && i < CUPS.length - 1 ? CUPS[i + 1].id : null;
}

function ord(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
