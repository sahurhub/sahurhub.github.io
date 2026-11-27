// Harbour Rush (Explorer Cup). A busy seaside port: along the docks past giant cranes and
// container stacks, out over the water on a wooden pier, across the canal on a lifting
// bridge, and a shortcut through the container yard (mind the forklift).
const K = 1.38;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'harbour-rush',
  name: 'Harbour Rush',
  season: 'explorer',
  laps: 3,
  margin: 4.5,
  offroad: 'dirt',
  killY: -4,
  path: [
    P(0, 3, 0, 16),
    P(80, 3, 0, 16),
    P(140, 3, 30, 15),
    P(152, 3, 90, 14),
    P(112, 2.6, 136, 14),
    P(40, 2.6, 142, 14),
    P(-30, 2.8, 132, 14),
    P(-80, 3, 168, 13),
    P(-132, 3, 124, 13),
    P(-152, 4, 62, 13),
    P(-122, 6, 10, 14),
    P(-60, 4, -15, 15),
  ],
  wiggles: [
    { from: 40, to: 150, amp: 6, waves: 1 },
  ],
  shortcuts: [
    // between the container stacks: cuts the corner, a forklift drives across it
    { id: 'yard', from: XZ(140, 30), to: XZ(112, 136), points: [P(118, 3, 70, 7), P(112, 3, 105, 7)], surface: 'road', margin: 0.8 },
  ],
  bridges: [
    { from: XZ(-42, 138), to: XZ(-122, 138), style: 'wood', margin: 0.5 },
    { from: XZ(-150, 52), to: XZ(-140, 22), style: 'stone', margin: 0.5 },
  ],
  gaps: [],
  ramps: [{ at: XZ(60, 0), lat: 3, width: 6, length: 6, height: 1.2 }],
  patches: [],
  boostPads: [{ at: XZ(30, 0), lat: -3.5 }, { at: XZ(90, 140), lat: 3 }],
  tunnels: [],
  water: [
    { id: 'sea', poly: [XZ(-420, 200), XZ(420, 200)], width: 82 * K, level: 0.8, deep: true },
    { id: 'canal', at: XZ(-146, 37), length: 200, width: 16, level: 0.8, deep: true, wiggle: 0 },
  ],
  itemBoxes: [
    { at: XZ(45, 0), lats: [-5, -1.7, 1.7, 5] },
    { at: XZ(150, 70), lats: [-3.5, 0, 3.5] },
    { path: 'yard', f: 0.5, lats: [0] },
    { at: XZ(10, 140), lats: [-4, 0, 4] },
    { at: XZ(-150, 90), lats: [-3.5, 0, 3.5] },
    { at: XZ(-95, 0), lats: [-4, 0, 4] },
  ],
  obstacles: [],
  movers: [
    { kind: 'slide', path: 'yard', s: 55, lat0: -4, lat1: 4, period: 4.0, phase: 0, r: 1.4, h: 2.2, model: 'forklift' },
  ],
};
