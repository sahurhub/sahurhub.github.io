// The lawn grid and the cutting simulation (shared by the game and the server).
// LevelGrid = static per level: surface type per cell and which cells can be mown.
// JobSim = one job: which cells are cut, the catcher, fuel, stations, neatness.
import { compileLevel, pointInPoly, shapeContains, shapeBounds, solidBounds, solidDist, distToSeg } from './levels.js';
import { RULES } from './rules.js';
import { angleDiff } from './rng.js';

export const SURF = { meadow: 0, lawn: 1, path: 2, soil: 3, sand: 4, water: 5, asphalt: 6, patio: 7 };

const grids = new Map();

export function levelGrid(id) {
  if (grids.has(id)) return grids.get(id);
  const L = compileLevel(id);
  const cs = L.cell;
  const [bx0, bz0, bx1, bz1] = L.bounds;
  const nx = Math.ceil((bx1 - bx0) / cs), nz = Math.ceil((bz1 - bz0) / cs);
  const n = nx * nz;
  const surf = new Uint8Array(n); // meadow by default
  const mow = new Uint8Array(n);
  const cx = (i) => bx0 + (i + 0.5) * cs, cz = (j) => bz0 + (j + 0.5) * cs;
  const range = (b) => [
    Math.max(0, Math.floor((b[0] - bx0) / cs)), Math.max(0, Math.floor((b[1] - bz0) / cs)),
    Math.min(nx - 1, Math.ceil((b[2] - bx0) / cs)), Math.min(nz - 1, Math.ceil((b[3] - bz0) / cs)),
  ];
  // lawn polygons
  for (const poly of L.lawn) {
    const [i0, j0, i1, j1] = range(shapeBounds({ poly }));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (pointInPoly(poly, cx(i), cz(j))) surf[j * nx + i] = SURF.lawn;
  }
  // other surfaces paint over the lawn in order
  for (const s of L.surfaces) {
    const code = SURF[s.s] ?? SURF.path;
    const [i0, j0, i1, j1] = range(shapeBounds(s));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (shapeContains(s, cx(i), cz(j))) surf[j * nx + i] = code;
  }
  for (let k = 0; k < n; k++) mow[k] = surf[k] === SURF.lawn ? 1 : 0;
  // keep a small strip around anything solid uncut (you can't get the deck right up to it)
  const m = RULES.EDGE_MARGIN;
  const block = (b, test) => {
    const [i0, j0, i1, j1] = range(b);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * nx + i;
      if (mow[k] && test(cx(i), cz(j))) mow[k] = 0;
    }
  };
  for (const s of L.solids) block(solidBounds(s, m), (x, z) => solidDist(s, x, z) < m);
  for (const f of L.fragile) block([f.x - f.r - m, f.z - f.r - m, f.x + f.r + m, f.z + f.r + m], (x, z) => Math.hypot(x - f.x, z - f.z) < f.r + m);
  for (const zn of L.zones) {
    if (zn.kind !== 'hose') continue;
    for (let i = 0; i < zn.pts.length - 1; i++) {
      const [ax, az] = zn.pts[i], [bx, bz] = zn.pts[i + 1];
      const g = zn.r + m * 0.5;
      block([Math.min(ax, bx) - g, Math.min(az, bz) - g, Math.max(ax, bx) + g, Math.max(az, bz) + g], (x, z) => distToSeg(x, z, ax, az, bx, bz) < g);
    }
  }
  let total = 0, sx = 0, sz = 0;
  for (let k = 0; k < n; k++) if (mow[k]) { total++; sx += k % nx; sz += Math.floor(k / nx); }
  const g = { id, nx, nz, n, cs, x0: bx0, z0: bz0, surf, mow, total, area: total * cs * cs, cx, cz };
  grids.set(id, g);
  return g;
}

// Which cell is at (x, z), or -1 outside the grid.
export function cellAt(g, x, z) {
  const i = Math.floor((x - g.x0) / g.cs), j = Math.floor((z - g.z0) / g.cs);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return -1;
  return j * g.nx + i;
}

export class JobSim {
  // stats = mowerStats(...); opts = { pattern: Uint8Array | null, onlyPattern (race: cut only
  // your own part), cut: a shared Uint8Array (co-op: everyone mows the same lawn) }
  constructor(levelId, stats, opts = {}) {
    this.L = compileLevel(levelId);
    this.G = levelGrid(levelId);
    this.stats = stats;
    this.cut = opts.cut || new Uint8Array(this.G.n);
    this.onlyPattern = !!(opts.onlyPattern && opts.pattern);
    this.cutCount = 0;
    this.c2 = 0; this.s2 = 0;
    this.catcherMax = stats.catcher;
    this.catcher = 0;
    this.fuelMax = stats.fuel;
    this.fuel = stats.fuel;
    this.dumped = 0; this.trips = 0; this.refuels = 0;
    this.emptyT = 0; this.fuelT = 0;
    this.clipPerCell = this.G.cs * this.G.cs * RULES.CLIP_L_PER_M2 * (this.L.clip || 1);
    this.pattern = opts.pattern || null;
    this.patIn = 0; this.patOut = 0; this.patTotal = 0;
    if (this.pattern) for (let k = 0; k < this.G.n; k++) if (this.pattern[k] && this.G.mow[k]) this.patTotal++;
    this.last = null;
    this.time = 0;
    this.onCut = null;     // client: (cellIndex, heading) for each newly cut cell
    this.dirty = null;     // client: [i0, j0, i1, j1] of changed cells since last read
    this.inStation = null; // 'compost' | 'fuel' | null
  }

