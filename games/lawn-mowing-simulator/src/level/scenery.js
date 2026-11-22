// Background around each level (outside the fence): rings of trees, neighbours' houses,
// a windmill on a hill (like the user's reference picture), rocks. Purely decorative.
import { rng, hashStr } from '../shared/rng.js';

const MIX = {
  suburb: [['tree_round', 4], ['tree_big', 2], ['tree_pine', 2], ['bush', 2], ['tree_pine_tall', 1]],
  country: [['tree_pine', 4], ['tree_pine_tall', 3], ['tree_round', 2], ['bush', 1], ['rock_big', 1]],
  park: [['tree_round', 4], ['tree_big', 3], ['tree_pine', 2], ['bush', 2]],
  sports: [['tree_pine_tall', 3], ['tree_round', 3], ['tree_pine', 2], ['bush', 1]],
  golf: [['tree_pine_tall', 4], ['tree_pine', 2], ['tree_round', 2], ['tree_big', 1]],
};

function pickW(R, list) {
  const tot = list.reduce((a, x) => a + x[1], 0);
  let r = R() * tot;
  for (const [m, w] of list) { r -= w; if (r <= 0) return m; }
  return list[0][0];
}

export function sceneryProps(L) {
  const R = rng(hashStr('scenery:' + L.id));
  const [x0, z0, x1, z1] = L.bounds;
  const out = [];
  const taken = [];
  for (const p of L.props) taken.push([p.x, p.z, p.m.startsWith('house') || p.m === 'barn' || p.m === 'clubhouse' || p.m === 'stand' ? 9 : 2.5]);
  const free = (x, z, r) => {
    if (x > x0 - 1.5 && x < x1 + 1.5 && z > z0 - 1.5 && z < z1 + 1.5) return false;
    for (const [tx, tz, tr] of taken) if ((x - tx) ** 2 + (z - tz) ** 2 < (r + tr) ** 2) return false;
    return true;
  };
  const place = (m, x, z, r, extra = {}) => {
    if (!free(x, z, r)) return false;
    out.push({ m, x, z, rot: R() * Math.PI * 2, s: 0.85 + R() * 0.5, ...extra });
    taken.push([x, z, r]);
    return true;
  };
  const W = x1 - x0, D = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // landmark: windmill on a far hill (behind the spawn's view direction side)
  const ang = Math.atan2(Math.cos(L.spawn.h), Math.sin(L.spawn.h)) + 0.5;
  {
    const d = Math.max(W, D) / 2 + 36;
    place('windmill', cx + Math.sin(L.spawn.h + 0.5) * d, cz + Math.cos(L.spawn.h + 0.5) * d, 6, { rot: Math.PI + L.spawn.h + 0.5, s: 1, landmark: true });
  }
  if (L.scenery === 'suburb') {
    // neighbours' houses
    const spots = [[x0 - 11, cz - D * 0.25, Math.PI / 2], [x1 + 11, cz + D * 0.2, -Math.PI / 2], [x0 - 12, cz + D * 0.45, Math.PI / 2], [x1 + 12, cz - D * 0.4, -Math.PI / 2]];
    spots.forEach(([x, z, rot], i) => place(i % 2 ? 'house_b' : 'house_a', x, z, 6, { rot, s: 1 }));
  }
  if (L.scenery === 'country') place('barn', x1 + 18, z0 - 6, 7, { rot: -2.2, s: 1 });
  if (L.scenery === 'country' || L.scenery === 'golf' || L.scenery === 'suburb') {
    for (let i = 0; i < 3; i++) {
      const a = R() * Math.PI * 2, d = Math.max(W, D) / 2 + 30 + R() * 20;
      place('cliff', cx + Math.cos(a) * d, cz + Math.sin(a) * d, 5, { s: 1 + R() * 0.8 });
    }
  }
  // tree rings: many near the fence, fewer far away
  const mix = MIX[L.scenery] || MIX.suburb;
  const perim = 2 * (W + D);
  const n = Math.round(perim / 1.9);
  for (let i = 0; i < n * 2 && out.length < n + 20; i++) {
    const d = 3 + 42 * Math.pow(R(), 1.7);
    const t = R() * perim;
    let x, z;
    if (t < W) { x = x0 + t; z = z0 - d; }
    else if (t < W + D) { x = x1 + d; z = z0 + (t - W); }
    else if (t < 2 * W + D) { x = x1 - (t - W - D); z = z1 + d; }
    else { x = x0 - d; z = z1 - (t - 2 * W - D); }
    x += (R() - 0.5) * 3; z += (R() - 0.5) * 3;
    place(pickW(R, mix), x, z, 1.6);
  }
  // a few hedges / bushes just behind the fence for a lush look
  for (let i = 0; i < Math.round(perim / 9); i++) {
    const t = R() * perim, d = 1.8 + R() * 1.5;
    let x, z;
    if (t < W) { x = x0 + t; z = z0 - d; } else if (t < W + D) { x = x1 + d; z = z0 + (t - W); }
    else if (t < 2 * W + D) { x = x1 - (t - W - D); z = z1 + d; } else { x = x0 - d; z = z1 - (t - 2 * W - D); }
    place(R() < 0.5 ? 'bush' : 'bush_flower', x, z, 1.0);
  }
  return out;
}
