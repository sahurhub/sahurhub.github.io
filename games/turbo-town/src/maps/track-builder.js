// TURBO TOWN - builds a map's ground from its shared layout data and the map's look:
// terrain shaped around the track, road + kerbs + verges, bridges, gaps, ramps, boost
// pads and water. Everything drivable is also registered with the collision world.
import * as THREE from 'three';
import { CollisionWorld } from '../physics/collision.js';
import { SURF, surfaceId } from '../shared/surfaces.js';
import { pointAt, sInRange, clamp } from '../shared/track-math.js';
import { vcMaterial, roadTexture, groundTexture, boostTexture, canvasTex } from '../render/materials.js';
import { fbm, smoothstep, lerp, makeRng } from '../core/noise.js';

const C = new THREE.Color();
const KERB = 0.9;
const BARRIER_W = 0.9; // room taken by the guard rails along the track edges

export function buildTrackWorld(track, vis) {
  const def = track.def;
  const world = new CollisionWorld(track);
  world.killY = def.killY ?? -10;
  const group = new THREE.Group();
  group.name = 'track';
  const updaters = [];

  const inRanges = (list, s) => (list || []).some((r) => sInRange(s, r.from, r.to, track.length) != null);
  const ctx = {
    track, def, vis, world, group, updaters,
    inGap: (s) => inRanges(def.gaps, s),
    inBridge: (s) => inRanges(def.bridges, s),
    bridgeAt: (s) => (def.bridges || []).find((r) => sInRange(s, r.from, r.to, track.length) != null) || null,
  };

  const waters = makeWaters(track, def.water || []);
  waters.forEach((w) => world.addWater(w));
  ctx.waters = waters;
  world.setupMovers(def.movers);
  // fixed obstacles from the layout data (the map draws them)
  for (const o of def.obstacles || []) {
    const p = pointAt(track.main, o.s);
    world.addCircle({ x: p.x + p.rx * (o.lat || 0), z: p.z + p.rz * (o.lat || 0), r: o.r || 1.5, kind: o.model || 'obstacle' });
  }

  const terrain = makeTerrain(ctx);
  ctx.terrain = terrain;
  group.add(terrain.mesh);

  for (const path of track.paths) buildRibbons(ctx, path);
  buildBridges(ctx);
  buildRamps(ctx);
  buildBoostPads(ctx);
  buildPatches(ctx);
  buildWater(ctx);
  buildStartLine(ctx);
  buildBarriers(ctx);

  // props along the edges stand behind the barrier
  ctx.edgeDecor = (spacing, offset = 0.6) => edgePoints(ctx, spacing, offset + BARRIER_W);
  ctx.heightAt = terrain.heightAt;
  ctx.groundAt = (x, z, yTop = 200) => { const g = world.ground(x, yTop, z); return g ? g.y : terrain.heightAt(x, z); };
  ctx.grid = gridSlots(track, world);
  ctx.update = (dt, t) => { for (const u of updaters) u(dt, t); };
  return ctx;
}

// nearest main-road sample to (x, z), searching around lap distance s: { d, p }
function mainNear(track, x, z, s) {
  const main = track.main, n = main.pts.length;
  const i0 = Math.round(s / main.step);
  let best = Infinity, bp = main.pts[0];
  for (let k = -30; k <= 30; k++) {
    const p = main.pts[(((i0 + k) % n) + n) % n];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) { best = d; bp = p; }
  }
  return { d: Math.sqrt(best), p: bp };
}

// ------------------------------------------------------------------ cross-section height

// height of a path cross-section at lateral offset lat (verges slope gently down)
function yLat(p, lat) {
  const hw = p.w / 2, a = Math.abs(lat);
  let drop = 0;
  if (a > hw) {
    if (a <= hw + p.m) drop = -0.03 - 0.17 * (a - hw) / Math.max(0.1, p.m);
    else drop = -0.2 - 0.25 * (a - hw - p.m);
  }
  return p.y - lat * Math.sin(p.bank) + drop;
}

// ------------------------------------------------------------------ water

function distToPoly(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1), 0, 1);
    const d = Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
    if (d < best) best = d;
  }
  return best;
}

function makeWaters(track, list) {
  return list.map((w, idx) => {
    const out = { id: w.id || 'water' + idx, level: w.level, deep: !!w.deep, depth: w.depth ?? (w.deep ? 2.4 : 0.9), color: w.color, carve: w.carve };
    if (w.cross != null) {
      // a river crossing the track at lap distance w.cross, running sideways to it
      const p = pointAt(track.main, w.cross);
      const n = 24, half = w.length / 2, phase = idx * 1.7;
      out.poly = [];
      for (let i = 0; i <= n; i++) {
        const t = -half + (i / n) * w.length;
        const wig = (w.wiggle || 0) * Math.sin(t * 0.045 + phase) * Math.min(1, Math.abs(t) / 20);
        out.poly.push([p.x + p.rx * t + p.tx * wig, p.z + p.rz * t + p.tz * wig]);
      }
      out.width = w.width;
      out.test = (x, z) => distToPoly(x, z, out.poly) < out.width / 2;
      out.dist = (x, z) => distToPoly(x, z, out.poly) - out.width / 2;
    } else if (w.poly) {
      out.poly = w.poly; out.width = w.width;
      out.test = (x, z) => distToPoly(x, z, out.poly) < out.width / 2;
      out.dist = (x, z) => distToPoly(x, z, out.poly) - out.width / 2;
    } else {
      out.x = w.x; out.z = w.z; out.r = w.r;
      out.test = (x, z) => Math.hypot(x - w.x, z - w.z) < w.r;
      out.dist = (x, z) => Math.hypot(x - w.x, z - w.z) - w.r;
    }
    return out;
  });
}

// ------------------------------------------------------------------ terrain

