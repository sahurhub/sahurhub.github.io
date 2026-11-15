// Pumpkin Patch (Autumn). Farm roads lined with hay bales, a drive right through the big
// red barn, a chicane between giant pumpkins, muddy puddles, leafy lanes under the orange
// trees and a hidden path through the cornfield.
const K = 1.17;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'pumpkin-patch',
  name: 'Pumpkin Patch',
  season: 'autumn',
  laps: 3,
  margin: 4.5,
  offroad: 'dirt',
  killY: -4,
  path: [
    P(0, 2, 0, 16),
    P(80, 2, 0, 16),
    P(140, 3, -20, 15),
    P(172, 5, -70, 14),
    P(152, 8, -120, 14),
    P(100, 9, -142, 14),
    P(40, 7, -122, 14),
    P(10, 4, -84, 13),
    P(-30, 3, -98, 13),
    P(-70, 3, -76, 13),
    P(-110, 3, -98, 14),
    P(-160, 4, -82, 15),
    P(-182, 3, -20, 15),
    P(-150, 2, 30, 16),
    P(-80, 2, 30, 16),
  ],
  // extra S-bends (lap distances on the layout above)
  wiggles: [
    { from: 55, to: 150, amp: 9, waves: 1 },
    { from: 190, to: 310, amp: 12, waves: 1 },
    { from: 925, to: 1000, amp: 5.5, waves: 1 },
  ],
  shortcuts: [
    { id: 'cornfield', from: XZ(-150, -86), to: XZ(-120, 32), points: [P(-158, 3.5, -45, 7), P(-140, 3, -5, 7)], surface: 'dirt', margin: 1, hidden: true },
  ],
  bridges: [],
  gaps: [],
  ramps: [{ at: XZ(-176, -56), lat: 0, width: 7, length: 6, height: 1.3 }],
  patches: [
    { from: XZ(-8, -92), to: XZ(-24, -100), lat0: -6.5, lat1: 0, surface: 'mud', color: '#9a6232' },
    { from: XZ(-60, -76), to: XZ(-76, -78), lat0: 0, lat1: 6.5, surface: 'mud', color: '#9a6232' },
    { from: XZ(110, -4), to: XZ(140, -20), surface: 'leaves', color: '#ffa04a' },
  ],
  boostPads: [{ at: XZ(40, 0), lat: -3.5 }, { at: XZ(60, -132), lat: 3.5 }],
  // the barn the road runs through
  tunnels: [{ from: XZ(140, -128), to: XZ(118, -138), style: 'barn' }],
  water: [{ id: 'duck-pond', x: 60 * K, z: -60 * K, r: 22, level: 1.0, deep: true }],
  itemBoxes: [
    { at: XZ(40, 0), lats: [-4.5, -1.5, 1.5, 4.5] },
    { at: XZ(168, -60), lats: [-4, 0, 4] },
    { at: XZ(60, -136), lats: [-4, 0, 4] },
    { at: XZ(-50, -88), lats: [-3.5, 0, 3.5] },
    { path: 'cornfield', f: 0.5, lats: [0] },
    { at: XZ(-182, -10), lats: [-4, 0, 4] },
    { at: XZ(-110, 30), lats: [-4.5, -1.5, 1.5, 4.5] },
  ],
  // giant pumpkins in the chicane
  obstacles: [
    { at: XZ(-12, -88), lat: 3.2, r: 2.0, model: 'giant_pumpkin' },
    { at: XZ(-48, -90), lat: -3.4, r: 2.0, model: 'giant_pumpkin' },
    { at: XZ(-92, -88), lat: 3.0, r: 2.0, model: 'giant_pumpkin' },
  ],
  movers: [],
};
