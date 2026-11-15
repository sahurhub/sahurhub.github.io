// Haunted Hollow (Autumn). Fun, not scary: a twisty path through a misty purple forest,
// glowing pumpkins, friendly floating ghosts, a stone bridge over a bubbling swamp and a
// shortcut straight through a haunted house.
const K = 1.1;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'haunted-hollow',
  name: 'Haunted Hollow',
  season: 'autumn',
  laps: 3,
  margin: 4,
  offroad: 'grass',
  killY: -4,
  path: [
    P(0, 3, 0, 14),
    P(60, 3, 5, 14),
    P(100, 4, -25, 13),
    P(90, 5, -70, 12),
    P(50, 6, -92, 12),
    P(12, 6, -130, 12),
    P(50, 7, -172, 12),
    P(112, 8, -166, 12),
    P(150, 7, -125, 12),
    P(195, 5, -128, 12),
    P(222, 4, -90, 12),
    P(202, 4, -30, 13),
    P(172, 3, 30, 13),
    P(110, 3, 62, 13),
    P(50, 4, 42, 13),
    P(-15, 3, 65, 13),
    P(-70, 3, 48, 14),
    P(-62, 3, 0, 14),
  ],
  // extra S-bends (lap distances on the layout above)
  wiggles: [
    { from: 820, to: 930, amp: 10, waves: 1 },
    { from: 995, to: 1080, amp: 7, waves: 1 },
  ],
  shortcuts: [
    { id: 'haunted-house', from: XZ(66, -86), to: XZ(88, -170), points: [P(50, 6.2, -110, 7), P(56, 6.5, -140, 7), P(68, 7, -162, 7)], surface: 'leaves', margin: 0.8, hidden: true },
  ],
  bridges: [{ from: XZ(212, -58), to: XZ(196, -6), style: 'stone', margin: 0.5 }],
  gaps: [],
  ramps: [{ at: XZ(130, 54), lat: 0, width: 6, length: 6, height: 1.2 }],
  patches: [],
  boostPads: [{ at: XZ(30, 2), lat: 3 }, { at: XZ(80, 52), lat: -3 }],
  tunnels: [],
  water: [
    { id: 'swamp', at: XZ(206, -32), length: 140, width: 26, level: 1.3, deep: true, wiggle: 10, color: '#b06cff' },
  ],
  itemBoxes: [
    { at: XZ(40, 4), lats: [-4, -1.3, 1.3, 4] },
    { at: XZ(70, -84), lats: [-3, 0, 3] },
    { path: 'haunted-house', f: 0.5, lats: [0] },
    { at: XZ(90, -168), lats: [-3, 0, 3] },
    { at: XZ(220, -100), lats: [-3, 0, 3] },
    { at: XZ(140, 50), lats: [-4, 0, 4] },
    { at: XZ(-35, 48), lats: [-4, 0, 4] },
  ],
  obstacles: [],
  movers: [],
};
