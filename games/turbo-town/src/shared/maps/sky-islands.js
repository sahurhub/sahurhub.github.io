// Sky Islands (Thrill Cup). Grassy islands floating on a sea of clouds, joined by stone
// bridges, with a big boost jump from one island to the next. Fall off and you are put
// back on the road.
const K = 1.5;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'sky-islands',
  name: 'Sky Islands',
  season: 'thrill',
  laps: 3,
  margin: 4.5,
  offroad: 'grass',
  killY: -8,
  gapDepth: 45, // the jump gap is a real drop into the clouds
  path: [
    P(0, 24, 0, 15),
    P(70, 24, 0, 15),
    P(122, 26, -30, 14),
    P(142, 28, -85, 13),
    P(108, 30, -135, 13),
    P(46, 32, -142, 13),
    P(-10, 30, -120, 13),
    // a straight run for the big jump (the karts fly straight, so the road must too)
    P(-34, 29.5, -140.8, 13),
    P(-54, 29.2, -138.8, 13),
    P(-74, 28.6, -136.8, 13),
    P(-94, 27.2, -134.8, 13),
    P(-114, 26.6, -132.8, 13),
    P(-130, 26, -100, 13),
    P(-132, 25, -55, 13),
    P(-112, 24, 0, 14),
    P(-60, 24, 20, 14),
  ],
  wiggles: [],
  shortcuts: [],
  // bridges from island to island over the clouds
  bridges: [
    { from: XZ(96, -12), to: XZ(140, -62), style: 'stone', margin: 0.5 },
    { from: XZ(80, -142), to: XZ(14, -130), style: 'stone', margin: 0.5 },
    { from: XZ(-86, 12), to: XZ(-30, 8), style: 'stone', margin: 0.5 },
  ],
  // the big jump between two islands (boost pad and ramp before it)
  // on a dead straight: boost pad, then the ramp ending about 5 m before the gap, a 15 m
  // gap, and the far side a little lower so karts land on it
  gaps: [{ from: XZ(-71.6, -137), to: XZ(-81.6, -136) }],
  ramps: [{ at: XZ(-62, -138), lat: 0, width: 15, length: 9, height: 2.8 }],
  patches: [],
  boostPads: [{ at: XZ(-50, -139.2), lat: 0, width: 5 }, { at: XZ(30, 0), lat: -3.5 }],
  tunnels: [],
  // the sea of clouds far below (it does not carve the islands away)
  water: [
    { id: 'clouds', poly: [XZ(-500, -60), XZ(500, -60)], width: 800, level: -2, deep: true, carve: false, color: '#ffffff' },
  ],
  itemBoxes: [
    { at: XZ(40, 0), lats: [-4.5, -1.5, 1.5, 4.5] },
    { at: XZ(142, -100), lats: [-3.5, 0, 3.5] },
    { at: XZ(-20, -125), lats: [-3.5, 0, 3.5] },
    { at: XZ(-124, -78), lats: [-3.5, 0, 3.5] },
    { at: XZ(-112, -10), lats: [-4, 0, 4] },
  ],
  obstacles: [],
  movers: [],
};
