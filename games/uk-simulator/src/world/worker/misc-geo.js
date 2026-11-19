// UK Simulator - railways, water surfaces and walls / fences / hedges in the chunk worker.
import earcut from 'https://cdn.jsdelivr.net/npm/earcut@3.0.0/+esm';

const inChunk = (x, z) => x >= 0 && x < 256 && z >= 0 && z < 256;

export function buildRail(rl, heightAt, M, C, furnOut) {
  for (const r of rl) {
    if (r.k === 2) continue; // platforms: drawn as paved ground
    const pts = [];
    for (let k = 0; k < r.p.length; k += 3) pts.push([r.p[k], r.p[k + 1], r.p[k + 2]]);
    const gauge = r.k === 0 ? 1.435 : 0.61;
    const bridge = (r.f & 1) !== 0;
    let acc = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      const mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2;
      const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
      acc += L;
      if (!inChunk(mx, mz)) continue;
      const ya = bridge ? a[1] : heightAt(a[0], a[2]), yb = bridge ? b[1] : heightAt(b[0], b[2]);
      const dx = (b[0] - a[0]) / (L || 1), dz = (b[2] - a[2]) / (L || 1), lx = dz, lz = -dx;
      // sleepers (one strip) and the two rails
      M.boxAlong(a[0], ya + 0.05, a[2], b[0], yb + 0.05, b[2], gauge + 1.1, 0.1, [0.28, 0.24, 0.2], true, true);
      for (const s of [1, -1]) {
        const o = s * gauge / 2;
        M.boxAlong(a[0] + lx * o, ya + 0.15, a[2] + lz * o, b[0] + lx * o, yb + 0.15, b[2] + lz * o, 0.07, 0.13, [0.42, 0.4, 0.38], true, true);
      }
      if (bridge) {
        // deck under the track + low parapets
        M.boxAlong(a[0], ya - 0.9, a[2], b[0], yb - 0.9, b[2], 4.5, 0.95, [0.6, 0.57, 0.52], true, true);
        for (const s of [1, -1]) M.boxAlong(a[0] + lx * s * 2.1, ya, a[2] + lz * s * 2.1, b[0] + lx * s * 2.1, yb, b[2] + lz * s * 2.1, 0.25, 1.0, [0.6, 0.57, 0.52], true, true);
        const ca = C.add(a[0] + lx * 2.2, ya + 0.05, a[2] + lz * 2.2), cb = C.add(b[0] + lx * 2.2, yb + 0.05, b[2] + lz * 2.2), cc = C.add(b[0] - lx * 2.2, yb + 0.05, b[2] - lz * 2.2), cd = C.add(a[0] - lx * 2.2, ya + 0.05, a[2] - lz * 2.2);
        C.quad(ca, cb, cc, cd);
      }
      // overhead line masts on the electrified main line, every ~55 m
      if (r.f & 2 && r.k === 0 && Math.floor((acc - L) / 55) !== Math.floor(acc / 55)) furnOut.push(41, a[0] + lx * 2.6, ya, a[2] + lz * 2.6, Math.atan2(dz, dx));
      if (r.f & 2 && r.k === 0) M.boxAlong(a[0], ya + 5.4, a[2], b[0], yb + 5.4, b[2], 0.02, 0.02, [0.2, 0.2, 0.2], true, true);
    }
  }
}

export function buildWater(wa, wl, W) {
  for (const w of wa) {
    const flat = Array.from(w.o), holes = [];
    for (const h of w.h || []) { holes.push(flat.length / 2); for (const v of h) flat.push(v); }
    const tris = earcut(flat, holes.length ? holes : null);
    const base = W.count;
    for (let k = 0; k < flat.length; k += 2) W.vert(flat[k], w.y, flat[k + 1], 0, 1, 0, flat[k], flat[k + 1], null, 0, null);
    for (let k = 0; k < tris.length; k += 3) W.triFacing(base + tris[k], base + tris[k + 1], base + tris[k + 2], 0, 1, 0);
  }
  for (const l of wl) {
    const pts = [];
    for (let k = 0; k < l.p.length; k += 3) pts.push([l.p[k], l.p[k + 1], l.p[k + 2]]);
    const hw = l.w / 2 + 0.4;
    let prev = null;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1;
      const lx = dz / L, lz = -dx / L, p = pts[k];
      const vl = W.vert(p[0] + lx * hw, p[1], p[2] + lz * hw, 0, 1, 0, p[0] + lx * hw, p[2] + lz * hw, null, 0, null);
      const vr = W.vert(p[0] - lx * hw, p[1], p[2] - lz * hw, 0, 1, 0, p[0] - lx * hw, p[2] - lz * hw, null, 0, null);
      if (prev && (inChunk(p[0], p[2]) || inChunk(pts[k - 1][0], pts[k - 1][2]))) W.quad(prev[0], vl, vr, prev[1], 0, 1, 0);
      prev = [vl, vr];
    }
  }
}

