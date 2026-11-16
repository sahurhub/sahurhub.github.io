// Sunburst Speedway (Summer). An amusement park: a big jump over the fountain pond, a
// rollercoaster section high on lattice towers with banked drops, and bumper cars that
// slide across the road.
const K = 1.13;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'sunburst-speedway',
  name: 'Sunburst Speedway',
  season: 'summer',
  laps: 3,
  margin: 4.5,
  offroad: 'grass',
  killY: -4,
  bankMax: 0.16,
  path: [
    P(0, 2, 0, 18),
    P(70, 2, 0, 18),
    P(122, 2, 22, 16),
    P(150, 2, 70, 15),
    P(150, 2, 130, 15),
    P(118, 5, 176, 13),
    P(60, 13, 192, 12),
    P(10, 18, 162, 12),
    P(-20, 9, 112, 12),
    P(-60, 15, 72, 12),
    P(-112, 7, 58, 12),
    P(-165, 3, 82, 14),
    P(-198, 2, 30, 16),
    P(-186, 2, -30, 17),
    P(-110, 2, -48, 17),
    P(-50, 2, -30, 17),
  ],
  // extra S-bends (lap distances on the layout above)
  wiggles: [
    { from: 50, to: 175, amp: 10, waves: 1 },
    { from: 728, to: 798, amp: 5, waves: 1 },
    { from: 990, to: 1058, amp: 5, waves: 1 },
  ],
  shortcuts: [
    // a path through the bumper-car midway: shorter, but the cars slide across it
    { id: 'midway', from: XZ(-196, 36), to: XZ(-100, -47), points: [P(-160, 2, 6, 7), P(-135, 2, -26, 7)], surface: 'road', margin: 1 },
  ],
  bridges: [{ from: XZ(110, 180), to: XZ(-140, 72), style: 'coaster', margin: 0.5 }],
  gaps: [{ from: XZ(150, 92), to: XZ(150, 108) }],
  ramps: [{ at: XZ(150, 76), lat: 0, width: 15, length: 9, height: 2.2 }],
  patches: [],
  boostPads: [{ at: XZ(150, 62), lat: 0, width: 5 }, { at: XZ(30, 0), lat: -4 }],
  tunnels: [],
  water: [
    { id: 'fountain-pond', at: XZ(150, 100), length: 70, width: 16, level: 0.9, deep: false, depth: 1.0, wiggle: 0 },
  ],
  itemBoxes: [
    { at: XZ(35, 0), lats: [-5, -1.7, 1.7, 5] },
    { at: XZ(150, 118), lats: [-4, 0, 4] },
    { at: XZ(35, 180), lats: [-3, 0, 3] },
    { at: XZ(-90, 64), lats: [-3, 0, 3] },
    { path: 'midway', f: 0.5, lats: [0] },
    { at: XZ(-140, -30), lats: [-5, -1.7, 1.7, 5] },
  ],
  obstacles: [],
  // bumper cars sliding across the road in the midway plaza
  movers: [
    { kind: 'slide', path: 'midway', s: 50, lat0: -3.5, lat1: 3.5, period: 2.6, phase: 0, r: 1.5, model: 'bumper_car' },
    { kind: 'slide', path: 'midway', s: 90, lat0: 3.5, lat1: -3.5, period: 3.0, phase: 0.3, r: 1.5, model: 'bumper_car' },
    { kind: 'slide', at: XZ(-188, -5), lat0: -6.5, lat1: 6.5, period: 4.2, phase: 0.6, r: 1.5, model: 'bumper_car' },
  ],
};
