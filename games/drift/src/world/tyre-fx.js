// Drift! - tyre marks and tyre smoke.
// Marks: a long ring buffer of quads laid on tarmac and concrete behind every tyre that slides
// sideways, textured with a rubber tread pattern (grooves, blocks, smudgy edges) that runs along the
// mark. The oldest marks are reused once the buffer is full.
// Smoke: soft round puffs that only start after a tyre has been drifting for 3 seconds, then rise,
// spread and fade (white on tarmac and concrete, light dust off-road). Your own car uses the
// physics' sideways slip per wheel; other players' cars use an estimate (see remotes.js).
import * as THREE from 'three';

const MARK_ON = 0.3;      // sideways slide needed to leave a mark
const SMOKE_ON = 0.4;     // sideways slide needed to make smoke
const MARK_STEP = 0.35;   // metres between mark points
const TREAD_LEN = 1.2;    // metres of mark per repeat of the tread texture
const SMOKE_AFTER = 3.0;  // seconds of drifting before smoke starts

export class TyreFX {
  constructor(scene, quality) {
    this.scene = scene;
    const low = quality && quality.name === 'low';
    // ---- tyre marks ----
    this.maxSeg = low ? 2500 : 6000;
    const geo = new THREE.BufferGeometry();
    this.mPos = new Float32Array(this.maxSeg * 4 * 3);
    this.mCol = new Float32Array(this.maxSeg * 4 * 4);
    const idx = new Uint32Array(this.maxSeg * 6);
    for (let i = 0; i < this.maxSeg; i++) {
      const v = i * 4, k = i * 6;
      idx[k] = v; idx[k + 1] = v + 1; idx[k + 2] = v + 2; idx[k + 3] = v; idx[k + 4] = v + 2; idx[k + 5] = v + 3;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mPosAttr = new THREE.BufferAttribute(this.mPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.mColAttr = new THREE.BufferAttribute(this.mCol, 4).setUsage(THREE.DynamicDrawUsage);
    this.mUV = new Float32Array(this.maxSeg * 4 * 2);
    this.mUVAttr = new THREE.BufferAttribute(this.mUV, 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.mPosAttr);
    geo.setAttribute('color', this.mColAttr);
    geo.setAttribute('uv', this.mUVAttr);
    this.treadTex = treadTexture();
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({ map: this.treadTex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -10 });
    this.marks = new THREE.Mesh(geo, mat);
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 1;
    scene.add(this.marks);
    this.seg = 0; this.total = 0;
    this.dirty = [];
    // ---- smoke ----
    this.maxP = Math.round((quality ? quality.particles ?? 1 : 1) * (low ? 260 : 700));
    this.smokeRate = low ? 0.5 : 1;
    const pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(this.maxP * 3);
    this.pSize = new Float32Array(this.maxP);
    this.pAlpha = new Float32Array(this.maxP);
    this.pCol = new Float32Array(this.maxP * 3);
    this.pVel = new Float32Array(this.maxP * 3);
    this.pAge = new Float32Array(this.maxP).fill(99);
    this.pLife = new Float32Array(this.maxP).fill(1);
    this.pS0 = new Float32Array(this.maxP); this.pS1 = new Float32Array(this.maxP); this.pA0 = new Float32Array(this.maxP);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aColor', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.smokeMat = new THREE.ShaderMaterial({
      uniforms: { tPuff: { value: puffTexture() }, uScale: { value: 400 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale;
        varying float vAlpha; varying vec3 vColor; varying float vRot;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / max(0.5, -mv.z); vAlpha = aAlpha; vColor = aColor; vRot = position.x * 3.1 + position.z * 1.7; }`,
      fragmentShader: `uniform sampler2D tPuff; varying float vAlpha; varying vec3 vColor; varying float vRot;
        void main() { vec2 p = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot); p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
          float a = texture2D(tPuff, p).a * vAlpha; if (a < 0.01) discard; gl_FragColor = vec4(vColor, a); }`,
      transparent: true, depthWrite: false,
    });
    this.smoke = new THREE.Points(pg, this.smokeMat);
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 2;
    scene.add(this.smoke);
    this.pNext = 0;
    this.trackers = new Map();    // id -> { lL, lR (last corner points), emit }
    this.tmp = new THREE.Vector3();
  }

  /**
   * One tyre this frame. c = contact point on the ground, right = unit vector across the tyre (world),
   * width = tyre width (m), slip 0..1, surface 'road' | 'ground' | 'sand' | 'dirt' | 'rock', vel = car velocity.
   */
  wheel(id, c, right, width, slip, surface, vel, dt) {
    let tr = this.trackers.get(id);
    if (!tr) { tr = { lL: null, lR: null, emit: 0, seen: 0, v: 0, driftT: 0, gap: 0 }; this.trackers.set(id, tr); }
    tr.seen = performance.now();
    const paved = surface === 'road' || surface === 'rock';
    const y = c.y + 0.045;
    // ---- marks ----
    if (slip > MARK_ON && surface === 'road') {               // marks on tarmac and concrete only, never on grass
      const hw = Math.max(0.11, width * 0.46);
      const L = [c.x - right.x * hw, y, c.z - right.z * hw], R = [c.x + right.x * hw, y, c.z + right.z * hw];
      if (!tr.lL) { tr.lL = L; tr.lR = R; tr.a = 0; tr.v = Math.random(); }
      else {
        const dx = (L[0] + R[0]) / 2 - (tr.lL[0] + tr.lR[0]) / 2, dz = (L[2] + R[2]) / 2 - (tr.lL[2] + tr.lR[2]) / 2;
        const d2 = dx * dx + dz * dz;
        if (d2 > 9) { tr.lL = L; tr.lR = R; tr.a = 0; tr.v = Math.random(); }  // jumped (teleport/reset): start a new line
        else if (d2 > MARK_STEP * MARK_STEP) {
          const a = Math.min(1, (slip - MARK_ON) / 0.45) * 0.8;
          const v1 = tr.v + Math.sqrt(d2) / TREAD_LEN;
          this.addSeg(tr.lL, tr.lR, R, L, tr.a, a, paved, tr.v, v1);
          tr.lL = L; tr.lR = R; tr.a = a; tr.v = v1 % 64;
        }
      }
    } else { tr.lL = null; tr.lR = null; }
    // ---- smoke: only once this tyre has been drifting for 3 s (short dips in the slide don't reset it) ----
    if (slip > SMOKE_ON) { tr.driftT += dt; tr.gap = 0; }
    else { tr.gap += dt; if (tr.gap > 0.5) tr.driftT = 0; }
    if (slip > SMOKE_ON && tr.driftT > SMOKE_AFTER) {
      const k = Math.min(1, (slip - SMOKE_ON) / 0.5);
      const fadeIn = Math.min(1, tr.driftT - SMOKE_AFTER);
      tr.emit += (paved ? 14 : 6) * (0.3 + 0.7 * k) * fadeIn * this.smokeRate * dt;
      while (tr.emit >= 1) {
        tr.emit -= 1;
        this.spawn(c.x, y + 0.25, c.z, vel, paved, k);
      }
    } else tr.emit = 0;
  }

  addSeg(p0, p1, p2, p3, a0, a1, paved, v0, v1) {
    const i = this.seg;
    const P = this.mPos, C = this.mCol, U = this.mUV, o = i * 12, q = i * 16, u = i * 8;
    // tread texture: across the tyre (u) and along the mark (v)
    U[u] = 0; U[u + 1] = v0; U[u + 2] = 1; U[u + 3] = v0; U[u + 4] = 1; U[u + 5] = v1; U[u + 6] = 0; U[u + 7] = v1;
    const pts = [p0, p1, p2, p3];
    for (let k = 0; k < 4; k++) { P[o + k * 3] = pts[k][0]; P[o + k * 3 + 1] = pts[k][1]; P[o + k * 3 + 2] = pts[k][2]; }
    const col = paved ? [0.035, 0.035, 0.04] : [0.22, 0.17, 0.1];
    const al = [a0, a0, a1, a1];
    for (let k = 0; k < 4; k++) { C[q + k * 4] = col[0]; C[q + k * 4 + 1] = col[1]; C[q + k * 4 + 2] = col[2]; C[q + k * 4 + 3] = al[k]; }
    this.dirty.push(i);
    this.seg = (i + 1) % this.maxSeg;
    this.total = Math.min(this.maxSeg, this.total + 1);
  }

  spawn(x, y, z, vel, paved, k) {
    const i = this.pNext; this.pNext = (i + 1) % this.maxP;
    const P = this.pPos, V = this.pVel, C = this.pCol;
    P[i * 3] = x + (Math.random() - 0.5) * 0.4; P[i * 3 + 1] = y; P[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
    V[i * 3] = vel.x * 0.18 + (Math.random() - 0.5) * 1.6;
    V[i * 3 + 1] = 0.5 + Math.random() * 0.8;
    V[i * 3 + 2] = vel.z * 0.18 + (Math.random() - 0.5) * 1.6;
    this.pAge[i] = 0;
    this.pLife[i] = paved ? 1.2 + Math.random() * 0.9 : 0.9 + Math.random() * 0.5;
    this.pS0[i] = 0.4 + Math.random() * 0.3;
    this.pS1[i] = (paved ? 2.4 : 1.8) + Math.random() * 1.0;
    this.pA0[i] = (paved ? 0.3 : 0.2) * (0.6 + 0.4 * k);
    const g = paved ? 0.9 + Math.random() * 0.06 : 0;
    if (paved) { C[i * 3] = g; C[i * 3 + 1] = g; C[i * 3 + 2] = g + 0.02; }
    else { C[i * 3] = 0.66; C[i * 3 + 1] = 0.55; C[i * 3 + 2] = 0.4; }
  }

  update(dt, camera, renderer) {
    // marks: send only the changed parts to the graphics card
    if (this.dirty.length) {
      const pa = this.mPosAttr, ca = this.mColAttr, ua = this.mUVAttr;
      pa.clearUpdateRanges(); ca.clearUpdateRanges(); ua.clearUpdateRanges();
      // merge runs of consecutive segments
      this.dirty.sort((a, b) => a - b);
      let s = this.dirty[0], e = s;
      const flush = () => { pa.addUpdateRange(s * 12, (e - s + 1) * 12); ca.addUpdateRange(s * 16, (e - s + 1) * 16); ua.addUpdateRange(s * 8, (e - s + 1) * 8); };
      for (let j = 1; j < this.dirty.length; j++) { const d = this.dirty[j]; if (d === e + 1) e = d; else { flush(); s = e = d; } }
      flush();
      pa.needsUpdate = true; ca.needsUpdate = true; ua.needsUpdate = true;
      this.dirty.length = 0;
      this.marks.geometry.setDrawRange(0, this.total * 6);
    }
    // smoke
    const P = this.pPos, V = this.pVel, S = this.pSize, A = this.pAlpha;
    const drag = Math.exp(-1.4 * dt);
    let live = 0;
    for (let i = 0; i < this.maxP; i++) {
      const age = (this.pAge[i] += dt), life = this.pLife[i];
      if (age >= life) { if (A[i] !== 0) { A[i] = 0; S[i] = 0; } continue; }
      live++;
      const t = age / life;
      V[i * 3] *= drag; V[i * 3 + 2] *= drag; V[i * 3 + 1] = V[i * 3 + 1] * drag + 0.35 * dt;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      S[i] = this.pS0[i] + (this.pS1[i] - this.pS0[i]) * (1 - (1 - t) * (1 - t));
      A[i] = this.pA0[i] * Math.min(1, age * 8) * (1 - t) * (1 - t * 0.5);
    }
    const g = this.smoke.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true; g.attributes.aColor.needsUpdate = true;
    this.smoke.visible = live > 0;
    if (camera && renderer) {
      if (!this.treadTex.anisoSet) { this.treadTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); this.treadTex.needsUpdate = true; this.treadTex.anisoSet = true; }
      const h = renderer.domElement.height;
      this.smokeMat.uniforms.uScale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    }
    // forget wheels we haven't heard from in a while (players who left)
    if (Math.random() < 0.01) { const now = performance.now(); for (const [k, tr] of this.trackers) if (now - tr.seen > 5000) this.trackers.delete(k); }
  }

  clear() {
    this.total = 0; this.seg = 0; this.marks.geometry.setDrawRange(0, 0);
    this.pAge.fill(99); this.pAlpha.fill(0); this.pSize.fill(0);
    this.trackers.clear();
  }
}

/**
 * Rubber tread mark: across = u (0..1, tyre edge to edge), along = v (repeats every TREAD_LEN metres).
 * White with alpha: the marks' vertex colour makes it dark rubber (or brown dirt). Grooves running along
 * the tyre, angled tread blocks, smudgy uneven rubber and soft worn edges.
 */
function treadTexture() {
  const W = 64, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), cc = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
  };
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, v = (y + 0.5) / H;
      // soft, slightly ragged edges
      const rag = 0.04 * noise(v * 40, 3.1);
      let a = sstep(0.0 + rag, 0.14 + rag, u) * sstep(1.0 - rag, 0.86 - rag, u);
      // three grooves along the tyre
      for (const gu of [0.3, 0.5, 0.7]) a *= 0.25 + 0.75 * sstep(0.018, 0.04, Math.abs(u - gu));
      // angled tread blocks (a V pattern), 10 rows per repeat
      const side = u < 0.5 ? (0.5 - u) : (u - 0.5);
      const row = (v * 10 + side * 1.6) % 1;
      a *= 0.4 + 0.6 * sstep(0.05, 0.16, row) * sstep(0.95, 0.84, row) + 0.0;
      // uneven, smudged rubber
      const n = 0.55 * noise(u * 12, v * 60) + 0.3 * noise(u * 30, v * 150) + 0.15 * noise(u * 4, v * 8);
      a *= 0.45 + 0.75 * n;
      const k = (y * W + x) * 4;
      const shade = 225 + 30 * noise(u * 20, v * 90);
      img.data[k] = shade; img.data[k + 1] = shade; img.data[k + 2] = shade;
      img.data[k + 3] = Math.max(0, Math.min(255, a * 255));
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round smoke puff (alpha), a little lumpy so puffs don't look like perfect circles. */
function puffTexture() {
  const N = 64, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  for (let k = 0; k < 7; k++) {
    const x = N / 2 + (Math.random() - 0.5) * N * 0.3, y = N / 2 + (Math.random() - 0.5) * N * 0.3, r = N * (0.22 + Math.random() * 0.16);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.75)'); grd.addColorStop(0.55, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, N, N);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