function makeTerrain(ctx) {
  const { track, vis, waters, def } = ctx;
  const cfg = vis.terrain || {};
  const cell = cfg.cell || 4;
  const pad = cfg.pad || 150;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const path of track.paths) for (const p of path.pts) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  x0 = Math.floor((x0 - pad) / cell) * cell; z0 = Math.floor((z0 - pad) / cell) * cell;
  x1 = Math.ceil((x1 + pad) / cell) * cell; z1 = Math.ceil((z1 + pad) / cell) * cell;
  const nx = Math.round((x1 - x0) / cell) + 1, nz = Math.round((z1 - z0) / cell) + 1;
  const N = nx * nz;
  const H = new Float32Array(N), D = new Float32Array(N).fill(1e9), Y = new Float32Array(N), IN = new Float32Array(N);
  const CAP = new Float32Array(N).fill(1e9); // highest the ground may be (under bridges)
  const seed = cfg.seed || 1;

  // distance to the nearest track path, with that road's height and edge. Bridges are left
  // out (the ground under them is whatever is below), and where two roads overlap (a road
  // passing under a bridge) the lower one shapes the ground.
  const R = 48;
  for (const path of track.paths) {
    const n = path.pts.length, segs = path.closed ? n : n - 1;
    const lower = path.id === 'main' ? 0 : 0.08;
    for (let i = 0; i < segs; i++) {
      const a = path.pts[i], b = path.pts[(i + 1) % n];
      const deepGap = def.gapDepth && path.id === 'main' && ctx.inGap(a.s) && ctx.inGap(b.s);
      if (path.id === 'main' && ((ctx.inBridge(a.s) && ctx.inBridge(b.s)) || deepGap)) {
        // keep the ground well below the bridge deck (or far below a jump gap, def.gapDepth:
        // a real drop between floating islands)
        const drop = deepGap ? def.gapDepth : 2.2;
        const ix0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - 14 - x0) / cell)), ix1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + 14 - x0) / cell));
        const iz0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - 14 - z0) / cell)), iz1 = Math.min(nz - 1, Math.ceil((Math.max(a.z, b.z) + 14 - z0) / cell));
        const ex = b.x - a.x, ez = b.z - a.z, el = ex * ex + ez * ez || 1;
        for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
          const x = x0 + ix * cell, z = z0 + iz * cell;
          const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / el, 0, 1);
          const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t);
          if (d < a.w / 2 + 6) CAP[iz * nx + ix] = Math.min(CAP[iz * nx + ix], a.y + (b.y - a.y) * t - drop);
        }
        continue;
      }
      const ix0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - R - x0) / cell)), ix1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + R - x0) / cell));
      const iz0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - R - z0) / cell)), iz1 = Math.min(nz - 1, Math.ceil((Math.max(a.z, b.z) + R - z0) / cell));
      const ex = b.x - a.x, ez = b.z - a.z, el = ex * ex + ez * ez || 1;
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        const x = x0 + ix * cell, z = z0 + iz * cell;
        const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / el, 0, 1);
        const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t);
        const k = iz * nx + ix;
        const inner = (a.w + (b.w - a.w) * t) / 2 + a.m + (b.m - a.m) * t + 1.6;
        // compare by distance past each road's own edge so wide roads win near junctions
        const yy = a.y + (b.y - a.y) * t - lower - Math.abs(a.bank) * Math.min(d, (a.w / 2)) * 0.5;
        const both = d - inner < 0 && D[k] - IN[k] < 0;
        if (both ? yy < Y[k] - 3 || (Math.abs(yy - Y[k]) <= 3 && d - inner < D[k] - IN[k]) : d - inner < D[k] - IN[k]) {
          D[k] = d; IN[k] = inner;
          Y[k] = yy;
        }
      }
    }
  }

  const hills = cfg.hills || [];
  const base = cfg.base ?? 1;
  const noiseAmp = cfg.noise ?? 3;
  const blend = cfg.blend ?? 34;
  const rim = cfg.rim ?? 18; // raise the outer area into a soft bowl of hills
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = x0 + ix * cell, z = z0 + iz * cell, k = iz * nx + ix;
    let h0 = base + fbm(x / 90, z / 90, seed, 3) * noiseAmp + fbm(x / 22, z / 22, seed + 5, 2) * noiseAmp * 0.18;
    for (const hl of hills) h0 += hl.h * Math.exp(-((x - hl.x) ** 2 + (z - hl.z) ** 2) / (hl.r * hl.r));
    const far = D[k] - IN[k];
    if (far > 45) h0 += smoothstep(45, 210, far) * rim * (0.6 + 0.4 * fbm(x / 70, z / 70, seed + 9, 2));
    let h = h0;
    if (D[k] < 1e8) {
      if (D[k] <= IN[k]) h = Y[k] - 0.45;
      else h = lerp(Y[k] - 0.45, h0, smoothstep(0, 1, (D[k] - IN[k]) / blend));
    }
    // water carves the ground (carve: false = a sea of clouds far below that leaves the
    // floating islands alone)
    for (const w of waters) {
      if (w.carve === false) continue;
      const dd = w.dist(x, z);
      const bank = 9;
      if (dd < bank) {
        const bed = w.level - w.depth;
        let wh;
        if (dd < 0) {
          const half = w.r ?? w.width / 2;
          wh = bed + Math.pow(clamp(1 + dd / half, 0, 1), 2) * w.depth * 0.7;
        } else wh = lerp(w.level - 0.25, Math.max(h, w.level + 0.3), smoothstep(0, bank, dd));
        h = Math.min(h, wh);
      }
    }
    H[k] = Math.min(h, CAP[k]);
  }

  const heightAt = (x, z) => {
    const fx = clamp((x - x0) / cell, 0, nx - 1.001), fz = clamp((z - z0) / cell, 0, nz - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const k = iz * nx + ix;
    const a = H[k], b = H[k + 1], c = H[k + nx], d = H[k + nx + 1];
    // same triangle split as the mesh
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  };

  // mesh with vertex colours
  const pos = new Float32Array(N * 3), colArr = new Float32Array(N * 3), uv = new Float32Array(N * 2);
  const pal = vis.colors || {};
  const cLow = new THREE.Color(pal.grassLow || '#5fd14b'), cHigh = new THREE.Color(pal.grassHigh || '#a8ec5a');
  const cSand = new THREE.Color(pal.sand || '#ffe08a'), cDirt = new THREE.Color(pal.dirt || '#d9a066');
  const cFar = new THREE.Color(pal.far || pal.grassHigh || '#9be564');
  const specks = (pal.specks || []).map((c) => new THREE.Color(c));
  const rng = makeRng(seed + 99);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const k = iz * nx + ix, x = x0 + ix * cell, z = z0 + iz * cell, h = H[k];
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
    const n = fbm(x / 40, z / 40, seed + 3, 2) * 0.5 + 0.5;
    C.copy(cLow).lerp(cHigh, clamp(n * 0.8 + (h - base) * 0.03, 0, 1));
    const far = D[k] - IN[k];
    if (far > 60) C.lerp(cFar, smoothstep(60, 160, far) * 0.6);
    let wd = Infinity;
    for (const w of waters) if (w.carve !== false) wd = Math.min(wd, w.dist(x, z));
    if (wd < 6) C.lerp(cSand, smoothstep(6, 0, wd));
    void cDirt;
    if (specks.length && far > 4 && wd > 6 && rng() < (pal.speckChance ?? 0.12)) C.lerp(specks[Math.floor(rng() * specks.length)], 0.75);
    colArr[k * 3] = C.r; colArr[k * 3 + 1] = C.g; colArr[k * 3 + 2] = C.b;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let o = 0;
  for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
    const a = iz * nx + ix, b = a + 1, c = a + nx, d = c + 1;
    idx[o++] = a; idx[o++] = c; idx[o++] = b;
    idx[o++] = b; idx[o++] = c; idx[o++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, vcMaterial({ toon: false, map: groundTexture() }));
  mesh.name = 'terrain';
  mesh.receiveShadow = true;

  // collision: only the ground near the track can ever be driven on
  const offSurf = surfaceId(def.offroad || 'grass');
  const world = ctx.world;
  for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
    const a = iz * nx + ix, b = a + 1, c = a + nx, d = c + 1;
    const near = Math.min(D[a] - IN[a], D[b] - IN[b], D[c] - IN[c], D[d] - IN[d]);
    const px = pos[a * 3], pz = pos[a * 3 + 2];
    const inZone = (track.zones || []).some((zn) => Math.hypot(px - zn.x, pz - zn.z) < zn.r + 8);
    if (near > 10 && !inZone) continue;
    world.addTri(pos[a * 3], H[a], pos[a * 3 + 2], pos[c * 3], H[c], pos[c * 3 + 2], pos[b * 3], H[b], pos[b * 3 + 2], offSurf);
    world.addTri(pos[b * 3], H[b], pos[b * 3 + 2], pos[c * 3], H[c], pos[c * 3 + 2], pos[d * 3], H[d], pos[d * 3 + 2], offSurf);
  }
  return { mesh, heightAt, x0, z0, x1, z1, nx, nz, cell, H, D, IN };
}

