// Static collision world: boxes (with a top height you can stand on) and circles, stored in a
// spatial hash. Characters and vehicles resolve as circles against it.
import { CITY } from './config.js';

const CELL = 16;

export class CollisionWorld {
  constructor(layout) {
    this.layout = layout;
    this.grid = new Map();
    this.items = [];
    this.stamp = 0;
    for (const c of layout.colliders) this.add(c);
  }
  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  add(c) {
    c._s = 0;
    this.items.push(c);
    const [x0, x1, z0, z1] = c.t === 'b' ? [c.minX, c.maxX, c.minZ, c.maxZ] : [c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r];
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = this.key(cx, cz);
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, a = []);
        a.push(c);
      }
    }
  }
  remove(c) {
    for (const a of this.grid.values()) {
      const i = a.indexOf(c);
      if (i >= 0) a.splice(i, 1);
    }
    const i = this.items.indexOf(c);
    if (i >= 0) this.items.splice(i, 1);
  }
  query(x0, z0, x1, z1, out = []) {
    out.length = 0;
    const st = ++this.stamp;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const a = this.grid.get(this.key(cx, cz));
        if (!a) continue;
        for (const c of a) if (c._s !== st) { c._s = st; out.push(c); }
      }
    }
    return out;
  }

  // ground height under a circle for something whose feet are at `feetY` (can step onto low tops)
  groundAt(x, z, r, feetY, step = 0.45) {
    let g = this.layout.heightAt(x, z);
    const list = this.query(x - r, z - r, x + r, z + r, this._q || (this._q = []));
    for (const c of list) {
      if (c.top > feetY + step) continue;
      if (c.t === 'b') {
        if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && c.top > g) g = c.top;
      } else if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r && c.top > g) g = c.top;
    }
    return g;
  }

  // push a circle out of everything taller than feetY + step. Returns {x, z, nx, nz, hit, tag}
  resolveCircle(x, z, r, feetY = 0, step = 0.45, ignoreTops = false) {
    const res = this._res || (this._res = { x: 0, z: 0, nx: 0, nz: 0, hit: false, depth: 0, tag: null });
    res.hit = false; res.nx = 0; res.nz = 0; res.depth = 0; res.tag = null;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const list = this.query(x - r, z - r, x + r, z + r, this._q2 || (this._q2 = []));
      for (const c of list) {
        if (!ignoreTops && c.top <= feetY + step) continue;
        let px, pz, d, nx, nz;
        if (c.t === 'b') {
          px = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
          pz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
          const dx = x - px, dz = z - pz;
          d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d < 1e-5) {
            // centre inside the box: push out along the smallest axis
            const l = x - c.minX, rr = c.maxX - x, t = z - c.minZ, b = c.maxZ - z;
            const m = Math.min(l, rr, t, b);
            if (m === l) { nx = -1; nz = 0; x = c.minX - r; }
            else if (m === rr) { nx = 1; nz = 0; x = c.maxX + r; }
            else if (m === t) { nx = 0; nz = -1; z = c.minZ - r; }
            else { nx = 0; nz = 1; z = c.maxZ + r; }
            res.depth = Math.max(res.depth, r + m);
          } else {
            nx = dx / d; nz = dz / d;
            x = px + nx * r; z = pz + nz * r;
            res.depth = Math.max(res.depth, r - d);
          }
        } else {
          const dx = x - c.x, dz = z - c.z;
          d = Math.hypot(dx, dz);
          const rr = r + c.r;
          if (d >= rr) continue;
          nx = d > 1e-5 ? dx / d : 1; nz = d > 1e-5 ? dz / d : 0;
          x = c.x + nx * rr; z = c.z + nz * rr;
          res.depth = Math.max(res.depth, rr - d);
        }
        res.hit = true; res.nx += nx; res.nz += nz; res.tag = c.tag;
        moved = true;
      }
      if (!moved) break;
    }
    const h = CITY.worldHalf - r;
    if (x < -h) { x = -h; res.hit = true; res.nx += 1; }
    if (x > h) { x = h; res.hit = true; res.nx -= 1; }
    if (z < -h) { z = -h; res.hit = true; res.nz += 1; }
    if (z > h) { z = h; res.hit = true; res.nz -= 1; }
    const nl = Math.hypot(res.nx, res.nz);
    if (nl > 0) { res.nx /= nl; res.nz /= nl; }
    res.x = x; res.z = z;
    return res;
  }

  // segment test (camera collision). Returns the fraction [0..1] of the first hit or 1.
  raycast(ax, ay, az, bx, by, bz) {
    const list = this.query(Math.min(ax, bx) - 1, Math.min(az, bz) - 1, Math.max(ax, bx) + 1, Math.max(az, bz) + 1, this._q3 || (this._q3 = []));
    let best = 1;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    for (const c of list) {
      if (c.t !== 'b' || c.top < 2.5) continue;
      // slab test in 3D against box [minX,maxX] x [0, top] x [minZ,maxZ]
      let t0 = 0, t1 = best;
      const slab = (o, d, mn, mx) => {
        if (Math.abs(d) < 1e-8) return o >= mn && o <= mx;
        let ta = (mn - o) / d, tb = (mx - o) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        return t0 <= t1;
      };
      if (slab(ax, dx, c.minX, c.maxX) && slab(ay, dy, 0, c.top) && slab(az, dz, c.minZ, c.maxZ)) {
        if (t0 < best) best = t0;
      }
    }
    return best;
  }
}
