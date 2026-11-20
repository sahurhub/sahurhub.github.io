// TURBO TOWN - collision world. Pure JavaScript (no three.js).
//  - Ground: every drivable triangle (road, shoulders, ramps, bridges, terrain) goes into a
//    2D grid. A ground query casts a vertical ray down and returns the highest surface below
//    a start height, so bridges and stacked roads work.
//  - Edges: the drivable area is the union of the corridors around the track paths
//    (see track-math nearest()). Open zones (circles) can widen it.
//  - Obstacles: circles (trees, mushrooms, posts) and moving circles, in a grid.
//  - Water: regions with a water level; deep water sends a kart back to the track.
import { nearest } from '../shared/track-math.js';
import { moverPos } from '../shared/movers.js';
import { SURF } from '../shared/surfaces.js';

const TCELL = 8;   // triangle grid cell size (m)
const OCELL = 8;   // obstacle grid cell size (m)
const key = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);

export class CollisionWorld {
  constructor(track) {
    this.track = track;
    this.tris = new Float32Array(14 * 4096);
    this.triCount = 0;
    this.cells = new Map();
    this.obstacles = [];
    this.ocells = new Map();
    this.moving = [];        // moving obstacles: { x, z, r, y0, y1, vx, vz, kind }
    this.water = [];         // { level, deep, test(x, z) }
    this.zones = (track && track.zones) || []; // open areas { x, z, r, y0, y1 }
    this.rects = [];         // open rectangles { x0, z0, x1, z1 } (a whole city you can drive anywhere in)
    this._near = {};
  }

  // ---------------------------------------------------------------- triangles

