// Jungle Ruins (Explorer Cup). Thick jungle round an old stone temple: ruined arches over
// the road, a stretch behind a roaring waterfall, a wooden rope bridge over the river, and
// a shortcut through the temple courtyard (watch the swinging log).
const K = 1.35;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'jungle-ruins',
  name: 'Jungle Ruins',
  season: 'explorer',
  laps: 3,
  margin: 4.5,
  offroad: 'grass',
  killY: -4,
  path: [
    P(0, 3, 0, 15),
    P(75, 3, 10, 15),
    P(132, 4, -15, 14),
    P(152, 6, -65, 13),
    P(122, 8, -112, 12),
    P(66, 9, -118, 12),
    P(30, 7, -158, 12),
    P(-30, 6, -165, 12),
    P(-82, 5, -132, 13),
    P(-96, 4, -76, 13),
    P(-140, 3, -40, 13),
    P(-132, 3, 22, 14),
    P(-70, 3, 46, 14),
  ],
  wiggles: [
    { from: 30, to: 140, amp: 8, waves: 1 },
  ],
  shortcuts: [
    { id: 'temple', from: XZ(122, -112), to: XZ(30, -158), points: [P(85, 9.5, -140, 7), P(55, 8.5, -152, 7)], surface: 'dirt', margin: 0.8 },
  ],
  bridges: [{ from: XZ(-118, 30), to: XZ(-88, 42), style: 'wood', margin: 0.5 }],
  gaps: [],
  ramps: [{ at: XZ(100, 4), lat: -3, width: 6, length: 6, height: 1.2 }],
  patches: [
    { from: XZ(-140, -34), to: XZ(-138, -10), lat0: -6.5, lat1: -1, surface: 'mud', color: '#8a5a2b' },
  ],
  boostPads: [{ at: XZ(28, 3), lat: 3.5 }, { at: XZ(-60, 44), lat: -3 }],
  // the road behind the waterfall (rock overhang, water falling on the outside)
  tunnels: [{ from: XZ(-90, -98), to: XZ(-104, -66), style: 'waterfall' }],
  water: [
    { id: 'river', at: XZ(-103, 37), length: 220, width: 18, level: 1.0, deep: true, wiggle: 10, color: '#3fc0a0' },
    { id: 'pool', x: -60 * K, z: -85 * K, r: 18, level: 2.4, deep: true, color: '#3fc0a0' },
  ],
  itemBoxes: [
    { at: XZ(40, 6), lats: [-4.5, -1.5, 1.5, 4.5] },
    { at: XZ(150, -45), lats: [-3.5, 0, 3.5] },
    { path: 'temple', f: 0.5, lats: [0] },
    { at: XZ(0, -165), lats: [-3, 0, 3] },
    { at: XZ(-138, -20), lats: [-4, 0, 4] },
    { at: XZ(-110, 38), lats: [-3, 0, 3] },
  ],
  obstacles: [],
  movers: [
    // a log swinging across the temple courtyard shortcut
    { kind: 'swing', path: 'temple', s: 40, amp: 3.2, period: 3.2, phase: 0, r: 1.1, h: 2.2, model: 'swing_log' },
  ],
};
