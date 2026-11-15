// Tropical Splash (Summer). Beach road, a climb up the cliffs, a giant water slide back
// down to the sand, a wooden pier over the sea and a lagoon shortcut through the shallows.
const K = 1.15;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'tropical-splash',
  name: 'Tropical Splash',
  season: 'summer',
  laps: 3,
  margin: 5,
  offroad: 'sand',
  killY: -4,
  path: [
    P(-40, 2, 160, 16),
    P(40, 2, 165, 16),
    P(110, 2.5, 150, 15),
    P(165, 4, 110, 14),
    P(188, 9, 50, 14),
    P(172, 15, -5, 13),
    P(120, 18, -36, 13),
    P(60, 18.5, -30, 13),
    P(22, 14, 2, 13),
    P(-8, 8, 40, 13),
    P(-48, 3.5, 70, 14),
    P(-110, 2.5, 62, 15),
    P(-160, 3, 92, 15),
    P(-186, 2.5, 140, 14),
    P(-172, 2.2, 196, 13),
    P(-120, 2.2, 216, 13),
    P(-80, 2, 192, 15),
  ],
  // extra S-bends (lap distances on the layout above)
  wiggles: [
    { from: 40, to: 150, amp: 8, waves: 1 },
    { from: 230, to: 330, amp: 10, waves: 1 },
    { from: 390, to: 495, amp: 9, waves: 1 },
  ],
  shortcuts: [
    // a narrow water channel across the lagoon: the current pushes you along, but fall off
    // the edge and you land in deep water
    { id: 'lagoon', from: XZ(-115, 62), to: XZ(-184, 150), points: [P(-140, 2.05, 85, 7), P(-160, 2.05, 120, 7)], surface: 'slide', margin: 0.3 },
  ],
  bridges: [{ from: XZ(-182, 178), to: XZ(-128, 214), style: 'wood', margin: 0.5 }],
  gaps: [],
  ramps: [{ at: XZ(150, 128), lat: -3, width: 6, length: 6, height: 1.2 }],
  patches: [
    // the giant water slide down the cliff
    { from: XZ(40, -18), to: XZ(-40, 66), surface: 'slide', color: '#5fd0ff' },
  ],
  boostPads: [{ at: XZ(-112, 63), lat: -3.5 }, { at: XZ(60, 163), lat: 3 }],
  tunnels: [],
  water: [
    { id: 'sea', poly: [XZ(-420, 255), XZ(420, 255)], width: 90, level: 0.8, deep: true },
    { id: 'lagoon', x: -150 * K, z: 105 * K, r: 24, level: 1.9, deep: true, depth: 2.2 },
  ],
  itemBoxes: [
    { at: XZ(20, 163), lats: [-4.5, -1.5, 1.5, 4.5] },
    { at: XZ(185, 30), lats: [-4, 0, 4] },
    { at: XZ(90, -36), lats: [-3.5, 0, 3.5] },
    { path: 'lagoon', f: 0.55, lats: [-2, 2] },
    { at: XZ(-75, 66), lats: [-4, 0, 4] },
    { at: XZ(-150, 212), lats: [-3.5, 0, 3.5] },
  ],
  obstacles: [],
  movers: [],
};