  // pos: flat array of xyz for each vertex, 3 vertices per triangle (non-indexed),
  // or indexed with idx. surf: surface id for all, or a function (triIndex) -> id.
  addMesh(pos, idx, surf) {
    const triN = idx ? idx.length / 3 : pos.length / 9;
    for (let t = 0; t < triN; t++) {
      const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      this.addTri(pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2], pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2],
        pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2], typeof surf === 'function' ? surf(t) : surf);
    }
  }

  addTri(ax, ay, az, bx, by, bz, cx, cy, cz, surf) {
    // normal (pointing up)
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) return;
    nx /= nl; ny /= nl; nz /= nl;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    if (ny < 0.25) return; // walls are not ground
    if (this.triCount * 14 + 14 > this.tris.length) {
      const bigger = new Float32Array(this.tris.length * 2);
      bigger.set(this.tris);
      this.tris = bigger;
    }
    const o = this.triCount * 14;
    const T = this.tris;
    T[o] = ax; T[o + 1] = ay; T[o + 2] = az; T[o + 3] = bx; T[o + 4] = by; T[o + 5] = bz;
    T[o + 6] = cx; T[o + 7] = cy; T[o + 8] = cz;
    T[o + 9] = nx; T[o + 10] = ny; T[o + 11] = nz; T[o + 12] = nx * ax + ny * ay + nz * az; T[o + 13] = surf;
    const ti = this.triCount++;
    const x0 = Math.floor(Math.min(ax, bx, cx) / TCELL), x1 = Math.floor(Math.max(ax, bx, cx) / TCELL);
    const z0 = Math.floor(Math.min(az, bz, cz) / TCELL), z1 = Math.floor(Math.max(az, bz, cz) / TCELL);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = key(gx, gz);
      let list = this.cells.get(k);
      if (!list) this.cells.set(k, list = []);
      list.push(ti);
    }
  }

  // Highest ground at (x, z) whose height is <= yTop. Returns out or null.
  // out: { y, nx, ny, nz, surf }
  ground(x, yTop, z, out = {}) {
    const list = this.cells.get(key(Math.floor(x / TCELL), Math.floor(z / TCELL)));
    if (!list) return null;
    const T = this.tris;
    let bestY = -Infinity, bo = -1;
    for (let k = 0; k < list.length; k++) {
      const o = list[k] * 14;
      const ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx = T[o + 6], cz = T[o + 8];
      // point in triangle (2D, either winding)
      const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
      const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
      const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (neg && pos) continue;
      const y = (T[o + 12] - T[o + 9] * x - T[o + 11] * z) / T[o + 10];
      if (y <= yTop && y > bestY) { bestY = y; bo = o; }
    }
    if (bo < 0) return null;
    out.y = bestY; out.nx = T[bo + 9]; out.ny = T[bo + 10]; out.nz = T[bo + 11]; out.surf = T[bo + 13];
    return out;
  }

  // ---------------------------------------------------------------- obstacles

  // circle obstacle: { x, z, r, y0, y1, bounce, kind }
  addCircle(o) {
    o.y0 = o.y0 ?? -1e9; o.y1 = o.y1 ?? 1e9;
    o.bounce = o.bounce ?? 0.4;
    this.obstacles.push(o);
    const x0 = Math.floor((o.x - o.r) / OCELL), x1 = Math.floor((o.x + o.r) / OCELL);
    const z0 = Math.floor((o.z - o.r) / OCELL), z1 = Math.floor((o.z + o.r) / OCELL);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = key(gx, gz);
      let list = this.ocells.get(k);
      if (!list) this.ocells.set(k, list = []);
      list.push(o);
    }
    return o;
  }

  // box obstacle (a building, a wall): { x, z, hx, hz, y0, y1 } - axis-aligned, hx/hz are
  // half the width and depth
  addBox(o) {
    o.box = true;
    o.r = Math.hypot(o.hx, o.hz);
    o.y0 = o.y0 ?? -1e9; o.y1 = o.y1 ?? 1e9;
    o.bounce = o.bounce ?? 0.3;
    this.obstacles.push(o);
    const x0 = Math.floor((o.x - o.hx) / OCELL), x1 = Math.floor((o.x + o.hx) / OCELL);
    const z0 = Math.floor((o.z - o.hz) / OCELL), z1 = Math.floor((o.z + o.hz) / OCELL);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = key(gx, gz);
      let list = this.ocells.get(k);
      if (!list) this.ocells.set(k, list = []);
      list.push(o);
    }
    return o;
  }

  // Moving obstacles from the map data (see shared/movers.js), positioned by race time.
  setupMovers(list) {
    this.moving = (list || []).map((m) => ({ def: m, x: 0, z: 0, y: 0, vx: 0, vz: 0, r: m.r || 1.5, y0: -1e9, y1: 1e9, bounce: 0.8, kind: 'mover', heading: 0, ph: 0, spin: m.spin !== false }));
    this.updateMovers(0);
  }

  updateMovers(t) {
    for (const o of this.moving) {
      const px = o.x, pz = o.z;
      moverPos(o.def, t, this.track, o);
      o.y0 = o.y - 1; o.y1 = o.y + (o.def.h || 3);
      o.vx = (o.x - px) * 60; o.vz = (o.z - pz) * 60;
    }
  }

  // calls fn(obstacle) for static and moving obstacles near (x, z)
  nearObstacles(x, z, fn) {
    const list = this.ocells.get(key(Math.floor(x / OCELL), Math.floor(z / OCELL)));
    if (list) for (const o of list) fn(o);
    for (const o of this.moving) if (!o.disabled) fn(o);
  }

  // ---------------------------------------------------------------- water

  // region: { level, depth (how deep counts as deep), test(x, z) -> bool }
  addWater(region) { this.water.push(region); }

  waterAt(x, z) {
    for (const w of this.water) if (w.test(x, z)) return w;
    return null;
  }

  // ---------------------------------------------------------------- track edges

  // Returns the nearest path info plus: inside (bool), excess (metres outside the
  // drivable area, <= 0 inside) and the outward direction (ox, oz) to push back along.
  // An open zone (circle) counts as drivable too.
  edge(x, y, z, radius, out = this._near) {
    const n = nearest(this.track, x, y, z, out);
    if (!n) return null;
    const sg = n.lat >= 0 ? 1 : -1;
    n.excess = Math.abs(n.lat) - (n.limit - radius);
    n.ox = n.rx * sg; n.oz = n.rz * sg;
    n.zone = null;
    for (const zn of this.zones) {
      if (y < (zn.y0 ?? -1e9) || y > (zn.y1 ?? 1e9)) continue;
      const dx = x - zn.x, dz = z - zn.z, d = Math.hypot(dx, dz) || 1e-6;
      const ex = d - (zn.r - radius);
      if (ex < n.excess) { n.excess = ex; n.ox = dx / d; n.oz = dz / d; n.zone = zn; }
    }
    for (const rc of this.rects) {
      // inside: how far in from the nearest side; outside: how far out
      const ox = Math.max(rc.x0 - x, 0, x - rc.x1), oz = Math.max(rc.z0 - z, 0, z - rc.z1);
      let ex, nx = 0, nz = 0;
      if (ox > 0 || oz > 0) {
        const d = Math.hypot(ox, oz);
        ex = d + radius;
        nx = (x < rc.x0 ? -ox : x > rc.x1 ? ox : 0) / d; nz = (z < rc.z0 ? -oz : z > rc.z1 ? oz : 0) / d;
      } else {
        const dl = x - rc.x0, dr = rc.x1 - x, db = z - rc.z0, df = rc.z1 - z;
        const m = Math.min(dl, dr, db, df);
        ex = radius - m;
        if (m === dl) nx = -1; else if (m === dr) nx = 1; else if (m === db) nz = -1; else nz = 1;
      }
      if (ex < n.excess) { n.excess = ex; n.ox = nx; n.oz = nz; n.zone = rc; }
    }
    n.inside = n.excess <= 0;
    return n;
  }
}

export { SURF };