// ------------------------------------------------------------------ road ribbons

function buildRibbons(ctx, path) {
  const { track, def, vis, world, group } = ctx;
  const isMain = path.id === 'main';
  const lower = isMain ? 0 : 0.08;
  const n = path.pts.length, segs = path.closed ? n : n - 1;
  const roadSurf = isMain ? SURF.ROAD : surfaceId(path.surface || 'road');
  const offSurf = surfaceId(def.offroad || 'grass');
  const roadCol = new THREE.Color(isMain ? (vis.road?.color || '#f2b28c') : (vis.shortcut?.color || vis.road?.color || '#f2b28c'));
  const woodCol = new THREE.Color(vis.bridge?.deck || '#c98b52');
  const kerbA = new THREE.Color(vis.road?.kerbA || '#ff5d8f'), kerbB = new THREE.Color(vis.road?.kerbB || '#ffffff');
  const vergeCol = new THREE.Color(vis.colors?.verge || vis.colors?.grassLow || '#6fd657');
  const lipCol = new THREE.Color(vis.colors?.grassLow || '#5fd14b');

  const road = { pos: [], col: [], uv: [] }, ground = { pos: [], col: [], uv: [] }, wood = { pos: [], col: [], uv: [] };
  const coll = [];
  // shortcuts: where a shortcut lies completely on the main road (where it leaves and
  // joins) nothing is drawn; where it overlaps the main road it is kept just below it
  // (the main road is banked on corners, so a flat shortcut used to poke through it)
  const onMain = isMain ? null : path.pts.map((p) => {
    const m = mainNear(track, p.x, p.z, p.s);
    return m.d + p.w / 2 < m.p.w / 2 + 0.3 && Math.abs(m.p.y - p.y) < 2;
  });
  const underMain = (v) => {
    const g = world.ground(v[0], v[1] + 0.7, v[2]);
    if (g && g.surf === SURF.ROAD && g.y > v[1] - 0.7) v[1] = Math.min(v[1], g.y - 0.05);
  };

  for (let i = 0; i < segs; i++) {
    const a = path.pts[i], b = path.pts[(i + 1) % n];
    if (isMain && (ctx.inGap(a.s) || ctx.inGap(b.s))) continue;
    if (onMain && (onMain[i] || onMain[(i + 1) % n])) continue;
    const bridge = isMain && (ctx.inBridge(a.s) || ctx.inBridge(b.s));
    const hwa = a.w / 2, hwb = b.w / 2;
    // lateral offsets are given per sample, so build each strip with interpolated widths
    const strip = (buf, fa0, fa1, color, surf, uvMode) => {
      // fa0/fa1: functions (p, hw) -> lateral
      const P = [[a, fa0(a, hwa)], [a, fa1(a, hwa)], [b, fa1(b, hwb)], [b, fa0(b, hwb)]];
      const V = P.map(([p, l]) => [p.x + p.rx * l, yLat(p, l) - lower, p.z + p.rz * l, p, l]);
      if (!isMain) V.forEach(underMain);
      for (const j of [0, 1, 2, 0, 2, 3]) {
        const v = V[j];
        buf.pos.push(v[0], v[1], v[2]);
        buf.col.push(color.r, color.g, color.b);
        if (uvMode === 'road') buf.uv.push((v[4] + 20) / 4, v[3].s / 4);
        else if (uvMode === 'wood') buf.uv.push((v[4] + 20) / 3, v[3].s / 1.5);
        else buf.uv.push(v[0] / 6, v[2] / 6);
      }
      if (surf != null) {
        coll.push(V[0][0], V[0][1], V[0][2], V[1][0], V[1][1], V[1][2], V[2][0], V[2][1], V[2][2], surf);
        coll.push(V[0][0], V[0][1], V[0][2], V[2][0], V[2][1], V[2][2], V[3][0], V[3][1], V[3][2], surf);
      }
    };
    if (bridge) {
      const br = ctx.bridgeAt(a.s) || ctx.bridgeAt(b.s) || {};
      const st = br.style || 'wood';
      if (st === 'wood') strip(wood, (p, hw) => -hw - 0.5, (p, hw) => hw + 0.5, woodCol, SURF.WOOD, 'wood');
      else {
        const c = st === 'candy' && Math.floor(i / 2) % 2 ? kerbB : woodCol;
        strip(road, (p, hw) => -hw - 0.5, (p, hw) => hw + 0.5, c, st === 'ice' ? SURF.ICE : SURF.ROAD, 'road');
      }
      continue;
    }
    const kc = Math.floor(i / 2) % 2 ? kerbA : kerbB;
    if (isMain) {
      strip(road, (p, hw) => -hw, (p, hw) => -hw + KERB, kc, SURF.ROAD, 'road');
      strip(road, (p, hw) => -hw + KERB, (p, hw) => hw - KERB, roadCol, roadSurf, 'road');
      strip(road, (p, hw) => hw - KERB, (p, hw) => hw, kc, SURF.ROAD, 'road');
    } else {
      strip(road, (p, hw) => -hw, (p, hw) => hw, roadCol, roadSurf, 'road');
    }
    strip(ground, (p, hw) => -hw - p.m, (p, hw) => -hw, vergeCol, offSurf);
    strip(ground, (p, hw) => hw, (p, hw) => hw + p.m, vergeCol, offSurf);
    strip(ground, (p, hw) => -hw - p.m - 2, (p, hw) => -hw - p.m, lipCol, offSurf);
    strip(ground, (p, hw) => hw + p.m, (p, hw) => hw + p.m + 2, lipCol, offSurf);
  }

  const mk = (buf, mat, name) => {
    if (!buf.pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const roadMat = vcMaterial({ toon: false, map: roadTexture(isMain ? (vis.road?.texture || 'cobble') : (vis.shortcut?.texture || 'smooth')) });
  const groundMat = vcMaterial({ toon: false, map: groundTexture() });
  mk(road, roadMat, path.id + '_road');
  mk(ground, groundMat, path.id + '_verge');
  mk(wood, vcMaterial({ toon: false, map: roadTexture('planks') }), path.id + '_deck');
  for (let k = 0; k < coll.length; k += 10) {
    world.addTri(coll[k], coll[k + 1], coll[k + 2], coll[k + 3], coll[k + 4], coll[k + 5], coll[k + 6], coll[k + 7], coll[k + 8], coll[k + 9]);
  }
}

// ------------------------------------------------------------------ bridges

// Bridge styles: wood (posts + rails), coaster (tube rails, lattice towers), stone (solid
// low walls, arches), candy (striped posts), ice (clear blue walls). Colours from vis.bridge.
function buildBridges(ctx) {
  const { track, def, vis, group } = ctx;
  for (const br of def.bridges || []) {
    const style = br.style || 'wood';
    const pos = [], col = [];
    const railCol = new THREE.Color(vis.bridge?.rail || '#ffffff'), postCol = new THREE.Color(vis.bridge?.post || '#ff7aa8');
    const skirtCol = new THREE.Color(vis.bridge?.skirt || '#9c6236');
    const box = (cx, cy, cz, sx, sy, sz, yaw, color, pitch = 0, roll = 0) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      if (roll) g.rotateZ(roll);
      if (pitch) g.rotateX(pitch);
      g.rotateY(yaw); g.translate(cx, cy, cz);
      const p = g.toNonIndexed().attributes.position.array;
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); col.push(color.r, color.g, color.b); }
    };
    const len = (br.to - br.from + track.length) % track.length;
    const step = style === 'stone' ? 2 : 3;
    for (let d = 0; d <= len + 0.01; d += step) {
      const p = pointAt(track.main, br.from + d);
      const q = pointAt(track.main, br.from + d + step / 2);
      const pitch = -Math.atan((pointAt(track.main, br.from + d + step).y - p.y) / step);
      for (const side of [-1, 1]) {
        const lat = side * (p.w / 2 + 0.35);
        const x = p.x + p.rx * lat, z = p.z + p.rz * lat, y = yLat(p, side * p.w / 2);
        const lx = q.x + q.rx * side * (q.w / 2 + 0.35), lz = q.z + q.rz * side * (q.w / 2 + 0.35), ly = yLat(q, side * q.w / 2);
        const last = d + step > len + 0.01;
        if (style === 'stone' || style === 'ice') {
          if (!last) box(lx, ly + 0.45, lz, 0.6, 0.9, step + 0.05, q.heading, d % 4 < 0.01 ? postCol : railCol, pitch);
        } else if (style === 'coaster') {
          if (!last) box(lx, ly + 0.8, lz, 0.22, 0.22, step + 0.05, q.heading, railCol, pitch);
          if (!last) box(lx, ly + 0.35, lz, 0.16, 0.16, step + 0.05, q.heading, railCol, pitch);
          box(x, y + 0.45, z, 0.2, 0.9, 0.2, p.heading, postCol);
        } else {
          // wood and candy: posts with rails (candy posts alternate colours)
          box(x, y + 0.55, z, 0.35, 1.1, 0.35, p.heading, style === 'candy' && (d / step) % 2 ? railCol : postCol);
          if (!last) {
            box(lx, ly + 0.95, lz, 0.18, 0.18, step, q.heading, railCol, pitch);
            box(lx, ly + 0.5, lz, 0.12, 0.12, step, q.heading, railCol, pitch);
          }
        }
      }
      // deck skirt and supports
      if (Math.round(d) % 6 === 0) {
        const lowY = ctx.terrain.heightAt(p.x, p.z);
        const deckY = p.y;
        box(p.x, deckY - 0.45, p.z, p.w + 1.2, 0.8, 6.1, p.heading, skirtCol, pitch);
        const hgt = deckY - 0.8 - lowY + 1;
        if (hgt > 0.5) {
          if (style === 'coaster') {
            // lattice tower: two legs and a cross brace
            for (const side of [-1, 1]) {
              const lt = side * (p.w / 2 - 0.6);
              box(p.x + p.rx * lt, lowY - 1 + hgt / 2, p.z + p.rz * lt, 0.45, hgt, 0.45, p.heading, postCol);
            }
            const span = p.w - 1.2, diag = Math.hypot(span, hgt);
            box(p.x, lowY - 1 + hgt / 2, p.z, diag, 0.25, 0.25, p.heading, railCol, 0, Math.atan2(hgt, span));
          } else if (style === 'stone') {
            box(p.x, lowY - 1 + hgt / 2, p.z, p.w * 0.5, hgt, 1.6, p.heading, skirtCol);
          } else {
            for (const side of [-1, 1]) {
              const lt = side * (p.w / 2 - 0.5);
              box(p.x + p.rx * lt, lowY - 1 + hgt / 2, p.z + p.rz * lt, 0.8, hgt, 0.8, p.heading, skirtCol);
            }
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, vcMaterial({ toon: true }));
    m.name = 'bridge';
    m.castShadow = true;
    group.add(m);
  }
}

// ------------------------------------------------------------------ ramps

function buildRamps(ctx) {
  const { track, def, world, group } = ctx;
  const pos = [], col = [];
  const cA = new THREE.Color(ctx.vis.ramp?.a || '#ffcf3f'), cB = new THREE.Color(ctx.vis.ramp?.b || '#ff6b9a'), cSide = new THREE.Color(ctx.vis.ramp?.side || '#ffffff');
  for (const r of def.ramps || []) {
    const steps = 6;
    const corner = (d, lat, up) => {
      const p = pointAt(track.main, r.s + d);
      return [p.x + p.rx * (r.lat + lat), yLat(p, r.lat + lat) + up, p.z + p.rz * (r.lat + lat)];
    };
    for (let i = 0; i < steps; i++) {
      const d0 = (i / steps) * r.length, d1 = ((i + 1) / steps) * r.length;
      const h0 = (i / steps) * r.height, h1 = ((i + 1) / steps) * r.height;
      const A = corner(d0, -r.width / 2, h0 + 0.02), B = corner(d0, r.width / 2, h0 + 0.02);
      const Cc = corner(d1, r.width / 2, h1 + 0.02), Dd = corner(d1, -r.width / 2, h1 + 0.02);
      const c = i % 2 ? cA : cB;
      for (const v of [A, B, Cc, A, Cc, Dd]) { pos.push(...v); col.push(c.r, c.g, c.b); }
      world.addTri(...A, ...B, ...Cc, SURF.RAMP);
      world.addTri(...A, ...Cc, ...Dd, SURF.RAMP);
      // side walls
      for (const side of [-1, 1]) {
        const l = side * r.width / 2;
        const a0 = corner(d0, l, 0), a1 = corner(d0, l, h0 + 0.02), b1 = corner(d1, l, h1 + 0.02), b0 = corner(d1, l, 0);
        for (const v of [a0, a1, b1, a0, b1, b0]) { pos.push(...v); col.push(cSide.r, cSide.g, cSide.b); }
      }
    }
    // back face
    const l0 = corner(r.length, -r.width / 2, 0), l1 = corner(r.length, -r.width / 2, r.height), r1 = corner(r.length, r.width / 2, r.height), r0 = corner(r.length, r.width / 2, 0);
    for (const v of [l0, l1, r1, l0, r1, r0]) { pos.push(...v); col.push(cSide.r, cSide.g, cSide.b); }
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, vcMaterial({ toon: true, side: THREE.DoubleSide }));
  m.name = 'ramps';
  m.castShadow = true;
  group.add(m);
}

// ------------------------------------------------------------------ boost pads

function buildBoostPads(ctx) {
  const { track, def, world, group, updaters } = ctx;
  const tex = boostTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(1, 1.5);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, fog: true });
  const pos = [], uv = [];
  for (const b of def.boostPads || []) {
    const w = b.width || 3.4, len = b.length || 6;
    const c = (d, l) => { const p = pointAt(track.main, b.s + d); return [p.x + p.rx * (b.lat + l), yLat(p, b.lat + l) + 0.04, p.z + p.rz * (b.lat + l)]; };
    const A = c(0, -w / 2), B = c(0, w / 2), Cc = c(len, w / 2), Dd = c(len, -w / 2);
    pos.push(...A, ...B, ...Cc, ...A, ...Cc, ...Dd);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    world.addTri(...A, ...B, ...Cc, SURF.BOOST);
    world.addTri(...A, ...Cc, ...Dd, SURF.BOOST);
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, mat);
  m.name = 'boostPads';
  m.renderOrder = 1;
  group.add(m);
  updaters.push((dt) => { tex.offset.y -= dt * 1.6; });
}

