// Grand Prix Circuit (Thrill Cup). A proper motor-racing track for the F1 cars: a long
// start straight between grandstands, a hard braking first corner, fast esses, a tight
// hairpin and a chicane, with red-and-white kerbs, tyre walls and a bridge over the track.
const K = 1.38;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'grand-prix-circuit',
  name: 'Grand Prix Circuit',
  season: 'thrill',
  laps: 3,
  margin: 5,
  offroad: 'grass',
  killY: -4,
  bankMax: 0.1,
  path: [
    P(0, 3, 0, 18),
    P(110, 3, 0, 18),
    P(160, 3, -15, 15),
    P(176, 3, -60, 14),
    P(150, 3, -100, 14),
    P(100, 3.5, -95, 14),
    P(60, 4, -125, 14),
    P(0, 4.5, -132, 14),
    P(-60, 4, -112, 14),
    P(-82, 3.5, -62, 14),
    P(-130, 3, -50, 14),
    P(-152, 3, -16, 13),
    P(-122, 3, 16, 14),
    P(-60, 3, 20, 16),
  ],
  // the chicane on the back of the circuit
  wiggles: [
    { from: 640, to: 700, amp: 5, waves: 1 },
  ],
  shortcuts: [],
  bridges: [],
  gaps: [],
  ramps: [],
  patches: [],
  boostPads: [{ at: XZ(30, 0), lat: -4 }, { at: XZ(-20, -130), lat: 3 }],
  tunnels: [],
  water: [
    { id: 'lake', x: 40 * K, z: -60 * K, r: 24, level: 1.6, deep: true },
  ],
  itemBoxes: [
    { at: XZ(55, 0), lats: [-5, -1.7, 1.7, 5] },
    { at: XZ(172, -45), lats: [-3.5, 0, 3.5] },
    { at: XZ(80, -108), lats: [-3.5, 0, 3.5] },
    { at: XZ(-30, -125), lats: [-3.5, 0, 3.5] },
    { at: XZ(-100, -58), lats: [-3.5, 0, 3.5] },
    { at: XZ(-95, 18), lats: [-4, 0, 4] },
  ],
  obstacles: [],
  movers: [],
};
