// The dirt system. One WashSurface per washable object:
// - a low-res RG8 mask texture (R = grime, G = stubborn layer) laid out on the object's second UV set,
// - for every mask texel: its world position and normal (found by rasterising the triangles in UV space),
// - a 3D grid of texels so a spray only looks at texels near where it hits,
// - progress = cleaned texels / dirty texels.
import * as THREE from 'three';
import { fbm3, noise3, smooth } from './noise.js';

export const CLEAN = 0.035;        // a texel below this (grime and stubborn) is clean
export const DONE_AT = 0.98;       // an object is finished (and snapped clean) at this progress
const TEXEL = 0.016;               // wanted texel size in metres
const PACK = 0.62;                 // rough share of the mask that UV islands cover

let dummyInfo = null;
function dummy() {
  if (!dummyInfo) { dummyInfo = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType); dummyInfo.needsUpdate = true; }
  return dummyInfo;
}

export class WashSurface {
  // geo: baked world-space geometry with attributes position, aMaskUv and an index
  constructor(id, def, geo) {
    this.id = id;
    this.def = def;
    this.name = def.name || id;
    let area = 0;
    const P = geo.attributes.position.array, I = geo.index.array;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    }
    this.area = area;
    const want = Math.sqrt(area / (TEXEL * TEXEL) / PACK);
    this.res = def.res || Math.max(128, Math.min(512, Math.round(want / 32) * 32));
    this.rasterize(geo);
    this.buildGrid();
    const N = this.res;
    this.mask = new Uint8Array(N * N * 2);
    this.tex = new THREE.DataTexture(this.mask, N, N, THREE.RGFormat, THREE.UnsignedByteType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.unpackAlignment = 1;
    this.tex.needsUpdate = true;
    this.info = null;
    this.before = null; this.beforeTex = null;
    this.uniforms = {
      uMask: { value: this.tex }, uBefore: { value: this.tex }, uInfo: { value: dummy() }, uFlash: { value: 0 },
      uDirtTint: { value: new THREE.Color(def.dirtTint || '#8a7258') }, uLayerTint: { value: new THREE.Color(def.layerTint || '#7aa040') },
    };
    this.grime = new Float32Array(this.count);
    this.stub = new Float32Array(this.count);
    this.countable = new Uint8Array(this.count);
    this.total = 0; this.clean = 0;
    this.done = false; this.dirty = false; this.flash = 0;
    this.hits = 0; // texels cleaned this frame (sound + particles)
  }

