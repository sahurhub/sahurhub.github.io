// Track model: turns a surveyed centre line (+ widths) into everything the physics, AI and
// renderer need: evenly spaced points, headings, curvature, kerbs, run-off types and walls.
//
// Axes: X = east, Z = south (so a top-down view has north at the top), Y = up.
// Heading psi: forward = (sin psi, cos psi) in (X, Z). Positive psi change = turning LEFT.
// Lateral offset d: metres from the centre line, positive = LEFT of the driving direction.
import { clamp, wrapPi, lerp } from '../core/math.js';

export const SURF = { ASPHALT: 0, KERB: 1, GRASS: 2, GRAVEL: 3, RUNOFF: 4 };
export const SURFACE_PROPS = [
  { name: 'asphalt', grip: 1.0, drag: 0.012, bump: 0.0 },
  { name: 'kerb', grip: 0.93, drag: 0.016, bump: 0.011 },
  { name: 'grass', grip: 0.55, drag: 0.085, bump: 0.008 },
  { name: 'gravel', grip: 0.5, drag: 0.34, bump: 0.016 },
  { name: 'runoff', grip: 0.93, drag: 0.014, bump: 0.0 },
];

function smoothClosed(arr, half) {
  const n = arr.length;
  const out = new Float32Array(n);
  let sum = 0;
  for (let k = -half; k <= half; k++) sum += arr[(k + n) % n];
  const w = 2 * half + 1;
  for (let i = 0; i < n; i++) {
    out[i] = sum / w;
    sum += arr[(i + half + 1) % n] - arr[(i - half + n) % n];
  }
  return out;
}

export class Track {
  /**
   * @param meta        circuit json (data/circuits/<id>.json)
   * @param centerline  { points: [[x_east, y_north, w_right, w_left], ...] }
   */
  constructor(meta, centerline) {
    this.meta = meta;
    this.id = meta.id;
    this._resample(centerline.points, meta.startLineS || 0);
    this._frames();
    this._features();
  }

