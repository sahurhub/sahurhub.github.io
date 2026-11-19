// UK Simulator - roads in the chunk worker: the surface distance field (drawn by the ground
// shader), raised pavements with kerbs, road markings, bridge decks and speed humps.
const RF = { oneway: 1, bridge: 2, tunnel: 4, sideL: 8, sideR: 16, lit: 32, roundabout: 64, centreLine: 128, cycleLane: 256, doubleYellow: 512, ford: 1024, noCars: 2048, noBikes: 4096 };
export { RF };
export const SDF_SIZE = 256; // 1 m texels over the 256 m chunk
const SURF = { asphalt: 0, paved: 1 };

// road piece -> points [[x, y, z], ...]
export function piecePoints(r) { const pts = []; for (let k = 0; k < r.p.length; k += 3) pts.push([r.p[k], r.p[k + 1], r.p[k + 2]]); return pts; }

// segment grid for "which road is near this point" questions
export class SegGrid {
  constructor(roads, cell = 8) {
    this.cell = cell; this.map = new Map();
    for (const r of roads) {
      const pts = r.pts;
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1];
        const seg = { r, a, b };
        const pad = r.w / 2 + 3;
        const gx0 = Math.floor((Math.min(a[0], b[0]) - pad) / cell), gx1 = Math.floor((Math.max(a[0], b[0]) + pad) / cell);
        const gz0 = Math.floor((Math.min(a[2], b[2]) - pad) / cell), gz1 = Math.floor((Math.max(a[2], b[2]) + pad) / cell);
        for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) { const key = gx * 10007 + gz; let l = this.map.get(key); if (!l) this.map.set(key, l = []); l.push(seg); }
      }
    }
  }
  near(x, z) { return this.map.get(Math.floor(x / this.cell) * 10007 + Math.floor(z / this.cell)) || []; }
  // true if (x,z) is on the carriageway of a drivable road other than `self`
  inOtherCarriageway(x, z, self, margin = 0) {
    for (const s of this.near(x, z)) {
      if (s.r === self || s.r.noRoad) continue;
      if (distSeg(x, z, s.a, s.b) < s.r.w / 2 + margin) return s.r;
    }
    return null;
  }
}

export function distSeg(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[2] - a[2], L2 = dx * dx + dz * dz || 1e-9;
  let t = ((x - a[0]) * dx + (z - a[2]) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz);
}

// ---------------------------------------------------------------- distance field
// R: asphalt carriageway, G: paved (pavements, footways, paved paths), B: unpaved tracks/paths.
// value = 128 - distance * 32 (inside > 128), distance clamped to +-4 m.
export function buildSdf(roads) {
  const S = SDF_SIZE;
  const d = [new Float32Array(S * S).fill(4), new Float32Array(S * S).fill(4), new Float32Array(S * S).fill(4)];
  const stamp = (ch, pts, inner, outer) => {
    // distance to a band around the polyline between `inner` and `outer` (inner 0 = centre)
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      const pad = outer + 4;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - pad)), x1 = Math.min(S - 1, Math.ceil(Math.max(a[0], b[0]) + pad));
      const z0 = Math.max(0, Math.floor(Math.min(a[2], b[2]) - pad)), z1 = Math.min(S - 1, Math.ceil(Math.max(a[2], b[2]) + pad));
      if (x0 > x1 || z0 > z1) continue;
      const dx = b[0] - a[0], dz = b[2] - a[2], L2 = dx * dx + dz * dz || 1e-9;
      const arr = d[ch];
      for (let z = z0; z <= z1; z++) {
        const pz = z + 0.5 - a[2];
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5 - a[0];
          let t = (px * dx + pz * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dist = Math.hypot(px - t * dx, pz - t * dz);
          const v = inner > 0 ? Math.abs(dist - (inner + outer) / 2) - (outer - inner) / 2 : dist - outer;
          const i = z * S + x;
          if (v < arr[i]) arr[i] = v;
        }
      }
    }
  };
  for (const r of roads) {
    if (r.f & (RF.bridge | RF.tunnel)) continue;
    const hw = r.w / 2;
    const ch = r.s === SURF.asphalt ? 0 : r.s === SURF.paved ? 1 : 2;
    stamp(ch, r.pts, 0, hw);
    if (r.f & RF.sideL || r.f & RF.sideR) stamp(1, r.pts, hw, hw + r.sw);
  }
  const out = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    out[i * 4] = Math.max(0, Math.min(255, Math.round(128 - d[0][i] * 32)));
    out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(128 - d[1][i] * 32)));
    out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(128 - d[2][i] * 32)));
    out[i * 4 + 3] = 255;
  }
  return out;
}