// ------------------------------------------------------------------ surface patches

// Patches change the ground on part of the road: mud, ice, sand, leaves, water slides,
// bouncy pads... { from, to, lat0, lat1, surface, color, path, visual: false (drawn by the
// map's own models) }. They sit just above the road so they win the ground test.
function buildPatches(ctx) {
  const { track, def, world, group, updaters, vis } = ctx;
  const flat = { pos: [], col: [], uv: [] }, slide = { pos: [], col: [], uv: [] };
  for (const pt of def.patches || []) {
    const path = pt.path ? track.paths.find((p) => p.id === pt.path) : track.main;
    if (!path) continue;
    const surf = surfaceId(pt.surface);
    const c = new THREE.Color(pt.color || '#8a5a2b');
    const len = path.closed ? ((pt.to - pt.from + track.length) % track.length) : pt.to - pt.from;
    const steps = Math.max(1, Math.ceil(len / 2));
    const buf = surf === SURF.SLIDE ? slide : flat;
    for (let i = 0; i < steps; i++) {
      const d0 = pt.from + (i / steps) * len, d1 = pt.from + ((i + 1) / steps) * len;
      const pa = pointAt(path, d0), pb = pointAt(path, d1);
      const l0 = (p) => (pt.lat0 != null ? pt.lat0 : -p.w / 2), l1 = (p) => (pt.lat1 != null ? pt.lat1 : p.w / 2);
      const V = [[pa, l0(pa)], [pa, l1(pa)], [pb, l1(pb)], [pb, l0(pb)]].map(([p, l]) => [p.x + p.rx * l, yLat(p, l) + 0.035 - (path.id === 'main' ? 0 : 0.08), p.z + p.rz * l, l, d0]);
      world.addTri(...V[0].slice(0, 3), ...V[1].slice(0, 3), ...V[2].slice(0, 3), surf);
      world.addTri(...V[0].slice(0, 3), ...V[2].slice(0, 3), ...V[3].slice(0, 3), surf);
      if (pt.visual === false) continue;
      const vv = [V[0], V[1], V[2], V[0], V[2], V[3]];
      for (let k = 0; k < 6; k++) {
        const v = vv[k];
        buf.pos.push(v[0], v[1], v[2]);
        buf.col.push(c.r, c.g, c.b);
        buf.uv.push((v[3] + 20) / 4, (k === 2 || k === 4 || k === 5 ? d1 : d0) / 4);
      }
    }
  }
  const mk = (buf, mat, name) => {
    if (!buf.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.name = name; m.receiveShadow = true; m.renderOrder = 1;
    group.add(m);
    return m;
  };
  mk(flat, vcMaterial({ toon: false, map: groundTexture() }), 'patches');
  if (slide.pos.length) {
    const tex = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(160,220,255,0.9)'; g.lineWidth = 4;
      for (let i = 0; i < 3; i++) { g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, i * 22 + 8 + Math.sin(x / 8) * 3); g.stroke(); }
    });
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex, emissive: new THREE.Color(vis.water?.glow || '#0a5d8a'), transparent: true, opacity: 0.92 });
    mk(slide, mat, 'slides');
    updaters.push((dt) => { tex.offset.y -= dt * 2.5; });
  }
}

