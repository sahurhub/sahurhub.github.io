// City generation as pure data (no three.js): road graph, districts, plots, buildings, props,
// colliders and points of interest. Deterministic from a seed, so every client and a future
// server build exactly the same city.
import { CITY, DISTRICT_MAP, DISTRICT_BY_LETTER, DISTRICTS } from './config.js';
import { rng } from './utils.js';

const N = CITY.cells, S = CITY.cell, O = CITY.origin, RH = CITY.roadHalf, SW = CITY.sidewalk;
export const gx = i => O + i * S;        // grid line coordinate
export const cellOf = v => Math.floor((v - O) / S);

const H_STREETS = ['Skyway Rd', 'Maple St', 'Juniper Ave', 'Harbor St', 'Oak Ave', 'Central Blvd', 'Elm St', 'Market St', 'Cedar Ave', 'Birch St', 'Southgate Rd'];
const V_STREETS = ['West End Rd', 'Willow Ln', 'Poplar St', 'Aspen Ave', 'Pine St', 'Main St', 'Rose Ave', 'Iron St', 'Dock Rd', 'Forge Ave', 'East End Rd'];

const NAMES = {
  restaurant: ['Pixel Pizza', 'Bolt Burgers', 'Noodle Nook', 'Taco Rocket', 'Sushi Splash', 'Curry Comet', 'Waffle Wave', 'Bao Bounce', 'Pasta Planet', 'Dumpling Dash', 'Grill Galaxy', 'Falafel Fiesta', 'Pancake Port', 'Ramen Rally'],
  shop: ['Gadget Grove', 'Sneaker Spot', 'Book Burrow', 'Toy Tornado', 'Bloom Florist', 'Comic Cove', 'Tech Tonic', 'Pet Palace', 'Hat Hut', 'Vinyl Vault', 'Paper Plane', 'Lamp Lane', 'Candle Corner', 'Sport Sprint', 'Bike Barn', 'Corner Store'],
  office: ['Rush Tower', 'Skyline Offices', 'Nova Center', 'Atlas Building', 'Echo Plaza', 'Summit House', 'Beacon Tower', 'Prism Offices', 'Zenith Point', 'Orbit Tower', 'Granite Hall', 'Vista Center'],
  apartment: ['Sunrise Flats', 'Parkview Apartments', 'Riverside Lofts', 'Maple Court', 'City Heights', 'The Terraces', 'Bluebell Flats', 'Garden Court'],
  mall: ['Mega Mall', 'Galleria Grande', 'Star Plaza', 'Market Square', 'Rainbow Mall', 'Crown Centre'],
  supermarket: ['FreshCo', 'Mango Market', 'Daily Basket', 'GreenGrocer', 'Super Saver', 'Harvest Hall'],
  warehouse: ['Crate & Co', 'Boxwell Depot', 'Northside Storage', 'Pallet Pro', 'Forklift Freight', 'StackIt Storage', 'Cargo King', 'Bulk Barn'],
  factory: ['Gearworks', 'Cog Factory', 'Bolt Industries', 'Steel Spark', 'Widget Works', 'Rivet Mill'],
  terminal: ['Cargo Terminal A', 'Cargo Terminal B', 'SkyFreight Hub', 'Hangar 1', 'Hangar 2', 'Hangar 3'],
};
const SIGN_COLORS = ['#e5383b', '#2b7de9', '#ff7a1f', '#27ae60', '#8f4bd6', '#ff70a6', '#14213d', '#e8b923', '#0f9d8a'];
const WALL_TINTS = {
  house: ['#f6e7c8', '#cfe3f2', '#f7d0c4', '#d7ecd0', '#efe0f5', '#fff3b0', '#e6e6e6', '#f9c784'],
  roof: ['#c0504d', '#5b6b8c', '#7a5c47', '#3f6e5a', '#4b4f58', '#9b4f7a'],
  shop: ['#f2e8d5', '#d9e8f5', '#f5d9d0', '#e1f0dc', '#ece3f7', '#fbe9a4'],
  awning: ['#e5383b', '#2b7de9', '#ff7a1f', '#27ae60', '#8f4bd6', '#ffd23f', '#14b8a6'],
  tower: ['#ffffff', '#e8eef5', '#f4efe6', '#e3ecf0', '#f6efe9'],
  industrial: ['#c7ccd3', '#d9c8a9', '#a9c1d1', '#c9d3b8', '#e0d1c0'],
  mall: ['#f3f0ea', '#e9eef6', '#f5ecea'],
};

export function districtAtCell(c, r) {
  if (c < 0 || r < 0 || c >= N || r >= N) return null;
  return DISTRICT_BY_LETTER[DISTRICT_MAP[r][c]];
}
export function districtAt(x, z) { return districtAtCell(cellOf(x), cellOf(z)); }

