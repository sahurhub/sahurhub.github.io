// Dusty Canyon (Explorer Cup). A red-rock desert canyon: a long climb along the cliff
// edge, a jump over a muddy river, a shortcut through an old mine tunnel, and tumbleweeds
// rolling across the road.
const K = 1.27;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'dusty-canyon',
  name: 'Dusty Canyon',
  season: 'explorer',
  laps: 3,
  margin: 4.5,
  offroad: 'sand',
  killY: -4,
  path: [
    P(0, 4, 0, 16),
    P(80, 4, 0, 16),
    P(140, 5, -25, 14),
    P(172, 8, -75, 13),
    P(158, 14, -130, 12),
    P(105, 17, -152, 12),
    P(50, 15, -128, 12),
    P(10, 11, -188, 12),
    P(-45, 8, -152, 13),
    P(-88, 5, -118, 14),
    P(-82, 3.5, -62, 15),
    P(-118, 3, -22, 14),
    P(-108, 3, 32, 14),
    P(-52, 3.5, 46, 15),
  ],
  wiggles: [
    { from: 40, to: 150, amp: 7, waves: 1 },
  ],
  shortcuts: [
    // straight through the hill along the old mine rails (the road bends round the outside)
    { id: 'mine', from: XZ(50, -128), to: XZ(-45, -152), points: [P(20, 12.5, -138, 7), P(-12, 10, -146, 7)], surface: 'dirt', margin: 0.8 },
  ],
  bridges: [],
  // the jump over the muddy river (ramp and boost pad just before it)
  // gap 15 m across, starting 5 m after the end of the ramp
  gaps: [{ from: XZ(-86, -92.3), to: XZ(-82.8, -80.9) }],
  ramps: [
    { at: XZ(-87, -104), lat: 0, width: 15, length: 9, height: 2.6 },
    { at: XZ(112, -10), lat: 3, width: 6, length: 6, height: 1.2 },
  ],
  patches: [],
  boostPads: [{ at: XZ(-88, -114), lat: 0, width: 5 }, { at: XZ(30, 0), lat: -3.5 }],
  tunnels: [],
  water: [
    { id: 'river', at: XZ(-84.4, -86.6), length: 200, width: 10, level: 1.2, deep: true, wiggle: 9, color: '#b0763a' },
  ],
  itemBoxes: [
    { at: XZ(45, 0), lats: [-4.5, -1.5, 1.5, 4.5] },
    { at: XZ(170, -60), lats: [-3.5, 0, 3.5] },
    { at: XZ(100, -150), lats: [-3, 0, 3] },
    { path: 'mine', f: 0.5, lats: [-1.5, 1.5] },
    { at: XZ(-84, -68), lats: [-4, 0, 4] },
    { at: XZ(-112, 10), lats: [-4, 0, 4] },
  ],
  obstacles: [],
  // tumbleweeds blowing back and forth across the road (they bump you, no spin)
  movers: [
    { kind: 'slide', at: XZ(60, 0), lat0: -9, lat1: 9, period: 6.5, phase: 0, r: 0.9, h: 1.6, model: 'tumbleweed', spin: false },
    { kind: 'slide', at: XZ(-114, 0), lat0: 8, lat1: -8, period: 5.5, phase: 0.4, r: 0.9, h: 1.6, model: 'tumbleweed', spin: false },
    { kind: 'slide', at: XZ(160, -105), lat0: -7, lat1: 7, period: 7.0, phase: 0.7, r: 0.9, h: 1.6, model: 'tumbleweed', spin: false },
  ],
};
