// Level layouts (shared by the game and the server; the server uses them to check results).
// Coordinates: metres on the ground plane (x, z). A model with rot 0 faces +z.
// Shapes: { poly: [[x,z]...] } | { circle: [x, z, r] } | { rect: [x0, z0, x1, z1] }
import { rng, hashStr } from './rng.js';

const TAU = Math.PI * 2;

export function rect(x0, z0, x1, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export function roundRect(x0, z0, x1, z1, r, seg = 4) {
  const pts = [];
  const corners = [[x1 - r, z0 + r, -Math.PI / 2], [x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI]];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= seg; i++) {
    const a = a0 + (i / seg) * (Math.PI / 2);
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

// ---------------------------------------------------------------- obstacle and prop catalogues

// Things that cost a penalty. fragile = knocked over once (then no longer solid); solid = you bounce off.
export const OBSTACLES = {
  gnome_a: { r: 0.2, fragile: true, pen: 40, msg: 'You knocked over a gnome!' },
  gnome_b: { r: 0.2, fragile: true, pen: 40, msg: 'You knocked over a gnome!' },
  toy_ball: { r: 0.16, fragile: true, pen: 15, msg: 'Bonk! You hit a ball.', kick: true },
  toy_truck: { r: 0.26, fragile: true, pen: 25, msg: 'You ran over a toy truck!' },
  toy_bucket: { r: 0.2, fragile: true, pen: 15, msg: 'You squashed the sand bucket!' },
  golf_flag: { r: 0.14, fragile: true, pen: 60, msg: 'You flattened the flag!' },
  corner_flag: { r: 0.12, fragile: true, pen: 20, msg: 'You knocked a corner flag down!' },
  pool: { r: 1.18, solid: true, pen: 50, msg: 'Splash! Mind the paddling pool.' },
  trampoline: { r: 1.38, solid: true, pen: 40, msg: 'Boing! You hit the trampoline.' },
  birdbath: { r: 0.38, solid: true, pen: 30, msg: 'You bumped the bird bath!' },
  wheelbarrow: { r: 0.55, solid: true, pen: 25, msg: 'Clang! You hit the wheelbarrow.' },
  picnic_table: { box: [1.9, 1.75], solid: true, pen: 15, msg: 'You bumped a picnic table.' },
  bench: { box: [1.7, 0.62], solid: true, pen: 15, msg: 'You bumped a bench.' },
  mailbox: { r: 0.2, solid: true, pen: 20, msg: 'You hit the mailbox!' },
  golf_cart: { box: [1.25, 2.45], solid: true, pen: 40, msg: 'You dented the golf cart!' },
};

export const TREE_PEN = { pen: 20, msg: 'Ouch! You bumped into a tree.', minSpeed: 1.0 };
export const WATER_PEN = { pen: 30, msg: 'Splash! That is the pond.' };
export const BED_PEN = { pen: 30, msg: 'You drove through the flower bed!' };
export const HOSE_PEN = { pen: 35, msg: 'You ran over the hose!' };

// Colliders for plain props (rot 0). Boxes: [cx, cz, w, d] in the model's own frame.
export const PROP_COLLIDERS = {
  tree_round: { r: 0.3, kind: 'tree' }, tree_fruit: { r: 0.26, kind: 'tree' }, tree_big: { r: 0.42, kind: 'tree' },
  tree_pine: { r: 0.3, kind: 'tree' }, tree_pine_tall: { r: 0.38, kind: 'tree' },
  bush: { r: 0.75, kind: 'bush' }, bush_flower: { r: 0.75, kind: 'bush' },
  rock_big: { r: 0.85, kind: 'rock' }, cliff: { r: 3.0, kind: 'rock' },
  house_a: { boxes: [[0, 0, 9.3, 7.3], [6.9, -0.5, 5.2, 6.2]], kind: 'wall' },
  house_b: { boxes: [[0, 0, 7.3, 5.8]], kind: 'wall' },
  shed: { boxes: [[0, 0, 2.75, 2.15]], kind: 'wall' },
  barn: { boxes: [[0, 0, 7.4, 9.4]], kind: 'wall' },
  clubhouse: { boxes: [[0, 0, 12.4, 7.4], [0, 4.6, 12.4, 2.8]], kind: 'wall' },
  stand: { boxes: [[0, -1.6, 10.4, 4.4]], kind: 'wall' },
  windmill: { r: 2.1, kind: 'wall' }, gazebo: { r: 2.25, kind: 'wall' }, fountain: { r: 1.65, kind: 'wall' },
  compost_bin: { boxes: [[0, 0, 0.95, 0.95]], kind: 'station' },
  fuel_stand: { boxes: [[0, 0, 1.1, 0.7]], kind: 'station' },
  lamp_post: { r: 0.16, kind: 'post' }, bin_park: { r: 0.32, kind: 'post' }, hose_reel: { r: 0.32, kind: 'post' },
  goal: { segs: [[-3.66, 0, -3.66, -1.8], [3.66, 0, 3.66, -1.8], [-3.66, -1.8, 3.66, -1.8]], r: 0.07, kind: 'post' },
};

// ---------------------------------------------------------------- level definitions

const L = [];

// 1. Tiny Back Garden
L.push({
  id: 'back-garden', name: 'Tiny Back Garden', short: 'Back Garden', price: 0, basePay: 50, cell: 0.1, clip: 1.0,
  desc: 'A small square of shaggy grass behind a cottage. Watch the gnome!',
  bounds: [-8.4, -8.2, 8.4, 6.4], scenery: 'suburb', stripeAxis: Math.PI / 2, patternOk: true,
  lawn: [roundRect(-7.2, -5.0, 7.2, 5.2, 0.6)],
  surfaces: [{ s: 'patio', rect: [-4.2, -7.5, 4.2, -5.0] }],
  beds: [{ rect: [5.5, -3.2, 7.2, 2.8], flowers: ['flowers_pink', 'flowers_white', 'flowers_yellow'] }],
  fences: [{ m: 'fence_rail', pts: [[-3.5, -7.55], [-7.8, -7.55], [-7.8, 5.8], [7.8, 5.8], [7.8, -7.55], [3.5, -7.55]] }],
  props: [
    { m: 'house_b', x: 0, z: -10.3 }, { m: 'tree_fruit', x: -5.0, z: -2.6, rot: 0.5 },
    { m: 'bush_flower', x: -5.4, z: -6.8 }, { m: 'bush', x: 5.4, z: -6.8 },
  ],
  obstacles: [{ type: 'gnome_a', x: 3.2, z: 1.2, rot: 0.4 }, { type: 'toy_ball', x: -2.2, z: 2.4 }],
  stations: { compost: [{ x: 6.55, z: 5.2, rot: Math.PI }], fuel: { x: -6.6, z: -6.6, rot: 0 } },
  spawn: { x: -5.6, z: 3.9, h: Math.PI / 2 },
});

// 2. Maple Street Front Lawn (the look from the user's reference picture)
L.push({
  id: 'front-lawn', name: 'Maple Street Front Lawn', short: 'Front Lawn', price: 250, basePay: 110, cell: 0.1, clip: 1.0,
  desc: 'A proper front lawn with a driveway, a hose to avoid and a nosy gnome.',
  bounds: [-12, -10, 11.4, 9.2], scenery: 'suburb', stripeAxis: Math.PI / 2, patternOk: true,
  lawn: [rect(-10.9, -8.4, 6.6, 8.1)],
  surfaces: [
    { s: 'asphalt', rect: [6.6, -9.6, 10.3, 9.4] },
    { s: 'path', rect: [1.0, -8.5, 2.3, -6.4] }, { s: 'path', rect: [2.3, -7.5, 6.6, -6.4] },
    { s: 'path', rect: [-14, 8.7, 14, 10.4] },
  ],
  beds: [
    { rect: [-2.9, -8.4, 0.9, -7.25], flowers: ['flowers_white', 'flowers_yellow'] },
    { rect: [-10.9, -6.0, -9.7, -1.0], flowers: ['flowers_pink', 'flowers_purple', 'flowers_red'] },
  ],
  fences: [
    { m: 'fence_rail', pts: [[-3.0, -8.55], [-11.4, -8.55], [-11.4, 8.5]] },
    { m: 'fence_picket', pts: [[-11.4, 8.5], [10.65, 8.5]] },
    { m: 'fence_rail', pts: [[10.65, 8.5], [10.65, -9.55]] },
  ],
  props: [
    { m: 'house_a', x: 1.5, z: -12.0 }, { m: 'tree_big', x: -7.2, z: 4.4, rot: 1.2 }, { m: 'tree_round', x: 3.6, z: 5.2, rot: 2 },
    { m: 'bush', x: -3.6, z: -9.2 }, { m: 'hose_reel', x: -3.3, z: -7.95, rot: 0.3 },
  ],
  obstacles: [
    { type: 'gnome_b', x: -4.4, z: 1.4, rot: -0.6 }, { type: 'toy_truck', x: 0.6, z: 3.8, rot: 1.0 },
    { type: 'birdbath', x: -1.4, z: -3.0 }, { type: 'mailbox', x: 6.25, z: 7.7, rot: Math.PI / 2 },
  ],
  hoses: [[[-3.5, -7.6], [-4.6, -5.6], [-6.8, -4.7], [-7.6, -2.2], [-6.3, 0.4]]],
  stations: { compost: [{ x: -10.75, z: 7.75, rot: Math.PI / 2 }], fuel: { x: 9.7, z: -8.75, rot: -Math.PI / 2 } },
  spawn: { x: 8.4, z: 4.0, h: -Math.PI / 2 },
});

// 3. Cottage on the Hill
L.push({
  id: 'cottage-hill', name: 'Cottage on the Hill', short: 'Cottage Hill', price: 900, basePay: 220, cell: 0.1, clip: 1.0,
  desc: 'Bumpy, sloping garden full of toys, a paddling pool and tight gaps between trees.',
  bounds: [-14.4, -12.8, 14.4, 11.9], scenery: 'country', stripeAxis: Math.PI / 2,
  hills: [{ x: 5, z: 1, r: 6, h: 1.4 }, { x: -8, z: 6, r: 5, h: 0.9 }], tilt: [0, 0.06],
  lawn: [roundRect(-13, -10.6, 13, 10.5, 2.0)],
  surfaces: [{ s: 'patio', rect: [-8.5, -12.3, -1.5, -10.6] }],
  beds: [
    { circle: [9.2, 6.8, 1.5], flowers: ['flowers_red', 'flowers_yellow'] },
    { rect: [-12.6, -9.6, -10.4, -7.6], flowers: ['flowers_purple', 'flowers_white'] },
  ],
  fences: [{ m: 'fence_rail', pts: [[-8.5, -12.3], [-13.8, -12.3], [-13.8, 11.3], [13.8, 11.3], [13.8, -12.3], [-1.5, -12.3]] }],
  props: [
    { m: 'house_b', x: -5, z: -15.05 }, { m: 'shed', x: 11.8, z: -10.9 },
    { m: 'tree_round', x: -6.0, z: 1.5, rot: 0.3 }, { m: 'tree_round', x: -3.6, z: 2.9, rot: 1.9 },
    { m: 'tree_fruit', x: -7.3, z: 4.3, rot: 0.9 }, { m: 'tree_round', x: -4.8, z: 5.7, rot: 2.8 },
    { m: 'hose_reel', x: -1.0, z: -11.65 }, { m: 'bush_flower', x: 12.6, z: 9.8 },
  ],
  obstacles: [
    { type: 'pool', x: 6.2, z: -5.0 }, { type: 'trampoline', x: -8.5, z: -5.4 },
    { type: 'gnome_a', x: -0.8, z: -2.5, rot: 0.2 }, { type: 'gnome_b', x: 10.4, z: -5.4, rot: -1 },
    { type: 'toy_bucket', x: 2.2, z: 6.2 }, { type: 'toy_ball', x: 8.4, z: 3.5 },
    { type: 'wheelbarrow', x: -10.5, z: 8.4, rot: 0.8 },
  ],
  hoses: [[[-1.0, -11.2], [0.0, -8.0], [1.6, -5.2], [1.0, -2.0], [2.6, 0.8]]],
  stations: { compost: [{ x: -12.95, z: 10.3, rot: Math.PI / 2 }], fuel: { x: 9.3, z: -11.4, rot: 0 } },
  spawn: { x: -8.4, z: -9.3, h: Math.PI / 2 },
});

// 4. Hillside Orchard (rows of fruit trees = tight gaps)
const orchardTrees = [];
for (let row = 0; row < 4; row++) {
  const z = -7 + row * 4.7;
  const off = row % 2 ? 1.75 : 0;
  for (let i = 0; i < 7; i++) {
    const x = -10.5 + i * 3.5 + off;
    if (x > 12) continue;
    orchardTrees.push({ m: 'tree_fruit', x, z, rot: (i * 1.7 + row) % TAU, s: 0.9 + ((i + row) % 3) * 0.08 });
  }
}
L.push({
  id: 'orchard', name: 'Hillside Orchard', short: 'Orchard', price: 1800, basePay: 330, cell: 0.1, clip: 1.0,
  desc: 'Rows and rows of apple trees on a hill. Steer carefully through the gaps.',
  bounds: [-16.4, -13.4, 16.4, 13.4], scenery: 'country', stripeAxis: Math.PI / 2,
  hills: [{ x: 0, z: 0, r: 10, h: 1.8 }], tilt: [0.04, 0],
  lawn: [roundRect(-15, -12, 15, 12, 1.5)],
  surfaces: [],
  beds: [],
  fences: [{ m: 'fence_rail', pts: [[-15.8, -12.8], [15.8, -12.8], [15.8, 12.8], [-15.8, 12.8], [-15.8, -12.8]] }],
  props: [...orchardTrees, { m: 'barn', x: 0, z: -20 }, { m: 'hose_reel', x: -15.25, z: 0.6, rot: Math.PI / 2 }],
  obstacles: [
    { type: 'gnome_a', x: 5.25, z: -4.6, rot: 2 }, { type: 'wheelbarrow', x: -5.2, z: 4.7, rot: 1.4 },
    { type: 'toy_ball', x: 9.0, z: 9.5 }, { type: 'gnome_b', x: 12.4, z: -9.6, rot: -0.6 },
  ],
  hoses: [[[-14.9, 0.6], [-12.0, 0.2], [-9.0, 0.9], [-7.5, 0.4]]],
  stations: { compost: [{ x: 14.6, z: 11.55, rot: -Math.PI / 2 }], fuel: { x: -14.6, z: -11.55, rot: Math.PI / 2 } },
  spawn: { x: -12.0, z: -10.6, h: Math.PI / 2 },
});

// 5. Village Park
const parkBenches = [];
for (let i = 0; i < 4; i++) {
  const a = Math.PI / 4 + i * (Math.PI / 2);
  parkBenches.push({ type: 'bench', x: Math.cos(a) * 4.0, z: Math.sin(a) * 4.0, rot: -a - Math.PI / 2 });
}
L.push({
  id: 'village-park', name: 'Village Park', short: 'Park', price: 4000, basePay: 650, cell: 0.15, clip: 0.8,
  desc: 'Four big lawns around a fountain, with a pond, a gazebo and picnic tables.',
  bounds: [-24, -17, 24, 17], scenery: 'park', stripeAxis: Math.PI / 2, recommend: 'rideon', patternOk: true,
  hills: [{ x: -15, z: 9, r: 7, h: 0.9 }, { x: 13, z: 7, r: 8, h: 0.7 }],
  lawn: [roundRect(-22, -15, 22, 15, 3)],
  surfaces: [
    { s: 'path', rect: [-23, -1.2, 23, 1.2] }, { s: 'path', rect: [-1.2, -16, 1.2, 16] }, { s: 'path', circle: [0, 0, 5] },
    { s: 'water', circle: [-12, -8, 3.4] },
  ],
  beds: [
    { circle: [5.8, -5.6, 1.5], flowers: ['flowers_red', 'flowers_yellow', 'flowers_white'] },
    { rect: [6.5, 3.5, 15.5, 5.2], flowers: ['flowers_pink', 'flowers_purple', 'flowers_white', 'flowers_yellow'] },
  ],
  water: [{ circle: [-12, -8, 3.25] }],
  fences: [{ m: 'fence_rail', pts: [[-23.2, -16.2], [23.2, -16.2], [23.2, 16.2], [-23.2, 16.2], [-23.2, -16.2]] }],
  props: [
    { m: 'fountain', x: 0, z: 0 }, { m: 'gazebo', x: 12, z: -8, rot: 0.4 },
    { m: 'tree_big', x: -18, z: -11, rot: 1 }, { m: 'tree_pine', x: -19, z: -3.5 }, { m: 'tree_round', x: -5.5, z: -11.5, rot: 2 },
    { m: 'tree_round', x: 18.5, z: -11.5, rot: 0.5 }, { m: 'tree_round', x: 17.5, z: -3.5, rot: 1.5 },
    { m: 'tree_big', x: -6.5, z: 10.5, rot: 2.2 }, { m: 'tree_pine_tall', x: -19.5, z: 12 },
    { m: 'tree_round', x: 5.5, z: 11.5, rot: 0.2 }, { m: 'tree_round', x: 19, z: 8, rot: 2.9 }, { m: 'tree_big', x: 14, z: 12, rot: 0.7 },
    { m: 'rock_big', x: -8.3, z: -5.6, rot: 0.6 }, { m: 'reeds', x: -14.8, z: -6.4 }, { m: 'reeds', x: -9.4, z: -10.2 }, { m: 'reeds', x: -12.8, z: -11.2 },
    { m: 'lamp_post', x: 3.6, z: -3.6 }, { m: 'lamp_post', x: -3.6, z: 3.6 }, { m: 'bin_park', x: 3.4, z: 3.4 },
    { m: 'lamp_post', x: -12, z: 1.6 }, { m: 'lamp_post', x: 12, z: -1.6 }, { m: 'lamp_post', x: 1.6, z: 11 }, { m: 'lamp_post', x: -1.6, z: -11 },
    { m: 'shed', x: 18.6, z: 18.8, rot: Math.PI },
  ],
  obstacles: [
    ...parkBenches,
    { type: 'picnic_table', x: -12, z: 7, rot: 0.2 }, { type: 'picnic_table', x: -16, z: 11, rot: -0.3 },
    { type: 'toy_ball', x: -9.5, z: 3.8 },
  ],
  stations: {
    compost: [{ x: -22.45, z: 14.55, rot: Math.PI / 2 }, { x: 22.45, z: -14.55, rot: -Math.PI / 2 }],
    fuel: { x: 20.3, z: 15.6, rot: Math.PI },
  },
  spawn: { x: -7.0, z: 2.3, h: -Math.PI / 2 },
});

// 6. Sports Field
L.push({
  id: 'sports-field', name: 'Oakwood Sports Field', short: 'Sports Field', price: 9000, basePay: 1100, cell: 0.15, clip: 0.6,
  desc: 'A football pitch that has to look perfect for Saturday. Straight stripes earn big bonuses.',
  bounds: [-25.5, -17.5, 25.5, 17.5], scenery: 'sports', stripeAxis: 0, recommend: 'zeroturn', patternOk: true, pitch: [44, 28],
  lawn: [rect(-24, -16, 24, 16)],
  surfaces: [],
  beds: [],
  fences: [{ m: 'fence_picket', pts: [[-25, -17], [25, -17], [25, 17], [-25, 17], [-25, -17]] }],
  props: [
    { m: 'goal', x: 22, z: 0, rot: -Math.PI / 2 }, { m: 'goal', x: -22, z: 0, rot: Math.PI / 2 },
    { m: 'stand', x: 0, z: -21.2 }, { m: 'lamp_post', x: -26.5, z: -18.5 }, { m: 'lamp_post', x: 26.5, z: -18.5 },
  ],
  obstacles: [
    { type: 'corner_flag', x: 22, z: 14 }, { type: 'corner_flag', x: -22, z: 14 },
    { type: 'corner_flag', x: 22, z: -14 }, { type: 'corner_flag', x: -22, z: -14 },
  ],
  stations: {
    compost: [{ x: -24.45, z: 16.45, rot: Math.PI / 2 }, { x: 24.45, z: -16.45, rot: -Math.PI / 2 }],
    fuel: { x: 24.45, z: 16.45, rot: -Math.PI / 2 },
  },
  spawn: { x: -20, z: -15.0, h: Math.PI / 2 },
});

// 7. Golf course hole
const golfTrees = [];
{
  const r = rng(hashStr('golf-trees'));
  const lines = [
    [[-36, 17], [-10, 15], [10, 11], [26, 9], [46, 8]],
    [[-36, -2], [-14, -4], [2, -9], [16, -15], [30, -21], [46, -20]],
  ];
  for (const line of lines) for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const n = Math.round(Math.hypot(bx - ax, bz - az) / 4.5);
    for (let k = 0; k < n; k++) {
      const t = (k + r() * 0.5) / n;
      golfTrees.push({ m: r() < 0.55 ? 'tree_pine_tall' : (r() < 0.5 ? 'tree_round' : 'tree_big'), x: ax + (bx - ax) * t + (r() - 0.5) * 2, z: az + (bz - az) * t + (r() - 0.5) * 2, rot: r() * TAU });
    }
  }
}
L.push({
  id: 'golf-course', name: 'Fairway Golf Club - Hole 7', short: 'Golf Course', price: 18000, basePay: 1700, cell: 0.2, clip: 0.5,
  desc: 'Mow the tee, the long fairway and the green. Miss the bunkers, the pond and the flag.',
  bounds: [-47, -23, 48, 21], scenery: 'golf', stripeAxis: Math.PI / 2, recommend: 'zeroturn',
  hills: [{ x: -10, z: -4, r: 10, h: 1.5 }, { x: 20, z: 12, r: 9, h: 2 }, { x: 30, z: -18, r: 8, h: 1.2 }, { x: -24, z: 8, r: 7, h: 0.8 }],
  lawn: [
    [[-34, 3], [-10, 1], [6, -3], [22, -9], [28, -13], [34, -14.5], [42, -12], [44.5, -5], [41, 1.5], [30, 4], [20, 3.5], [8, 6], [-8, 9.5], [-34, 12.5]],
    rect(-42, 4.5, -34, 11),
  ],
  surfaces: [
    { s: 'sand', circle: [13, 0.8, 2.1] }, { s: 'sand', circle: [31, -1.8, 1.9] }, { s: 'sand', circle: [40.5, -13.2, 1.8] },
    { s: 'water', circle: [2, 12.5, 4.6] }, { s: 'path', rect: [-46, -12, -30, -9] },
  ],
  water: [{ circle: [2, 12.5, 4.45] }],
  beds: [],
  fences: [{ m: 'hedge', pts: [[-46, -21.5], [47, -21.5], [47, 19.5], [-46, 19.5], [-46, -21.5]] }],
  props: [
    ...golfTrees, { m: 'clubhouse', x: -38, z: -16 }, { m: 'reeds', x: -1.5, z: 9.6 }, { m: 'reeds', x: 5.6, z: 10.2 },
    { m: 'bench', x: -40, z: 2.6, rot: Math.PI },
  ],
  obstacles: [{ type: 'golf_flag', x: 38.6, z: -6.2 }, { type: 'golf_cart', x: -36.5, z: 14.5, rot: 0.5 }],
  stations: {
    compost: [{ x: -30, z: 15, rot: Math.PI }, { x: 45.2, z: 4.6, rot: Math.PI }],
    fuel: { x: -30, z: -8.2, rot: 0 },
  },
  spawn: { x: -39.5, z: 7.8, h: Math.PI / 2 },
});

export const LEVELS = Object.fromEntries(L.map((l) => [l.id, l]));
export const LEVEL_IDS = L.map((l) => l.id);

// ---------------------------------------------------------------- terrain

export function heightAt(level, x, z) {
  let h = 0;
  if (level.tilt) h += level.tilt[0] * x + level.tilt[1] * z;
  if (level.hills) for (const k of level.hills) {
    const dx = x - k.x, dz = z - k.z;
    h += k.h * Math.exp(-(dx * dx + dz * dz) / (k.r * k.r));
  }
  return h;
}

// slope along a direction (rise per metre)
export function slopeAlong(level, x, z, dx, dz) {
  const e = 0.5;
  return (heightAt(level, x + dx * e, z + dz * e) - heightAt(level, x - dx * e, z - dz * e)) / (2 * e);
}

// ---------------------------------------------------------------- geometry helpers

export function pointInPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t - px, cz = az + dz * t - pz;
  return Math.sqrt(cx * cx + cz * cz);
}

