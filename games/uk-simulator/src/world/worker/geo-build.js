// UK Simulator - geometry helpers for the chunk worker (no three.js here: plain arrays).
export class Geo {
  // attribute layout per vertex: position 3, normal 3, uv 2, tint 3, mat 1, info 4
  constructor(extra = true) { this.p = []; this.n = []; this.uv = []; this.t = []; this.m = []; this.i = []; this.idx = []; this.extra = extra; }
  get count() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v, tint, mat, info) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v);
    if (this.extra) { this.t.push(tint[0], tint[1], tint[2]); this.m.push(mat); this.i.push(info[0], info[1], info[2], info[3]); }
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  // quad a-b-c-d (any order around the edge); faces the given normal
  quad(a, b, c, d, nx, ny, nz) {
    const P = this.p;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz >= 0) { this.idx.push(a, b, c, a, c, d); } else { this.idx.push(a, c, b, a, d, c); }
  }
  triFacing(a, b, c, nx, ny, nz) {
    const P = this.p;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
  out() {
    const o = {
      p: new Float32Array(this.p), n: new Float32Array(this.n), uv: new Float32Array(this.uv),
      idx: this.count > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
    };
    if (this.extra) { o.t = new Float32Array(this.t); o.m = new Float32Array(this.m); o.i = new Float32Array(this.i); }
    return o;
  }
  buffers(o) { const b = [o.p.buffer, o.n.buffer, o.uv.buffer, o.idx.buffer]; if (o.t) b.push(o.t.buffer, o.m.buffer, o.i.buffer); return b; }
}

// simple coloured geometry (position, normal, colour)
export class ColGeo {
  constructor() { this.p = []; this.n = []; this.c = []; this.idx = []; }
  get count() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, r, g, b) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(r, g, b); return this.count - 1; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d, nx, ny, nz) {
    const P = this.p;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz >= 0) this.idx.push(a, b, c, a, c, d); else this.idx.push(a, c, b, a, d, c);
  }
  // a box along a segment (for kerbs, rails, walls...): from (x0,z0) to (x1,z1), width w, from y0a/y0b (bottom at each end) up by h
  boxAlong(x0, y0, z0, x1, y1, z1, w, h, col, top = true, sides = true, ends = false) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1e-6;
    const nx = dz / L * w / 2, nz = -dx / L * w / 2; // left side offset (outward normal for the +n side)
    const [r, g, b] = col;
    const S = (sx, sz, y) => [sx, y, sz];
    const pts = [
      S(x0 + nx, z0 + nz, y0), S(x1 + nx, z1 + nz, y1), S(x1 - nx, z1 - nz, y1), S(x0 - nx, z0 - nz, y0),
    ];
    const ux = nx / (w / 2), uz = nz / (w / 2);
    if (top) {
      const a = this.vert(pts[0][0], pts[0][1] + h, pts[0][2], 0, 1, 0, r, g, b), bb = this.vert(pts[1][0], pts[1][1] + h, pts[1][2], 0, 1, 0, r, g, b);
      const c = this.vert(pts[2][0], pts[2][1] + h, pts[2][2], 0, 1, 0, r, g, b), d = this.vert(pts[3][0], pts[3][1] + h, pts[3][2], 0, 1, 0, r, g, b);
      this.quad(a, bb, c, d, 0, 1, 0);
    }
    if (sides) {
      for (const [p, q, sx, sz] of [[0, 1, ux, uz], [3, 2, -ux, -uz]]) {
        const a = this.vert(pts[p][0], pts[p][1], pts[p][2], sx, 0, sz, r * 0.85, g * 0.85, b * 0.85), bb = this.vert(pts[q][0], pts[q][1], pts[q][2], sx, 0, sz, r * 0.85, g * 0.85, b * 0.85);
        const c = this.vert(pts[q][0], pts[q][1] + h, pts[q][2], sx, 0, sz, r * 0.85, g * 0.85, b * 0.85), d = this.vert(pts[p][0], pts[p][1] + h, pts[p][2], sx, 0, sz, r * 0.85, g * 0.85, b * 0.85);
        this.quad(a, bb, c, d, sx, 0, sz);
      }
    }
    if (ends) {
      const ex = dx / L, ez = dz / L;
      for (const [p, q, sx, sz] of [[0, 3, -ex, -ez], [1, 2, ex, ez]]) {
        const a = this.vert(pts[p][0], pts[p][1], pts[p][2], sx, 0, sz, r * 0.8, g * 0.8, b * 0.8), bb = this.vert(pts[q][0], pts[q][1], pts[q][2], sx, 0, sz, r * 0.8, g * 0.8, b * 0.8);
        const c = this.vert(pts[q][0], pts[q][1] + h, pts[q][2], sx, 0, sz, r * 0.8, g * 0.8, b * 0.8), d = this.vert(pts[p][0], pts[p][1] + h, pts[p][2], sx, 0, sz, r * 0.8, g * 0.8, b * 0.8);
        this.quad(a, bb, c, d, sx, 0, sz);
      }
    }
  }
  out() { return { p: new Float32Array(this.p), n: new Float32Array(this.n), c: new Float32Array(this.c), idx: this.count > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx) }; }
}

// collider triangles (positions + indices)
export class Col {
  constructor() { this.v = []; this.i = []; }
  get count() { return this.v.length / 3; }
  add(x, y, z) { this.v.push(x, y, z); return this.count - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  // vertical wall strip between two points
  wall(x0, z0, x1, z1, yb0, yt0, yb1, yt1) {
    const a = this.add(x0, yb0, z0), b = this.add(x1, yb1, z1), c = this.add(x1, yt1, z1), d = this.add(x0, yt0, z0);
    this.quad(a, b, c, d);
  }
  out() { return { v: new Float32Array(this.v), i: new Uint32Array(this.i) }; }
}

export function polyArea(pts) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; return a / 2; }