  // ---- geometry ---------------------------------------------------------------------------
  _resample(raw, startS) {
    const n = raw.length;
    const K = 8;
    const dx = [], dz = [], dwl = [], dwr = [];
    // optional measured columns: height, bank, walls, kerbs, run-off type
    const ext = raw[0].length >= 12;
    this.measured = ext;
    const E = ext ? { h: [], bank: [], wallR: [], wallL: [], kerbR: [], kerbL: [], runR: [], runL: [] } : null;
    const RUN = { G: SURF.GRASS, S: SURF.GRAVEL, A: SURF.RUNOFF };
    const P = (i) => raw[((i % n) + n) % n];
    for (let i = 0; i < n; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let k = 0; k < K; k++) {
        const t = k / K, t2 = t * t, t3 = t2 * t;
        const c = (a, b, cc, d) =>
          0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
        dx.push(c(p0[0], p1[0], p2[0], p3[0]));
        dz.push(-c(p0[1], p1[1], p2[1], p3[1])); // north -> -Z
        dwr.push(lerp(p1[2], p2[2], t));
        dwl.push(lerp(p1[3], p2[3], t));
        if (ext) {
          E.h.push(c(p0[4], p1[4], p2[4], p3[4]));
          E.bank.push(lerp(p1[5], p2[5], t));
          E.wallR.push(lerp(p1[6], p2[6], t)); E.wallL.push(lerp(p1[7], p2[7], t));
          E.kerbR.push(lerp(p1[8], p2[8], t)); E.kerbL.push(lerp(p1[9], p2[9], t));
          const q = t < 0.5 ? p1 : p2;
          E.runR.push(RUN[q[10]] ?? SURF.GRASS); E.runL.push(RUN[q[11]] ?? SURF.GRASS);
        }
      }
    }
    const m = dx.length;
    const cum = new Float64Array(m + 1);
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      cum[i + 1] = cum[i] + Math.hypot(dx[j] - dx[i], dz[j] - dz[i]);
    }
    const L = cum[m];
    const N = Math.round(L / 2);
    const ds = L / N;
    this.length = L;
    this.n = N;
    this.ds = ds;
    const X = new Float32Array(N), Z = new Float32Array(N);
    let wl = new Float32Array(N), wr = new Float32Array(N);
    const M = ext ? Object.fromEntries(Object.keys(E).map((k) => [k, k.startsWith('run') ? new Uint8Array(N) : new Float32Array(N)])) : null;
    let seg = 0;
    for (let i = 0; i < N; i++) {
      let s = (i * ds + startS) % L;
      if (s < cum[seg]) seg = 0;
      while (cum[seg + 1] < s) seg++;
      const t = (s - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
      const a = seg, b = (seg + 1) % m;
      X[i] = lerp(dx[a], dx[b], t);
      Z[i] = lerp(dz[a], dz[b], t);
      wl[i] = lerp(dwl[a], dwl[b], t);
      wr[i] = lerp(dwr[a], dwr[b], t);
      if (ext) for (const k in E) M[k][i] = k.startsWith('run') ? (t < 0.5 ? E[k][a] : E[k][b]) : lerp(E[k][a], E[k][b], t);
    }
    this.x = X;
    this.z = Z;
    // height of the road (m) and its sideways tilt (rise per metre to the left)
    this.h = ext ? smoothClosed(M.h, 3) : new Float32Array(N);
    this.bank = ext ? smoothClosed(M.bank, 4) : new Float32Array(N);
    this.grade = new Float32Array(N);
    for (let i = 0; i < N; i++) this.grade[i] = (this.h[(i + 1) % N] - this.h[(i - 1 + N) % N]) / (2 * ds);
    this.m = M;
    const add = this.meta.widthAdd || 0;
    this.wl = smoothClosed(wl, 6).map((v) => v + add);
    this.wr = smoothClosed(wr, 6).map((v) => v + add);
    // local corrections where the measured width is known to be too narrow (e.g. chicanes)
    for (const o of this.meta.widthOverrides || []) {
      const len = ((o.to - o.from + L) % L) || L;
      for (let i = 0; i < N; i++) {
        const rel = (i * ds - o.from + L) % L;
        if (rel > len) continue;
        const ramp = Math.min(1, rel / 30, (len - rel) / 30);
        if (o.side !== 'right') this.wl[i] += o.add * ramp;
        if (o.side !== 'left') this.wr[i] += o.add * ramp;
      }
    }
  }

  _frames() {
    const N = this.n, X = this.x, Z = this.z;
    const psi = new Float32Array(N), nx = new Float32Array(N), nz = new Float32Array(N);
    const tx = new Float32Array(N), tz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const ddx = X[b] - X[a], ddz = Z[b] - Z[a];
      const l = Math.hypot(ddx, ddz) || 1;
      tx[i] = ddx / l;
      tz[i] = ddz / l;
      psi[i] = Math.atan2(ddx, ddz);
      nx[i] = tz[i]; // left normal = (cos psi, -sin psi)
      nz[i] = -tx[i];
    }
    const kap = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      kap[i] = wrapPi(psi[b] - psi[a]) / (2 * this.ds);
    }
    this.psi = psi;
    this.tx = tx; this.tz = tz;
    this.nx = nx; this.nz = nz;
    this.kappa = smoothClosed(kap, 2);
  }

  idx(s) {
    const N = this.n;
    let i = Math.floor(s / this.ds) % N;
    if (i < 0) i += N;
    return i;
  }

  /** Is lap distance s inside the range [from, to] (which may wrap past the start line)? */
  static inRange(s, from, to) {
    return from <= to ? s >= from && s <= to : s >= from || s <= to;
  }

  _features() {
    const N = this.n, ds = this.ds, meta = this.meta;
    const kS = smoothClosed(this.kappa, 5);
    const kerbL = new Float32Array(N), kerbR = new Float32Array(N);
    const runL = new Uint8Array(N).fill(SURF.GRASS), runR = new Uint8Array(N).fill(SURF.GRASS);
    const b = meta.barriers || { default: 8, cornerRunoff: { slow: 40, medium: 25, fast: 15 } };
    let wallL = new Float32Array(N).fill(b.default), wallR = new Float32Array(N).fill(b.default);

    // --- find corners from curvature
    const TH = 1 / 300;
    const segs = [];
    let i = 0;
    while (i < N) {
      if (Math.abs(kS[i]) > TH) {
        const sg = Math.sign(kS[i]);
        let j = i, kmax = 0;
        while (j < N && Math.abs(kS[j]) > TH && Math.sign(kS[j]) === sg) {
          kmax = Math.max(kmax, Math.abs(kS[j]));
          j++;
        }
        const last = segs[segs.length - 1];
        if (last && last.sg === sg && (i - last.i1) * ds < 30) {
          last.i1 = j;
          last.kmax = Math.max(last.kmax, kmax);
        } else segs.push({ i0: i, i1: j, sg, kmax });
        i = j;
      } else i++;
    }
    this.cornerSegs = segs;
    const span = (arr, from, to, fn) => {
      for (let k = from; k <= to; k++) {
        const q = ((k % N) + N) % N;
        arr[q] = fn(arr[q], q);
      }
    };
    const M = (metres) => Math.round(metres / ds);
    for (const c of segs) {
      const R = 1 / c.kmax;
      const cls = R < 60 ? 'slow' : R < 130 ? 'medium' : 'fast';
      const insideL = c.sg > 0;
      if (R < 200) {
        const kw = cls === 'slow' ? 2.0 : 1.5; // chicane kerbs are wide and flat
        span(insideL ? kerbL : kerbR, c.i0 - M(8), c.i1 + M(6), (v) => Math.max(v, kw));
        span(insideL ? kerbR : kerbL, c.i1 - M(15), c.i1 + M(55), (v) => Math.max(v, 1.5));
      }
      const lead = cls === 'slow' ? 130 : cls === 'medium' ? 90 : 60;
      const depth = b.cornerRunoff[cls];
      const outRun = insideL ? runR : runL;
      const outWall = insideL ? wallR : wallL;
      if (R < 200) span(outRun, c.i0 - M(lead), c.i1 + M(50), () => SURF.GRAVEL);
      span(outWall, c.i0 - M(lead), c.i1 + M(50), (v) => Math.max(v, depth));
    }
    wallL = smoothClosed(wallL, M(24));
    wallR = smoothClosed(wallR, M(24));
    for (const o of b.overrides || []) {
      const arr = o.side === 'left' ? wallL : wallR;
      for (let q = 0; q < N; q++) if (Track.inRange(q * ds, o.from, o.to)) arr[q] = o.dist;
    }
    wallL = smoothClosed(wallL, 3);
    wallR = smoothClosed(wallR, 3);
    // walls are stored as distance from the centre line
    for (let q = 0; q < N; q++) {
      wallL[q] = this.wl[q] + Math.max(wallL[q], kerbL[q] + 0.6);
      wallR[q] = this.wr[q] + Math.max(wallR[q], kerbR[q] + 0.6);
    }
    if (this.measured) {
      // Measured from the 3D circuit: kerbs, run-off surface and barriers where they really are.
      // A thin object (a pole) can show up as a "wall" in one sample, so take a running median.
      const med = (src, half) => {
        const out = new Float32Array(N), win = [];
        for (let q = 0; q < N; q++) {
          win.length = 0;
          for (let k = -half; k <= half; k++) win.push(src[(q + k + N) % N]);
          win.sort((a, c) => a - c);
          out[q] = win[half];
        }
        return out;
      };
      const kR = smoothClosed(this.m.kerbR, 2), kL = smoothClosed(this.m.kerbL, 2);
      const wR = med(this.m.wallR, M(14)), wL = med(this.m.wallL, M(14));
      for (let q = 0; q < N; q++) {
        kerbR[q] = kR[q] > 0.3 ? Math.min(kR[q], 2.5) : 0;
        kerbL[q] = kL[q] > 0.3 ? Math.min(kL[q], 2.5) : 0;
        runR[q] = this.m.runR[q]; runL[q] = this.m.runL[q];
        wallR[q] = Math.max(wR[q] - 0.25, this.wr[q] + kerbR[q] + 0.8);
        wallL[q] = Math.max(wL[q] - 0.25, this.wl[q] + kerbL[q] + 0.8);
      }
    }
    this.kerbL = kerbL; this.kerbR = kerbR;
    this.runL = runL; this.runR = runR;
    this.wallL = wallL; this.wallR = wallR;

    const sm = new Uint8Array(N);
    for (const [from, to] of meta.straightModeZones || []) {
      for (let q = 0; q < N; q++) if (Track.inRange(q * ds, from, to)) sm[q] = 1;
    }
    this.straightZone = sm;
    this.sectorEnds = [...(meta.sectors || [this.length / 3, (2 * this.length) / 3]), this.length];
  }

  // ---- queries ----------------------------------------------------------------------------
  /**
   * Find where a world position is on the track.
   * @param hint previous index (or -1 for a full search)
   * @param out  object that receives { i, s, d }
   */
  locate(px, pz, hint, out) {
    const N = this.n, X = this.x, Z = this.z;
    let best = -1, bd = Infinity;
    if (hint >= 0) {
      for (let k = -14; k <= 30; k++) {
        const q = (((hint + k) % N) + N) % N;
        const ex = px - X[q], ez = pz - Z[q];
        const d2 = ex * ex + ez * ez;
        if (d2 < bd) { bd = d2; best = q; }
      }
    }
    if (best < 0 || bd > 3600) {
      bd = Infinity;
      for (let q = 0; q < N; q++) {
        const ex = px - X[q], ez = pz - Z[q];
        const d2 = ex * ex + ez * ez;
        if (d2 < bd) { bd = d2; best = q; }
      }
    }
    const ex = px - X[best], ez = pz - Z[best];
    const along = ex * this.tx[best] + ez * this.tz[best];
    let s = best * this.ds + along;
    if (s < 0) s += this.length;
    else if (s >= this.length) s -= this.length;
    out.i = best;
    out.s = s;
    out.d = ex * this.nx[best] + ez * this.nz[best];
    return out;
  }

  /** World position and heading at lap distance s, lateral offset d. */
  posAt(s, d, out) {
    const N = this.n;
    let f = s / this.ds;
    f = ((f % N) + N) % N;
    const i = Math.floor(f), t = f - i, j = (i + 1) % N;
    const nx = lerp(this.nx[i], this.nx[j], t), nz = lerp(this.nz[i], this.nz[j], t);
    out.x = lerp(this.x[i], this.x[j], t) + nx * d;
    out.z = lerp(this.z[i], this.z[j], t) + nz * d;
    out.psi = this.psi[i] + wrapPi(this.psi[j] - this.psi[i]) * t;
    return out;
  }

  /** Road height (m) at index i, lateral offset d (follows the banking). */
  heightAt(i, d) {
    return this.h[i] + this.bank[i] * d;
  }

  /** Surface type under a point at index i, lateral offset d. */
  surfaceAt(i, d) {
    if (d >= 0) {
      const e = this.wl[i];
      if (d <= e) return SURF.ASPHALT;
      if (d <= e + this.kerbL[i]) return SURF.KERB;
      return this.runL[i];
    }
    const e = this.wr[i];
    if (-d <= e) return SURF.ASPHALT;
    if (-d <= e + this.kerbR[i]) return SURF.KERB;
    return this.runR[i];
  }

  /** Signed lap-distance difference a - b, wrapped into (-L/2, L/2]. */
  delta(a, b) {
    let d = a - b;
    const L = this.length;
    if (d > L / 2) d -= L;
    else if (d < -L / 2) d += L;
    return d;
  }

  sectorOf(s) {
    return s < this.sectorEnds[0] ? 0 : s < this.sectorEnds[1] ? 1 : 2;
  }

  cornerAt(s) {
    const cs = this.meta.corners || [];
    let best = null, bd = 90;
    for (const c of cs) {
      const d = Math.abs(this.delta(c.s, s));
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
}

export async function loadTrack(id) {
  const base = new URL(`../../data/circuits/`, import.meta.url);
  const meta = await (await fetch(new URL(`${id}.json`, base))).json();
  const cl = await (await fetch(new URL(meta.centerline, base))).json();
  return new Track(meta, cl);
}
