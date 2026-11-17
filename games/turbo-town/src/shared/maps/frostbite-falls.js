// Frostbite Falls (Winter). Up a snowy mountain pass where snowballs roll down at you,
// through a glittering ice cave, a snow-ramp jump, then a slippery frozen lake.
const K = 1.2;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'frostbite-falls',
  name: 'Frostbite Falls',
  season: 'winter',
  laps: 3,
  margin: 5,
  offroad: 'snow',
  killY: -4,
  path: [
    P(0, 2, 0, 16),
    P(70, 3, -5, 16),
    P(130, 7, -30, 15),
    P(160, 13, -80, 14),
    P(150, 19, -140, 14),
    P(100, 22, -175, 13),
    P(40, 21, -170, 13),
    P(0, 16, -130, 14),
    P(-30, 10, -82, 14),
    P(-60, 4, -40, 18),
    P(-110, 3, -30, 20),
    P(-150, 3, 10, 18),
    P(-140, 3, 60, 15),
    P(-90, 2, 70, 15),
    P(-40, 2, 40, 16),
  ],
  // extra S-bends (lap distances on the layout above)
  wiggles: [
    { from: 58, to: 150, amp: 8.5, waves: 1 },
    { from: 895, to: 990, amp: 9, waves: 1 },
  ],
  shortcuts: [
    // a narrow icy ledge that skips the top of the pass
    { id: 'icicle-ledge', from: XZ(157, -108), to: XZ(78, -176), points: [P(128, 20.5, -152, 6)], surface: 'road', margin: 0.4 },
  ],
  // an ice bridge over the icy creek (the snow ramp before it is still a jump)
  bridges: [{ from: XZ(-33, -77), to: XZ(-47, -54), style: 'ice', margin: 0.5 }],
  gaps: [],
  ramps: [{ at: XZ(-26, -92), lat: 0, width: 14, length: 7, height: 1.6 }],
  patches: [
    // the frozen lake
    { from: XZ(-55, -45), to: XZ(-150, 20), surface: 'ice', color: '#c8f0ff' },
  ],
  boostPads: [{ at: XZ(40, -2), lat: 0 }, { at: XZ(-120, 64), lat: 3 }],
  tunnels: [{ from: XZ(110, -172), to: XZ(45, -171), style: 'icecave' }],
  water: [{ id: 'icy-creek', at: XZ(-41, -65), length: 100, width: 7, level: 7.2, deep: false, depth: 0.8, wiggle: 5 }],
  itemBoxes: [
    { at: XZ(40, -3), lats: [-4.5, -1.5, 1.5, 4.5] },
    { at: XZ(158, -100), lats: [-4, 0, 4] },
    { at: XZ(20, -150), lats: [-3.5, 0, 3.5] },
    { at: XZ(-80, -34), lats: [-6, -2, 2, 6] },
    { at: XZ(-145, 40), lats: [-4, 0, 4] },
    { at: XZ(-60, 58), lats: [-4, 0, 4] },
  ],
  obstacles: [],
  // giant snowballs rolling down the pass towards the karts
  movers: [
    { kind: 'roll', from: XZ(150, -138), to: XZ(158, -76), lat: -3, period: 6, phase: 0, r: 1.6, model: 'snowball' },
    { kind: 'roll', from: XZ(150, -138), to: XZ(158, -76), lat: 3.2, period: 6, phase: 0.5, r: 1.6, model: 'snowball' },
  ],
};