// ------------------------------------------------------------------ water

function buildWater(ctx) {
  const { waters, group, updaters, vis } = ctx;
  if (!waters.length) return;
  const tex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.fillStyle = 'rgba(0,0,0,0.0)';
    g.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = `rgba(190,235,255,${0.5 + (i % 3) * 0.15})`;
      g.beginPath();
      const y = (i / 9) * h + 6;
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 12 + i) * 4);
      g.stroke();
    }
  });
  tex.repeat.set(1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: vis.water?.color || '#3fc4ff', map: tex, transparent: true, opacity: 0.86, emissive: new THREE.Color(vis.water?.glow || '#0a5d8a'), depthWrite: false });
  for (const w of waters) {
    let geo;
    if (w.poly) {
      const pos = [], uv = [];
      const width = w.width + 12;
      let dist = 0;
      for (let i = 0; i < w.poly.length; i++) {
        const a = w.poly[Math.max(0, i - 1)], b = w.poly[Math.min(w.poly.length - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1];
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const p = w.poly[i];
        if (i > 0) dist += Math.hypot(p[0] - w.poly[i - 1][0], p[1] - w.poly[i - 1][1]);
        pos.push(p[0] - dz * width / 2, w.level, p[1] + dx * width / 2, p[0] + dz * width / 2, w.level, p[1] - dx * width / 2);
        uv.push(0, dist / 10, width / 10, dist / 10);
      }
      const idx = [];
      for (let i = 0; i < w.poly.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
    } else {
      geo = new THREE.CircleGeometry(w.r + 6, 40);
      geo.rotateX(-Math.PI / 2);
      geo.translate(w.x, w.level, w.z);
      const uvA = geo.attributes.uv;
      const p = geo.attributes.position;
      for (let i = 0; i < uvA.count; i++) uvA.setXY(i, p.getX(i) / 10, p.getZ(i) / 10);
    }
    const m = new THREE.Mesh(geo, mat);
    m.name = 'water_' + w.id;
    m.renderOrder = 2;
    group.add(m);
  }
  updaters.push((dt, t) => { tex.offset.set(Math.sin(t * 0.3) * 0.05, -t * 0.06); });
}

// ------------------------------------------------------------------ start line

function buildStartLine(ctx) {
  const { track, group } = ctx;
  const p = pointAt(track.main, 0);
  const tex = canvasTex(256, 32, (g, w, h) => {
    const n = 16;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#ffffff' : '#222244';
      g.fillRect(i * w / n, j * h / 2, w / n, h / 2);
    }
  }, false);
  const geo = new THREE.PlaneGeometry(p.w, 2);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, fog: true }));
  m.position.set(p.x, p.y + 0.03, p.z);
  m.name = 'startLine';
  // the plane's local X runs across the road: turn it onto the road's right vector
  m.rotation.set(0, Math.atan2(-p.rz, p.rx), 0);
  group.add(m);
}