export function shapePoly(sh) {
  if (sh.poly) return sh.poly;
  if (sh.rect) return rect(...sh.rect);
  return null;
}

export function shapeContains(sh, x, z, grow = 0) {
  if (sh.circle) {
    const [cx, cz, r] = sh.circle;
    return (x - cx) ** 2 + (z - cz) ** 2 <= (r + grow) ** 2;
  }
  const p = shapePoly(sh);
  if (pointInPoly(p, x, z)) return true;
  if (grow <= 0) return false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if (distToSeg(x, z, p[j][0], p[j][1], p[i][0], p[i][1]) <= grow) return true;
  return false;
}

export function shapeBounds(sh, grow = 0) {
  if (sh.circle) { const [x, z, r] = sh.circle; return [x - r - grow, z - r - grow, x + r + grow, z + r + grow]; }
  const p = shapePoly(sh);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of p) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return [x0 - grow, z0 - grow, x1 + grow, z1 + grow];
}

// solid collider tests: { t:'circle', x, z, r } | { t:'box', x, z, hw, hd, c, s } | { t:'seg', x1, z1, x2, z2, r }
export function solidDist(s, x, z) {
  if (s.t === 'circle') return Math.hypot(x - s.x, z - s.z) - s.r;
  if (s.t === 'seg') return distToSeg(x, z, s.x1, s.z1, s.x2, s.z2) - s.r;
  // box: rotate the point into the box frame
  const dx = x - s.x, dz = z - s.z;
  const lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
  const qx = Math.abs(lx) - s.hw, qz = Math.abs(lz) - s.hd;
  const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0);
}

