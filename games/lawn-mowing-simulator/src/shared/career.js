// Career mode: customers, offers, reviews and reputation (shared by the game and the server).
import { rng, hashStr, pick, clamp } from './rng.js';
import { LEVELS, LEVEL_IDS } from './levels.js';
import { PATTERN_IDS } from './patterns.js';

export const TIERS = [
  { rep: 0, name: 'Newcomer', mult: 1.0 },
  { rep: 15, name: 'Local Favourite', mult: 1.15 },
  { rep: 35, name: 'Trusted Pro', mult: 1.3 },
  { rep: 60, name: 'Lawn Expert', mult: 1.45 },
  { rep: 85, name: 'Lawn Legend', mult: 1.6 },
];

// reputation needed before customers at this place will offer you work
export const LEVEL_REP = { 'back-garden': 0, 'front-lawn': 0, 'cottage-hill': 8, orchard: 20, 'village-park': 32, 'sports-field': 52, 'golf-course': 72 };

export function tierFor(rep) {
  let t = TIERS[0], idx = 0;
  TIERS.forEach((x, i) => { if (rep >= x.rep) { t = x; idx = i; } });
  return { ...t, index: idx, next: TIERS[idx + 1] || null };
}

const PEOPLE = ['Mrs. Higgins', 'Mr. Patel', 'The Okafor Family', 'Grandma Rose', 'Mr. Novak', 'Ms. Rivera', 'Dr. Lindqvist',
  'The Chens', 'Mr. Fitzgerald', 'Auntie Mel', 'Mrs. Kowalski', 'Mr. Adeyemi', 'The Murphys', 'Miss Tanaka', 'Mr. Bramble'];
const CLIENTS = { 'village-park': 'Willow Village Council', 'sports-field': 'Oakwood FC', 'golf-course': 'Fairway Golf Club', orchard: 'Bramley Orchard Farm' };

const KINDS = [
  { kind: 'standard', weather: 'sunny', mult: 1.0, w: 5, note: 'Just a normal cut, please.' },
  { kind: 'standard', weather: 'evening', mult: 1.1, w: 2, note: 'Can you come after work? Evening job.' },
  { kind: 'standard', weather: 'rain', mult: 1.25, w: 2, note: 'It has been raining. Careful, the grass is slippery.' },
  { kind: 'timed', weather: 'sunny', mult: 1.3, w: 2, note: 'Guests arrive soon. Be quick!' },
  { kind: 'perfect', weather: 'sunny', mult: 1.45, w: 2, note: 'I want every single blade cut. No missed patches!', rep: 15 },
  { kind: 'pattern', weather: 'sunny', mult: 1.5, w: 1, note: 'Could you mow a fun shape into the lawn?', rep: 25 },
];

// Make `count` offers for a profile. Places you own, plus the next place if your reputation allows
// (finishing a contract at a new place unlocks it for free).
export function makeOffers(profile, count = 3) {
  const c = profile.career;
  const R = rng(hashStr('offers:' + (c.seed || 1) + ':' + (profile.uidSeed || 0)));
  const owned = LEVEL_IDS.filter((id) => profile.levels.includes(id) && c.rep >= (LEVEL_REP[id] || 0));
  const fresh = LEVEL_IDS.find((id) => !profile.levels.includes(id) && c.rep >= (LEVEL_REP[id] || 0));
  const out = [];
  for (let n = 0; n < count; n++) {
    let level = n === 0 && fresh ? fresh : pick(R, owned.length ? owned : ['back-garden']);
    // prefer bigger places as reputation grows
    if (owned.length > 1 && R() < 0.5) level = owned[owned.length - 1 - Math.floor(R() * Math.min(2, owned.length))];
    const L = LEVELS[level];
    const kinds = KINDS.filter((k) => c.rep >= (k.rep || 0) && (k.kind !== 'pattern' || L.patternOk));
    let tot = kinds.reduce((a, k) => a + k.w, 0), r = R() * tot, k = kinds[0];
    for (const x of kinds) { r -= x.w; if (r <= 0) { k = x; break; } }
    const isNew = level === fresh && n === 0;
    out.push({
      id: `${c.seed || 1}-${n}`,
      level, customer: CLIENTS[level] || pick(R, PEOPLE),
      kind: k.kind, weather: k.weather, mult: k.mult * (isNew ? 1.2 : 1),
      pattern: k.kind === 'pattern' ? pick(R, PATTERN_IDS) : null,
      note: isNew ? 'New customer! Do a good job and this place is yours to mow any time.' : k.note,
      isNew,
    });
  }
  return out;
}

const REVIEW_TEXT = {
  5: ['Absolutely perfect stripes. Five stars!', 'Best the lawn has ever looked. Thank you!', 'Like a cricket pitch. Wonderful.', 'Neat, quick and polite. Will book again.'],
  4: ['Lovely job, just a couple of rough bits.', 'Very nice! Nearly perfect.', 'Good work, the garden looks great.'],
  3: ['It is cut, I suppose. A bit messy.', 'Okay job. Some patches were missed.', 'Not bad, not great.'],
  2: ['Lots of missed bits and wonky lines.', 'Took ages and it still looks shaggy.'],
  1: ['What happened to my garden?!', 'Never again. Total mess.'],
};
const HIT_TEXT = { gnome: 'Also, someone flattened my gnome!', hose: 'And my hose has a hole in it now.', bed: 'You drove through my flowers!', pool: 'The paddling pool got squashed!', flag: 'The flag was knocked down.' };

// Review stars 1-5 from the job result.
export function makeReview(res, offer, seed) {
  const R = rng(hashStr('review:' + seed));
  let stars = [1, 3, 4, 5][res.stars] || 1;
  if (res.pen >= 60) stars -= 1;
  if (res.stars === 3 && res.neat >= 0.85 && res.pen === 0) stars = 5;
  stars = clamp(stars, 1, 5);
  let text = pick(R, REVIEW_TEXT[stars]);
  const hk = (res.hitKinds || []).find((k) => HIT_TEXT[k]);
  if (hk) text += ' ' + HIT_TEXT[hk];
  return { stars, text, customer: offer.customer, level: offer.level };
}

export const REP_CHANGE = { 5: 6, 4: 3, 3: 1, 2: -2, 1: -4 };