// ------------------------------------------------------------------ barriers

// Guard-rail styles, one per map theme (chosen with vis.rail = { style, rail, rail2, post,
// post2, cap } in the map's look file). Beams run along the edge with their inner face
// right at the physics edge; posts stand just behind them (bars sit between the beams).
//   beams: [{ y (bottom height), h, t (thickness), c, c2 (stripes) }]
//   post:  { every (m), w, h, c, cap: { w, h, c } }     bars: { every, w, h, c }
const RAIL_STYLES = {
  metal: { beams: [{ y: 0.7, h: 0.17, t: 0.12, c: '#eef3fb' }, { y: 0.53, h: 0.17, t: 0.12, c: '#b7c3d6' }], post: { every: 4, w: 0.16, h: 0.8, c: '#7d8aa3' } },
  picket: { beams: [{ y: 0.74, h: 0.14, t: 0.1, c: '#ffffff' }, { y: 0.4, h: 0.14, t: 0.1, c: '#ffffff' }], post: { every: 2.5, w: 0.2, h: 0.9, c: '#ff7aa8', cap: { w: 0.28, h: 0.1, c: '#ffffff' } } },
  log: { beams: [{ y: 0.52, h: 0.3, t: 0.3, c: '#a8673a' }], post: { every: 4, w: 0.26, h: 0.62, c: '#fff3e0', cap: { w: 0.72, h: 0.24, c: '#ff4f5e' } } },
  bamboo: { beams: [{ y: 0.76, h: 0.12, t: 0.12, c: '#e0cd72' }, { y: 0.44, h: 0.12, t: 0.12, c: '#d2bd5e' }], post: { every: 2.5, w: 0.18, h: 0.98, c: '#b9a34c', cap: { w: 0.22, h: 0.07, c: '#7fa83e' } } },
  wood: { beams: [{ y: 0.8, h: 0.17, t: 0.12, c: '#c98b52' }, { y: 0.42, h: 0.17, t: 0.12, c: '#b47a44' }], post: { every: 3, w: 0.22, h: 0.98, c: '#8a5a2b' } },
  iron: { beams: [{ y: 0.86, h: 0.08, t: 0.08, c: '#3b2a5f' }, { y: 0.24, h: 0.08, t: 0.08, c: '#3b2a5f' }], bars: { every: 0.8, w: 0.06, h: 0.96, c: '#4a3a70' }, post: { every: 4, w: 0.18, h: 1.06, c: '#2b1f48', cap: { w: 0.26, h: 0.26, c: '#ff8a1f' } } },
  ice: { beams: [{ y: 0.5, h: 0.3, t: 0.14, c: '#9fd8ff' }, { y: 0.8, h: 0.09, t: 0.26, c: '#ffffff' }], post: { every: 4, w: 0.18, h: 0.8, c: '#5fb8ef' } },
  candy: { beams: [{ y: 0.6, h: 0.22, t: 0.2, c: '#ff3d5a', c2: '#ffffff' }], post: { every: 3, w: 0.2, h: 0.84, c: '#ffffff', cap: { w: 0.36, h: 0.22, c: '#ff8ac4' } } },
  // old stone blocks (Jungle Ruins), rope between wooden posts (Amazon), tyre-and-steel (circuit)
  stone: { beams: [{ y: 0.0, h: 0.66, t: 0.5, c: '#b9b08f', c2: '#a39a7a' }], post: { every: 3, w: 0.62, h: 0.82, c: '#8f8a6e', cap: { w: 0.7, h: 0.12, c: '#6fae4a' } } },
  rope: { beams: [{ y: 0.78, h: 0.07, t: 0.07, c: '#e0c48a' }, { y: 0.45, h: 0.07, t: 0.07, c: '#d2b478' }], post: { every: 2.8, w: 0.22, h: 0.96, c: '#7a4f2a', cap: { w: 0.26, h: 0.08, c: '#4c9a3a' } } },
  armco: { beams: [{ y: 0.62, h: 0.3, t: 0.1, c: '#e8ecf4' }, { y: 0.2, h: 0.36, t: 0.5, c: '#2b2b3a', c2: '#ff4757' }], post: { every: 3.5, w: 0.14, h: 0.8, c: '#9aa3b8' } },
};