  // ---------------------------------------------------------------- set-up
  rasterize(geo) {
    const N = this.res;
    const P = geo.attributes.position.array, U = geo.attributes.aMaskUv.array, I = geo.index.array;
    const owner = new Int32Array(N * N).fill(-1);
    let cap = Math.ceil(N * N * 0.8) + 64;
    let pos = new Float32Array(cap * 3), nrm = new Int8Array(cap * 3), pix = new Int32Array(cap);
    let count = 0;
    const eps = 1e-4;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const ax = U[a * 2] * N, ay = U[a * 2 + 1] * N, bx = U[b * 2] * N, by = U[b * 2 + 1] * N, cx = U[c * 2] * N, cy = U[c * 2 + 1] * N;
      const area2 = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area2) < 1e-9) continue;
      const inv = 1 / area2;
      // world face normal
      const pax = P[a * 3], pay = P[a * 3 + 1], paz = P[a * 3 + 2];
      const pbx = P[b * 3], pby = P[b * 3 + 1], pbz = P[b * 3 + 2];
      const pcx = P[c * 3], pcy = P[c * 3 + 1], pcz = P[c * 3 + 2];
      const e1x = pbx - pax, e1y = pby - pay, e1z = pbz - paz, e2x = pcx - pax, e2y = pcy - pay, e2z = pcz - paz;
      let fnx = e1y * e2z - e1z * e2y, fny = e1z * e2x - e1x * e2z, fnz = e1x * e2y - e1y * e2x;
      const fl = Math.hypot(fnx, fny, fnz) || 1;
      fnx = Math.round((fnx / fl) * 127); fny = Math.round((fny / fl) * 127); fnz = Math.round((fnz / fl) * 127);
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const p = y * N + x;
          if (owner[p] >= 0) continue;
          const px = x + 0.5;
          const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) * inv;
          if (w0 < -eps) continue;
          const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) * inv;
          if (w1 < -eps) continue;
          const w2 = 1 - w0 - w1;
          if (w2 < -eps) continue;
          if (count >= cap) {
            cap = Math.ceil(cap * 1.4);
            const np = new Float32Array(cap * 3); np.set(pos); pos = np;
            const nn = new Int8Array(cap * 3); nn.set(nrm); nrm = nn;
            const nx = new Int32Array(cap); nx.set(pix); pix = nx;
          }
          owner[p] = count;
          pix[count] = p;
          pos[count * 3] = w0 * pax + w1 * pbx + w2 * pcx;
          pos[count * 3 + 1] = w0 * pay + w1 * pby + w2 * pcy;
          pos[count * 3 + 2] = w0 * paz + w1 * pbz + w2 * pcz;
          nrm[count * 3] = fnx; nrm[count * 3 + 1] = fny; nrm[count * 3 + 2] = fnz;
          count++;
        }
      }
    }
    this.count = count;
    this.pos = pos.subarray(0, count * 3);
    this.nrm = nrm.subarray(0, count * 3);
    this.pix = pix.subarray(0, count);
    // padding: pixels just outside the islands copy their neighbour (no dark seams with linear filtering)
    const src = new Int32Array(N * N).fill(-1);
    for (let p = 0; p < N * N; p++) if (owner[p] >= 0) src[p] = owner[p];
    const pad = [];
    for (let pass = 0; pass < 3; pass++) {
      const add = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const p = y * N + x;
        if (src[p] >= 0) continue;
        let s = -1;
        for (let dy = -1; dy <= 1 && s < 0; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= N) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= N) continue;
            const q = src[yy * N + xx];
            if (q >= 0) { s = q; break; }
          }
        }
        if (s >= 0) add.push(p, s);
      }
      for (let i = 0; i < add.length; i += 2) { src[add[i]] = add[i + 1]; pad.push(add[i], add[i + 1]); }
    }
    // CSR: texel -> its padding pixels
    const start = new Int32Array(count + 1);
    for (let i = 1; i < pad.length; i += 2) start[pad[i] + 1]++;
    for (let i = 0; i < count; i++) start[i + 1] += start[i];
    const fill = start.slice(0, count);
    const list = new Int32Array(pad.length / 2);
    for (let i = 0; i < pad.length; i += 2) list[fill[pad[i + 1]]++] = pad[i];
    this.padStart = start; this.padList = list;
  }

  buildGrid() {
    const n = this.count, P = this.pos;
    const bb = new THREE.Box3();
    for (let i = 0; i < n; i++) bb.expandByPoint(new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
    if (!n) bb.set(new THREE.Vector3(), new THREE.Vector3());
    this.box = bb;
    let cs = 0.2;
    const size = bb.getSize(new THREE.Vector3());
    let gx, gy, gz;
    for (;;) {
      gx = Math.floor(size.x / cs) + 1; gy = Math.floor(size.y / cs) + 1; gz = Math.floor(size.z / cs) + 1;
      if (gx * gy * gz <= 600000) break;
      cs *= 1.25;
    }
    this.cs = cs; this.gx = gx; this.gy = gy; this.gz = gz;
    const cells = gx * gy * gz;
    const cellOf = new Int32Array(n);
    const start = new Int32Array(cells + 1);
    for (let i = 0; i < n; i++) {
      const ix = Math.min(gx - 1, Math.floor((P[i * 3] - bb.min.x) / cs));
      const iy = Math.min(gy - 1, Math.floor((P[i * 3 + 1] - bb.min.y) / cs));
      const iz = Math.min(gz - 1, Math.floor((P[i * 3 + 2] - bb.min.z) / cs));
      const c = (iz * gy + iy) * gx + ix;
      cellOf[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < cells; c++) start[c + 1] += start[c];
    const fill = start.slice(0, cells);
    const items = new Int32Array(n);
    for (let i = 0; i < n; i++) items[fill[cellOf[i]]++] = i;
    this.cellStart = start; this.cellItems = items;
  }

  // ---------------------------------------------------------------- dirt
  // job = { groundY, reachTop, seed }; layer = the object's stubborn layer spec (or null)
  initDirt(job) {
    const n = this.count, P = this.pos, Nn = this.nrm, def = this.def;
    const seed = (job.seed || 1) + this.id.length * 31;
    const base = def.grime == null ? 0.82 : def.grime;
    const g0 = job.groundY || 0;
    const reach = def.reachTop || job.reachTop || 2.8;
    const layer = def.layer || null;
    const hideN = def.hideNormals || null; // sides that face away from the player area (data per object)
    const tags = layer && layer.kind === 'graffiti' ? this.prepareGraffiti(layer) : null;
    let info = null;
    if (tags) info = new Uint8Array(this.res * this.res);
    this.total = 0; this.clean = 0;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const nx = Nn[i * 3] / 127, ny = Nn[i * 3 + 1] / 127, nz = Nn[i * 3 + 2] / 127;
      let g = base + (fbm3(x * 0.8, y * 0.8, z * 0.8, seed) - 0.5) * 0.7;
      if (Math.abs(ny) < 0.7) {
        g += 0.32 * Math.max(0, 1 - (y - g0) / 0.7);                    // mud splashes low down
        g += 0.18 * (noise3(x * 5, y * 0.5, z * 5, seed + 3) - 0.5);    // run-down streaks
      } else if (ny > 0.7) g += 0.08;                                  // tops collect more
      g = Math.min(1, Math.max(0.5, g));
      let s = 0;
      if (layer) {
        if (layer.kind === 'moss') {
          const m = fbm3(x * (layer.scale || 1.4), y * (layer.scale || 1.4), z * (layer.scale || 1.4), seed + 17)
            + (layer.low ? 0.45 * Math.max(0, 1 - (y - g0) / layer.low) : 0)
            + (layer.top && ny > 0.6 ? 0.15 : 0);
          const th = 1 - (layer.amount || 0.4);
          s = smooth(th, th + 0.1, m);
          if (layer.below != null && y > layer.below) s = 0;
        } else if (layer.kind === 'oil' && ny > 0.5) {
          for (const sp of layer.spots) {
            const d = Math.hypot(x - sp[0], z - sp[1]) / sp[2] + (noise3(x * 3, 0, z * 3, seed + 5) - 0.5) * 0.45;
            if (d < 1) s = Math.max(s, 1 - smooth(0.7, 1.0, d));
          }
        } else if (tags) {
          const r = this.graffitiAt(tags, x, y, z, nx, ny, nz);
          if (r >= 0) { s = 1; info[this.pix[i]] = (r & 7) * 32; }
        }
      }
      // surfaces nobody can see: facing down, or tops too high to reach
      if (ny < -0.5 || (ny > 0.35 && y > reach)) { g = 0; s = 0; }
      // hidden: ground under something solid, or facing straight into a wall / solid object
      else if (job.hidden && job.hidden(x, y, z, nx, ny, nz)) { g = 0; s = 0; }
      else if (hideN && hideN.some((v) => nx * v[0] + ny * v[1] + nz * v[2] > 0.7)) { g = 0; s = 0; }
      this.grime[i] = g; this.stub[i] = s;
      const c = g > CLEAN || s > CLEAN;
      this.countable[i] = c ? 1 : 0;
      if (c) this.total++;
      this.write(i);
    }
    if (info) {
      // padding pixels copy their texel's colour
      for (let i = 0; i < n; i++) for (let k = this.padStart[i]; k < this.padStart[i + 1]; k++) info[this.padList[k]] = info[this.pix[i]];
      if (this.info) this.info.dispose();
      this.info = new THREE.DataTexture(info, this.res, this.res, THREE.RedFormat, THREE.UnsignedByteType);
      this.info.minFilter = this.info.magFilter = THREE.NearestFilter;
      this.info.generateMipmaps = false; this.info.unpackAlignment = 1; this.info.needsUpdate = true;
      this.uniforms.uInfo.value = this.info;
    }
    this.done = this.total === 0;
    this.before = this.mask.slice();
    if (this.beforeTex) { this.beforeTex.dispose(); this.beforeTex = null; }
    this.uniforms.uBefore.value = this.tex;
    this.dirty = true;
  }

  // graffiti tags: text drawn on a canvas in Fredoka, projected on one side of the object's box
  prepareGraffiti(layer) {
    const bb = this.box, out = [];
    for (const t of layer.tags) {
      const W = 512, H = 256;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const code = (i) => `rgb(${i * 32 + 16},0,0)`;
      let fs = 190;
      ctx.font = `700 ${fs}px Fredoka, "Trebuchet MS", Arial, sans-serif`;
      const tw = ctx.measureText(t.text).width;
      fs = Math.min(190, (fs * 440) / Math.max(1, tw));
      ctx.font = `700 ${fs}px Fredoka, "Trebuchet MS", Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(t.tilt || -0.06);
      ctx.lineWidth = fs * 0.2; ctx.strokeStyle = code(0); ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = code(t.fill || 1); ctx.fillText(t.text, 0, 0);
      if (t.fill2) { ctx.save(); ctx.beginPath(); ctx.rect(-W, fs * 0.06, W * 2, H); ctx.clip(); ctx.fillStyle = code(t.fill2); ctx.fillText(t.text, 0, 0); ctx.restore(); }
      // drips
      ctx.fillStyle = code(t.fill || 1);
      let rs = (t.text.length * 7919) % 101;
      for (let d = 0; d < 7; d++) { rs = (rs * 53 + 17) % 101; const dx = (rs / 101 - 0.5) * tw * 0.8 * (fs / 190); ctx.fillRect(dx, fs * 0.3, fs * 0.05, fs * (0.15 + (rs % 7) * 0.04)); }
      ctx.restore();
      const data = ctx.getImageData(0, 0, W, H).data;
      // tag plane
      const side = t.side || '-z';
      const u = t.u == null ? 0.5 : t.u, v = t.v == null ? 0.55 : t.v;
      const lerp = (a, b, k) => a + (b - a) * k;
      let c, right, normal;
      const cy = lerp(bb.min.y, bb.max.y, v);
      if (side === '-z') { c = new THREE.Vector3(lerp(bb.max.x, bb.min.x, u), cy, bb.min.z); right = new THREE.Vector3(-1, 0, 0); normal = new THREE.Vector3(0, 0, -1); }
      else if (side === '+z') { c = new THREE.Vector3(lerp(bb.min.x, bb.max.x, u), cy, bb.max.z); right = new THREE.Vector3(1, 0, 0); normal = new THREE.Vector3(0, 0, 1); }
      else if (side === '-x') { c = new THREE.Vector3(bb.min.x, cy, lerp(bb.min.z, bb.max.z, u)); right = new THREE.Vector3(0, 0, 1); normal = new THREE.Vector3(-1, 0, 0); }
      else { c = new THREE.Vector3(bb.max.x, cy, lerp(bb.max.z, bb.min.z, u)); right = new THREE.Vector3(0, 0, -1); normal = new THREE.Vector3(1, 0, 0); }
      out.push({ data, W, H, c, right, normal, w: t.w || 2, h: (t.w || 2) / 2, depth: t.depth || 0.9 });
    }
    return out;
  }

  graffitiAt(tags, x, y, z, nx, ny, nz) {
    for (const t of tags) {
      if (nx * t.normal.x + ny * t.normal.y + nz * t.normal.z < 0.45) continue;
      const dx = x - t.c.x, dy = y - t.c.y, dz = z - t.c.z;
      if (Math.abs(dx * t.normal.x + dz * t.normal.z) > t.depth) continue;
      const u = (dx * t.right.x + dz * t.right.z) / t.w + 0.5, v = dy / t.h + 0.5;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const k = (Math.floor((1 - v) * t.H) * t.W + Math.floor(u * t.W)) * 4;
      if (t.data[k + 3] < 140) continue;
      return Math.max(0, Math.min(7, Math.round((t.data[k] - 16) / 32)));
    }
    return -1;
  }

  // ---------------------------------------------------------------- cleaning
  write(i) {
    const g = (this.grime[i] * 255 + 0.5) | 0, s = (this.stub[i] * 255 + 0.5) | 0;
    const M = this.mask;
    let p = this.pix[i] * 2;
    M[p] = g; M[p + 1] = s;
    for (let k = this.padStart[i]; k < this.padStart[i + 1]; k++) { p = this.padList[k] * 2; M[p] = g; M[p + 1] = s; }
  }

  apply(i, amt, samt) {
    let g = this.grime[i], s = this.stub[i];
    if (g <= 0 && s <= 0) return;
    g -= amt; s -= samt;
    if (g < 0) g = 0;
    if (s < 0) s = 0;
    if (g < CLEAN && s < CLEAN) {
      g = 0; s = 0;
      if (this.countable[i]) this.clean++;
    }
    this.grime[i] = g; this.stub[i] = s;
    this.write(i);
    this.dirty = true;
    this.hits++;
  }

  // does a sphere touch this surface's box?
  near(p, r) {
    const b = this.box;
    const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x), dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y), dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
    return dx * dx + dy * dy + dz * dz <= r * r;
  }

  // loop over texels in the grid cells around p (radius r)
  each(p, r, fn) {
    const b = this.box, cs = this.cs;
    const x0 = Math.max(0, Math.floor((p.x - r - b.min.x) / cs)), x1 = Math.min(this.gx - 1, Math.floor((p.x + r - b.min.x) / cs));
    const y0 = Math.max(0, Math.floor((p.y - r - b.min.y) / cs)), y1 = Math.min(this.gy - 1, Math.floor((p.y + r - b.min.y) / cs));
    const z0 = Math.max(0, Math.floor((p.z - r - b.min.z) / cs)), z1 = Math.min(this.gz - 1, Math.floor((p.z + r - b.min.z) / cs));
    const S = this.cellStart, L = this.cellItems;
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
      const row = (z * this.gy + y) * this.gx;
      for (let x = x0; x <= x1; x++) {
        const c = row + x;
        for (let k = S[c]; k < S[c + 1]; k++) fn(L[k]);
      }
    }
  }

  // Spray cone from o along dir. right/up = the fan's axes, tanA/tanB = half-angle tangents along them.
  // hitDist = distance to what the ray hit; rate = grime removed per second at full strength.
  sprayCone(o, dir, right, up, tanA, tanB, hitDist, range, rate, stubRate, dt) {
    if (this.done) return;
    const R = hitDist * Math.max(tanA, tanB) + 0.03;
    const tol = 0.1 + R * 1.5;
    const hp = { x: o.x + dir.x * hitDist, y: o.y + dir.y * hitDist, z: o.z + dir.z * hitDist };
    if (!this.near(hp, R + tol)) return;
    const P = this.pos, Nn = this.nrm;
    const half = range * 0.5;
    this.each(hp, R + tol, (i) => {
      const wx = P[i * 3] - o.x, wy = P[i * 3 + 1] - o.y, wz = P[i * 3 + 2] - o.z;
      const along = wx * dir.x + wy * dir.y + wz * dir.z;
      if (along < 0.05 || along > hitDist + tol || along < hitDist - tol || along > range) return;
      const u = (wx * right.x + wy * right.y + wz * right.z) / (along * tanA);
      const v = (wx * up.x + wy * up.y + wz * up.z) / (along * tanB);
      if (u * u + v * v > 1) return;
      const facing = -(Nn[i * 3] * dir.x + Nn[i * 3 + 1] * dir.y + Nn[i * 3 + 2] * dir.z) / 127;
      if (facing < 0.06) return;
      const f = (along <= half ? 1 : 1 - 0.65 * (along - half) / half) * (0.55 + 0.45 * facing) * dt;
      this.apply(i, rate * f, stubRate * f);
    });
  }

  // Surface cleaner: a disc of radius r on up-facing surfaces around c.
  sprayDisc(c, r, rate, stubRate, dt) {
    if (this.done || !this.near(c, r + 0.15)) return;
    const P = this.pos, Nn = this.nrm;
    this.each(c, r + 0.15, (i) => {
      if (Nn[i * 3 + 1] < 76) return; // normal.y < 0.6
      const dx = P[i * 3] - c.x, dz = P[i * 3 + 2] - c.z, dy = P[i * 3 + 1] - c.y;
      if (dy * dy > 0.02 || dx * dx + dz * dz > r * r) return;
      this.apply(i, rate * dt, stubRate * dt);
    });
  }

  get progress() { return this.total ? this.clean / this.total : 1; }

  // finished: snap the last specks clean
  finishOff() {
    const n = this.count;
    for (let i = 0; i < n; i++) { if (this.grime[i] > 0 || this.stub[i] > 0) { this.grime[i] = 0; this.stub[i] = 0; this.write(i); } }
    this.clean = this.total;
    this.done = true;
    this.flash = 1;
    this.dirty = true;
  }

  // a random dirty texel (for the test autopilot and sparkles); returns index or -1
  randomTexel(dirtyOnly = true, tries = 60) {
    for (let k = 0; k < tries; k++) {
      const i = (Math.random() * this.count) | 0;
      if (!dirtyOnly || (this.countable[i] && (this.grime[i] > 0 || this.stub[i] > 0))) return i;
    }
    if (dirtyOnly) for (let i = 0; i < this.count; i++) if (this.countable[i] && (this.grime[i] > 0 || this.stub[i] > 0)) return i;
    return -1;
  }
  texelPos(i, v) { return v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]); }
  texelNormal(i, v) { return v.set(this.nrm[i * 3] / 127, this.nrm[i * 3 + 1] / 127, this.nrm[i * 3 + 2] / 127).normalize(); }

  upload() {
    if (!this.dirty) return false;
    this.tex.needsUpdate = true;
    this.dirty = false;
    return true;
  }

  // the "before" picture for the reveal
  showBefore(on) {
    if (on && this.before) {
      if (!this.beforeTex) {
        this.beforeTex = new THREE.DataTexture(this.before, this.res, this.res, THREE.RGFormat, THREE.UnsignedByteType);
        this.beforeTex.minFilter = this.beforeTex.magFilter = THREE.LinearFilter;
        this.beforeTex.generateMipmaps = false; this.beforeTex.unpackAlignment = 1; this.beforeTex.needsUpdate = true;
      }
      this.uniforms.uBefore.value = this.beforeTex;
    } else this.uniforms.uBefore.value = this.tex;
  }

  dispose() {
    this.tex.dispose();
    if (this.beforeTex) this.beforeTex.dispose();
    if (this.info) this.info.dispose();
    this.pos = this.nrm = this.pix = this.grime = this.stub = this.mask = this.before = null;
    this.cellStart = this.cellItems = this.padStart = this.padList = null;
  }
}
