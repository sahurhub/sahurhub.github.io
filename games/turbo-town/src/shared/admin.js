// TURBO TOWN - admin actions on a profile (shared by the server and the local test
// profile). Only the server decides who may use them (ADMIN_UIDS on the server).
import { KARTS } from './karts.js';
import { MAP_INFO, CUPS, xpForLevel } from './rules.js';

export const ADMIN_LEVEL_ALL = 25; // every cosmetic is unlocked by this level

// total XP needed to reach a level
export function xpToReach(level) {
  let t = 0;
  for (let l = 1; l < level; l++) t += xpForLevel(l);
  return t;
}

// Changes the profile object p in place and returns a short description. Throws an Error
// with a friendly message for bad values.
export function adminApply(p, action, value) {
  switch (action) {
    case 'unlockAll':
      p.karts = KARTS.map((k) => k.id);
      p.maps = MAP_INFO.map((m) => m.id);
      p.cupsOpen = CUPS.map((c) => c.id);
      p.xp = Math.max(p.xp || 0, xpToReach(ADMIN_LEVEL_ALL));
      return 'Everything unlocked: all karts, maps, cups and styles';
    case 'gold':
      p.cups = p.cups || {};
      for (const c of CUPS) p.cups[c.id] = { best: 1, trophy: 'gold' };
      return 'Gold trophy in every cup';
    case 'coins': {
      const n = Math.trunc(Number(value) || 0);
      if (!n || Math.abs(n) > 10000000) throw new Error('Pick an amount between 1 and 10,000,000.');
      p.coins = Math.max(0, Math.min(99999999, (p.coins || 0) + n));
      return (n > 0 ? 'Gave ' : 'Took ') + Math.abs(n).toLocaleString('en-GB') + ' coins';
    }
    case 'level': {
      const lv = Math.trunc(Number(value) || 0);
      if (lv < 1 || lv > 60) throw new Error('Pick a level from 1 to 60.');
      p.xp = xpToReach(lv);
      return 'Level set to ' + lv;
    }
    default:
      throw new Error('Unknown admin action.');
  }
}
