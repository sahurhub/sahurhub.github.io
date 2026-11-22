// Checks a finished job and works out the official result from the recorded path.
// The server runs this to reject impossible results; the game runs the same code so the
// numbers the player sees match the server exactly.
import { compileLevel, solidDist, distToSeg, shapeContains, TREE_PEN, WATER_PEN, BED_PEN, HOSE_PEN } from './levels.js';
import { JobSim, levelGrid } from './lawn.js';
import { RULES, parTime, timeLimit, scoreJob } from './rules.js';
import { mowerStats } from './mowers.js';
import { patternMask } from './patterns.js';

const KIND_PEN = { tree: TREE_PEN.pen, water: WATER_PEN.pen, bed: BED_PEN.pen, hose: HOSE_PEN.pen };

// job = { level, mower, up, weather, kind, pattern }
// report = { path: [x_cm, z_cm, h_mrad, ...] (10 per second), resets: [sample index], hits: [{ kind, id }] }
export function evaluateJob(job, report) {
  const fail = (reason) => ({ ok: false, reason });
  const L = compileLevel(job.level);
  const G = levelGrid(job.level);
  const stats = mowerStats(job.mower, job.up || {});
  const path = report && report.path;
  if (!Array.isArray(path) || path.length % 3 !== 0) return fail('Bad path.');
  const n = path.length / 3;
  if (n < 30) return fail('That job was too short.');
  if (n > RULES.MAX_JOB_S * 10 + 50) return fail('That job was too long.');
  for (let k = 0; k < path.length; k++) if (!Number.isFinite(path[k]) || Math.abs(path[k]) > 1e6) return fail('Bad path.');
  const resets = new Set((Array.isArray(report.resets) ? report.resets : []).slice(0, 200).map(Number));
  const P = (k) => [path[k * 3] / 100, path[k * 3 + 1] / 100, path[k * 3 + 2] / 1000];
  const sp = L.spawn;
  const [sx, sz] = P(0);
  if (Math.hypot(sx - sp.x, sz - sp.z) > 1.5) return fail('Did not start at the start.');

  const maxStep = (stats.speed * 1.3 + 0.7) * RULES.SAMPLE_DT + 0.05;
  const solids = L.solids;
  let fast = 0, inside = 0;
  const pattern = job.kind === 'pattern' && job.pattern ? patternMask(job.level, job.pattern) : null;
  const sim = new JobSim(job.level, stats, { pattern });
  const fragHit = new Set();
  const zoneLast = new Map();
  let serverPen = 0;
  const kinds = new Set();
  for (let k = 0; k < n; k++) {
    const [x, z, h] = P(k);
    if (k > 0) {
      const [px, pz] = P(k - 1);
      const d = Math.hypot(x - px, z - pz);
      if (resets.has(k)) {
        if (Math.hypot(x - sp.x, z - sp.z) > 1.5) return fail('Bad reset.');
        sim.last = null;
      } else if (d > maxStep) fast++;
    }
    if (fast > 3) return fail('The mower moved impossibly fast.');
    for (const s of solids) {
      if (solidDist(s, x, z) < -0.3) { inside++; break; }
    }
    if (inside > 6) return fail('The mower went through solid objects.');
    sim.step(x, z, h, RULES.SAMPLE_DT, true);
    // penalties the path proves happened
    for (const f of L.fragile) {
      if (!fragHit.has(f.id) && Math.hypot(x - f.x, z - f.z) < f.r + 0.22) { fragHit.add(f.id); serverPen += f.pen; kinds.add(kindOf(f.type)); }
    }
    L.zones.forEach((zn, zi) => {
      let inZone = false;
      if (zn.kind === 'bed') inZone = shapeContains(zn.shape, x, z);
      else if (zn.kind === 'hose') {
        for (let i = 0; i < zn.pts.length - 1 && !inZone; i++) {
          if (distToSeg(x, z, zn.pts[i][0], zn.pts[i][1], zn.pts[i + 1][0], zn.pts[i + 1][1]) < zn.r) inZone = true;
        }
      }
      const last = zoneLast.get(zi);
      if (inZone && (last == null || k - last > 20)) { serverPen += zn.pen; kinds.add(zn.kind); }
      if (inZone) zoneLast.set(zi, k);
    });
  }

  // penalties the game reported (only ever adds; amounts come from our own tables)
  let clientPen = 0;
  const seenFrag = new Set();
  for (const hit of (Array.isArray(report.hits) ? report.hits : []).slice(0, 300)) {
    if (!hit || typeof hit !== 'object') continue;
    if (hit.kind === 'fragile') {
      const f = L.fragile.find((o) => o.id === hit.id);
      if (f && !seenFrag.has(f.id)) { seenFrag.add(f.id); clientPen += f.pen; kinds.add(kindOf(f.type)); }
    } else if (hit.kind === 'solid') {
      const s = solids.find((o) => o.obstacle === hit.id);
      if (s) { clientPen += s.pen || 0; kinds.add(kindOf(L.props.find((p) => p.obstacle === hit.id)?.m || '')); }
    } else if (KIND_PEN[hit.kind]) { clientPen += KIND_PEN[hit.kind]; kinds.add(hit.kind); }
  }
  const pen = Math.max(clientPen, serverPen);

  const time = Math.round(n * RULES.SAMPLE_DT * 10) / 10;
  const par = parTime(L, G, stats, job.weather);
  const limit = timeLimit(par, job.kind);
  const coverage = pattern ? (sim.patTotal ? sim.patIn / sim.patTotal : 0) : sim.coverage;
  const r = {
    coverage, neat: sim.neat, time, par, limit, pen, challenge: job.kind,
    acc: pattern ? coverage : undefined, wrong: pattern ? (sim.patTotal ? sim.patOut / sim.patTotal : 0) : undefined,
  };
  const sc = scoreJob(r);
  return {
    ok: true,
    result: {
      ...r, ...sc, dumped: Math.round(sim.dumped), trips: sim.trips, refuels: sim.refuels,
      area: Math.round(sim.cutCount * G.cs * G.cs), hitKinds: [...kinds].filter(Boolean),
    },
  };
}

function kindOf(type) {
  if (type.startsWith('gnome')) return 'gnome';
  if (type === 'pool') return 'pool';
  if (type === 'golf_flag' || type === 'corner_flag') return 'flag';
  return type;
}