export function generateCity(seed = 20261114) {
  const R = rng(seed);
  const L = {
    nodes: [], segments: [], cells: [], buildings: [], colliders: [], sidewalks: [], grounds: [],
    props: {}, parking: [], decals: [], walkLoops: [], pois: {}, airport: null, signs: [],
  };
  const P = name => (L.props[name] ||= []);
  const usedNames = {};
  const nameFor = kind => {
    const list = NAMES[kind] || ['Building'];
    const k = usedNames[kind] = (usedNames[kind] || 0) + 1;
    const base = list[(k - 1) % list.length];
    const round = Math.floor((k - 1) / list.length);
    return round ? `${base} ${round + 1}` : base;
  };
  const addBox = (x0, x1, z0, z1, top, tag) => L.colliders.push({ t: 'b', minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), top, tag });
  const addCircle = (x, z, r, top, tag) => L.colliders.push({ t: 'c', x, z, r, top, tag });

  // ---------------------------------------------------------------- cells
  const isAirport = (c, r) => districtAtCell(c, r) === 'airport';
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    L.cells.push({ c, r, district: districtAtCell(c, r), x0: gx(c), x1: gx(c + 1), z0: gx(r), z1: gx(r + 1) });
  }

  // ---------------------------------------------------------------- roads
  const hSeg = (i, j) => !(isAirport(i, j - 1) && isAirport(i, j));      // z = gx(j), x in [gx(i), gx(i+1)]
  const vSeg = (i, j) => !(isAirport(i - 1, j) && isAirport(i, j));      // x = gx(i), z in [gx(j), gx(j+1)]
  L.hasH = (i, j) => i >= 0 && i < N && j >= 0 && j <= N && hSeg(i, j);
  L.hasV = (i, j) => i >= 0 && i <= N && j >= 0 && j < N && vSeg(i, j);
  const nodeIdx = (i, j) => j * (N + 1) + i;
  L.nodeGrid = new Array((N + 1) * (N + 1)).fill(null);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const e = L.hasH(i - 1, j) || L.hasH(i, j) || L.hasV(i, j - 1) || L.hasV(i, j);
    if (!e) continue;
    const node = { id: L.nodes.length, i, j, x: gx(i), z: gx(j), segs: [], signal: false };
    L.nodes.push(node);
    L.nodeGrid[nodeIdx(i, j)] = node;
  }
  L.nodeAt = (i, j) => (i < 0 || j < 0 || i > N || j > N ? null : L.nodeGrid[nodeIdx(i, j)]);
  const addSeg = (a, b, horizontal) => {
    const s = { id: L.segments.length, a: a.id, b: b.id, horizontal, len: Math.hypot(b.x - a.x, b.z - a.z) };
    L.segments.push(s);
    a.segs.push(s.id); b.segs.push(s.id);
  };
  for (let j = 0; j <= N; j++) for (let i = 0; i < N; i++) if (hSeg(i, j)) addSeg(L.nodeAt(i, j), L.nodeAt(i + 1, j), true);
  for (let j = 0; j < N; j++) for (let i = 0; i <= N; i++) if (vSeg(i, j)) addSeg(L.nodeAt(i, j), L.nodeAt(i, j + 1), false);
  for (const n of L.nodes) {
    n.signal = n.segs.length >= 3 && !(n.i === 0 || n.j === 0 || n.i === N || n.j === N) && ((n.i + n.j) % 2 === 0 || n.segs.length === 4);
    n.streetH = H_STREETS[n.j]; n.streetV = V_STREETS[n.i];
  }

  // is the point on a road surface?
  L.isRoad = (x, z) => {
    const i = Math.round((x - O) / S), j = Math.round((z - O) / S);
    const dx = Math.abs(x - gx(i)), dz = Math.abs(z - gx(j));
    if (dx < RH && dz < RH) return !!L.nodeAt(i, j);
    if (dx < RH) return L.hasV(i, cellOf(z));
    if (dz < RH) return L.hasH(cellOf(x), j);
    return false;
  };
  L.heightAt = (x, z) => (L.isRoad(x, z) ? 0 : CITY.curb);
  L.streetName = (x, z) => {
    const i = Math.round((x - O) / S), j = Math.round((z - O) / S);
    return Math.abs(x - gx(i)) < Math.abs(z - gx(j)) ? V_STREETS[i] : H_STREETS[j];
  };

  // ---------------------------------------------------------------- blocks (regions between roads)
  const blocks = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (isAirport(c, r)) continue;
    blocks.push({ c, r, district: districtAtCell(c, r), X0: gx(c), X1: gx(c + 1), Z0: gx(r), Z1: gx(r + 1) });
  }
  const airportBlock = { c: 4, r: 0, district: 'airport', X0: gx(4), X1: gx(10), Z0: gx(0), Z1: gx(3), airport: true };
  blocks.push(airportBlock);

  for (const b of blocks) {
    const o = { x0: b.X0 + RH, x1: b.X1 - RH, z0: b.Z0 + RH, z1: b.Z1 - RH };
    const i = { x0: o.x0 + SW, x1: o.x1 - SW, z0: o.z0 + SW, z1: o.z1 - SW };
    b.outer = o; b.inner = i;
    L.sidewalks.push({ outer: o, inner: i });
    const mid = (SW / 2);
    L.walkLoops.push({ x0: o.x0 + mid, x1: o.x1 - mid, z0: o.z0 + mid, z1: o.z1 - mid, district: b.district });
  }

  // ---------------------------------------------------------------- helpers for placing buildings
  // edge: 'n','s','w','e' -> rotation so the model front (+Z) faces that street
  const ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
  function placeBuilding(b, spec) {
    // spec: type, x, z (centre), w (along front), d (depth), h, edge, model, proc...
    const rot = ROT[spec.edge];
    const alongX = spec.edge === 'n' || spec.edge === 's';
    const sx = alongX ? spec.w : spec.d, sz = alongX ? spec.d : spec.w;
    const bld = {
      id: L.buildings.length, district: b.district, ...spec, ry: rot, sx, sz,
      name: spec.name || (spec.nameKind ? nameFor(spec.nameKind) : ''),
    };
    // door point on the sidewalk in front of the building
    const io = b.outer;
    const side = SW / 2;
    if (spec.edge === 'n') bld.door = { x: spec.x, z: io.z0 + side };
    if (spec.edge === 's') bld.door = { x: spec.x, z: io.z1 - side };
    if (spec.edge === 'w') bld.door = { x: io.x0 + side, z: spec.z };
    if (spec.edge === 'e') bld.door = { x: io.x1 - side, z: spec.z };
    bld.door.ry = rot;
    if (spec.address) bld.name = spec.address;
    L.buildings.push(bld);
    if (spec.collide !== false) addBox(spec.x - sx / 2, spec.x + sx / 2, spec.z - sz / 2, spec.z + sz / 2, spec.h + (spec.y || 0), 'building');
    return bld;
  }
  const streetOf = (b, edge) => edge === 'n' ? H_STREETS[b.r] : edge === 's' ? H_STREETS[b.r + 1] : edge === 'w' ? V_STREETS[b.c] : V_STREETS[b.c + 1];
  // position on an edge strip. t in [0,1] along the edge, depth = building depth
  function edgePos(b, edge, t, depth, margin = 0.5) {
    const i = b.inner;
    if (edge === 'n') return { x: i.x0 + (i.x1 - i.x0) * t, z: i.z0 + margin + depth / 2 };
    if (edge === 's') return { x: i.x0 + (i.x1 - i.x0) * t, z: i.z1 - margin - depth / 2 };
    if (edge === 'w') return { x: i.x0 + margin + depth / 2, z: i.z0 + (i.z1 - i.z0) * t };
    return { x: i.x1 - margin - depth / 2, z: i.z0 + (i.z1 - i.z0) * t };
  }

  // street furniture along every block's sidewalk
  function streetFurniture(b) {
    const o = b.outer;
    const lampEvery = b.airport ? 50 : 34;
    const edges = [
      { e: 'n', x0: o.x0, x1: o.x1, z: o.z0 + 0.7, ry: Math.PI, horiz: true },
      { e: 's', x0: o.x0, x1: o.x1, z: o.z1 - 0.7, ry: 0, horiz: true },
      { e: 'w', z0: o.z0, z1: o.z1, x: o.x0 + 0.7, ry: -Math.PI / 2, horiz: false },
      { e: 'e', z0: o.z0, z1: o.z1, x: o.x1 - 0.7, ry: Math.PI / 2, horiz: false },
    ];
    for (const ed of edges) {
      const len = ed.horiz ? ed.x1 - ed.x0 : ed.z1 - ed.z0;
      const n = Math.max(1, Math.round(len / lampEvery));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = ed.horiz ? ed.x0 + len * t : ed.x;
        const z = ed.horiz ? ed.z : ed.z0 + len * t;
        P('streetlight').push({ x, y: CITY.curb, z, ry: ed.ry });
        addCircle(x, z, 0.2, 7, 'pole');
        // trees between lamps (not in industrial / airport)
        if (b.district !== 'industrial' && !b.airport && k < n - 1) {
          const t2 = (k + 1) / n;
          const tx = ed.horiz ? ed.x0 + len * t2 : ed.x + (ed.e === 'w' ? 0.8 : -0.8);
          const tz = ed.horiz ? ed.z + (ed.e === 'n' ? 0.8 : -0.8) : ed.z0 + len * t2;
          const kind = b.district === 'shopping' ? 'palm' : (b.district === 'downtown' ? 'round' : (R() < 0.5 ? 'round' : 'pine'));
          P('tree_' + kind).push({ x: tx, y: CITY.curb, z: tz, ry: R() * 6.28, s: 0.8 + R() * 0.3 });
          addCircle(tx, tz, 0.35, 6, 'tree');
        }
      }
      // a few benches, bins and hydrants
      if (!b.airport && R() < 0.55) {
        const t = 0.2 + R() * 0.6;
        const x = ed.horiz ? ed.x0 + len * t : ed.x + (ed.e === 'w' ? 2.6 : -2.6);
        const z = ed.horiz ? ed.z + (ed.e === 'n' ? 2.6 : -2.6) : ed.z0 + len * t;
        P('bench').push({ x, y: CITY.curb, z, ry: ed.ry + Math.PI });
        if (ed.horiz) addBox(x - 0.95, x + 0.95, z - 0.35, z + 0.35, 0.5, 'bench');
        else addBox(x - 0.35, x + 0.35, z - 0.95, z + 0.95, 0.5, 'bench');
        const bx = ed.horiz ? x + 2.2 : x, bz = ed.horiz ? z : z + 2.2;
        P('bin').push({ x: bx, y: CITY.curb, z: bz, ry: 0 });
        addCircle(bx, bz, 0.38, 1, 'bin');
      }
      if (!b.airport && R() < 0.4) {
        const t = R() < 0.5 ? 0.08 : 0.92;
        const x = ed.horiz ? ed.x0 + len * t : ed.x;
        const z = ed.horiz ? ed.z : ed.z0 + len * t;
        P('hydrant').push({ x, y: CITY.curb, z, ry: R() * 6 });
        addCircle(x, z, 0.2, 0.8, 'hydrant');
      }
    }
  }

  // ---------------------------------------------------------------- per-district builders
  const blockAt = (c, r) => blocks.find(b => b.c === c && b.r === r && !b.airport);
  const reserved = new Set();

  // POIs in downtown around the centre
  const hqBlock = blockAt(4, 4), dealerBlock = blockAt(5, 4), plazaBlock = blockAt(4, 5);
  reserved.add(hqBlock); reserved.add(dealerBlock); reserved.add(plazaBlock);

  function downtownBlock(b) {
    L.grounds.push({ kind: 'plaza', ...b.inner });
    const i = b.inner;
    const hw = (i.x1 - i.x0) / 2, hd = (i.z1 - i.z0) / 2;
    const quads = [
      { x0: i.x0, z0: i.z0, edges: ['n', 'w'] }, { x0: i.x0 + hw, z0: i.z0, edges: ['n', 'e'] },
      { x0: i.x0, z0: i.z0 + hd, edges: ['s', 'w'] }, { x0: i.x0 + hw, z0: i.z0 + hd, edges: ['s', 'e'] },
    ];
    const distC = Math.hypot((b.X0 + b.X1) / 2, (b.Z0 + b.Z1) / 2);
    for (const q of quads) {
      const cx = q.x0 + hw / 2, cz = q.z0 + hd / 2;
      const edge = R.pick(q.edges);
      const roll = R();
      if (roll < 0.42) {
        // tower
        const w = R.range(20, 30), d = R.range(20, 30);
        const h = Math.round(R.range(34, 60) + Math.max(0, 300 - distC) / 300 * R.range(30, 80));
        const tiers = [];
        if (h > 60 && R() < 0.6) tiers.push({ w: w * 0.7, d: d * 0.7, h: R.range(10, 26) });
        placeBuilding(b, { type: 'tower', proc: true, x: cx, z: cz, w, d, h, edge, style: R() < 0.55 ? 0 : 2, tint: R.pick(WALL_TINTS.tower), tiers, role: 'drop', nameKind: 'office' });
      } else if (roll < 0.72) {
        // shop row on the front edge + apartments behind
        const n = 3;
        for (let k = 0; k < n; k++) {
          const isRest = R() < 0.45;
          const pos = edgeQuadPos(q, edge, (k + 0.5) / n, 10, hw, hd);
          placeBuilding(b, { type: isRest ? 'restaurant' : 'shop', model: isRest ? 'buildings/restaurant' : 'buildings/shop', x: pos.x, z: pos.z, w: 12, d: 10, h: 8,
            edge, tint: R.pick(WALL_TINTS.shop), tint2: R.pick(WALL_TINTS.awning), role: 'pickup', nameKind: isRest ? 'restaurant' : 'shop', sign: true });
          if (isRest && R() < 0.5) {
            const tp = offsetFront(pos, edge, 8.2);
            P('cafe_table').push({ x: tp.x, y: CITY.curb, z: tp.z, ry: 0 });
            addCircle(tp.x, tp.z, 0.9, 0.9, 'table');
          }
        }
        // apartments behind the shops
        const back = edgeQuadPos(q, edge, 0.5, 18, hw, hd, 14);
        placeBuilding(b, { type: 'apartment', proc: true, x: back.x, z: back.z, w: 30, d: 14, h: Math.round(R.range(14, 26)), edge, style: 1, tint: R.pick(WALL_TINTS.shop), role: 'drop', nameKind: 'apartment', collide: true });
      } else if (roll < 0.9) {
        const w = R.range(26, 32), d = R.range(24, 30);
        placeBuilding(b, { type: 'office', proc: true, x: cx, z: cz, w, d, h: Math.round(R.range(14, 34)), edge, style: R() < 0.5 ? 1 : 3, tint: R.pick(WALL_TINTS.tower), role: 'both', nameKind: 'office' });
      } else {
        // pocket plaza with a restaurant
        const pos = edgeQuadPos(q, edge, 0.5, 10, hw, hd);
        placeBuilding(b, { type: 'restaurant', model: 'buildings/restaurant', x: pos.x, z: pos.z, w: 12, d: 10, h: 8, edge, tint: R.pick(WALL_TINTS.shop), tint2: R.pick(WALL_TINTS.awning), role: 'pickup', nameKind: 'restaurant', sign: true });
        for (let k = 0; k < 4; k++) {
          const tx = cx + R.range(-12, 12), tz = cz + R.range(-12, 12);
          if (Math.abs(tx - pos.x) < 9 && Math.abs(tz - pos.z) < 8) continue;
          P('tree_round').push({ x: tx, y: CITY.curb, z: tz, ry: R() * 6, s: 1 + R() * 0.3 });
          addCircle(tx, tz, 0.4, 6, 'tree');
        }
      }
    }
  }
  function edgeQuadPos(q, edge, t, depth, hw, hd, inset = 0.5) {
    if (edge === 'n') return { x: q.x0 + hw * t, z: q.z0 + inset + depth / 2 };
    if (edge === 's') return { x: q.x0 + hw * t, z: q.z0 + hd - inset - depth / 2 };
    if (edge === 'w') return { x: q.x0 + inset + depth / 2, z: q.z0 + hd * t };
    return { x: q.x0 + hw - inset - depth / 2, z: q.z0 + hd * t };
  }
  function offsetFront(p, edge, d) {
    if (edge === 'n') return { x: p.x, z: p.z - d };
    if (edge === 's') return { x: p.x, z: p.z + d };
    if (edge === 'w') return { x: p.x - d, z: p.z };
    return { x: p.x + d, z: p.z };
  }

  function suburbBlock(b) {
    L.grounds.push({ kind: 'grass', ...b.inner });
    if (R() < 0.14) return parkBlock(b);
    const variants = ['buildings/house_a', 'buildings/house_b', 'buildings/house_c'];
    const dims = { 'buildings/house_a': [9, 8, 8.8], 'buildings/house_b': [12, 8, 5.8], 'buildings/house_c': [7.5, 9, 7.4] };
    let num = 2 + R.int(0, 40);
    const edgeLots = { n: 4, s: 4, w: 2, e: 2 };
    let shopPlaced = R() < 0.35;
    for (const edge of ['n', 's', 'w', 'e']) {
      const n = edgeLots[edge];
      for (let k = 0; k < n; k++) {
        const horiz = edge === 'n' || edge === 's';
        const t = horiz ? (k + 0.5) / n : 0.25 + (k + 0.5) / n * 0.5;
        if (shopPlaced && edge === 'n' && k === 0) {
          const pos = edgePos(b, edge, t, 10, 1.5);
          placeBuilding(b, { type: 'shop', model: 'buildings/shop', x: pos.x, z: pos.z, w: 12, d: 10, h: 8, edge, tint: R.pick(WALL_TINTS.shop), tint2: R.pick(WALL_TINTS.awning), role: 'pickup', nameKind: 'shop', sign: true });
          shopPlaced = false;
          continue;
        }
        const model = R.pick(variants);
        const [w, d, h] = dims[model];
        const pos = edgePos(b, edge, t, d, 6);
        const street = streetOf(b, edge);
        const bld = placeBuilding(b, { type: 'house', model, x: pos.x, z: pos.z, w, d, h, edge, tint: R.pick(WALL_TINTS.house), tint2: R.pick(WALL_TINTS.roof), role: 'drop', address: `${num} ${street}` });
        num += 2 + R.int(0, 3);
        // mailbox and front hedge
        const mb = offsetFront(pos, edge, d / 2 + 4.5);
        const mside = horiz ? { x: mb.x + w / 2 - 0.5, z: mb.z } : { x: mb.x, z: mb.z + w / 2 - 0.5 };
        P('mailbox').push({ x: mside.x, y: CITY.curb, z: mside.z, ry: bld.ry });
        addCircle(mside.x, mside.z, 0.25, 1.3, 'mailbox');
        if (R() < 0.6) {
          const bp = offsetFront(pos, edge, d / 2 + 2.5);
          const bx = horiz ? bp.x - w / 2 + 0.6 : bp.x, bz = horiz ? bp.z : bp.z - w / 2 + 0.6;
          P('tree_bush').push({ x: bx, y: CITY.curb, z: bz, ry: R() * 6 });
          addCircle(bx, bz, 0.6, 1.2, 'bush');
        }
        // back garden tree
        if (R() < 0.7) {
          const tp = offsetFront(pos, edge, -(d / 2 + 4 + R() * 3));
          const kind = R() < 0.6 ? 'round' : 'pine';
          P('tree_' + kind).push({ x: tp.x + R.range(-2, 2), y: CITY.curb, z: tp.z + R.range(-2, 2), ry: R() * 6, s: 0.9 + R() * 0.4 });
        }
      }
    }
    // fences around the back gardens (decorative ring)
    const i = b.inner;
    const fz0 = i.z0 + 22, fz1 = i.z1 - 22, fx0 = i.x0 + 22, fx1 = i.x1 - 22;
    for (let x = fx0 + 1; x < fx1; x += 2) { P('fence').push({ x, y: CITY.curb, z: fz0, ry: 0 }); P('fence').push({ x, y: CITY.curb, z: fz1, ry: 0 }); }
    for (let z = fz0 + 1; z < fz1; z += 2) { P('fence').push({ x: fx0, y: CITY.curb, z, ry: Math.PI / 2 }); P('fence').push({ x: fx1, y: CITY.curb, z, ry: Math.PI / 2 }); }
  }

  function parkBlock(b, withPond = true) {
    const i = b.inner;
    const cx = (i.x0 + i.x1) / 2, cz = (i.z0 + i.z1) / 2;
    if (withPond) {
      L.decals.push({ kind: 'pond', x: cx, z: cz, r: 13 });
      addCircle(cx, cz, 12.5, 0.4, 'pond');
    }
    L.decals.push({ kind: 'path', x0: i.x0, x1: i.x1, z0: cz - 1.6, z1: cz + 1.6 });
    L.decals.push({ kind: 'path', x0: cx - 1.6, x1: cx + 1.6, z0: i.z0, z1: i.z1 });
    for (let k = 0; k < 26; k++) {
      const x = R.range(i.x0 + 3, i.x1 - 3), z = R.range(i.z0 + 3, i.z1 - 3);
      if (Math.hypot(x - cx, z - cz) < 16 || Math.abs(x - cx) < 3.5 || Math.abs(z - cz) < 3.5) continue;
      const kind = R() < 0.55 ? 'round' : (R() < 0.6 ? 'pine' : 'bush');
      P('tree_' + kind).push({ x, y: CITY.curb, z, ry: R() * 6, s: 0.9 + R() * 0.5 });
      addCircle(x, z, kind === 'bush' ? 0.6 : 0.4, 5, 'tree');
    }
    for (const [dx, dz, ry] of [[-6, -18, 0], [6, 18, Math.PI], [-18, 6, Math.PI / 2], [18, -6, -Math.PI / 2]]) {
      P('bench').push({ x: cx + dx, y: CITY.curb, z: cz + dz, ry, sit: true });
      if (Math.abs(ry) < 0.1 || Math.abs(ry - Math.PI) < 0.1) addBox(cx + dx - 0.95, cx + dx + 0.95, cz + dz - 0.35, cz + dz + 0.35, 0.5, 'bench');
      else addBox(cx + dx - 0.35, cx + dx + 0.35, cz + dz - 0.95, cz + dz + 0.95, 0.5, 'bench');
    }
  }

  function industrialBlock(b) {
    L.grounds.push({ kind: 'concrete', ...b.inner });
    const i = b.inner;
    const roll = R();
    const cx = (i.x0 + i.x1) / 2, cz = (i.z0 + i.z1) / 2;
    if (roll < 0.55) {
      // two warehouses back to back
      for (const edge of ['n', 's']) {
        const pos = edgePos(b, edge, 0.5, 20, 3);
        placeBuilding(b, { type: 'warehouse', model: 'buildings/warehouse', x: pos.x, z: pos.z, w: 30, d: 20, h: 10.6, edge, tint: R.pick(WALL_TINTS.industrial), tint2: '#7d8590', role: 'both', nameKind: 'warehouse' });
        // cones marking the loading bays
        for (const off of [-12.5, 12.5]) {
          const cp = offsetFront(pos, edge, 11.5);
          const cx2 = cp.x + (edge === 'n' || edge === 's' ? off : 0), cz2 = cp.z + (edge === 'n' || edge === 's' ? 0 : off);
          P('cone').push({ x: cx2, y: CITY.curb, z: cz2, ry: R() * 6 });
          addCircle(cx2, cz2, 0.22, 0.7, 'cone');
        }
        // crates in front of the doors
        for (let k = 0; k < 3; k++) {
          const p = offsetFront(pos, edge, 13.5);
          const x = p.x + R.range(-18, 18), z = p.z;
          if (Math.abs(x - pos.x) < 16) continue;
          P('crates').push({ x, y: CITY.curb, z, ry: R() * 6 });
          addBox(x - 0.7, x + 0.7, z - 0.7, z + 0.7, 1.0, 'crates');
        }
      }
      // container stacks in the middle (east / west)
      for (const ex of [i.x0 + 6, i.x1 - 6]) {
        for (let k = 0; k < 2; k++) {
          const z = cz - 4 + k * 8;
          const stack = R.int(1, 2);
          for (let s = 0; s < stack; s++) {
            P('container').push({ x: ex, y: CITY.curb + s * 2.6, z, ry: Math.PI / 2, tint: R.pick(['#d84a3a', '#2b7de9', '#27ae60', '#e8b923', '#8f4bd6', '#ff7a1f']) });
          }
          addBox(ex - 3.1, ex + 3.1, z - 1.25, z + 1.25, CITY.curb + stack * 2.6, 'container');
        }
      }
    } else if (roll < 0.85) {
      // factory with chimneys + yard
      const edge = R.pick(['n', 's', 'w', 'e']);
      const pos = edgePos(b, edge, 0.5, 30, 6);
      const f = placeBuilding(b, { type: 'factory', proc: true, x: pos.x, z: pos.z, w: 44, d: 30, h: 14, edge, style: 3, tint: R.pick(WALL_TINTS.industrial), role: 'both', nameKind: 'factory' });
      f.chimneys = [];
      for (let k = 0; k < 2; k++) {
        const off = (k - 0.5) * 18;
        const back = offsetFront(pos, edge, -8);
        const horiz = edge === 'n' || edge === 's';
        const ch = { x: back.x + (horiz ? off : 0), z: back.z + (horiz ? 0 : off), r: 1.6, h: 30 };
        f.chimneys.push(ch);
      }
      const yard = offsetFront({ x: cx, z: cz }, edge, -26);
      for (let k = 0; k < 5; k++) {
        const x = yard.x + R.range(-25, 25), z = yard.z + R.range(-6, 6);
        if (Math.abs(x - cx) > 34 || Math.abs(z - cz) > 34) continue;
        P('crates').push({ x, y: CITY.curb, z, ry: R() * 6 });
        addBox(x - 0.7, x + 0.7, z - 0.7, z + 0.7, 1.0, 'crates');
      }
    } else {
      // depot: one warehouse + container yard + fence
      const edge = R.pick(['n', 's']);
      const pos = edgePos(b, edge, 0.5, 20, 3);
      placeBuilding(b, { type: 'warehouse', model: 'buildings/warehouse', x: pos.x, z: pos.z, w: 30, d: 20, h: 10.6, edge, tint: R.pick(WALL_TINTS.industrial), tint2: '#7d8590', role: 'both', nameKind: 'warehouse' });
      const yz = edge === 'n' ? i.z1 - 18 : i.z0 + 18;
      for (let k = 0; k < 6; k++) {
        const x = i.x0 + 10 + k * 11.5, stack = R.int(1, 3);
        for (let s = 0; s < stack; s++) P('container').push({ x, y: CITY.curb + s * 2.6, z: yz, ry: 0, tint: R.pick(['#d84a3a', '#2b7de9', '#27ae60', '#e8b923', '#8f4bd6']) });
        addBox(x - 1.25, x + 1.25, yz - 3.1, yz + 3.1, CITY.curb + stack * 2.6, 'container');
      }
    }
    // perimeter fence (gaps at the middle of every side for access)
    const fe = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 4);
      const ry = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 0 : Math.PI / 2;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        P('fence_metal').push({ x: x0 + (x1 - x0) * t, y: CITY.curb, z: z0 + (z1 - z0) * t, ry });
      }
    };
    fe(i.x0, i.z0, i.x0 + 24, i.z0); fe(i.x1 - 24, i.z0, i.x1, i.z0);
    fe(i.x0, i.z1, i.x0 + 24, i.z1); fe(i.x1 - 24, i.z1, i.x1, i.z1);
  }

  function shoppingBlock(b) {
    const i = b.inner;
    const cx = (i.x0 + i.x1) / 2, cz = (i.z0 + i.z1) / 2;
    const roll = R();
    const edge = R.pick(['n', 's']);
    const back = edge === 'n' ? 's' : 'n';
    if (roll < 0.4) {
      // mall at the back, parking in front
      L.grounds.push({ kind: 'plaza', ...i });
      const pos = edgePos(b, back, 0.5, 40, 1);
      placeBuilding(b, { type: 'mall', proc: true, x: pos.x, z: pos.z, w: 64, d: 40, h: 15, edge, style: 0, tint: R.pick(WALL_TINTS.mall), role: 'pickup', nameKind: 'mall', bigSign: true });
      const pz0 = edge === 'n' ? i.z0 + 2 : pos.z + 22, pz1 = edge === 'n' ? pos.z - 22 : i.z1 - 2;
      parkingLot(i.x0 + 4, i.x1 - 4, pz0, pz1, b.district);
    } else if (roll < 0.7) {
      L.grounds.push({ kind: 'plaza', ...i });
      const pos = edgePos(b, back, 0.5, 28, 2);
      placeBuilding(b, { type: 'supermarket', proc: true, x: pos.x, z: pos.z, w: 46, d: 28, h: 9, edge, style: 2, tint: R.pick(WALL_TINTS.mall), role: 'pickup', nameKind: 'supermarket', bigSign: true });
      const pz0 = edge === 'n' ? i.z0 + 2 : pos.z + 16, pz1 = edge === 'n' ? pos.z - 16 : i.z1 - 2;
      parkingLot(i.x0 + 4, i.x1 - 4, pz0, pz1, b.district);
    } else {
      // shop strip + apartments
      L.grounds.push({ kind: 'plaza', ...i });
      for (let k = 0; k < 5; k++) {
        const pos = edgePos(b, edge, (k + 0.5) / 5, 10, 1);
        const rest = R() < 0.35;
        placeBuilding(b, { type: rest ? 'restaurant' : 'shop', model: rest ? 'buildings/restaurant' : 'buildings/shop', x: pos.x, z: pos.z, w: 12, d: 10, h: 8, edge, tint: R.pick(WALL_TINTS.shop), tint2: R.pick(WALL_TINTS.awning), role: 'pickup', nameKind: rest ? 'restaurant' : 'shop', sign: true });
      }
      const pos = edgePos(b, back, 0.5, 18, 4);
      placeBuilding(b, { type: 'apartment', proc: true, x: pos.x, z: pos.z, w: 54, d: 18, h: Math.round(R.range(16, 30)), edge: back, style: 2, tint: R.pick(WALL_TINTS.shop), role: 'drop', nameKind: 'apartment' });
      for (let k = 0; k < 6; k++) {
        const x = i.x0 + 8 + k * 12.4;
        P('tree_palm').push({ x, y: CITY.curb, z: cz + (edge === 'n' ? 6 : -6), ry: R() * 6 });
        addCircle(x, cz + (edge === 'n' ? 6 : -6), 0.35, 6, 'tree');
      }
    }
  }

  function parkingLot(x0, x1, z0, z1, district) {
    if (z1 - z0 < 12) return;
    L.parking.push({ x0, x1, z0, z1 });
    const rows = Math.floor((z1 - z0) / 12);
    for (let rr = 0; rr < rows; rr++) {
      const zr = z0 + 6 + rr * 12;
      for (let x = x0 + 2; x < x1 - 2; x += 3) {
        L.decals.push({ kind: 'stall', x, z: zr });
        if (R() < 0.45) {
          const zc = zr + (R() < 0.5 ? -2.6 : 2.6);
          L.props.parked = L.props.parked || [];
          L.props.parked.push({ x: x + 1.5, y: CITY.curb, z: zc, ry: R() < 0.5 ? 0 : Math.PI, model: R.pick(['sedan', 'hatch', 'pickup']), tint: carColor() });
          addBox(x + 1.5 - 0.95, x + 1.5 + 0.95, zc - 2.3, zc + 2.3, 1.6, 'car');
        }
      }
      for (let x = x0 + 12; x < x1 - 4; x += 24) {
        P('streetlight').push({ x, y: CITY.curb, z: zr, ry: 0 });
        addCircle(x, zr, 0.2, 7, 'pole');
      }
    }
  }
  const carColor = () => R.pick(['#e5383b', '#2b7de9', '#f4f1ea', '#22252e', '#52d6a3', '#ffd60a', '#8f4bd6', '#ff7a1f', '#9aa3ad', '#5c80bc']);

  function airportArea(b) {
    const i = b.inner;
    L.grounds.push({ kind: 'grass', ...i });
    // runway, taxiway and apron
    const rw = { x0: i.x0 + 30, x1: i.x1 - 30, z0: -446, z1: -402 };
    const tw = { x0: i.x0 + 40, x1: i.x1 - 40, z0: -378, z1: -362 };
    const ap = { x0: i.x0 + 10, x1: i.x1 - 10, z0: -350, z1: i.z1 - 4 };
    L.airport = { runway: rw, taxiway: tw, apron: ap };
    L.grounds.push({ kind: 'runway', ...rw });
    L.grounds.push({ kind: 'asphalt', ...tw });
    L.grounds.push({ kind: 'concrete', ...ap });
    for (const x of [i.x0 + 60, (i.x0 + i.x1) / 2, i.x1 - 60]) L.grounds.push({ kind: 'asphalt', x0: x - 8, x1: x + 8, z0: tw.z1, z1: ap.z0 });
    // terminals along the south edge (doors on the perimeter sidewalk)
    const tA = edgePos(b, 's', 0.16, 30, 1);
    placeBuilding(b, { type: 'terminal', proc: true, x: tA.x, z: tA.z, w: 70, d: 30, h: 15, edge: 's', style: 0, tint: '#eef2f6', role: 'both', name: 'Cargo Terminal A', bigSign: true });
    const tB = edgePos(b, 's', 0.84, 30, 1);
    placeBuilding(b, { type: 'terminal', proc: true, x: tB.x, z: tB.z, w: 70, d: 30, h: 15, edge: 's', style: 0, tint: '#eef2f6', role: 'both', name: 'Cargo Terminal B', bigSign: true });
    const tC = edgePos(b, 's', 0.5, 24, 1);
    placeBuilding(b, { type: 'terminal', proc: true, x: tC.x, z: tC.z, w: 50, d: 24, h: 12, edge: 's', style: 2, tint: '#fdf3e3', role: 'both', name: 'SkyFreight Hub', bigSign: true });
    // hangars facing the apron (north), control tower on the west
    const hx = [i.x0 + 110, i.x0 + 175, i.x1 - 120];
    hx.forEach((x, k) => {
      const hb = placeBuilding(b, { type: 'hangar', model: 'buildings/hangar', x, z: -300, w: 40, d: 36, h: 19, edge: 'n', tint: '#dfe5ec', tint2: '#b9c3cf', role: 'none', name: 'Hangar ' + (k + 1) });
      hb.door = { x, z: -322, ry: Math.PI };
    });
    placeBuilding(b, { type: 'control_tower', model: 'buildings/control_tower', x: i.x0 + 30, z: -300, w: 10, d: 10, h: 42, edge: 's', tint: '#f4f6f8', tint2: '#f4f6f8', role: 'none', name: 'Control Tower' });
    // parked planes on the apron + one on the runway threshold (animated)
    L.props.planes = [
      { x: i.x0 + 250, y: CITY.curb, z: -330, ry: -Math.PI / 2 },
      { x: i.x1 - 50, y: CITY.curb, z: -330, ry: -Math.PI / 2 },
    ];
    for (const p of L.props.planes) addBox(p.x - 16, p.x + 16, p.z - 2.4, p.z + 2.4, 6.5, 'plane');
    L.airport.taxiPlane = { x0: rw.x0 + 20, x1: rw.x1 - 20, z: (rw.z0 + rw.z1) / 2 };
    // cargo containers and pallets on the apron
    for (let k = 0; k < 10; k++) {
      const x = ap.x0 + 40 + k * 40 + R.range(-6, 6), z = R.range(-345, -335);
      if (L.props.planes.some(p => Math.abs(p.x - x) < 22)) continue;
      P('container').push({ x, y: CITY.curb, z, ry: 0, tint: R.pick(['#d84a3a', '#2b7de9', '#27ae60', '#e8b923']) });
      addBox(x - 1.25, x + 1.25, z - 3.1, z + 3.1, CITY.curb + 2.6, 'container');
    }
    // perimeter fence along the runway side
    for (let x = i.x0 + 2; x < i.x1; x += 4) P('fence_metal').push({ x, y: CITY.curb, z: -392, ry: 0 });
    L.colliders.push({ t: 'b', minX: i.x0, maxX: i.x1, minZ: -393, maxZ: -391, top: 2.2, tag: 'fence' });
  }

  // ---------------------------------------------------------------- special POI blocks
  function hqArea() {
    // HQ garage on the south side of block (4,4), facing the street at z = 0
    let b = hqBlock;
    L.grounds.push({ kind: 'plaza', ...b.inner });
    let pos = edgePos(b, 's', 0.5, 16, 1);
    const garage = placeBuilding(b, { type: 'garage', model: 'buildings/garage', x: pos.x, z: pos.z, w: 24, d: 16, h: 7.5, edge: 's', tint: '#f4f1ea', tint2: '#ff7a1f', role: 'none', name: 'Rush HQ Garage', sign: true, signText: 'RUSH HQ' });
    L.pois.garage = { x: pos.x, z: b.outer.z1 - 2, building: garage.id };
    // north half: offices
    const t1 = edgePos(b, 'n', 0.3, 26, 1);
    placeBuilding(b, { type: 'tower', proc: true, x: t1.x, z: t1.z, w: 24, d: 24, h: 96, edge: 'n', style: 0, tint: '#ffffff', tiers: [{ w: 16, d: 16, h: 18 }], role: 'drop', name: 'Rush Tower' });
    const t2 = edgePos(b, 'n', 0.78, 24, 1);
    placeBuilding(b, { type: 'office', proc: true, x: t2.x, z: t2.z, w: 22, d: 24, h: 30, edge: 'n', style: 1, tint: '#f4efe6', role: 'both', nameKind: 'office' });
    // dealership on block (5,4)
    b = dealerBlock;
    L.grounds.push({ kind: 'plaza', ...b.inner });
    pos = edgePos(b, 's', 0.5, 18, 1);
    const dealer = placeBuilding(b, { type: 'dealership', model: 'buildings/dealership', x: pos.x, z: pos.z, w: 26, d: 18, h: 8.8, edge: 's', tint: '#ffffff', tint2: '#3a86ff', role: 'none', name: 'Wheelhouse Motors', sign: true, signText: 'WHEELHOUSE MOTORS' });
    L.pois.dealership = { x: pos.x, z: b.outer.z1 - 2, building: dealer.id };
    // display vehicles on the forecourt
    L.pois.showroomSpots = [{ x: pos.x - 9, z: pos.z + 13.5, ry: 0.6 }, { x: pos.x + 9, z: pos.z + 13.5, ry: -0.6 }];
    const t3 = edgePos(b, 'n', 0.5, 28, 1);
    placeBuilding(b, { type: 'tower', proc: true, x: t3.x, z: t3.z, w: 28, d: 26, h: 72, edge: 'n', style: 2, tint: '#e8eef5', role: 'drop', nameKind: 'office' });
    // central plaza block (4,5): park + job board + restaurant
    b = plazaBlock;
    L.grounds.push({ kind: 'plaza', ...b.inner });
    parkBlock(b, true);
    L.pois.spawn = { x: hqBlock.outer.x0 + 24, z: hqBlock.outer.z1 - 2.2, ry: 0 };
  }

  for (const b of blocks) {
    if (reserved.has(b)) continue;
    if (b.airport) airportArea(b);
    else if (b.district === 'downtown') downtownBlock(b);
    else if (b.district === 'suburbs') suburbBlock(b);
    else if (b.district === 'industrial') industrialBlock(b);
    else if (b.district === 'shopping') shoppingBlock(b);
  }
  hqArea();
  for (const b of blocks) streetFurniture(b);

  // ---------------------------------------------------------------- job boards (one per district)
  const boardSpots = {
    downtown: { x: plazaBlock.outer.x0 + 30, z: plazaBlock.outer.z0 + 1.2, ry: Math.PI },
    suburbs: { x: gx(2) - RH - 3, z: gx(2) - 30, ry: Math.PI / 2 },
    shopping: { x: gx(3) + 30, z: gx(7) + RH + 1.2, ry: Math.PI },
    industrial: { x: gx(8) + 30, z: gx(5) + RH + 1.2, ry: Math.PI },
    airport: { x: gx(7) + 0, z: gx(3) - RH - 1.2, ry: 0 },
  };
  L.pois.jobBoards = Object.entries(boardSpots).map(([district, p]) => ({ district, x: p.x, z: p.z, ry: p.ry, name: DISTRICTS[district].name + ' Job Board' }));
  for (const jb of L.pois.jobBoards) addBox(jb.x - 1.4, jb.x + 1.4, jb.z - 0.4, jb.z + 0.4, 3.1, 'jobboard');

  // ---------------------------------------------------------------- traffic lights + street signs
  L.props.trafficlights = [];
  for (const n of L.nodes) {
    if (!n.signal && n.segs.length >= 3 && n.i > 0 && n.j > 0 && n.i < N && n.j < N) {
      // street-name post on one corner of unsignalled junctions
      const sx = n.x + (RH + 1.0) * (n.i % 2 ? 1 : -1), sz = n.z + (RH + 1.0) * (n.j % 2 ? -1 : 1);
      if (L.isRoad(sx, sz) === false) { P('signpost').push({ x: sx, y: CITY.curb, z: sz, ry: 0 }); addCircle(sx, sz, 0.15, 3.2, 'pole'); }
    }
    if (!n.signal) continue;
    // one signal per incoming approach, on the near-right corner
    for (const sid of n.segs) {
      const s = L.segments[sid];
      const other = L.nodes[s.a === n.id ? s.b : s.a];
      const fx = Math.sign(n.x - other.x), fz = Math.sign(n.z - other.z);   // travel direction towards n
      const rx = -fz, rz = fx;                                                // right of travel
      const px = n.x - fx * (RH + 1.2) + rx * (RH + 1.2), pz = n.z - fz * (RH + 1.2) + rz * (RH + 1.2);
      const ry = Math.atan2(-fx, -fz);   // lens faces the oncoming driver
      L.props.trafficlights.push({ x: px, y: CITY.curb, z: pz, ry, node: n.id, axis: s.horizontal ? 'h' : 'v' });
      addCircle(px, pz, 0.2, 6, 'pole');
    }
  }

  // ---------------------------------------------------------------- crosswalks and stop lines
  for (const n of L.nodes) {
    if (n.segs.length < 3) continue;
    for (const sid of n.segs) {
      const s = L.segments[sid];
      const other = L.nodes[s.a === n.id ? s.b : s.a];
      const fx = Math.sign(other.x - n.x), fz = Math.sign(other.z - n.z);
      L.decals.push({ kind: 'crosswalk', x: n.x + fx * (RH + 2), z: n.z + fz * (RH + 2), horizontal: s.horizontal });
    }
  }

  // ---------------------------------------------------------------- parked cars along streets
  L.props.parked = L.props.parked || [];
  for (const s of L.segments) {
    const a = L.nodes[s.a], b = L.nodes[s.b];
    const dA = districtAt((a.x + b.x) / 2 + (s.horizontal ? 0 : 10), (a.z + b.z) / 2 + (s.horizontal ? 10 : 0));
    if (dA !== 'downtown' && dA !== 'suburbs') continue;
    for (const side of [-1, 1]) {
      if (R() < 0.45) continue;
      const count = R.int(1, 3);
      for (let k = 0; k < count; k++) {
        const t = 0.25 + R() * 0.5;
        const x = s.horizontal ? a.x + (b.x - a.x) * t : a.x + side * 6.1;
        const z = s.horizontal ? a.z + side * 6.1 : a.z + (b.z - a.z) * t;
        if (L.props.parked.some(p => Math.abs(p.x - x) < 6 && Math.abs(p.z - z) < 6)) continue;
        // parked facing the travel direction of that side
        const ry = s.horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? Math.PI : 0);
        L.props.parked.push({ x, y: 0, z, ry, model: R.pick(['sedan', 'hatch', 'pickup', 'taxi']), tint: carColor(), street: true });
        if (s.horizontal) addBox(x - 2.3, x + 2.3, z - 0.95, z + 0.95, 1.6, 'car');
        else addBox(x - 0.95, x + 0.95, z - 2.3, z + 2.3, 1.6, 'car');
      }
    }
  }

  // ---------------------------------------------------------------- district gateway signs
  for (const [d, c, r, edge] of [['suburbs', 1, 2, 'e'], ['shopping', 3, 7, 'n'], ['industrial', 7, 5, 'w'], ['airport', 6, 2, 's'], ['downtown', 3, 3, 'n']]) {
    const b = blockAt(c, r);
    if (!b) continue;
    const o = b.outer;
    const p = edge === 'e' ? { x: o.x1 - 1, z: (o.z0 + o.z1) / 2 + 20 } : edge === 'n' ? { x: (o.x0 + o.x1) / 2 + 20, z: o.z0 + 1 } : edge === 'w' ? { x: o.x0 + 1, z: (o.z0 + o.z1) / 2 } : { x: (o.x0 + o.x1) / 2, z: o.z1 - 1 };
    L.signs.push({ district: d, x: p.x, z: p.z, ry: ROT[edge] });
  }

  // ---------------------------------------------------------------- outskirts: trees and hills
  const half = CITY.worldHalf;
  for (let k = 0; k < 420; k++) {
    const a = R() * Math.PI * 2;
    const rad = R.range(522, half - 8);
    let x = Math.cos(a) * rad * 1.3, z = Math.sin(a) * rad * 1.3;
    x = Math.max(-half + 5, Math.min(half - 5, x));
    z = Math.max(-half + 5, Math.min(half - 5, z));
    if (Math.abs(x) < 516 && Math.abs(z) < 516) continue;
    const kind = R() < 0.55 ? 'pine' : 'round';
    P('tree_' + kind).push({ x, y: CITY.curb, z, ry: R() * 6, s: 1 + R() * 0.7 });
    addCircle(x, z, 0.5, 6, 'tree');
  }

  L.blocks = blocks;
  return L;
}

