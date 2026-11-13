// Racing line (minimum-curvature path inside the track limits) and the speed a given car can
// carry along it. The AI drives to these; the HUD and track rubber use the line too.
import { clamp } from '../core/math.js';

const RHO = 1.225, G = 9.81;

/**
 * @returns {{ off: Float32Array, px: Float32Array, pz: Float32Array, kappa: Float32Array, dl: Float32Array }}
 *          off = lateral offset from the centre line (+ left), kappa = curvature of the line.
 */
export function computeRacingLine(track, { margin = 1.0, kerbKeep = 0.25, levels = null, relax = 1.5 } = {}) {
  const N = track.n;
  const lo = new Float32Array(N), hi = new Float32Array(N);
  // The car's centre may go to within `margin` of the white line (outer wheels on the line),
  // and further where there is a kerb to ride (all but the last `kerbKeep` metres of it).
  for (let i = 0; i < N; i++) {
    hi[i] = Math.max(0.2, track.wl[i] - margin + Math.max(0, track.kerbL[i] - kerbKeep));
    lo[i] = -Math.max(0.2, track.wr[i] - margin + Math.max(0, track.kerbR[i] - kerbKeep));
  }
  // coarse-to-fine relaxation of the bending energy sum |p[i-1] - 2 p[i] + p[i+1]|^2
  // Very coarse levels settle the long sweeps (where to place the car on a straight before a
  // corner); each finer level then only has to fix detail one size smaller.
  let off = new Float32Array(N);
  const LEVELS = levels || [[64, 400], [32, 500], [16, 800], [8, 1500], [4, 2500], [2, 2000], [1, 600]];
  for (const [step, iters] of LEVELS) {
    const idx = [];
    for (let i = 0; i < N; i += step) idx.push(i);
    const M = idx.length;
    const d = new Float32Array(M);
    for (let j = 0; j < M; j++) d[j] = off[idx[j]];
    const px = new Float32Array(M), pz = new Float32Array(M);
    const upd = (j) => {
      const i = idx[j];
      px[j] = track.x[i] + track.nx[i] * d[j];
      pz[j] = track.z[i] + track.nz[i] * d[j];
    };
    for (let j = 0; j < M; j++) upd(j);
    // Weights 1/h^3 (h = spacing between neighbouring points) turn "sum of squared second
    // differences" into a proper "curvature squared x distance" measure. Without them the
    // solver wrongly prefers the inside of tight corners, where points sit closer together.
    const w = new Float32Array(M).fill(1);
    for (let it = 0; it < iters; it++) {
      if (it % 8 === 0) {
        let mean = 0;
        for (let j = 0; j < M; j++) {
          const b = (j - 1 + M) % M, c = (j + 1) % M;
          w[j] = 0.5 * Math.hypot(px[c] - px[b], pz[c] - pz[b]);
          mean += w[j];
        }
        mean /= M;
        for (let j = 0; j < M; j++) { const h = Math.max(w[j] / mean, 0.2); w[j] = 1 / (h * h * h); }
      }
      for (let j = 0; j < M; j++) {
        const a = (j - 2 + M) % M, b = (j - 1 + M) % M, c = (j + 1) % M, e = (j + 2) % M;
        const wb = w[b], wj = w[j], wc = w[c];
        const den = wb + 4 * wj + wc;
        const qx = (wb * (2 * px[b] - px[a]) + 2 * wj * (px[b] + px[c]) + wc * (2 * px[c] - px[e])) / den;
        const qz = (wb * (2 * pz[b] - pz[a]) + 2 * wj * (pz[b] + pz[c]) + wc * (2 * pz[c] - pz[e])) / den;
        const i = idx[j];
        const want = (qx - track.x[i]) * track.nx[i] + (qz - track.z[i]) * track.nz[i];
        d[j] = clamp(d[j] + (want - d[j]) * relax, lo[i], hi[i]);
        upd(j);
      }
    }
    // write back with linear interpolation between coarse points
    for (let j = 0; j < M; j++) {
      const i0 = idx[j], j1 = (j + 1) % M;
      const span = j1 === 0 ? N - i0 : idx[j1] - i0;
      for (let k = 0; k < span; k++) {
        const i = (i0 + k) % N;
        off[i] = clamp(d[j] + ((d[j1] - d[j]) * k) / span, lo[i], hi[i]);
      }
    }
  }
  return finishLine(track, off);
}