// barrier kinds: hedge, wall, fence, retaining_wall, guard_rail, city_wall, railing, hedge_bank
export function buildBarriers(ba, heightAt, G, C) {
  for (const b of ba) {
    const pts = [];
    for (let k = 0; k < b.p.length; k += 2) pts.push([b.p[k], b.p[k + 1]]);
    const kind = b.k;
    const h = b.h || 1.5;
    const w = kind === 0 || kind === 7 ? 1.1 : kind === 1 || kind === 5 ? 0.3 : kind === 3 ? 0.4 : 0.06;
    const layer = kind === 0 || kind === 7 ? 3 : kind === 1 || kind === 3 || kind === 5 ? 12 : kind === 2 ? 19 : 18;
    const tint = kind === 0 || kind === 7 ? [0.42, 0.56, 0.3] : kind === 4 || kind === 6 ? [0.75, 0.77, 0.8] : kind === 2 ? [1.7, 1.5, 1.25] : [1, 1, 1];
    const lift = kind === 4 ? 0.35 : 0;
    const hh = kind === 4 ? 0.35 : h;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], c = pts[k + 1];
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (!inChunk(mx, mz)) continue;
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 0.05) continue;
      // split long runs so they follow the ground
      const n = Math.max(1, Math.ceil(L / 4));
      for (let s = 0; s < n; s++) {
        const x0 = a[0] + (c[0] - a[0]) * s / n, z0 = a[1] + (c[1] - a[1]) * s / n;
        const x1 = a[0] + (c[0] - a[0]) * (s + 1) / n, z1 = a[1] + (c[1] - a[1]) * (s + 1) / n;
        const y0 = heightAt(x0, z0) + lift, y1 = heightAt(x1, z1) + lift;
        box(G, x0, y0 - 0.1, z0, x1, y1 - 0.1, z1, w, hh + 0.1, tint, layer, kind === 0 || kind === 7);
        if (kind !== 6) C.wall(x0, z0, x1, z1, y0 - 0.1, y0 + hh, y1 - 0.1, y1 + hh);
      }
      // fence / railing posts handled by the panel look; guard rail posts
    }
  }
}

function box(G, x0, y0, z0, x1, y1, z1, w, h, tint, layer, soft) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1e-6;
  const nx = dz / L, nz = -dx / L;
  const hw = w / 2;
  const P = [[x0 + nx * hw, z0 + nz * hw, y0], [x1 + nx * hw, z1 + nz * hw, y1], [x1 - nx * hw, z1 - nz * hw, y1], [x0 - nx * hw, z0 - nz * hw, y0]];
  const info = [0, 0, 0, 256];
  const top = soft ? 0.25 : 0;
  // two long sides
  for (const [i, j, sx, sz] of [[0, 1, nx, nz], [3, 2, -nx, -nz]]) {
    const a = G.vert(P[i][0], P[i][2], P[i][1], sx, 0, sz, 0, 0, tint, layer, info), b = G.vert(P[j][0], P[j][2], P[j][1], sx, 0, sz, L, 0, tint, layer, info);
    const c = G.vert(P[j][0] - sx * top, P[j][2] + h, P[j][1] - sz * top, sx, 0.3, sz, L, h, tint, layer, info), d = G.vert(P[i][0] - sx * top, P[i][2] + h, P[i][1] - sz * top, sx, 0.3, sz, 0, h, tint, layer, info);
    G.quad(a, b, c, d, sx, 0, sz);
  }
  // top
  const a = G.vert(P[0][0] - nx * top, P[0][2] + h, P[0][1] - nz * top, 0, 1, 0, 0, 0, tint, layer, info), b = G.vert(P[1][0] - nx * top, P[1][2] + h, P[1][1] - nz * top, 0, 1, 0, L, 0, tint, layer, info);
  const c = G.vert(P[2][0] + nx * top, P[2][2] + h, P[2][1] + nz * top, 0, 1, 0, L, w, tint, layer, info), d = G.vert(P[3][0] + nx * top, P[3][2] + h, P[3][1] + nz * top, 0, 1, 0, 0, w, tint, layer, info);
  G.quad(a, b, c, d, 0, 1, 0);
}