  get coverage() { return this.G.total ? this.cutCount / this.G.total : 0; }
  get neat() {
    if (this.cutCount < 20) return 0;
    const R = Math.hypot(this.c2, this.s2) / this.cutCount;
    const axis = this.L.stripeAxis;
    if (axis == null) return R;
    const mean = Math.atan2(this.s2, this.c2) / 2;
    const align = (1 + Math.cos(2 * (mean - axis))) / 2;
    return R * (0.85 + 0.15 * align);
  }
  get catcherFull() { return this.catcher >= this.catcherMax - 1e-6; }
  get outOfFuel() { return this.fuelMax > 0 && this.fuel <= 0; }
  get canCut() { return !this.catcherFull && !this.outOfFuel; }

  // Advance to pose (x, z, h) over dt seconds. blades = whether cutting is switched on.
  step(x, z, h, dt, blades = true) {
    this.time += dt;
    if (this.fuelMax > 0) this.fuel = Math.max(0, this.fuel - dt);
    const s = this.stats;
    const dx0 = Math.sin(h) * s.deck, dz0 = Math.cos(h) * s.deck;
    if (blades) {
      if (this.last) {
        const [lx, lz, lh] = this.last;
        const ax = lx + Math.sin(lh) * s.deck, az = lz + Math.cos(lh) * s.deck;
        const bx = x + dx0, bz = z + dz0;
        const dist = Math.hypot(bx - ax, bz - az);
        const dh = angleDiff(lh, h);
        const n = Math.min(60, Math.max(1, Math.ceil(dist / 0.2), Math.ceil(Math.abs(dh) / 0.15)));
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          this.stamp(ax + (bx - ax) * t, az + (bz - az) * t, lh + dh * t);
        }
      } else this.stamp(x + dx0, z + dz0, h);
    }
    this.last = [x, z, h];
    // stations
    const near = (list) => list.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < RULES.STATION_R * RULES.STATION_R);
    const zones = this.L.stationZones;
    this.inStation = null;
    if (near(zones.compost) && Number.isFinite(this.catcherMax)) {
      this.inStation = 'compost';
      this.emptyT += dt;
      if (this.emptyT >= RULES.EMPTY_TIME && this.catcher > 0.5) {
        this.dumped += this.catcher; this.catcher = 0; this.trips++; this.emptyT = 0;
        this.emptied = true;
      }
    } else this.emptyT = 0;
    if (zones.fuel.length && near(zones.fuel) && this.fuelMax > 0) {
      this.inStation = this.inStation || 'fuel';
      this.fuelT += dt;
      if (this.fuelT >= RULES.REFUEL_TIME && this.fuel < this.fuelMax - 1) {
        this.fuel = this.fuelMax; this.refuels++; this.fuelT = 0;
        this.refuelled = true;
      }
    } else this.fuelT = 0;
  }

  // Cut the cells under the deck centred at (x, z) facing h.
  stamp(x, z, h) {
    if (!this.canCut) return 0;
    const G = this.G, s = this.stats;
    const hw = s.width / 2, hl = RULES.DECK_HALF_LEN;
    const rad = Math.hypot(hw, hl);
    const i0 = Math.max(0, Math.floor((x - rad - G.x0) / G.cs)), i1 = Math.min(G.nx - 1, Math.floor((x + rad - G.x0) / G.cs));
    const j0 = Math.max(0, Math.floor((z - rad - G.z0) / G.cs)), j1 = Math.min(G.nz - 1, Math.floor((z + rad - G.z0) / G.cs));
    if (i0 > i1 || j0 > j1) return 0;
    const sh = Math.sin(h), ch = Math.cos(h);
    const c2 = Math.cos(2 * h), s2 = Math.sin(2 * h);
    let n = 0;
    const finite = Number.isFinite(this.catcherMax);
    for (let j = j0; j <= j1; j++) {
      const pz = G.z0 + (j + 0.5) * G.cs - z;
      for (let i = i0; i <= i1; i++) {
        const k = j * G.nx + i;
        if (!G.mow[k] || this.cut[k]) continue;
        if (this.onlyPattern && !this.pattern[k]) continue;
        const px = G.x0 + (i + 0.5) * G.cs - x;
        const lat = px * ch - pz * sh, lon = px * sh + pz * ch;
        if (lat > hw || lat < -hw || lon > hl || lon < -hl) continue;
        this.cut[k] = 1;
        this.cutCount++;
        this.c2 += c2; this.s2 += s2;
        n++;
        if (this.pattern) { if (this.pattern[k]) this.patIn++; else this.patOut++; }
        if (this.onCut) this.onCut(k, h);
        if (finite) {
          this.catcher += this.clipPerCell;
          if (this.catcher >= this.catcherMax) { this.catcher = this.catcherMax; break; }
        }
      }
      if (finite && this.catcher >= this.catcherMax) break;
    }
    if (n && this.dirty !== undefined) {
      const d = this.dirty;
      if (!d) this.dirty = [i0, j0, i1, j1];
      else { d[0] = Math.min(d[0], i0); d[1] = Math.min(d[1], j0); d[2] = Math.max(d[2], i1); d[3] = Math.max(d[3], j1); }
    }
    return n;
  }

  // Lawn cells still uncut, as a list of cell indices (for the "missed patches" view).
  missed() {
    const out = [];
    for (let k = 0; k < this.G.n; k++) if (this.G.mow[k] && !this.cut[k] && (!this.pattern || this.pattern[k])) out.push(k);
    return out;
  }
}