/** Build point / curvature arrays for any lateral-offset profile. */
export function finishLine(track, off) {
  const N = track.n;
  const px = new Float32Array(N), pz = new Float32Array(N), kappa = new Float32Array(N), dl = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    px[i] = track.x[i] + track.nx[i] * off[i];
    pz[i] = track.z[i] + track.nz[i] * off[i];
  }
  for (let i = 0; i < N; i++) {
    const a = (i - 2 + N) % N, b = (i + 2) % N;
    const ax = px[i] - px[a], az = pz[i] - pz[a];
    const bx = px[b] - px[i], bz = pz[b] - pz[i];
    const cx = px[b] - px[a], cz = pz[b] - pz[a];
    const cross = ax * bz - az * bx; // > 0 means turning right in (X, Z)
    const den = Math.hypot(ax, az) * Math.hypot(bx, bz) * Math.hypot(cx, cz);
    kappa[i] = den > 1e-9 ? (-2 * cross) / den : 0; // + = left
    const j = (i + 1) % N;
    dl[i] = Math.hypot(px[j] - px[i], pz[j] - pz[i]);
  }
  // light smoothing of curvature
  const ks = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -2; k <= 2; k++) s += kappa[(i + k + N) % N];
    ks[i] = s / 5;
  }
  return { off, px, pz, kappa: ks, dl };
}

/**
 * Speed profile along a line for a car.
 * @param car  { mass, clA, cdA, clAStraight, cdAStraight, mu, driveForce(v) }
 * @param grip overall grip usage (1 = everything the tyres have)
 */
export function computeSpeedProfile(track, line, car, grip = 1) {
  const N = track.n;
  const v = new Float32Array(N);
  const m = car.mass;
  const mu = car.mu * grip;
  const kdfC = (0.5 * RHO * car.clA) / m;
  const kdfS = (0.5 * RHO * car.clAStraight) / m;
  const vTop = car.vMax || 102;
  const latMax = new Float32Array(N);
  // Wings are closed whenever cornering is above ~1.8 g (see Vehicle.step), so corner limits
  // always use full downforce; open wings only matter for drag on the straights.
  const STRAIGHT_LAT = 18;
  for (let i = 0; i < N; i++) {
    const k = Math.abs(line.kappa[i]);
    const kdf = kdfC;
    const den = k - mu * kdf;
    latMax[i] = den > 1e-6 ? Math.min(vTop, Math.sqrt((mu * G) / den)) : vTop;
    v[i] = latMax[i];
  }
  const aLatCap = (vv, kdf) => mu * (G + kdf * vv * vv);
  for (let pass = 0; pass < 2; pass++) {
    // forward: acceleration limit
    for (let q = 0; q < N; q++) {
      const i = q, j = (q + 1) % N;
      const vv = Math.max(v[i], 5);
      const k = Math.abs(line.kappa[i]);
      const straight = track.straightZone[i] && vv * vv * k < STRAIGHT_LAT;
      const kdf = straight ? kdfS : kdfC;
      const cap = aLatCap(vv, kdf);
      const use = Math.min(1, (vv * vv * k) / cap);
      const comb = Math.sqrt(Math.max(0, 1 - use * use));
      const trac = 0.6 * cap * comb;
      const drag = (0.5 * RHO * (straight ? car.cdAStraight : car.cdA) * vv * vv + 0.014 * m * G) / m;
      const a = Math.min(car.driveForce(vv) / m, trac) - drag;
      const v2 = vv * vv + 2 * a * line.dl[i];
      v[j] = Math.min(v[j], Math.sqrt(Math.max(v2, 25)));
    }
    // backward: braking limit (wings closed while braking)
    for (let q = N; q > 0; q--) {
      const j = q % N, i = (q - 1 + N) % N;
      const vv = v[j];
      const k = Math.abs(line.kappa[j]);
      const cap = aLatCap(vv, kdfC);
      const use = Math.min(1, (vv * vv * k) / cap);
      const comb = Math.sqrt(Math.max(0, 1 - use * use));
      const drag = (0.5 * RHO * car.cdA * vv * vv) / m;
      const a = 0.92 * cap * comb + drag;
      const v2 = vv * vv + 2 * a * line.dl[i];
      v[i] = Math.min(v[i], Math.sqrt(v2));
    }
  }
  return v;
}

/** Lap time implied by a speed profile. */
export function profileLapTime(line, v) {
  let t = 0;
  for (let i = 0; i < v.length; i++) t += line.dl[i] / Math.max(v[i], 1);
  return t;
}
