// Amazon Rainforest (Thrill Cup). Deep in the rainforest: giant trees arch over the road
// like a green tunnel with vines hanging down, a wide muddy-green river, a wooden boardwalk
// over a creek, a waterfall pool, and parrots, toucans, butterflies and monkeys all around.
const K = 1.52;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'amazon-rainforest',
  name: 'Amazon Rainforest',
  season: 'thrill',
  laps: 3,
  margin: 4.5,
  offroad: 'grass',
  killY: -4,
  path: [
    P(0, 3, 0, 15),
    P(80, 3, 10, 15),
    P(135, 3.5, -15, 14),
    P(155, 4, -70, 13),
    P(120, 5, -115, 13),
    P(60, 5, -128, 13),
    P(10, 4, -112, 13),
    P(-45, 4, -128, 13),
    P(-100, 4, -110, 13),
    P(-125, 3.5, -55, 13),
    P(-100, 3, 0, 14),
    P(-50, 3, 25, 14),
  ],
  wiggles: [
    { from: 30, to: 140, amp: 8, waves: 1 },
  ],
  shortcuts: [
    // a hidden trail through the undergrowth (under the leaves)
    { id: 'trail', from: XZ(135, -15), to: XZ(120, -115), points: [P(118, 4, -55, 7), P(112, 4.5, -88, 7)], surface: 'leaves', margin: 0.8, hidden: true },
  ],
  // the wooden boardwalk over the creek
  bridges: [{ from: XZ(32, -122), to: XZ(-14, -116), style: 'wood', margin: 0.5 }],
  gaps: [],
  ramps: [{ at: XZ(-115, -30), lat: 3, width: 6, length: 6, height: 1.2 }],
  patches: [
    { from: XZ(-100, -110), to: XZ(-118, -80), lat0: 1, lat1: 6.5, surface: 'mud', color: '#7a5030' },
  ],
  boostPads: [{ at: XZ(30, 4), lat: -3.5 }, { at: XZ(-80, 15), lat: 3 }],
  tunnels: [],
  water: [
    { id: 'river', poly: [XZ(-300, -190), XZ(-120, -180), XZ(0, -186), XZ(120, -178), XZ(300, -190)], width: 41 * K, level: 1.4, deep: true, color: '#4a9a7a' },
    { id: 'creek', at: XZ(9, -118), length: 107 * K, width: 12.5 * K, level: 1.4, deep: true, wiggle: 6, color: '#4a9a7a' },
    { id: 'falls-pool', x: -165 * K, z: -60 * K, r: 16 * K, level: 1.6, deep: true, color: '#5fb8a0' },
  ],
  itemBoxes: [
    { at: XZ(40, 6), lats: [-4.5, -1.5, 1.5, 4.5] },
    { at: XZ(152, -50), lats: [-3.5, 0, 3.5] },
    { path: 'trail', f: 0.5, lats: [0] },
    { at: XZ(60, -128), lats: [-3.5, 0, 3.5] },
    { at: XZ(-70, -122), lats: [-3.5, 0, 3.5] },
    { at: XZ(-115, -20), lats: [-4, 0, 4] },
  ],
  obstacles: [],
  movers: [],
};