export function solidBounds(s, grow = 0) {
  if (s.t === 'circle') return [s.x - s.r - grow, s.z - s.r - grow, s.x + s.r + grow, s.z + s.r + grow];
  if (s.t === 'seg') return [Math.min(s.x1, s.x2) - s.r - grow, Math.min(s.z1, s.z2) - s.r - grow, Math.max(s.x1, s.x2) + s.r + grow, Math.max(s.z1, s.z2) + s.r + grow];
  const e = Math.abs(s.hw * s.c) + Math.abs(s.hd * s.s) + grow, f = Math.abs(s.hw * s.s) + Math.abs(s.hd * s.c) + grow;
  return [s.x - e, s.z - f, s.x + e, s.z + f];
}

// model-local (x, z) -> world, for a prop at (px, pz) rotated by rot (three.js rotation.y)
function toWorld(px, pz, rot, lx, lz) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [px + lx * c + lz * s, pz - lx * s + lz * c];
}

function makeBox(x, z, w, d, rot) {
  // solidDist turns world offsets into the box's own frame with these (inverse of toWorld)
  return { t: 'box', x, z, hw: w / 2, hd: d / 2, c: Math.cos(rot), s: Math.sin(rot) };
}

// ---------------------------------------------------------------- compile

const cache = new Map();