// ------------------------------------------------------------------ path finding (A*)
// Returns a list of {x, z} road points from near (sx, sz) to near (tx, tz).
export function findPath(L, sx, sz, tx, tz, allowNode = null) {
  const nearest = (x, z) => {
    let best = null, bd = Infinity;
    for (const n of L.nodes) {
      if (allowNode && !allowNode(n)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  };
  const start = nearest(sx, sz), goal = nearest(tx, tz);
  if (!start || !goal) return [{ x: tx, z: tz }];
  const open = new Map([[start.id, 0]]);
  const g = new Map([[start.id, 0]]);
  const came = new Map();
  const h = n => Math.abs(n.x - goal.x) + Math.abs(n.z - goal.z);
  const f = new Map([[start.id, h(start)]]);
  let iter = 0;
  while (open.size && iter++ < 5000) {
    let cur = null, cf = Infinity;
    for (const id of open.keys()) { const v = f.get(id); if (v < cf) { cf = v; cur = id; } }
    if (cur === goal.id) break;
    open.delete(cur);
    const cn = L.nodes[cur];
    for (const sid of cn.segs) {
      const s = L.segments[sid];
      const nb = s.a === cur ? s.b : s.a;
      const nn = L.nodes[nb];
      if (allowNode && !allowNode(nn)) continue;
      const ng = g.get(cur) + s.len;
      if (ng < (g.has(nb) ? g.get(nb) : Infinity)) {
        came.set(nb, cur);
        g.set(nb, ng);
        f.set(nb, ng + h(nn));
        open.set(nb, true);
      }
    }
  }
  const pts = [];
  let c = goal.id;
  if (c !== start.id && !came.has(c)) return [{ x: tx, z: tz }];
  while (c !== undefined) {
    pts.push({ x: L.nodes[c].x, z: L.nodes[c].z });
    if (c === start.id) break;
    c = came.get(c);
  }
  pts.reverse();
  pts.push({ x: tx, z: tz });
  return pts;
}

export function pathLength(sx, sz, pts) {
  let len = 0, px = sx, pz = sz;
  for (const p of pts) { len += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; }
  return len;
}
