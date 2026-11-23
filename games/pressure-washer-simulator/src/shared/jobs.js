// The six jobs. Coordinates are game (three.js) coordinates: x = Blender x, z = -Blender y.
// objects: settings for each washable object (w_<id> in the GLB):
//   name, dirtTint (colour of the grime), grime (0.5..1 base thickness), reachTop (tops above this are left clean),
//   hideNormals (sides facing these directions are left out: they face a wall),
//   layer = stubborn layer: { kind: 'moss' | 'oil' | 'graffiti', ... } (needs detergent or pressure level 2)
export const JOBS = [
  {
    id: 'driveway', n: 1, file: 'models/job1.glb', icon: 'car', colors: ['#ff8a5c', '#d9482f'],
    name: "Brenda's Driveway", client: 'Brenda, 14 Elm Close',
    quip: "The car hasn't moved since the Jubilee and the pigeons have noticed. The drive's not much better.",
    par: 300, pay: 150, seed: 11, reachTop: 1.6,
    hideCols: ['col_2', 'col_3'], // car and bin (job1.glb was exported before the "h" marker existed)
    objects: {
      w_drive: { name: 'Block paving', dirtTint: '#6d5d48', layer: { kind: 'oil', spots: [[2.2, -4.6, 0.55], [4.3, -5.0, 0.32], [1.2, 1.4, 0.28]] } },
      w_car: { name: 'Little red car', dirtTint: '#7a6a52' },
      w_garage: { name: 'Garage door', dirtTint: '#6a6450', hideNormals: [[1, 0, 0], [-1, 0, 0], [0, 0, -1]] },
      w_bin: { name: 'Wheelie bin', dirtTint: '#4f4636' },
    },
  },
  {
    id: 'patio', n: 2, file: 'models/job2.glb', icon: 'patio', colors: ['#7bd36a', '#2f8e4a'],
    name: 'Patio Paradise', client: 'Ruth, The Laurels',
    quip: "I've not seen the patio since 2019. I think there's a table under the moss somewhere.",
    par: 330, pay: 220, seed: 23, reachTop: 1.6,
    objects: {
      w_patio: { name: 'Patio slabs', dirtTint: '#5d5a40', layerTint: '#7da24a', layer: { kind: 'moss', amount: 0.45, scale: 1.5 } },
      w_fence: { name: 'Fence', dirtTint: '#5a4a34', layerTint: '#6f9a3a', layer: { kind: 'moss', amount: 0.35, low: 0.6, scale: 2.2 } },
      w_table: { name: 'Garden table', dirtTint: '#4f4a36' },
      w_chair1: { name: 'Chair', dirtTint: '#4f4a36' },
      w_chair2: { name: 'Other chair', dirtTint: '#4f4a36' },
      w_bench: { name: 'Bench', dirtTint: '#4f4a36', layerTint: '#7aa040', layer: { kind: 'moss', amount: 0.25, scale: 3, top: true } },
    },
  },
  {
    id: 'van', n: 3, file: 'models/job3.glb', icon: 'van', colors: ['#7fc8ff', '#2f6fd0'],
    name: 'Van-tastic', client: 'Dave the plumber',
    quip: "Some herbert's tagged me van. Also I may have driven through a field. Twice.",
    par: 300, pay: 300, seed: 37, reachTop: 1.6,
    objects: {
      w_van: {
        name: "Dave's van", dirtTint: '#6e624e',
        layer: { kind: 'graffiti', tags: [{ side: '+z', u: 0.42, v: 0.55, w: 2.6, text: 'OI OI!', fill: 1, fill2: 3 }, { side: '-z', u: 0.45, v: 0.55, w: 2.8, text: 'SAHUR', fill: 2, fill2: 4, tilt: 0.05 }] },
      },
    },
  },
  {
    id: 'shop', n: 4, file: 'models/job4.glb', icon: 'shop', colors: ['#ffd36a', '#e0902a'],
    name: 'Cod Almighty', client: 'Mo, Cod Almighty chippy',
    quip: 'Thirty years of chip fat on the pavement, and the shutter next door has been tagged. Again.',
    par: 360, pay: 420, seed: 41, reachTop: 2.6,
    objects: {
      w_front: { name: 'Shop front', dirtTint: '#4e4a40' },
      w_windows: { name: 'Windows', dirtTint: '#6a6458', grime: 0.75 },
      w_sign: { name: 'Sign', dirtTint: '#3e3a30' },
      w_shutter: {
        name: 'Shutter next door', dirtTint: '#504a40',
        layer: { kind: 'graffiti', tags: [{ side: '+z', u: 0.28, v: 0.6, w: 1.9, text: 'OI!', fill: 5, fill2: 3 }, { side: '+z', u: 0.74, v: 0.38, w: 1.6, text: 'SAHUR', fill: 6, fill2: 1, tilt: 0.08 }] },
      },
      w_pavement: { name: 'Pavement', dirtTint: '#5a5040', layer: { kind: 'oil', spots: [[0.6, -2.6, 0.45], [-1.8, -1.4, 0.35], [-3.6, -2.9, 0.3], [2.2, -1.0, 0.25], [-0.6, -0.6, 0.22]] } },
    },
  },
  {
    id: 'boat', n: 5, file: 'models/job5.glb', icon: 'boat', colors: ['#7fe3ff', '#1594b8'],
    name: 'Ship Shape', client: 'Captain Pete',
    quip: "She's been sat on the trailer since the big storm. The seagulls think she's a public toilet.",
    par: 390, pay: 560, seed: 53, reachTop: 2.3,
    objects: {
      w_hull: { name: 'Hull', dirtTint: '#5e5a48', layerTint: '#4f7a3a', layer: { kind: 'moss', amount: 0.62, scale: 2.5, below: 1.0 } },
      w_deck: { name: 'Deck', dirtTint: '#4a4436' },
      w_cabin: { name: 'Cabin', dirtTint: '#6b6a50' },
      w_motor: { name: 'Outboard motor', dirtTint: '#5a5444' },
      w_trailer: { name: 'Trailer', dirtTint: '#6a5038' },
    },
  },
  {
    id: 'skate', n: 6, file: 'models/job6.glb', icon: 'skate', colors: ['#d59bff', '#7b4bd6'],
    name: 'Skate Park Showdown', client: 'Hatfield Town Council',
    quip: "The skaters say it's 'sick'. We assume that's bad. Also, Sir Reg needs a bath.",
    par: 600, pay: 900, seed: 67, reachTop: 2.0,
    objects: {
      w_floor_a: { name: 'Floor (left)', dirtTint: '#5a5644', layerTint: '#6f9a3a', layer: { kind: 'moss', amount: 0.28, scale: 0.9 } },
      w_floor_b: { name: 'Floor (right)', dirtTint: '#5a5644', layerTint: '#6f9a3a', layer: { kind: 'moss', amount: 0.28, scale: 0.9 } },
      w_quarter: {
        name: 'Quarter pipe', dirtTint: '#55524a',
        layer: { kind: 'graffiti', tags: [{ side: '+z', u: 0.5, v: 0.62, w: 3.2, text: 'RAD', fill: 1, fill2: 6, depth: 1.8 }, { side: '+x', u: 0.5, v: 0.4, w: 1.7, text: 'BRAP', fill: 4, fill2: 2 }] },
      },
      w_mini: {
        name: 'Mini ramp', dirtTint: '#55524a',
        layer: { kind: 'graffiti', tags: [{ side: '-x', u: 0.5, v: 0.45, w: 2.6, text: 'SK8', fill: 5, fill2: 3 }] },
      },
      w_funbox: {
        name: 'Fun box', dirtTint: '#55524a',
        layer: { kind: 'graffiti', tags: [{ side: '+z', u: 0.5, v: 0.5, w: 3.2, text: 'OLLIE', fill: 2, fill2: 4, depth: 1.2 }] },
      },
      w_plinth: { name: 'Plinth', dirtTint: '#5e6a50', layerTint: '#6f9a3a', layer: { kind: 'moss', amount: 0.3, low: 0.5, scale: 2 } },
      w_statue: { name: 'Sir Reg', dirtTint: '#5e6a50' },
    },
  },
];

export const JOB_BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j]));
