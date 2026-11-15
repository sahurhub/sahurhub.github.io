// Blossom Valley (Spring). Shared layout data: used by the game and the server.
// Path points are [x, y, z, roadWidth]. Places can be given as lap distance (number)
// or as a map position [x, z], which is turned into the nearest lap distance.
export default {
  id: 'blossom-valley',
  name: 'Blossom Valley',
  season: 'spring',
  laps: 3,
  margin: 5,          // off-road strip on each side of the road before the edge
  offroad: 'grass',
  killY: -4,
  path: [
    [-54, 2, 0, 16],
    [18, 2, 0, 16],
    [81, 2.5, -5, 16],
    [126, 4, -27, 15],
    [164, 7.5, -59, 14],
    [209, 11, -67, 14],
    [239, 13, -38, 14],
    [243, 12, 5, 14],
    [220, 9, 43, 14],
    [184, 6.5, 74, 14],
    [158, 5, 112, 14],
    [149, 4.5, 158, 14],
    [126, 4, 200, 14],
    [86, 3.6, 223, 14],
    [41, 4, 229, 13],
    [0, 4.6, 230, 12],
    [-41, 4, 229, 13],
    [-86, 3.2, 220, 14],
    [-126, 2.5, 196, 15],
    [-157, 2, 160, 15],
    [-171, 3, 115, 14],
    [-167, 4, 72, 14],
    [-149, 3, 36, 15],
    [-113, 2.5, 7, 16],
  ],
  // extra S-bends (lap distances on the layout above; see buildTrack in track-math.js)
  wiggles: [
    { from: 325, to: 430, amp: 9, waves: 1 },
    { from: 495, to: 650, amp: 12, waves: 1 },
    { from: 770, to: 848, amp: 6, waves: 1 },
  ],
  shortcuts: [
    {
      id: 'flower-field',
      from: [135, -34], to: [191, 67],
      points: [[170, 6.5, -20, 8], [158, 7, 10, 8], [185, 7, 32, 8]],
      surface: 'grass', margin: 1.5,
    },
  ],
  // wooden bridge over the river (edges move in to the railings)
  bridges: [{ from: 714, to: 760, style: 'wood' }],
  // no road over the creek: jump it from the ramp, or splash through
  gaps: [{ from: 880, to: 888 }],
  ramps: [{ s: 866, lat: 0, width: 7, length: 7, height: 1.6 }],
  boostPads: [{ s: 470, lat: -3.5 }, { s: 856, lat: 0 }],
  tunnels: [{ from: 990, to: 1032, style: 'flowers' }],
  water: [
    { id: 'river', cross: 737, length: 210, width: 20, level: 0.6, deep: true, wiggle: 9 },
    { id: 'creek', cross: 884, length: 90, width: 6, level: 1.25, deep: false, depth: 0.9, wiggle: 3 },
    { id: 'pond', x: 70, z: 120, r: 26, level: 1.2, deep: true },
  ],
  itemBoxes: [
    { s: 110, lats: [-4.5, -1.5, 1.5, 4.5] },
    { s: 300, lats: [-3, 0, 3] },
    { path: 'flower-field', f: 0.5, lats: [0] },
    { s: 560, lats: [-4, 0, 4] },
    { s: 792, lats: [-3, 0, 3] },
    { s: 906, lats: [-4.5, -1.5, 1.5, 4.5] },
    { s: 1046, lats: [-3, 0, 3] },
  ],
};
