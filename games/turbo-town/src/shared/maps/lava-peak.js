// Lava Peak (Explorer Cup). A volcano island: the road climbs round the mountain and back
// down, over a stone bridge across a lava river, past glowing lava pools. The brave cut
// across the crater ridge on a narrow ledge.
const K = 1.45;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'lava-peak',
  name: 'Lava Peak',
  season: 'explorer',
  laps: 3,
  margin: 4.5,
  offroad: 'dirt',
  killY: -4,
  path: [
    P(0, 3, 60, 15),
    P(80, 3, 60, 15),
    P(140, 5, 30, 14),
    P(160, 9, -30, 13),
    P(130, 14, -90, 13),
    P(70, 19, -125, 12),
    P(0, 23, -130, 12),
    P(-60, 24, -105, 12),
    P(-100, 20, -55, 12),
    P(-112, 14, 0, 13),
    P(-96, 9, 44, 13),
    P(-55, 4, 70, 14),
  ],
  wiggles: [
    { from: 30, to: 150, amp: 7, waves: 1 },
  ],
  shortcuts: [
    // a narrow ledge across the crater ridge: shorter, but one slip and it's lava
    { id: 'ridge', from: XZ(130, -90), to: XZ(0, -130), points: [P(85, 23, -100, 6), P(42, 25, -112, 6)], surface: 'road', margin: 0.4 },
  ],
  bridges: [{ from: XZ(-111, 6), to: XZ(-101, 36), style: 'stone', margin: 0.5 }],
  gaps: [],
  ramps: [{ at: XZ(120, 50), lat: -3, width: 6, length: 6, height: 1.2 }],
  patches: [],
  boostPads: [{ at: XZ(30, 60), lat: 3.5 }, { at: XZ(-110, -20), lat: 0 }],
  tunnels: [],
  water: [
    { id: 'lava-river', at: XZ(-106, 21), length: 220, width: 18, level: 6, deep: true, wiggle: 10, color: '#ff5a1f' },
    // lava right beside the crater ridge ledge, and the crater at the very top
    { id: 'ridge-lava', x: 75 * K, z: -86 * K, r: 9, level: 20, deep: true, color: '#ff5a1f' },
    { id: 'crater', x: 20 * K, z: -35 * K, r: 11, level: 44, deep: true, color: '#ff5a1f' },
  ],
  itemBoxes: [
    { at: XZ(45, 60), lats: [-4.5, -1.5, 1.5, 4.5] },
    { at: XZ(158, -10), lats: [-3.5, 0, 3.5] },
    { path: 'ridge', f: 0.5, lats: [0] },
    { at: XZ(30, -130), lats: [-3, 0, 3] },
    { at: XZ(-82, -82), lats: [-3, 0, 3] },
    { at: XZ(-80, 60), lats: [-4, 0, 4] },
  ],
  obstacles: [],
  movers: [],
};
