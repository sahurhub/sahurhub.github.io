// Neon Nights (Thrill Cup). A street race through the city at night: neon signs and lit
// windows, a long tunnel, a bridge over the river, and a shortcut down the market alley.
const K = 1.38;
const P = (x, y, z, w) => [x * K, y, z * K, w];
const XZ = (x, z) => [x * K, z * K];

export default {
  id: 'neon-nights',
  name: 'Neon Nights',
  season: 'thrill',
  laps: 3,
  margin: 4,
  offroad: 'dirt',
  killY: -4,
  path: [
    P(0, 3, 0, 16),
    P(90, 3, 0, 16),
    P(142, 3, -20, 14),
    P(152, 3, -80, 14),
    P(122, 3, -122, 13),
    P(62, 3, -120, 13),
    P(30, 3, -88, 13),
    P(-20, 3, -100, 13),
    P(-70, 3, -132, 13),
    P(-130, 3, -112, 14),
    P(-152, 3, -52, 14),
    P(-122, 6, 0, 14),
    P(-60, 4, 20, 15),
  ],
  wiggles: [
    { from: 30, to: 120, amp: 5, waves: 2 },
  ],
  shortcuts: [
    // the market alley: straight past the noodle stalls while the main road loops north
    { id: 'alley', from: XZ(62, -120), to: XZ(-70, -132), points: [P(20, 3, -132, 7), P(-25, 3, -136, 7)], surface: 'road', margin: 0.8 },
  ],
  bridges: [{ from: XZ(-148, -40), to: XZ(-130, -8), style: 'stone', margin: 0.5 }],
  gaps: [],
  ramps: [],
  patches: [],
  boostPads: [{ at: XZ(40, 0), lat: -3.5 }, { at: XZ(-100, 14), lat: 3 }],
  tunnels: [{ from: XZ(152, -60), to: XZ(132, -112), style: 'city' }],
  water: [
    { id: 'river', at: XZ(-138, -25), length: 220, width: 18, level: 0.8, deep: true, wiggle: 6, color: '#1a2a5a' },
  ],
  itemBoxes: [
    { at: XZ(55, 0), lats: [-5, -1.7, 1.7, 5] },
    { at: XZ(150, -45), lats: [-3.5, 0, 3.5] },
    { at: XZ(45, -105), lats: [-3, 0, 3] },
    { path: 'alley', f: 0.5, lats: [0] },
    { at: XZ(-110, -122), lats: [-3.5, 0, 3.5] },
    { at: XZ(-90, 12), lats: [-4, 0, 4] },
  ],
  obstacles: [],
  movers: [],
};
