// UK Simulator - tyre model.
// Pacejka "magic formula" curves for longitudinal (slip ratio) and lateral (slip angle) force,
// combined with a friction ellipse, load sensitivity (a tyre gets relatively less grip the
// more it is loaded), surface grip and rolling resistance, and a relaxation length so forces
// build up over a short distance like a real tyre instead of instantly.

// surface types (the world reports one of these under each wheel)
export const SURFACE = {
  tarmac: 0, paving: 1, concrete: 2, gravel: 3, grass: 4, mud: 5, sand: 6, dirt: 7, forest: 8, water: 9, kerb: 10, ballast: 11,
};
export const SURFACE_NAMES = Object.keys(SURFACE);

// mu for road tyres / off-road tyres, rolling resistance, loose (flatter, slidier curve), sink (drag)
const TABLE = [
  /* tarmac   */ { muRoad: 1.0, muOff: 0.86, rr: 0.012, loose: 0.0, sink: 0 },
  /* paving   */ { muRoad: 0.92, muOff: 0.82, rr: 0.014, loose: 0.0, sink: 0 },
  /* concrete */ { muRoad: 0.97, muOff: 0.85, rr: 0.012, loose: 0.0, sink: 0 },
  /* gravel   */ { muRoad: 0.58, muOff: 0.78, rr: 0.03, loose: 0.6, sink: 0.01 },
  /* grass    */ { muRoad: 0.45, muOff: 0.7, rr: 0.05, loose: 0.4, sink: 0.02 },
  /* mud      */ { muRoad: 0.25, muOff: 0.58, rr: 0.10, loose: 0.8, sink: 0.06 },
  /* sand     */ { muRoad: 0.42, muOff: 0.66, rr: 0.14, loose: 0.9, sink: 0.08 },
  /* dirt     */ { muRoad: 0.62, muOff: 0.82, rr: 0.03, loose: 0.4, sink: 0.01 },
  /* forest   */ { muRoad: 0.5, muOff: 0.72, rr: 0.05, loose: 0.5, sink: 0.02 },
  /* water    */ { muRoad: 0.3, muOff: 0.4, rr: 0.25, loose: 0.5, sink: 0.2 },
  /* kerb     */ { muRoad: 0.95, muOff: 0.85, rr: 0.015, loose: 0, sink: 0 },
  /* ballast  */ { muRoad: 0.5, muOff: 0.7, rr: 0.06, loose: 0.7, sink: 0.02 },
];

export function surfaceGrip(surface, offroad, wet) {
  const s = TABLE[surface] || TABLE[0];
  let mu = s.muRoad + (s.muOff - s.muRoad) * offroad;
  // wet: tarmac loses about a quarter of its grip, grass and mud much more
  if (wet > 0) mu *= 1 - wet * (surface <= 2 || surface === 10 ? 0.25 : surface === 4 || surface === 5 ? 0.35 : 0.15);
  const rr = s.rr * (1 - 0.4 * offroad * s.loose) + (wet > 0 && surface === 5 ? 0.04 : 0);
  return { mu, rr, loose: s.loose, sink: s.sink * (1 - 0.5 * offroad) };
}

// magic formula, x in "normalised slip" (1 = peak)
function mf(x, B, C, E) {
  const bx = B * x;
  return Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx))));
}

export class Tyre {
  // radius (m), width (m), spec = { mu, offroad, stiffX, stiffY }
  constructor(radius, width, spec, opts = {}) {
    this.r = radius;
    this.w = width;
    this.spec = spec;
    this.peakSlip = opts.peakSlip ?? 0.11;            // slip ratio at peak grip
    this.peakAngle = opts.peakAngle ?? 0.13;          // slip angle (rad) at peak grip (~7.5 degrees)
    this.relaxLong = opts.relaxLong ?? 0.12;          // relaxation lengths (m)
    this.relaxLat = opts.relaxLat ?? 0.35;
    this.loadNominal = opts.loadNominal ?? 3500;       // N
    this.loadSens = opts.loadSens ?? 0.12;
    this.camberStiff = opts.camberStiff ?? 0;         // lateral force per radian of camber, x load (bikes)
    this.kx = 0; this.ky = 0;                          // relaxed slip state
    this.fx = 0; this.fy = 0;
    this.slipRatio = 0; this.slipAngle = 0; this.sliding = 0; this.load = 0;
  }

  reset() { this.kx = 0; this.ky = 0; this.fx = 0; this.fy = 0; this.sliding = 0; }

  // vLong / vLat: contact patch speed along / across the wheel (m/s); omega: wheel spin (rad/s)
  // fz: load (N); surf: { mu, rr, loose }; camber (rad, bikes). Returns [fx, fy].
  forces(vLong, vLat, omega, fz, surf, dt, camber = 0) {
    this.load = fz;
    if (fz <= 0) { this.kx = 0; this.ky *= 0.5; this.fx = this.fy = 0; this.sliding = 0; return [0, 0]; }
    const spec = this.spec;
    const vRef = Math.max(Math.abs(vLong), 1.2);
    // target slips
    const kTarget = (omega * this.r - vLong) / vRef;
    const aTarget = Math.atan2(vLat, vRef);
    // relaxation: the tyre deflects over a short rolling distance
    const roll = Math.abs(vLong) * dt + 0.02 * dt * 60;
    this.kx += (kTarget - this.kx) * Math.min(1, roll / this.relaxLong + 0.15);
    this.ky += (aTarget - this.ky) * Math.min(1, roll / this.relaxLat + 0.1);
    this.slipRatio = this.kx; this.slipAngle = this.ky;
    // grip with load sensitivity
    const loadF = Math.max(0.55, Math.min(1.25, 1 - this.loadSens * (fz / this.loadNominal - 1)));
    const mu = spec.mu * surf.mu * loadF;
    // normalised combined slip (friction ellipse); loose surfaces have a later, flatter peak
    const pk = this.peakSlip * (1 + surf.loose * 0.8) / spec.stiffX;
    const pa = this.peakAngle * (1 + surf.loose * 0.6) / spec.stiffY;
    const sx = this.kx / pk, sy = Math.tan(Math.max(-1.4, Math.min(1.4, this.ky))) / Math.tan(pa);
    const s = Math.hypot(sx, sy);
    let fx = 0, fy = 0;
    if (s > 1e-6) {
      // shape: B so the peak sits at s = 1; falloff after the peak depends on surface looseness
      const C = 1.55 - 0.25 * surf.loose, E = 0.6 + 0.3 * surf.loose;
      const B = Math.tan(Math.PI / (2 * C)) / 1.0 * 0.92;
      const f = mf(s, B, C, E) * mu * fz;
      fx = f * sx / s;
      fy = -f * sy / s;
    }
    // camber thrust (motorbike and bicycle tyres push sideways when leaned)
    if (camber && this.camberStiff) fy += Math.max(-1, Math.min(1, camber * this.camberStiff)) * fz * surf.mu * 0.9;
    // keep inside the friction ellipse
    const lim = mu * fz * 1.02, mag = Math.hypot(fx, fy);
    if (mag > lim) { fx *= lim / mag; fy *= lim / mag; }
    this.sliding = Math.max(0, Math.min(1, s - 1));
    this.fx = fx; this.fy = fy;
    return [fx, fy];
  }
}