// Expand a level definition into everything the game and server need:
// solids, fragile obstacles, penalty zones, props to draw, station zones.
export function compileLevel(id) {
  if (cache.has(id)) return cache.get(id);
  const def = LEVELS[id];
  if (!def) throw new Error('Unknown level ' + id);
  const R = rng(hashStr(id));
  const solids = [], fragile = [], zones = [], props = [];
  let oid = 0;

  const addCollider = (m, x, z, rot = 0, s = 1, extra = {}) => {
    const c = PROP_COLLIDERS[m];
    if (!c) return;
    if (c.r && !c.segs) solids.push({ t: 'circle', x, z, r: c.r * s, kind: c.kind, ...(c.kind === 'tree' ? TREE_PEN : {}), ...extra });
    if (c.boxes) for (const [bx, bz, w, d] of c.boxes) {
      const [wx, wz] = toWorld(x, z, rot, bx, bz);
      solids.push({ ...makeBox(wx, wz, w * s, d * s, rot), kind: c.kind, ...extra });
    }
    if (c.segs) for (const [ax, az, bx, bz] of c.segs) {
      const [x1, z1] = toWorld(x, z, rot, ax, az), [x2, z2] = toWorld(x, z, rot, bx, bz);
      solids.push({ t: 'seg', x1, z1, x2, z2, r: c.r, kind: c.kind, ...extra });
    }
  };

  for (const p of def.props || []) {
    props.push({ m: p.m, x: p.x, z: p.z, rot: p.rot || 0, s: p.s || 1 });
    addCollider(p.m, p.x, p.z, p.rot || 0, p.s || 1);
  }

  // fences: 2 m pieces along each polyline
  for (const f of def.fences || []) {
    const pieceLen = 2;
    const r = f.m === 'hedge' ? 0.42 : 0.1;
    for (let i = 0; i < f.pts.length - 1; i++) {
      const [ax, az] = f.pts[i], [bx, bz] = f.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / pieceLen));
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const rot = Math.atan2(-dz, dx);
      for (let k = 0; k < n; k++) {
        const t = ((k + 0.5) / n) * len;
        props.push({ m: f.m, x: ax + dx * t, z: az + dz * t, rot, s: 1, sx: len / n / pieceLen, fence: true });
      }
      solids.push({ t: 'seg', x1: ax, z1: az, x2: bx, z2: bz, r, kind: 'fence' });
    }
    if (f.m !== 'hedge') {
      const last = f.pts[f.pts.length - 1];
      const post = f.m === 'fence_picket' ? 'fence_post_white' : 'fence_post';
      props.push({ m: post, x: last[0], z: last[1], rot: 0, s: 1 });
    }
  }

  // obstacles
  for (const o of def.obstacles || []) {
    const t = OBSTACLES[o.type];
    const rot = o.rot || 0;
    const ob = { id: oid++, type: o.type, x: o.x, z: o.z, rot, pen: t.pen, msg: t.msg };
    props.push({ m: o.type, x: o.x, z: o.z, rot, s: 1, obstacle: ob.id });
    if (t.fragile) fragile.push({ ...ob, r: t.r, kick: !!t.kick });
    else if (t.box) solids.push({ ...makeBox(o.x, o.z, t.box[0], t.box[1], rot), kind: 'obstacle', pen: t.pen, msg: t.msg, obstacle: ob.id });
    else solids.push({ t: 'circle', x: o.x, z: o.z, r: t.r, kind: 'obstacle', pen: t.pen, msg: t.msg, obstacle: ob.id });
  }

  // water (solid, small penalty)
  for (const w of def.water || []) {
    const [x, z, r] = w.circle;
    solids.push({ t: 'circle', x, z, r, kind: 'water', ...WATER_PEN });
  }

  // hoses: penalty zones (not solid) + pieces to draw
  for (const h of def.hoses || []) {
    for (let i = 0; i < h.length - 1; i++) {
      const [ax, az] = h[i], [bx, bz] = h[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 1.0));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const x1 = ax + (bx - ax) * t0, z1 = az + (bz - az) * t0, x2 = ax + (bx - ax) * t1, z2 = az + (bz - az) * t1;
        props.push({ m: 'hose_seg', x: (x1 + x2) / 2, z: (z1 + z2) / 2, rot: Math.atan2(x2 - x1, z2 - z1), s: 1, sz: (len / n) / 1.04, hose: true });
      }
    }
    zones.push({ kind: 'hose', pts: h, r: 0.18, ...HOSE_PEN });
  }

  // flower beds: soil surface + flowers + penalty zone
  const surfaces = [...(def.surfaces || [])];
  for (const b of def.beds || []) {
    const sh = b.circle ? { circle: b.circle } : { rect: b.rect };
    surfaces.push({ s: 'soil', ...sh });
    zones.push({ kind: 'bed', shape: sh, ...BED_PEN });
    const [x0, z0, x1, z1] = shapeBounds(sh);
    const step = 0.62;
    let fi = 0;
    for (let z = z0 + step / 2; z < z1; z += step) for (let x = x0 + step / 2; x < x1; x += step) {
      const jx = x + (R() - 0.5) * 0.25, jz = z + (R() - 0.5) * 0.25;
      if (!shapeContains(sh, jx, jz, -0.1)) continue;
      props.push({ m: b.flowers[fi++ % b.flowers.length], x: jx, z: jz, rot: R() * TAU, s: 0.85 + R() * 0.35, flower: true });
    }
  }

  // stations: the bin/stand plus a zone in front of it where you stop to empty / refuel
  const st = def.stations || {};
  const stationZones = { compost: [], fuel: [] };
  for (const c of st.compost || []) {
    props.push({ m: 'compost_bin', x: c.x, z: c.z, rot: c.rot || 0, s: 1, station: 'compost' });
    addCollider('compost_bin', c.x, c.z, c.rot || 0);
    stationZones.compost.push({ x: c.x + Math.sin(c.rot || 0) * 1.45, z: c.z + Math.cos(c.rot || 0) * 1.45 });
  }
  if (st.fuel) {
    const f = st.fuel;
    props.push({ m: 'fuel_stand', x: f.x, z: f.z, rot: f.rot || 0, s: 1, station: 'fuel' });
    addCollider('fuel_stand', f.x, f.z, f.rot || 0);
    stationZones.fuel.push({ x: f.x + Math.sin(f.rot || 0) * 1.45, z: f.z + Math.cos(f.rot || 0) * 1.45 });
  }

  const out = { ...def, solids, fragile, zones, props, surfaces, stationZones };
  cache.set(id, out);
  return out;
}