// Guard rails right at the edge of the drivable area, like a real go-kart track. The
// physics edge is already a wall (see CollisionWorld.edge), so this is what the karts are
// seen to bump into. Left open where another road joins (shortcut entrances), and left
// out on bridges (they have railings), in tunnels, over gaps and water, and along hidden
// shortcuts.
function buildBarriers(ctx) {
  const { track, def, vis, world, group } = ctx;
  if (vis.barriers === false) return;
  const cfg = vis.rail || {};
  const st = JSON.parse(JSON.stringify(RAIL_STYLES[cfg.style] || RAIL_STYLES.metal));
  if (cfg.rail) st.beams[0].c = cfg.rail;
  if (cfg.rail2 && st.beams[1]) st.beams[1].c = cfg.rail2;
  if (cfg.post && st.post) st.post.c = cfg.post;
  if (cfg.post2 && st.post) st.post.c2 = cfg.post2;
  if (cfg.cap && st.post && st.post.cap) st.post.cap.c = cfg.cap;
  const colors = new Map();
  const colorOf = (hex) => { if (!colors.has(hex)) colors.set(hex, new THREE.Color(hex)); return colors.get(hex); };
  const beamT = Math.max(...st.beams.map((b) => b.t));
  const inTunnel = (s) => (def.tunnels || []).some((r) => sInRange(s, r.from, r.to, track.length) != null);
  const pos = [], col = [];
  const quad = (A, B, Cc, D, c) => { for (const v of [A, B, Cc, A, Cc, D]) { pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); } };
  // an upright box (post, cap, bar) turned to the road direction (tx, tz)
  const box = (x, y0, z, w, h, tx, tz, c) => {
    const hw = w / 2, rx = -tz, rz = tx, y1 = y0 + h;
    const P = (a, b, y) => [x + rx * a + tx * b, y, z + rz * a + tz * b];
    const c00 = [-hw, -hw], c10 = [hw, -hw], c11 = [hw, hw], c01 = [-hw, hw];
    const ring = [c00, c10, c11, c01];
    for (let k = 0; k < 4; k++) {
      const u = ring[k], v = ring[(k + 1) % 4];
      quad(P(u[0], u[1], y0), P(v[0], v[1], y0), P(v[0], v[1], y1), P(u[0], u[1], y1), c);
    }
    quad(P(-hw, -hw, y1), P(hw, -hw, y1), P(hw, hw, y1), P(-hw, hw, y1), c);
  };
  const edgeY = (p, side) => yLat(p, side * (p.w / 2 + p.m));
  for (const path of track.paths) {
    if (path.hidden) continue;
    const n = path.pts.length, segs = path.closed ? n : n - 1;
    for (const side of [-1, 1]) {
      // which samples get a rail
      const ok = path.pts.map((p) => {
        if (path.id === 'main' && (ctx.inBridge(p.s) || ctx.inGap(p.s) || inTunnel(p.s))) return false;
        const l = side * (p.w / 2 + p.m + 0.05);
        const x = p.x + p.rx * l, z = p.z + p.rz * l;
        const e = world.edge(x, p.y, z, 0, {});
        if (e && e.excess < -0.15) return false; // inside another road (a junction)
        for (const w of ctx.waters) if (w.carve !== false && w.dist(x, z) < 0.5) return false; // (not the cloud sea)
        return true;
      });
      const okAt = (d) => { const i = Math.round(d / path.step); return path.closed ? ok[((i % n) + n) % n] : ok[Math.min(n - 1, Math.max(0, i))]; };
      // beams: one box piece per sample gap (split in two for striped rails)
      for (const bm of st.beams) {
        const cA = colorOf(bm.c), cB = colorOf(bm.c2 || bm.c), pieces = bm.c2 ? 2 : 1;
        for (let i = 0; i < segs; i++) {
          const j = (i + 1) % n;
          if (!ok[i] || !ok[j]) continue;
          for (let q = 0; q < pieces; q++) {
            const a = q ? pointAt(path, (i + 0.5) * path.step) : path.pts[i];
            const b = pieces === 2 && !q ? pointAt(path, (i + 0.5) * path.step) : path.pts[j];
            const c = pieces === 2 ? (q ? cB : cA) : cA;
            const ia = side * (a.w / 2 + a.m + 0.02), ib = side * (b.w / 2 + b.m + 0.02);
            const oa = ia + side * bm.t, ob = ib + side * bm.t;
            const ya = edgeY(a, side) + bm.y, yb = edgeY(b, side) + bm.y;
            const at = (p, l, y) => [p.x + p.rx * l, y, p.z + p.rz * l];
            const aiB = at(a, ia, ya), biB = at(b, ib, yb), aiT = at(a, ia, ya + bm.h), biT = at(b, ib, yb + bm.h);
            const aoB = at(a, oa, ya), boB = at(b, ob, yb), aoT = at(a, oa, ya + bm.h), boT = at(b, ob, yb + bm.h);
            quad(aiB, biB, biT, aiT, c); quad(boB, aoB, aoT, boT, c); quad(aiT, biT, boT, aoT, c); quad(aoB, boB, biB, aiB, c);
            const prev = (i - 1 + n) % n;
            if (!q && (!ok[prev] || (!path.closed && i === 0))) quad(aoB, aiB, aiT, aoT, c);
            if (q === pieces - 1 && (!ok[(j + 1) % n] || (!path.closed && j === n - 1))) quad(biB, boB, boT, biT, c);
          }
        }
      }
      // posts (with caps) behind the beams, and thin bars between them
      const placeUprights = (u, latOff, withCap) => {
        if (!u) return;
        const len = path.closed ? path.length : path.length - 0.01;
        let k = 0;
        for (let d = u.every / 2; d < len; d += u.every, k++) {
          if (!okAt(d)) continue;
          const p = pointAt(path, d);
          const l = side * (p.w / 2 + p.m + latOff);
          const x = p.x + p.rx * l, z = p.z + p.rz * l, y = edgeY(p, side);
          box(x, y - 0.3, z, u.w, u.h + 0.3, p.tx, p.tz, colorOf(u.c2 && k % 2 ? u.c2 : u.c));
          if (withCap && u.cap) box(x, y + u.h, z, u.cap.w, u.cap.h, p.tx, p.tz, colorOf(u.cap.c));
        }
      };
      placeUprights(st.post, beamT + 0.02 + (st.post ? st.post.w / 2 : 0), true);
      placeUprights(st.bars, 0.02 + beamT / 2, false);
    }
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, vcMaterial({ toon: true, side: THREE.DoubleSide }));
  m.name = 'barriers';
  m.receiveShadow = true;
  group.add(m);
}

