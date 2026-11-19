// UK Simulator - the town: streams 256 m chunks in and out around the player, builds their
// meshes (ground, buildings, markings, water, trees, street furniture, signs), adds physics
// colliders close to the player, and answers ground height / surface questions.
import * as THREE from 'three';
import { SURFACE } from '../physics/tyre.js';
import { Trees } from './trees.js';
import { Props } from './props.js';
import { makeSignMeshes } from './signs.js';

const N = 129, GRID = 2, CHUNK = 256;
const LOAD_R = 1250, UNLOAD_R = 1450, PHYS_R = 330, MARK_R = 420, PROP_R = 450;

export class World {
  constructor({ scene, physics, materials, manifest, base, quality }) {
    this.scene = scene; this.physics = physics; this.mats = materials; this.man = manifest; this.base = base;
    this.quality = quality || 'medium';
    this.area = manifest.area;
    this.chunks = new Map();
    this.pending = new Map();
    this.names = manifest.names;
    this.group = new THREE.Group(); this.group.name = 'town';
    scene.add(this.group);
    const nw = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = [];
    for (let k = 0; k < nw; k++) {
      const w = new Worker(new URL('./worker/chunk-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => this.onWorker(ev.data);
      w.busy = 0;
      this.workers.push(w);
    }
    this.lodIndex = [1, 2, 4].map((s) => makeTerrainIndex(s));
    this.trees = new Trees(materials);
    this.trees.physics = physics;
    this.props = new Props(physics);
    scene.add(this.trees.group, this.props.group);
    this.night = 0;
    this.ready = 0;
    this.lastUpdate = -1;
    this.loadRadius = { low: 800, medium: 1100, high: 1400 }[this.quality] || LOAD_R;
  }

  key(i, j) { return i + '_' + j; }
  inArea(x, z, m = 0) { const a = this.area; return x > a.x0 + m && x < a.x1 - m && z > a.z0 + m && z < a.z1 - m; }

  // ---------------------------------------------------------------- streaming
  wanted(px, pz, radius) {
    const a = this.area, out = [];
    const ci = Math.floor((px - a.x0) / CHUNK), cj = Math.floor((pz - a.z0) / CHUNK);
    const r = Math.ceil(radius / CHUNK) + 1;
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || j < 0 || i >= a.cx || j >= a.cz) continue;
      const d = chunkDist(a, i, j, px, pz);
      if (d <= radius) out.push({ i, j, d });
    }
    out.sort((p, q) => p.d - q.d);
    return out;
  }

  // load everything within `radius` first (loading screen); resolves when done
  async preload(px, pz, radius, onProgress) {
    const list = this.wanted(px, pz, radius);
    let done = 0;
    await Promise.all(list.map((c) => this.request(c.i, c.j).then(() => onProgress && onProgress(++done / list.length))));
    this.update(px, pz, 0, true);
  }

  request(i, j) {
    const key = this.key(i, j);
    if (this.chunks.has(key)) return Promise.resolve(this.chunks.get(key));
    if (this.pending.has(key)) return this.pending.get(key).promise;
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    const w = this.workers.reduce((a, b) => (b.busy < a.busy ? b : a));
    w.busy++;
    this.pending.set(key, { promise, resolve, reject, worker: w });
    w.postMessage({ type: 'load', key, i, j, base: this.base + 'data/' });
    return promise;
  }

  onWorker(m) {
    const p = this.pending.get(m.key);
    if (!p) return;
    p.worker.busy--;
    this.pending.delete(m.key);
    if (m.type === 'error') { console.error('chunk failed', m.key, m.error); p.resolve(null); return; }
    const c = this.makeChunk(m);
    this.chunks.set(m.key, c);
    p.resolve(c);
  }