// ---------------------------------------------------------------- pavements, markings, decks, humps
const inChunk = (x, z) => x >= 0 && x < 256 && z >= 0 && z < 256;
const WHITE = [0.92, 0.92, 0.9], YELLOW = [0.95, 0.78, 0.15];

function offsetLine(pts, off) {
  // mitred offset of a polyline (left-hand normal * off; negative = right)
  const out = [];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    let dx = b[0] - a[0], dz = b[2] - a[2];
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    out.push([pts[k][0] + dz * off, pts[k][2] - dx * off]);
  }
  return out;
}

export function buildRoadStuff(roads, grid, heightAt, G, M, C) {
  for (const r of roads) {
    const pts = r.pts;
    if (pts.length < 2 || (r.f & RF.tunnel)) continue;
    const hw = r.w / 2;
    const bridge = (r.f & RF.bridge) !== 0;
    const yAt = (k, x, z) => (bridge ? pts[k][1] : heightAt(x, z));
    // ---- bridge deck
    if (bridge) buildDeck(r, pts, G, C);
    // ---- raised pavements with kerbs
    for (const side of [1, -1]) {
      if (!(r.f & (side > 0 ? RF.sideL : RF.sideR)) || bridge) continue;
      const inner = offsetLine(pts, side * (hw)), outer = offsetLine(pts, side * (hw + r.sw)), mid = offsetLine(pts, side * (hw + r.sw / 2));
      const cut = mid.map((p, k) => !!grid.inOtherCarriageway(p[0], p[1], r, 0.3) || !!grid.inOtherCarriageway(inner[k][0], inner[k][1], r, 0.1));
      for (let k = 0; k + 1 < pts.length; k++) {
        if (cut[k] || cut[k + 1]) continue;
        const mx = (mid[k][0] + mid[k + 1][0]) / 2, mz = (mid[k][1] + mid[k + 1][1]) / 2;
        if (!inChunk(mx, mz)) continue;
        const i0 = inner[k], i1 = inner[k + 1], o0 = outer[k], o1 = outer[k + 1];
        const yi0 = heightAt(i0[0], i0[1]), yi1 = heightAt(i1[0], i1[1]), yo0 = heightAt(o0[0], o0[1]), yo1 = heightAt(o1[0], o1[1]);
        const top = 0.12;
        // town centre: paving slabs; elsewhere the usual grey tarmac pavement
        const centre = (r.f & RF.doubleYellow) !== 0;
        const pv = centre ? [0.92, 0.92, 0.92] : [1.25, 1.25, 1.25], pl = centre ? 1 : 11;
        // top
        const a = G.vert(i0[0], yi0 + top, i0[1], 0, 1, 0, i0[0], i0[1], pv, pl, [0, 0, 0, 256]);
        const b = G.vert(i1[0], yi1 + top, i1[1], 0, 1, 0, i1[0], i1[1], pv, pl, [0, 0, 0, 256]);
        const c = G.vert(o1[0], yo1 + top, o1[1], 0, 1, 0, o1[0], o1[1], pv, pl, [0, 0, 0, 256]);
        const d = G.vert(o0[0], yo0 + top, o0[1], 0, 1, 0, o0[0], o0[1], pv, pl, [0, 0, 0, 256]);
        G.quad(a, b, c, d, 0, 1, 0);
        // kerb face (towards the road) and back face
        const dx = i1[0] - i0[0], dz = i1[1] - i0[1], L = Math.hypot(dx, dz) || 1;
        const nx = -dz / L * side, nz = dx / L * side; // pointing from pavement to road
        const kc = [0.78, 0.77, 0.75];
        const k0 = G.vert(i0[0], yi0 - 0.03, i0[1], nx, 0, nz, 0, 0, kc, 10, [0, 0, 0, 256]), k1 = G.vert(i1[0], yi1 - 0.03, i1[1], nx, 0, nz, L, 0, kc, 10, [0, 0, 0, 256]);
        const k2 = G.vert(i1[0], yi1 + top, i1[1], nx, 0, nz, L, 0.15, kc, 10, [0, 0, 0, 256]), k3 = G.vert(i0[0], yi0 + top, i0[1], nx, 0, nz, 0, 0.15, kc, 10, [0, 0, 0, 256]);
        G.quad(k0, k1, k2, k3, nx, 0, nz);
        const b0 = G.vert(o0[0], yo0 - 0.03, o0[1], -nx, 0, -nz, 0, 0, kc, 10, [0, 0, 0, 256]), b1 = G.vert(o1[0], yo1 - 0.03, o1[1], -nx, 0, -nz, L, 0, kc, 10, [0, 0, 0, 256]);
        const b2 = G.vert(o1[0], yo1 + top, o1[1], -nx, 0, -nz, L, 0.15, kc, 10, [0, 0, 0, 256]), b3 = G.vert(o0[0], yo0 + top, o0[1], -nx, 0, -nz, 0, 0.15, kc, 10, [0, 0, 0, 256]);
        G.quad(b0, b1, b2, b3, -nx, 0, -nz);
        // collider (top + kerb face)
        const ca = C.add(i0[0], yi0 + top, i0[1]), cb = C.add(i1[0], yi1 + top, i1[1]), cc = C.add(o1[0], yo1 + top, o1[1]), cd = C.add(o0[0], yo0 + top, o0[1]);
        C.quad(ca, cb, cc, cd);
        C.wall(i0[0], i0[1], i1[0], i1[1], yi0 - 0.05, yi0 + top, yi1 - 0.05, yi1 + top);
      }
    }
    // ---- markings (only on drivable roads)
    if (r.f & RF.noCars) continue;
    const onRoadOther = (x, z) => !!grid.inOtherCarriageway(x, z, r, 0.5);
    const dashLine = (off, dash, gap, width, col) => {
      const line = offsetLine(pts, off);
      let acc = 0;
      for (let k = 0; k + 1 < line.length; k++) {
        const a = line[k], b = line[k + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let t = 0;
        while (t < L) {
          const phase = acc % (dash + gap);
          const inDash = phase < dash;
          const step = Math.min(L - t, inDash ? dash - phase : dash + gap - phase);
          if (inDash && step > 0.05) {
            const x0 = a[0] + (b[0] - a[0]) * t / L, z0 = a[1] + (b[1] - a[1]) * t / L;
            const x1 = a[0] + (b[0] - a[0]) * (t + step) / L, z1 = a[1] + (b[1] - a[1]) * (t + step) / L;
            const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
            if (inChunk(mx, mz) && !onRoadOther(mx, mz)) {
              const ya = bridge ? lerpY(pts, k, t / L) : heightAt(x0, z0), yb = bridge ? lerpY(pts, k, (t + step) / L) : heightAt(x1, z1);
              M.boxAlong(x0, ya + 0.012, z0, x1, yb + 0.012, z1, width, 0.008, col, true, false);
            }
          }
          t += step; acc += step;
        }
      }
    };
    if (r.f & RF.centreLine && !(r.f & RF.roundabout)) dashLine(0, 4, 8, 0.1, WHITE);
    if (r.c <= 2 && !(r.f & (RF.sideL | RF.sideR))) { dashLine(hw - 0.25, 1000, 0.01, 0.12, WHITE); dashLine(-(hw - 0.25), 1000, 0.01, 0.12, WHITE); }
    if (r.f & RF.doubleYellow) for (const s of [1, -1]) { dashLine(s * (hw - 0.22), 1000, 0.01, 0.08, YELLOW); dashLine(s * (hw - 0.4), 1000, 0.01, 0.08, YELLOW); }
    if (r.f & RF.cycleLane && hw > 3) for (const s of (r.f & RF.oneway ? [1] : [1, -1])) dashLine(s * (hw - 1.5), 1.0, 1.0, 0.1, WHITE);
    // give way lines where a minor road meets a bigger one
    if (r.c >= 4 && r.c <= 8) {
      for (const end of [0, pts.length - 1]) {
        const p = pts[end];
        const other = grid.inOtherCarriageway(p[0], p[2], r, 0.6);
        if (!other || other.c >= r.c || other.f & RF.noCars) continue;
        // walk back along this road until we leave the other carriageway
        const dir = end === 0 ? 1 : -1;
        let k = end, q = null;
        for (let n = 0; n < 12 && k + dir >= 0 && k + dir < pts.length; n++) {
          k += dir;
          if (!grid.inOtherCarriageway(pts[k][0], pts[k][2], r, 0.3)) { q = pts[k]; break; }
        }
        if (!q || !inChunk(q[0], q[2])) continue;
        const prev = pts[k - dir] || p;
        const dx = q[0] - prev[0], dz = q[2] - prev[2], L = Math.hypot(dx, dz) || 1;
        const lx = dz / L, lz = -dx / L;
        const y = heightAt(q[0], q[2]);
        for (const off of [0, 0.4]) {
          const cx = q[0] + dx / L * off, cz = q[2] + dz / L * off;
          for (let s = -hw + 0.3; s < hw - 0.3; s += 0.9) {
            const ax = cx + lx * s, az = cz + lz * s, bx = cx + lx * Math.min(hw - 0.3, s + 0.6), bz = cz + lz * Math.min(hw - 0.3, s + 0.6);
            M.boxAlong(ax, y + 0.013, az, bx, y + 0.013, bz, 0.2, 0.008, WHITE, true, false);
          }
        }
      }
    }
  }
}

function lerpY(pts, k, t) { const a = pts[k], b = pts[Math.min(pts.length - 1, k + 1)]; return a[1] + (b[1] - a[1]) * t; }

function buildDeck(r, pts, G, C) {
  const foot = r.c >= 9;
  const half = r.w / 2 + ((r.f & RF.sideL) ? r.sw : 0.3) * 0.5 + ((r.f & RF.sideR) ? r.sw : 0.3) * 0.5 + 0.3;
  const thick = foot ? 0.4 : 0.9;
  const left = offsetLine(pts, half), right = offsetLine(pts, -half);
  const topLayer = r.s === 0 ? 0 : 1;
  const sideCol = [0.78, 0.74, 0.68];
  for (let k = 0; k + 1 < pts.length; k++) {
    const mx = (pts[k][0] + pts[k + 1][0]) / 2, mz = (pts[k][2] + pts[k + 1][2]) / 2;
    if (!inChunk(mx, mz)) continue;
    const ya = pts[k][1], yb = pts[k + 1][1];
    const L0 = left[k], L1 = left[k + 1], R0 = right[k], R1 = right[k + 1];
    const t = [1, 1, 1];
    const a = G.vert(L0[0], ya + 0.01, L0[1], 0, 1, 0, L0[0], L0[1], t, topLayer, [0, 0, 0, 256]);
    const b = G.vert(L1[0], yb + 0.01, L1[1], 0, 1, 0, L1[0], L1[1], t, topLayer, [0, 0, 0, 256]);
    const c = G.vert(R1[0], yb + 0.01, R1[1], 0, 1, 0, R1[0], R1[1], t, topLayer, [0, 0, 0, 256]);
    const d = G.vert(R0[0], ya + 0.01, R0[1], 0, 1, 0, R0[0], R0[1], t, topLayer, [0, 0, 0, 256]);
    G.quad(a, b, c, d, 0, 1, 0);
    // underside
    const u = [a, b, c, d].map((v, n) => { const P = [L0, L1, R1, R0][n]; const y = (n === 1 || n === 2 ? yb : ya) - thick; return G.vert(P[0], y, P[1], 0, -1, 0, P[0], P[1], sideCol, 10, [0, 0, 0, 256]); });
    G.quad(u[0], u[1], u[2], u[3], 0, -1, 0);
    // sides + parapets (stone for road bridges, railings for footbridges)
    const ph = foot ? 1.1 : 1.0, pw = foot ? 0.06 : 0.3;
    for (const [P0, P1, s] of [[L0, L1, 1], [R0, R1, -1]]) {
      const dx = P1[0] - P0[0], dz = P1[1] - P0[1], Ls = Math.hypot(dx, dz) || 1;
      const nx = dz / Ls * s, nz = -dx / Ls * s;
      const v0 = G.vert(P0[0], ya - thick, P0[1], nx, 0, nz, 0, 0, sideCol, 10, [0, 0, 0, 256]), v1 = G.vert(P1[0], yb - thick, P1[1], nx, 0, nz, Ls, 0, sideCol, 10, [0, 0, 0, 256]);
      const v2 = G.vert(P1[0], yb + ph, P1[1], nx, 0, nz, Ls, thick + ph, sideCol, foot ? 10 : 17, [0, 0, 0, 256]), v3 = G.vert(P0[0], ya + ph, P0[1], nx, 0, nz, 0, thick + ph, sideCol, foot ? 10 : 17, [0, 0, 0, 256]);
      G.quad(v0, v1, v2, v3, nx, 0, nz);
      const i0 = [P0[0] - nx * pw, P0[1] - nz * pw], i1 = [P1[0] - nx * pw, P1[1] - nz * pw];
      const w0 = G.vert(i0[0], ya, i0[1], -nx, 0, -nz, 0, 0, sideCol, foot ? 10 : 17, [0, 0, 0, 256]), w1 = G.vert(i1[0], yb, i1[1], -nx, 0, -nz, Ls, 0, sideCol, foot ? 10 : 17, [0, 0, 0, 256]);
      const w2 = G.vert(i1[0], yb + ph, i1[1], -nx, 0, -nz, Ls, ph, sideCol, foot ? 10 : 17, [0, 0, 0, 256]), w3 = G.vert(i0[0], ya + ph, i0[1], -nx, 0, -nz, 0, ph, sideCol, foot ? 10 : 17, [0, 0, 0, 256]);
      G.quad(w0, w1, w2, w3, -nx, 0, -nz);
      const t0 = G.vert(P0[0], ya + ph, P0[1], 0, 1, 0, P0[0], P0[1], sideCol, 10, [0, 0, 0, 256]), t1 = G.vert(P1[0], yb + ph, P1[1], 0, 1, 0, P1[0], P1[1], sideCol, 10, [0, 0, 0, 256]);
      const t2 = G.vert(i1[0], yb + ph, i1[1], 0, 1, 0, i1[0], i1[1], sideCol, 10, [0, 0, 0, 256]), t3 = G.vert(i0[0], ya + ph, i0[1], 0, 1, 0, i0[0], i0[1], sideCol, 10, [0, 0, 0, 256]);
      G.quad(t0, t1, t2, t3, 0, 1, 0);
      C.wall(i0[0], i0[1], i1[0], i1[1], ya, ya + ph, yb, yb + ph);
    }
    const ca = C.add(L0[0], ya, L0[1]), cb = C.add(L1[0], yb, L1[1]), cc = C.add(R1[0], yb, R1[1]), cd = C.add(R0[0], ya, R0[1]);
    C.quad(ca, cb, cc, cd);
  }
}

// speed hump across the road nearest (x, z); zebra crossing stripes; mini roundabout circle
export function buildRoadFeature(kind, x, z, grid, heightAt, G, M, C, extraFurn) {
  let best = null, bd = Infinity;
  for (const s of grid.near(x, z)) {
    if (s.r.f & RF.noCars) continue;
    const d = distSeg(x, z, s.a, s.b);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best || bd > best.r.w / 2 + 3) return;
  const r = best.r, hw = r.w / 2;
  const dx = best.b[0] - best.a[0], dz = best.b[2] - best.a[2], L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L, lx = uz, lz = -ux;
  // snap to the centreline
  const t = Math.max(0, Math.min(1, ((x - best.a[0]) * dx + (z - best.a[2]) * dz) / (L * L)));
  const cx = best.a[0] + dx * t, cz = best.a[2] + dz * t;
  if (kind === 20) {
    // UK round-top hump: 3.7 m long, 75 mm high, full width
    const n = 8, len = 3.7, h = 0.075;
    const tint = [0.92, 0.9, 0.88];
    let prevL = null, prevR = null, prevC = null;
    for (let k = 0; k <= n; k++) {
      const s = -len / 2 + len * k / n;
      const hy = h * Math.sin(Math.PI * k / n);
      const px = cx + ux * s, pz = cz + uz * s;
      const Lp = [px + lx * hw, pz + lz * hw], Rp = [px - lx * hw, pz - lz * hw];
      const yL = heightAt(Lp[0], Lp[1]) + hy + 0.005, yR = heightAt(Rp[0], Rp[1]) + hy + 0.005;
      const vL = G.vert(Lp[0], yL, Lp[1], 0, 1, 0, Lp[0], Lp[1], tint, 0, [0, 0, 0, 256]), vR = G.vert(Rp[0], yR, Rp[1], 0, 1, 0, Rp[0], Rp[1], tint, 0, [0, 0, 0, 256]);
      const cL = C.add(Lp[0], yL, Lp[1]), cR = C.add(Rp[0], yR, Rp[1]);
      if (prevL !== null) { G.quad(prevL, vL, vR, prevR, 0, 1, 0); C.quad(prevC[0], cL, cR, prevC[1]); C.quad(cL, prevC[0], prevC[1], cR); }
      prevL = vL; prevR = vR; prevC = [cL, cR];
      // white triangle markings on the ramp
      if (k === 2 || k === 6) for (let s2 = -hw + 0.6; s2 < hw - 0.4; s2 += 1.4) M.boxAlong(px + lx * s2, heightAt(px + lx * s2, pz + lz * s2) + hy + 0.02, pz + lz * s2, px + lx * (s2 + 0.5), heightAt(px + lx * (s2 + 0.5), pz + lz * (s2 + 0.5)) + hy + 0.02, pz + lz * (s2 + 0.5), 0.3, 0.005, WHITE, true, false);
    }
  } else if (kind === 10) {
    // zebra crossing: white stripes 0.5 m wide, 0.5 m apart, across the road; Belisha beacons
    const y = heightAt(cx, cz);
    for (let s = -hw + 0.25; s < hw; s += 1.0) {
      const ax = cx + lx * s, az = cz + lz * s;
      M.boxAlong(ax - ux * 1.2, y + 0.014, az - uz * 1.2, ax + ux * 1.2, y + 0.014, az + uz * 1.2, 0.5, 0.006, WHITE, true, false);
    }
    const sw = (r.f & (RF.sideL | RF.sideR)) ? r.sw * 0.5 : 0.6;
    for (const s of [1, -1]) extraFurn.push(40, cx + lx * s * (hw + sw) - ux * 1.6, heightAt(cx + lx * s * (hw + sw), cz + lz * s * (hw + sw)) + 0.12, cz + lz * s * (hw + sw) - uz * 1.6, 0);
  } else if (kind === 21) {
    const y = heightAt(cx, cz);
    const n = 16, R = Math.min(2, hw * 0.4);
    for (let k = 0; k < n; k++) {
      const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
      M.boxAlong(cx + Math.cos(a0) * R, y + 0.015, cz + Math.sin(a0) * R, cx + Math.cos(a1) * R, y + 0.015, cz + Math.sin(a1) * R, 0.25, 0.006, WHITE, true, false);
    }
  }
}