// ------------------------------------------------------------------ helpers

// Points along the outside of every corridor (for fences, hedges, rocks...). Points that
// fall inside another path's corridor (junctions) and bridge or gap sections are skipped.
function edgePoints(ctx, spacing, offset) {
  const { track, world } = ctx;
  const out = [];
  for (const path of track.paths) {
    const step = Math.max(1, Math.round(spacing / path.step));
    for (let i = 0; i < path.pts.length; i += step) {
      const p = path.pts[i];
      if (path.id === 'main' && (ctx.inBridge(p.s) || ctx.inGap(p.s))) continue;
      for (const side of [-1, 1]) {
        const lat = side * (p.w / 2 + p.m + offset);
        const x = p.x + p.rx * lat, z = p.z + p.rz * lat;
        const e = world.edge(x, p.y, z, 0, {});
        if (e && e.excess < -0.3) continue; // inside another corridor
        let skip = false;
        for (const w of ctx.waters) if (w.carve !== false && w.dist(x, z) < 1) skip = true;
        if (skip) continue;
        out.push({ x, y: yLat(p, lat), z, yaw: p.heading, side, s: p.s, path: path.id, curv: p.curv });
      }
    }
  }
  return out;
}

// 12 starting slots behind the line (online parties have up to 12), two staggered columns.
function gridSlots(track, world) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const p = pointAt(track.main, track.length - 7 - i * 5.2);
    const lat = (i % 2 ? 1 : -1) * p.w * 0.2;
    const x = p.x + p.rx * lat, z = p.z + p.rz * lat;
    const g = world.ground(x, p.y + 3, z);
    out.push({ x, y: g ? g.y : p.y, z, yaw: p.heading, s: p.s });
  }
  return out;
}
