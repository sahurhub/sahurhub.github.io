// Mushroom Meadow (Spring). A figure-eight: the road climbs over itself on a mushroom
// bridge, bounces over a stream on giant mushroom pads, and squeezes past a huge
// mushroom in the middle of the road. Shared layout data (game + server).
const K = 1.04;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'mushroom-meadow',
  name: 'Mushroom Meadow',
  season: 'spring',
  laps: 3,
  margin: 4.5,
  offroad: 'grass',
  killY: -4,
  bankMax: 0.1,
  path: [
    P(-60, 2, 60, 16),
    P(-25, 6, 25, 14),
    P(0, 10, 0, 13),
    P(30, 8.5, -30, 14),
    P(75, 4.5, -62, 15),
    P(150, 3, -62, 15),
    P(192, 3, -12, 15),
    P(186, 4, 55, 15),
    P(140, 3, 96, 15),
    P(72, 2, 80, 14),
    P(30, 1.5, 32, 14),
    P(0, 1.5, 0, 14),
    P(-30, 1.5, -32, 14),
    P(-75, 2.5, -64, 18),
    P(-150, 4, -62, 20),
    P(-192, 6, -12, 15),
    P(-186, 5, 50, 15),
    P(-140, 3, 90, 15),
  ],
  // extra S-bends (lap distances on the layout above)
  wiggles: [
    { from: 160, to: 245, amp: 7.5, waves: 1 },
    { from: 485, to: 600, amp: 10, waves: 1 },
    { from: 690, to: 790, amp: 8, waves: 1 },
    { from: 1000, to: 1082, amp: 7, waves: 1 },
  ],
  shortcuts: [
    { id: 'toadstool-trail', from: XZ(140, -62), to: XZ(150, 93), points: [P(158, 3.5, -22, 7), P(158, 3.5, 40, 7)], surface: 'dirt', margin: 1.2 },
  ],
  bridges: [{ from: XZ(-14, 14), to: XZ(16, -16), style: 'stone', margin: 0.5 }],
  narrow: [],
  gaps: [{ at: XZ(190, 20), from: XZ(191, 14), to: XZ(190, 24) }],
  patches: [
    // giant bouncy mushroom pads before the stream (bounce over it, or splash through)
    { from: XZ(192, -2), to: XZ(192, 3), lat0: -4.5, lat1: 4.5, surface: 'bounce', visual: false },
  ],
  boostPads: [{ at: XZ(110, -64), lat: 3 }, { at: XZ(-110, 92), lat: -3 }],
  ramps: [],
  tunnels: [{ from: XZ(-186, 30), to: XZ(-176, 66), style: 'log' }],
  water: [
    { id: 'stream', cross: null, at: XZ(190, 19), length: 120, width: 7, level: 1.6, deep: false, depth: 0.9, wiggle: 4 },
    { id: 'pond', x: 0 * K, z: 140 * K, r: 30, level: 1.0, deep: true },
  ],
  itemBoxes: [
    { at: XZ(-45, 45), lats: [-4, -1.3, 1.3, 4] },
    { at: XZ(60, -55), lats: [-4, 0, 4] },
    { path: 'toadstool-trail', f: 0.5, lats: [0] },
    { at: XZ(150, 92), lats: [-4, 0, 4] },
    { at: XZ(-40, -40), lats: [-4, 0, 4] },
    { at: XZ(-170, -40), lats: [-5, -1.7, 1.7, 5] },
    { at: XZ(-170, 80), lats: [-3, 0, 3] },
  ],
  // the giant mushroom stem in the middle of the wide section
  obstacles: [{ at: XZ(-112, -63), lat: 0, r: 2.6, model: 'giant_mushroom' }],
  movers: [],
};
