// UK Simulator - building meshes (walls with procedural windows, gabled / hipped / flat roofs)
// and their collision shapes, built in the chunk worker.
import earcut from 'https://cdn.jsdelivr.net/npm/earcut@3.0.0/+esm';
import { polyArea } from './geo-build.js';

// texture layers (see shared/textures.js)
const WALL_LAYER = [12, 13, 14, 15, 16, 17, 18, 19, 63, 20];
const ROOF_LAYER = [21, 22, 23, 11, 18, 63, 20, 5, 20];
const ROOF_TINT = [null, null, null, [0.55, 0.55, 0.57], [0.78, 0.8, 0.82], null, [0.62, 0.66, 0.7], [0.95, 0.82, 0.55], [0.45, 0.72, 0.6]];
const F = { windows: 1, shopfront: 2, industrial: 4, church: 8, garage: 16, greenhouse: 32, part: 64, tall: 128, roof: 256, gable: 512 };

function hexTint(t) { return [((t >> 16) & 255) / 255, ((t >> 8) & 255) / 255, (t & 255) / 255]; }

// b: encoded building from the chunk file; G: Geo (walls+roofs share one mesh), C: collider
export function addBuilding(b, G, C) {
  const ring = [];
  for (let k = 0; k < b.o.length; k += 2) ring.push([b.o[k], b.o[k + 1]]);
  if (ring.length < 3) return;
  if (polyArea(ring) < 0) ring.reverse();
  const holes = (b.h || []).map((h) => { const r = []; for (let k = 0; k < h.length; k += 2) r.push([h[k], h[k + 1]]); if (polyArea(r) > 0) r.reverse(); return r; });
  const y0 = b.y0, eave = b.e, ridge = b.r;
  const isPart = (b.f & F.part) !== 0;
  const bottom = isPart && b.mn > y0 + 0.5 ? b.mn : y0 - 0.4;
  const seed = (b.v || 0) / 256;
  const wallLayer = WALL_LAYER[b.w] ?? 12;
  // tint: OSM colour / chosen render colour, or natural texture colour with a small variation
  let tint = b.t !== undefined ? hexTint(b.t) : [1, 1, 1];
  const vary = 0.9 + seed * 0.18;
  tint = tint.map((c, k) => c * (k === 0 ? vary : vary * (0.98 + 0.04 * ((seed * 7.3) % 1))));
  let roofTint = b.rt !== undefined ? hexTint(b.rt) : (ROOF_TINT[b.rf] || [1, 1, 1]);
  roofTint = roofTint.map((c) => c * (0.88 + ((seed * 13.7) % 1) * 0.2));
  const flatRoof = b.s === 0 || ridge <= eave + 0.2;
  const parapet = flatRoof && ((b.f & F.industrial) || Math.abs(polyArea(ring)) > 160 || (b.f & F.shopfront)) ? 0.35 : 0;
  const wallTop = eave + parapet;
  const eaveH = eave - y0;
  const flags = b.f & 255;

  // ---- walls along every ring edge
  const doRing = (r, inner) => {
    for (let k = 0; k < r.length; k++) {
      const a = r[k], c = r[(k + 1) % r.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      let nx = dz / L, nz = -dx / L; // outward for the outer ring (clockwise seen from above)
      if (inner) { nx = -nx; nz = -nz; }
      const info = [L, b.fh || 2.7, eaveH, flags + seed * 0.99];
      const v0 = G.vert(a[0], bottom, a[1], nx, 0, nz, 0, bottom - y0, tint, wallLayer, info);
      const v1 = G.vert(c[0], bottom, c[1], nx, 0, nz, L, bottom - y0, tint, wallLayer, info);
      const v2 = G.vert(c[0], wallTop, c[1], nx, 0, nz, L, wallTop - y0, tint, wallLayer, info);
      const v3 = G.vert(a[0], wallTop, a[1], nx, 0, nz, 0, wallTop - y0, tint, wallLayer, info);
      G.quad(v0, v1, v2, v3, nx, 0, nz);
      if (parapet) {
        // inner face of the parapet
        const pi = [L, 99, eaveH, (flags & ~3) + seed * 0.99];
        const w0 = G.vert(c[0], eave, c[1], -nx, 0, -nz, 0, eave - y0, tint, wallLayer, pi), w1 = G.vert(a[0], eave, a[1], -nx, 0, -nz, L, eave - y0, tint, wallLayer, pi);
        const w2 = G.vert(a[0], wallTop, a[1], -nx, 0, -nz, L, wallTop - y0, tint, wallLayer, pi), w3 = G.vert(c[0], wallTop, c[1], -nx, 0, -nz, 0, wallTop - y0, tint, wallLayer, pi);
        G.quad(w0, w1, w2, w3, -nx, 0, -nz);
        // coping on top
        const cp = [0.75, 0.74, 0.72];
        const cw = 0.25;
        const q0 = G.vert(a[0], wallTop, a[1], 0, 1, 0, a[0], a[1], cp, 20, [0, 0, 0, 256]), q1 = G.vert(c[0], wallTop, c[1], 0, 1, 0, c[0], c[1], cp, 20, [0, 0, 0, 256]);
        const q2 = G.vert(c[0] - nx * cw, wallTop, c[1] - nz * cw, 0, 1, 0, c[0], c[1], cp, 20, [0, 0, 0, 256]), q3 = G.vert(a[0] - nx * cw, wallTop, a[1] - nz * cw, 0, 1, 0, a[0], a[1], cp, 20, [0, 0, 0, 256]);
        G.quad(q0, q1, q2, q3, 0, 1, 0);
      }
      // collider: wall strip (ground to top)
      C.wall(a[0], a[1], c[0], c[1], bottom, wallTop, bottom, wallTop);
    }
  };
  doRing(ring, false);
  for (const h of holes) doRing(h, true);

  // ---- roofs
  const rinfo = [0, 0, eaveH, F.roof + seed * 0.99];
  const roofLayer = ROOF_LAYER[b.rf] ?? 21;
  if (flatRoof) {
    const flat = [], holeIdx = [];
    for (const p of ring) flat.push(p[0], p[1]);
    for (const h of holes) { holeIdx.push(flat.length / 2); for (const p of h) flat.push(p[0], p[1]); }
    const tris = earcut(flat, holeIdx.length ? holeIdx : null);
    const base = G.count;
    const fl = b.rf === 5 ? 63 : (b.rf === 0 || b.rf === 1 || b.rf === 2 ? 11 : roofLayer);
    const ft = b.rf === 0 || b.rf === 1 || b.rf === 2 ? [0.5, 0.5, 0.52] : roofTint;
    for (let k = 0; k < flat.length; k += 2) G.vert(flat[k], eave + 0.02, flat[k + 1], 0, 1, 0, flat[k], flat[k + 1], ft, fl, rinfo);
    for (let k = 0; k < tris.length; k += 3) G.triFacing(base + tris[k], base + tris[k + 1], base + tris[k + 2], 0, 1, 0);
    // collider: roof cap
    const cb = C.count;
    for (let k = 0; k < flat.length; k += 2) C.add(flat[k], wallTop, flat[k + 1]);
    for (let k = 0; k < tris.length; k += 3) C.tri(cb + tris[k], cb + tris[k + 2], cb + tris[k + 1]);
    return;
  }
  // pitched: rectangle along the ridge direction (angle b.a)
  const ca = Math.cos(b.a), sa = Math.sin(b.a);
  let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
  for (const p of ring) { const u = p[0] * ca + p[1] * sa, w = -p[0] * sa + p[1] * ca; if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < w0) w0 = w; if (w > w1) w1 = w; }
  const toXZ = (u, w) => [u * ca - w * sa, u * sa + w * ca];
  const wc = (w0 + w1) / 2, halfW = (w1 - w0) / 2, len = u1 - u0;
  const rise = ridge - eave;
  const oh = 0.3, og = 0.2; // eave overhang, gable overhang
  const slopeW = rise / Math.max(0.5, halfW);
  const P = (u, w, y) => { const [x, z] = toXZ(u, w); return [x, y, z]; };
  const plane = (pts, layer, tintC) => {
    // pts: 3 or 4 points [x,y,z] counter-clockwise from above-ish; computes normal + uv
    const [a, c, d] = [pts[0], pts[1], pts[2]];
    let nx = (c[1] - a[1]) * (d[2] - a[2]) - (c[2] - a[2]) * (d[1] - a[1]);
    let ny = (c[2] - a[2]) * (d[0] - a[0]) - (c[0] - a[0]) * (d[2] - a[2]);
    let nz = (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    // T = cross(n, up), B = cross(T, n)
    let tx = -nz, tz = nx; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const bx = -ny * tz * 0 + (0 * nz - tz * ny), by = tz * nx - tx * nz, bz = tx * ny - 0 * nx;
    const idx = pts.map((p) => G.vert(p[0], p[1], p[2], nx, ny, nz, p[0] * tx + p[2] * tz, p[0] * bx + p[1] * by + p[2] * bz, tintC, layer, rinfo));
    if (idx.length === 3) G.triFacing(idx[0], idx[1], idx[2], nx, ny, nz);
    else G.quad(idx[0], idx[1], idx[2], idx[3], nx, ny, nz);
  };
  const gableTri = (u, sideSign) => {
    // wall triangle at a gable end
    const a = P(u, w0, eave), c = P(u, w1, eave), top = P(u, wc, ridge);
    const nx0 = ca * sideSign, nz0 = sa * sideSign;
    const ginfo = [halfW * 2, 99, eaveH, F.gable + seed * 0.99];
    const ia = G.vert(a[0], a[1], a[2], nx0, 0, nz0, 0, a[1] - y0, tint, wallLayer, ginfo);
    const ic = G.vert(c[0], c[1], c[2], nx0, 0, nz0, halfW * 2, c[1] - y0, tint, wallLayer, ginfo);
    const it = G.vert(top[0], top[1], top[2], nx0, 0, nz0, halfW, top[1] - y0, tint, wallLayer, ginfo);
    G.triFacing(ia, ic, it, nx0, 0, nz0);
    C.tri(C.add(a[0], a[1], a[2]), C.add(c[0], c[1], c[2]), C.add(top[0], top[1], top[2]));
  };
  const eY = eave - oh * slopeW;
  if (b.s === 1 || (b.s === 2 && len - 2 * halfW < 0.6 && false)) {
    // gabled
    plane([P(u0 - og, w0 - oh, eY), P(u1 + og, w0 - oh, eY), P(u1 + og, wc, ridge), P(u0 - og, wc, ridge)], roofLayer, roofTint);
    plane([P(u0 - og, w1 + oh, eY), P(u1 + og, w1 + oh, eY), P(u1 + og, wc, ridge), P(u0 - og, wc, ridge)], roofLayer, roofTint);
    gableTri(u0, -1); gableTri(u1, 1);
  } else if (b.s === 4) {
    // skillion: high along w0, low along w1
    const s = rise / Math.max(0.5, w1 - w0);
    plane([P(u0 - og, w0 - oh, ridge + oh * s), P(u1 + og, w0 - oh, ridge + oh * s), P(u1 + og, w1 + oh, eave - oh * s), P(u0 - og, w1 + oh, eave - oh * s)], roofLayer, roofTint);
    // infill walls (high side + two triangles)
    const ginfo = [len, 99, eaveH, F.gable + seed * 0.99];
    const hi0 = P(u0, w0, eave), hi1 = P(u1, w0, eave), ht0 = P(u0, w0, ridge), ht1 = P(u1, w0, ridge);
    const nx0 = sa, nz0 = -ca;
    const a1 = G.vert(hi0[0], hi0[1], hi0[2], nx0, 0, nz0, 0, hi0[1] - y0, tint, wallLayer, ginfo), a2 = G.vert(hi1[0], hi1[1], hi1[2], nx0, 0, nz0, len, hi1[1] - y0, tint, wallLayer, ginfo);
    const a3 = G.vert(ht1[0], ht1[1], ht1[2], nx0, 0, nz0, len, ht1[1] - y0, tint, wallLayer, ginfo), a4 = G.vert(ht0[0], ht0[1], ht0[2], nx0, 0, nz0, 0, ht0[1] - y0, tint, wallLayer, ginfo);
    G.quad(a1, a2, a3, a4, nx0, 0, nz0);
    for (const [u, sg] of [[u0, -1], [u1, 1]]) {
      const p1 = P(u, w0, eave), p2 = P(u, w1, eave), p3 = P(u, w0, ridge);
      const i1 = G.vert(p1[0], p1[1], p1[2], ca * sg, 0, sa * sg, 0, p1[1] - y0, tint, wallLayer, ginfo), i2 = G.vert(p2[0], p2[1], p2[2], ca * sg, 0, sa * sg, halfW * 2, p2[1] - y0, tint, wallLayer, ginfo), i3 = G.vert(p3[0], p3[1], p3[2], ca * sg, 0, sa * sg, 0, p3[1] - y0, tint, wallLayer, ginfo);
      G.triFacing(i1, i2, i3, ca * sg, 0, sa * sg);
    }
  } else {
    // hipped / pyramidal / spire / dome: hips at equal pitch
    const inset = Math.min(halfW, len / 2);
    const ra = u0 + inset, rb = u1 - inset;
    const slopeU = rise / Math.max(0.5, inset);
    const eU = eave - og * slopeU;
    const eYw = eave - oh * slopeW;
    const ey = Math.min(eU, eYw);
    if (rb - ra < 0.4 || b.s === 3 || b.s === 5 || b.s === 6) {
      const top = P((u0 + u1) / 2, wc, ridge);
      const c0 = P(u0 - oh, w0 - oh, ey), c1 = P(u1 + oh, w0 - oh, ey), c2 = P(u1 + oh, w1 + oh, ey), c3 = P(u0 - oh, w1 + oh, ey);
      plane([c0, c1, top], roofLayer, roofTint); plane([c1, c2, top], roofLayer, roofTint); plane([c2, c3, top], roofLayer, roofTint); plane([c3, c0, top], roofLayer, roofTint);
    } else {
      const r0 = P(ra, wc, ridge), r1 = P(rb, wc, ridge);
      const c0 = P(u0 - oh, w0 - oh, ey), c1 = P(u1 + oh, w0 - oh, ey), c2 = P(u1 + oh, w1 + oh, ey), c3 = P(u0 - oh, w1 + oh, ey);
      plane([c0, c1, r1, r0], roofLayer, roofTint);
      plane([c2, c3, r0, r1], roofLayer, roofTint);
      plane([c1, c2, r1], roofLayer, roofTint);
      plane([c3, c0, r0], roofLayer, roofTint);
    }
  }
  // collider: cap at the eaves
  const cb = C.count;
  const flat = [];
  for (const p of ring) { flat.push(p[0], p[1]); C.add(p[0], eave, p[1]); }
  const tris = earcut(flat);
  for (let k = 0; k < tris.length; k += 3) C.tri(cb + tris[k], cb + tris[k + 2], cb + tris[k + 1]);
}
