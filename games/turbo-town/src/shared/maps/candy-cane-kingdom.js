// Candy Cane Kingdom (Winter). An evening race through a sweet-shop town: gingerbread
// houses, giant presents to weave between, a striped bridge over the chocolate river,
// gumdrop hills and a candy-cane tunnel shortcut, all lit with twinkly lights.
const K = 1.3;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'candy-cane-kingdom',
  name: 'Candy Cane Kingdom',
  season: 'winter',
  laps: 3,
  margin: 4.5,
  offroad: 'snow',
  killY: -4,
  path: [
    P(0, 2, 0, 16),
    P(75, 2, 0, 16),
    P(130, 3, 30, 15),
    P(140, 4, 90, 14),
    P(100, 5, 130, 14),
    P(40, 5, 120, 14),
    P(0, 5, 152, 14),
    P(-40, 5, 190, 14),
    P(-100, 9, 192, 14),
    P(-172, 12, 180, 14),
    P(-180, 7, 95, 14),
    P(-140, 4, 40, 15),
    P(-90, 3, 20, 15),
    P(-40, 2, 30, 16),
  ],
  // extra S-bends (lap distances on the layout above)
  wiggles: [
    { from: 60, to: 150, amp: 8, waves: 1 },
    { from: 330, to: 430, amp: 9, waves: 1 },
    { from: 1000, to: 1080, amp: 6, waves: 1 },
  ],
  shortcuts: [
    { id: 'cane-tunnel', from: XZ(-110, 192), to: XZ(-178, 105), points: [P(-140, 10, 160, 7)], surface: 'road', margin: 0.8, hidden: true },
  ],
  bridges: [{ from: XZ(10, 140), to: XZ(-22, 175), style: 'candy', margin: 0.5 }],
  gaps: [],
  ramps: [{ at: XZ(-150, 140), lat: -3, width: 6, length: 6, height: 1.3 }],
  patches: [],
  boostPads: [{ at: XZ(40, 0), lat: 3 }, { at: XZ(-120, 28), lat: -3 }],
  tunnels: [],
  water: [
    { id: 'chocolate', at: XZ(-5, 158), length: 220, width: 22, level: 1.6, deep: true, wiggle: 12, color: '#8a4b2a' },
  ],
  itemBoxes: [
    { at: XZ(40, 0), lats: [-4.5, -1.5, 1.5, 4.5] },
    { at: XZ(140, 70), lats: [-4, 0, 4] },
    { at: XZ(60, 124), lats: [-3.5, 0, 3.5] },
    { at: XZ(-70, 192), lats: [-4, 0, 4] },
    { path: 'cane-tunnel', f: 0.5, lats: [0] },
    { at: XZ(-162, 70), lats: [-4, 0, 4] },
    { at: XZ(-70, 22), lats: [-4.5, -1.5, 1.5, 4.5] },
  ],
  // giant presents to weave between
  obstacles: [
    { at: XZ(-150, 54), lat: -3, r: 1.7, model: 'present_a' },
    { at: XZ(-128, 36), lat: 3.2, r: 1.7, model: 'present_b' },
    { at: XZ(-108, 26), lat: -2.6, r: 1.7, model: 'present_c' },
  ],
  movers: [],
};