  makeChunk(m) {
    const c = { key: m.key, i: m.i, j: m.j, x0: m.x0, z0: m.z0, heights: m.heights, land: m.land, sdf: m.sdf, col: m.col, named: m.named || [], phys: null, group: new THREE.Group() };
    c.group.position.set(m.x0, 0, m.z0);
    c.group.name = 'chunk ' + m.key;
    // ground
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(m.ter.p, 3));
    tg.setAttribute('normal', new THREE.BufferAttribute(m.ter.n, 3));
    tg.setIndex(this.lodIndex[0]);
    tg.boundingSphere = new THREE.Sphere(new THREE.Vector3(128, avgHeight(m.heights), 128), 200);
    const classTex = new THREE.DataTexture(m.land, 128, 128, THREE.RedFormat, THREE.UnsignedByteType);
    classTex.magFilter = classTex.minFilter = THREE.NearestFilter; classTex.needsUpdate = true;
    const sdfTex = new THREE.DataTexture(m.sdf, 256, 256, THREE.RGBAFormat, THREE.UnsignedByteType);
    sdfTex.magFilter = THREE.LinearFilter; sdfTex.minFilter = THREE.LinearFilter; sdfTex.needsUpdate = true;
    c.textures = [classTex, sdfTex];
    c.terrainMat = this.mats.terrain(classTex, sdfTex, m.x0, m.z0);
    c.terrain = new THREE.Mesh(tg, c.terrainMat);
    c.terrain.receiveShadow = true;
    c.terrain.name = 'ground';
    c.lod = 0;
    c.group.add(c.terrain);
    // buildings + pavements + decks + walls
    if (m.build.idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.build.p, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(m.build.n, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(m.build.uv, 2));
      g.setAttribute('tint', new THREE.BufferAttribute(m.build.t, 3));
      g.setAttribute('mat', new THREE.BufferAttribute(m.build.m, 1));
      g.setAttribute('info', new THREE.BufferAttribute(m.build.i, 4));
      g.setIndex(new THREE.BufferAttribute(m.build.idx, 1));
      g.computeBoundingSphere();
      c.buildings = new THREE.Mesh(g, this.mats.building);
      c.buildings.castShadow = true; c.buildings.receiveShadow = true;
      c.buildings.name = 'buildings';
      c.group.add(c.buildings);
    }
    if (m.marks.idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.marks.p, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(m.marks.n, 3));
      g.setAttribute('color', new THREE.BufferAttribute(m.marks.c, 3));
      g.setIndex(new THREE.BufferAttribute(m.marks.idx, 1));
      g.computeBoundingSphere();
      c.marks = new THREE.Mesh(g, this.mats.marks);
      c.marks.receiveShadow = true;
      c.marks.name = 'markings';
      c.group.add(c.marks);
    }
    if (m.water.idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.water.p, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(m.water.n, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(m.water.uv, 2));
      g.setIndex(new THREE.BufferAttribute(m.water.idx, 1));
      g.computeBoundingSphere();
      c.water = new THREE.Mesh(g, this.mats.water);
      c.water.receiveShadow = true;
      c.water.name = 'water';
      c.group.add(c.water);
      // water areas for the physics (deep water stops vehicles)
      c.waterTris = { p: m.water.p, idx: m.water.idx };
    }
    c.trees = this.trees.add(c, m.trees);
    c.props = this.props.add(c, m.furn);
    c.signs = makeSignMeshes(m.signs, m.shops, this.names);
    if (c.signs) c.group.add(c.signs);
    this.group.add(c.group);
    return c;
  }

  unload(c) {
    this.group.remove(c.group);
    c.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const t of c.textures) t.dispose();
    c.terrainMat.dispose();
    if (c.signs) c.signs.userData.dispose?.();
    this.trees.remove(c);
    this.props.remove(c);
    this.setPhysics(c, false);
    this.chunks.delete(c.key);
  }

  // called every frame with the camera / player position
  update(px, pz, time, force = false) {
    // streaming (a few times a second)
    if (force || time - this.lastUpdate > 0.25) {
      this.lastUpdate = time;
      const want = this.wanted(px, pz, this.loadRadius);
      let started = 0;
      for (const w of want) {
        const k = this.key(w.i, w.j);
        if (this.chunks.has(k) || this.pending.has(k)) continue;
        if (this.pending.size >= this.workers.length * 2 || started >= 2) break;
        this.request(w.i, w.j); started++;
      }
      for (const c of [...this.chunks.values()]) {
        const d = chunkDist(this.area, c.i, c.j, px, pz);
        if (d > this.loadRadius + 200) { this.unload(c); continue; }
        // ground detail
        const lod = d < 380 ? 0 : d < 800 ? 1 : 2;
        if (lod !== c.lod) { c.terrain.geometry.setIndex(this.lodIndex[lod]); c.lod = lod; }
        if (c.marks) c.marks.visible = d < MARK_R;
        if (c.signs) c.signs.visible = d < 260;
        this.trees.setDistance(c, d);
        this.props.setDistance(c, d, d < PROP_R);
        this.setPhysics(c, d < PHYS_R);
      }
    }
    this.trees.update();
    this.props.update(this.night, time);
    if (this.night > 0.01 && (force || time - (this.lampT || -1) > 0.5)) { this.lampT = time; this.props.nearestLamps(px, pz, this.mats.shared.uLamps.value); }
  }

  setPhysics(c, on) {
    if (on && !c.phys) {
      const ph = this.physics;
      const parts = [];
      // ground height field (absolute coordinates)
      parts.push(ph.addHeightfield(c.x0, c.z0, N, GRID, c.heights));
      // buildings, kerbs, bridges, walls: one triangle mesh in world coordinates
      const v = new Float32Array(c.col.v.length);
      for (let k = 0; k < v.length; k += 3) { v[k] = c.col.v[k] + c.x0; v[k + 1] = c.col.v[k + 1]; v[k + 2] = c.col.v[k + 2] + c.z0; }
      if (c.col.i.length) parts.push(ph.addTrimesh(v, c.col.i, 'static'));
      c.phys = parts;
      this.trees.setPhysics(c, true);
      this.props.setPhysics(c, true);
    } else if (!on && c.phys) {
      for (const p of c.phys) this.physics.remove(p);
      c.phys = null;
      this.trees.setPhysics(c, false);
      this.props.setPhysics(c, false);
    }
  }

  chunkAt(x, z) {
    const a = this.area;
    const i = Math.floor((x - a.x0) / CHUNK), j = Math.floor((z - a.z0) / CHUNK);
    return this.chunks.get(i + '_' + j) || null;
  }

  // ground mesh height (same triangles as the mesh and the physics height field)
  heightAt(x, z) {
    const c = this.chunkAt(x, z);
    if (!c) return this.farHeight ? this.farHeight(x, z) : 90;
    let fx = (x - c.x0) / GRID, fz = (z - c.z0) / GRID;
    let ci = Math.floor(fx), r = Math.floor(fz);
    ci = Math.max(0, Math.min(N - 2, ci)); r = Math.max(0, Math.min(N - 2, r));
    fx = Math.max(0, Math.min(1, fx - ci)); fz = Math.max(0, Math.min(1, fz - r));
    const h = c.heights;
    const h00 = h[r * N + ci], h10 = h[r * N + ci + 1], h01 = h[(r + 1) * N + ci], h11 = h[(r + 1) * N + ci + 1];
    return fx >= fz ? h00 + fx * (h10 - h00) + fz * (h11 - h10) : h00 + fz * (h01 - h00) + fx * (h11 - h01);
  }

  // ray against the ground mesh only (exact, matches what you see): { dist, point, normal } or null
  groundRay(ox, oy, oz, dx, dy, dz, maxDist) {
    const f = (t) => oy + dy * t - this.heightAt(ox + dx * t, oz + dz * t);
    let ta = 0, fa = f(0);
    if (fa < 0) return null; // starts under the ground
    const step = Math.min(maxDist, Math.abs(dy) > 0.9 ? 0.6 : 0.35);
    let tb = 0, fb = fa;
    while (tb < maxDist) {
      ta = tb; fa = fb;
      tb = Math.min(maxDist, tb + step);
      fb = f(tb);
      if (fb <= 0) break;
      if (tb >= maxDist) return null;
    }
    if (fb > 0) return null;
    for (let k = 0; k < 14; k++) { const tm = (ta + tb) / 2, fm = f(tm); if (fm > 0) { ta = tm; fa = fm; } else { tb = tm; fb = fm; } }
    const t = (ta + tb) / 2;
    const px = ox + dx * t, pz = oz + dz * t, e = 0.12;
    const hx = (this.heightAt(px + e, pz) - this.heightAt(px - e, pz)) / (2 * e), hz = (this.heightAt(px, pz + e) - this.heightAt(px, pz - e)) / (2 * e);
    const L = Math.hypot(hx, 1, hz);
    return { dist: t, point: [px, oy + dy * t, pz], normal: [-hx / L, 1 / L, -hz / L], kind: 'ground' };
  }

  // what kind of surface is at (x, z): { surface, wet, water (depth of water above ground), road }
  surfaceAt(x, z, y = null) {
    const c = this.chunkAt(x, z);
    const out = this._surf || (this._surf = { surface: SURFACE.grass, wet: 0, water: 0, road: 0, name: -1 });
    out.water = 0; out.road = 0;
    if (!c) { out.surface = SURFACE.grass; return out; }
    const lx = x - c.x0, lz = z - c.z0;
    const si = (Math.min(255, Math.max(0, Math.floor(lz))) * 256 + Math.min(255, Math.max(0, Math.floor(lx)))) * 4;
    const R = c.sdf[si], G = c.sdf[si + 1], B = c.sdf[si + 2];
    const cls = c.land[Math.min(127, Math.max(0, Math.floor(lz / 2))) * 128 + Math.min(127, Math.max(0, Math.floor(lx / 2)))];
    out.wet = this.wetness || 0;
    if (R > 128) { out.surface = SURFACE.tarmac; out.road = 1; return out; }
    if (G > 128) { out.surface = SURFACE.paving; out.road = 0.5; return out; }
    if (B > 124) { out.surface = cls === 6 ? SURFACE.sand : SURFACE.dirt; return out; }
    out.surface = LAND_SURFACE[cls] ?? SURFACE.grass;
    if (cls === 12) {
      // river / canal / pond: how deep is the water here?
      const lvl = this.waterLevelAt(c, lx, lz);
      if (lvl !== null && y !== null) out.water = Math.max(0, lvl - y);
      else if (lvl !== null) out.water = Math.max(0, lvl - this.heightAt(x, z));
    }
    // wet grass turns to mud
    if (out.wet > 0.5 && (out.surface === SURFACE.grass || out.surface === SURFACE.dirt) && cls !== 1 && cls !== 13) out.surface = cls === 4 || cls === 19 || cls === 7 ? SURFACE.mud : out.surface;
    if (cls === 4 || cls === 19) out.surface = out.wet > 0.2 ? SURFACE.mud : SURFACE.dirt;
    return out;
  }

  waterLevelAt(c, lx, lz) {
    if (!c.waterTris) return null;
    const { p, idx } = c.waterTris;
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k] * 3, b = idx[k + 1] * 3, d = idx[k + 2] * 3;
      if (pointInTri(lx, lz, p[a], p[a + 2], p[b], p[b + 2], p[d], p[d + 2])) return (p[a + 1] + p[b + 1] + p[d + 1]) / 3;
    }
    return null;
  }

  // name of the road nearest to (x, z) (for the HUD)
  roadNameAt(x, z) {
    const c = this.chunkAt(x, z);
    if (!c) return null;
    const lx = x - c.x0, lz = z - c.z0;
    let best = null, bd = 18;
    for (const r of c.named) {
      const p = r.p;
      for (let k = 0; k + 3 < p.length; k += 2) {
        const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
        let t = ((lx - ax) * dx + (lz - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(lx - ax - t * dx, lz - az - t * dz) - r.w / 2;
        if (d < bd) { bd = d; best = r; }
      }
    }
    return best ? this.names[best.n] : null;
  }

  stats() {
    let tris = 0;
    for (const c of this.chunks.values()) c.group.traverse((o) => { if (o.isMesh && o.visible && o.geometry.index) tris += o.geometry.index.count / 3 * (o.isInstancedMesh ? o.count : 1); });
    return { chunks: this.chunks.size, pending: this.pending.size, tris };
  }
}

const LAND_SURFACE = [
  SURFACE.grass, SURFACE.grass, SURFACE.grass, SURFACE.grass, SURFACE.dirt, SURFACE.forest, SURFACE.sand, SURFACE.dirt, SURFACE.concrete, SURFACE.tarmac,
  SURFACE.paving, SURFACE.gravel, SURFACE.mud, SURFACE.grass, SURFACE.grass, SURFACE.grass, SURFACE.ballast, SURFACE.grass, SURFACE.grass, SURFACE.dirt,
];

function pointInTri(px, pz, ax, az, bx, bz, cx, cz) {
  const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
  const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
  const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function chunkDist(a, i, j, px, pz) {
  const x0 = a.x0 + i * CHUNK, z0 = a.z0 + j * CHUNK;
  const dx = Math.max(x0 - px, 0, px - (x0 + CHUNK)), dz = Math.max(z0 - pz, 0, pz - (z0 + CHUNK));
  return Math.hypot(dx, dz);
}

function avgHeight(h) { let s = 0; for (let k = 0; k < h.length; k += 97) s += h[k]; return s / Math.ceil(h.length / 97); }

// index buffer for the ground grid at a given stride, plus skirts
function makeTerrainIndex(s) {
  const idx = [];
  for (let r = 0; r < N - 1; r += s) for (let c = 0; c < N - 1; c += s) {
    const a = r * N + c, b = r * N + c + s, d = (r + s) * N + c, e = (r + s) * N + c + s;
    // same diagonal as the height function: (0,0)-(1,1); counter-clockwise seen from above
    idx.push(a, e, b, a, d, e);
  }
  const base = N * N;
  const edges = [(t) => t, (t) => (N - 1) * N + t, (t) => t * N, (t) => t * N + N - 1];
  for (let e = 0; e < 4; e++) {
    for (let t = 0; t < N - 1; t += s) {
      const g0 = edges[e](t), g1 = edges[e](t + s), k0 = base + e * N + t, k1 = base + e * N + t + s;
      idx.push(g0, k0, g1, g1, k0, k1, g0, g1, k0, g1, k1, k0);
    }
  }
  return new THREE.BufferAttribute(new Uint32Array(idx), 1);
}
