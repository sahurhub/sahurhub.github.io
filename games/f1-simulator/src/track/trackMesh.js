// Builds the 3D circuit from the Track model: road surface, rubbered racing line, white lines,
// kerbs, run-off, walls, fences, sponsor boards, grandstands, pit building, start gantry, grid
// markings and trees. Everything is generated from data, so a new circuit only needs its files.
import * as THREE from 'three';
import { SURF, Track } from './track.js';
import { makeRng } from '../core/math.js';

function canvasTex(w, h, draw, { aniso = 4, srgb = true, rx = 1, ry = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, w, h, base, spread, count, rng, size = 1) {
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < count; k++) {
    const v = (rng() - 0.5) * 2 * spread;
    ctx.fillStyle = `rgb(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v | 0})`;
    const s = size * (0.6 + rng() * 1.2);
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
}

/** Triangle strip between two offset curves that follow the track. */
function strip(track, idx, sOf, A, B, vScale = 4, colorOf = null) {
  const n = idx.length;
  const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4);
  const col = colorOf ? new Float32Array(n * 6) : null;
  const tmp = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const i = idx[k];
    const a = A(i), b = B(i);
    pos[k * 6] = track.x[i] + track.nx[i] * a[0]; pos[k * 6 + 1] = a[1]; pos[k * 6 + 2] = track.z[i] + track.nz[i] * a[0];
    pos[k * 6 + 3] = track.x[i] + track.nx[i] * b[0]; pos[k * 6 + 4] = b[1]; pos[k * 6 + 5] = track.z[i] + track.nz[i] * b[0];
    const v = sOf(k) / vScale;
    uv[k * 4] = 0; uv[k * 4 + 1] = v; uv[k * 4 + 2] = 1; uv[k * 4 + 3] = v;
    if (col) {
      tmp.set(colorOf(i));
      col.set([tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b], k * 6);
    }
  }
  const ind = [];
  for (let k = 0; k < n - 1; k++) {
    const a0 = k * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
    ind.push(a0, b0, a1, b0, b1, a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

/** Index runs (possibly wrapping the start line) where test(i) is true. */
function runs(N, test) {
  const out = [];
  let start = -1;
  for (let i = 0; i < N; i++) {
    if (test(i)) { if (start < 0) start = i; }
    else if (start >= 0) { out.push([start, i - 1]); start = -1; }
  }
  if (start >= 0) out.push([start, N - 1]);
  if (out.length > 1 && out[0][0] === 0 && out[out.length - 1][1] === N - 1) {
    const last = out.pop();
    out[0] = [last[0], out[0][1] + N];
  }
  return out;
}

const range = (a, b, N) => { const r = []; for (let i = a; i <= b; i++) r.push(((i % N) + N) % N); return r; };

function merge(geoms) {
  let nv = 0, ni = 0;
  for (const g of geoms) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), nor = new Float32Array(nv * 3);
  const hasCol = geoms.every((g) => g.attributes.color);
  const col = hasCol ? new Float32Array(nv * 3) : null;
  const ind = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    nor.set(g.attributes.normal.array, vo * 3);
    if (col) col.set(g.attributes.color.array, vo * 3);
    const src = g.index.array;
    for (let k = 0; k < src.length; k++) ind[io + k] = src[k] + vo;
    vo += g.attributes.position.count; io += src.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(ind, 1));
  return out;
}

const BRANDS = {
  Pirelli: ['#ffd100', '#d50000'], Heineken: ['#0a6b2b', '#ffffff'], Aramco: ['#ffffff', '#00843d'], DHL: ['#ffcc00', '#d40511'],
  Rolex: ['#0b3d2e', '#c9a227'], 'Qatar Airways': ['#5c0632', '#ffffff'], AWS: ['#232f3e', '#ff9900'], MSC: ['#ffffff', '#111111'],
  Lenovo: ['#e2231a', '#ffffff'], 'Crypto.com': ['#03224c', '#ffffff'], Salesforce: ['#00a1e0', '#ffffff'], Santander: ['#ec0000', '#ffffff'],
};

/** Five red start lights (two lamps each) on a pod row, facing the grid. */
function makeStartLights(center, psi, width = 0.86) {
  const lampOff = new THREE.MeshStandardMaterial({ color: 0x1a0505, roughness: 0.4 });
  const lampOn = new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0xff0000, emissiveIntensity: 6, roughness: 0.4 });
  const g = new THREE.Group();
  g.position.copy(center);
  g.rotation.y = psi;
  const lamps = [];
  const podMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.6 });
  for (let k = 0; k < 5; k++) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.25, 0.3), podMat);
    pod.position.set((k - 2) * width, 0, -0.1);
    g.add(pod);
    const pair = [];
    for (const y of [0.3, -0.3]) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), lampOff);
      lamp.position.set(pod.position.x, y, -0.26);
      lamp.rotation.y = Math.PI; // faces the cars on the grid
      g.add(lamp);
      pair.push(lamp);
    }
    lamps.push(pair);
  }
  return {
    group: g,
    set(n) { lamps.forEach((pair, k) => pair.forEach((l) => { l.material = k < n ? lampOn : lampOff; })); },
  };
}

/** Loads a ready-made 3D circuit (GLB) and fixes up its materials for the browser. */
function loadTrackModel(url, engine, group) {
  return import('../render/gltf.js').then(async ({ loadGltf }) => {
    const gltf = await loadGltf(url);
    const ground = /apsh|asph|curb|grass|grs_brd|sand|whiteline|groove|top_|brd2/;
    const cutout = /tree|branch|fence|gstand-alpha|flag|misc_alpha|treesline|bushes|hedge|grille|antenna|metals-alpha|lights|adv_add|glass|shadow/;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material, n = (m.name || '').toLowerCase();
      o.castShadow = false;
      o.receiveShadow = ground.test(n);
      if (m.map) m.map.anisotropy = engine.maxAniso;
      if (/shadow/.test(n)) { m.transparent = true; m.depthWrite = false; o.renderOrder = 2; }
      else if (cutout.test(n) || m.transparent) { m.transparent = false; m.alphaTest = 0.45; m.depthWrite = true; m.side = THREE.DoubleSide; }
      if (/whiteline|groove/.test(n)) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
      m.envMapIntensity = 0.35;
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    });
    gltf.scene.updateMatrixWorld(true);
    group.add(gltf.scene);
    return gltf.scene;
  });
}

export function buildTrackMeshes(track, line, engine) {
  const q = engine.q, aniso = engine.maxAniso;
  const N = track.n, ds = track.ds, L = track.length, meta = track.meta;
  const rng = makeRng(1234);
  const group = new THREE.Group();
  group.name = 'track';
  if (meta.model) {
    // 3D circuit model: only add what it does not have (start lights we can switch on, a far
    // ground so there is no void beyond the model's edge)
    const ready = loadTrackModel(new URL(meta.model, new URL('../../data/circuits/', import.meta.url)).href, engine, group);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshStandardMaterial({ color: 0x4f6a3c, roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    far.position.set(track.x[0], -8, track.z[0]);
    group.add(far);
    const sl = meta.startLights;
    const pp = { x: 0, z: 0, psi: 0 };
    track.posAt(0, 0, pp);
    const centre = sl ? new THREE.Vector3(sl.east, sl.height, -sl.north) : new THREE.Vector3(pp.x, track.h[0] + 5.5, pp.z);
    const lights = makeStartLights(centre, pp.psi);
    group.add(lights.group);
    return { group, ready, setStartLights: lights.set };
  }
  const all = range(0, N, N);
  const sAll = (k) => k * ds;
  const add = (geo, mat, { shadow = true, cast = false, order = 0 } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = shadow; m.castShadow = cast; m.renderOrder = order;
    m.matrixAutoUpdate = false;
    group.add(m);
    return m;
  };

  // ---- ground -------------------------------------------------------------------------------
  const grassTex = canvasTex(256, 256, (c, w, h) => noise(c, w, h, [58, 96, 42], 16, 9000, rng, 2), { aniso, rx: 900, ry: 900 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  let cx = 0, cz = 0;
  for (let i = 0; i < N; i += 20) { cx += track.x[i]; cz += track.z[i]; }
  ground.position.set(cx / (N / 20), -0.06, cz / (N / 20));
  ground.receiveShadow = true;
  group.add(ground);

  // ---- road ---------------------------------------------------------------------------------
  const asphaltTex = canvasTex(256, 256, (c, w, h) => {
    noise(c, w, h, [52, 52, 56], 11, 14000, rng, 1.6);
    c.globalAlpha = 0.06;
    for (let k = 0; k < 40; k++) { c.fillStyle = k % 2 ? '#000' : '#888'; c.fillRect(rng() * w, 0, 2 + rng() * 6, h); }
  }, { aniso, rx: 3 });
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.86, metalness: 0 });
  add(strip(track, all, sAll, (i) => [track.wl[i], 0], (i) => [-track.wr[i], 0], 7), roadMat);

  // dark rubber laid down on the racing line
  const rubberTex = canvasTex(64, 8, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, { srgb: false });
  const lim = (i, d) => Math.max(-track.wr[i] + 0.1, Math.min(track.wl[i] - 0.1, d));
  add(strip(track, all, sAll, (i) => [lim(i, line.off[i] + 1.7), 0.004], (i) => [lim(i, line.off[i] - 1.7), 0.004], 8),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0b, alphaMap: rubberTex, transparent: true, opacity: 0.5, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { order: 1 });

  // white lines
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  add(merge([
    strip(track, all, sAll, (i) => [track.wl[i], 0.006], (i) => [track.wl[i] - 0.2, 0.006], 4),
    strip(track, all, sAll, (i) => [-track.wr[i] + 0.2, 0.006], (i) => [-track.wr[i], 0.006], 4),
  ]), lineMat, { order: 2 });

  // ---- kerbs --------------------------------------------------------------------------------
  const kerbTex = canvasTex(8, 64, (c, w, h) => {
    c.fillStyle = '#c21a26'; c.fillRect(0, 0, w, h / 2);
    c.fillStyle = '#ecebe6'; c.fillRect(0, h / 2, w, h / 2);
  }, { aniso });
  const kerbGeo = [];
  for (const [a, b] of runs(N, (i) => track.kerbL[i] > 0)) {
    const idx = range(a, b, N);
    kerbGeo.push(strip(track, idx, (k) => (a + k) * ds, (i) => [track.wl[i] + track.kerbL[i], 0.05], (i) => [track.wl[i], 0.0], 3));
  }
  for (const [a, b] of runs(N, (i) => track.kerbR[i] > 0)) {
    const idx = range(a, b, N);
    kerbGeo.push(strip(track, idx, (k) => (a + k) * ds, (i) => [-track.wr[i], 0.0], (i) => [-track.wr[i] - track.kerbR[i], 0.05], 3));
  }
  if (kerbGeo.length) add(merge(kerbGeo), new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7 }));

  // ---- run-off (grass verge / gravel) -------------------------------------------------------
  const vergeTex = canvasTex(128, 128, (c, w, h) => noise(c, w, h, [200, 200, 200], 34, 5000, rng, 2), { aniso, rx: 4 });
  const colOf = (type) => (type === SURF.GRAVEL ? 0xb7a57e : type === SURF.RUNOFF ? 0x4a4a4e : 0x5e8f45);
  add(merge([
    strip(track, all, sAll, (i) => [track.wallL[i], 0.0], (i) => [track.wl[i] + track.kerbL[i], -0.004], 5, (i) => colOf(track.runL[i])),
    strip(track, all, sAll, (i) => [-track.wr[i] - track.kerbR[i], -0.004], (i) => [-track.wallR[i], 0.0], 5, (i) => colOf(track.runR[i])),
  ]), new THREE.MeshStandardMaterial({ map: vergeTex, vertexColors: true, roughness: 1 }));

  // ---- walls and fences ---------------------------------------------------------------------
  const wallTex = canvasTex(64, 64, (c, w, h) => {
    noise(c, w, h, [178, 180, 182], 10, 900, rng, 2);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, w, 2); c.fillRect(0, h / 2, w, 1);
  }, { aniso });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, side: THREE.DoubleSide });
  const WH = 1.15;
  add(merge([
    strip(track, all, sAll, (i) => [track.wallL[i], WH], (i) => [track.wallL[i], 0], 3),
    strip(track, all, sAll, (i) => [-track.wallR[i], 0], (i) => [-track.wallR[i], WH], 3),
  ]), wallMat, { cast: true });
  const fenceTex = canvasTex(64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(190,195,200,1)'; c.lineWidth = 2;
    for (let k = 0; k <= 4; k++) { c.beginPath(); c.moveTo(k * 16, 0); c.lineTo(k * 16, h); c.stroke(); c.beginPath(); c.moveTo(0, k * 16); c.lineTo(w, k * 16); c.stroke(); }
    c.lineWidth = 5; c.strokeRect(0, 0, w, h);
  }, { aniso });
  const fenceGeo = [];
  for (const side of [1, -1]) {
    const wall = side > 0 ? track.wallL : track.wallR, edge = side > 0 ? track.wl : track.wr;
    for (const [a, b] of runs(N, (i) => wall[i] - edge[i] < 7)) {
      if (b - a < 6) continue;
      const idx = range(a, b, N);
      fenceGeo.push(strip(track, idx, (k) => (a + k) * ds, (i) => [side * wall[i], WH + 2.6], (i) => [side * wall[i], WH], 2.6));
    }
  }
  if (fenceGeo.length) add(merge(fenceGeo), new THREE.MeshStandardMaterial({ map: fenceTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }), { shadow: false });

  // ---- sponsor boards on the walls ----------------------------------------------------------
  const names = (meta.scenery && meta.scenery.boards) || Object.keys(BRANDS);
  const slots = names.map(() => []);
  let bi = 0;
  const step = Math.round(46 / ds), half = Math.round(6 / ds);
  for (const side of [1, -1]) {
    const wall = side > 0 ? track.wallL : track.wallR;
    for (let i = Math.round(rng() * step); i < N; i += step) {
      let ok = true;
      for (let k = -half; k <= half; k++) {
        const j = (i + k + N) % N;
        if (Math.abs(track.kappa[j]) > 1 / 500 || Math.abs(wall[j] - wall[i]) > 0.25) { ok = false; break; }
      }
      if (!ok) continue;
      slots[bi++ % names.length].push({ i, side, d: wall[i] - 0.07 });
    }
  }
  const boardGeo = new THREE.PlaneGeometry(11.5, 0.98);
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  names.forEach((name, k) => {
    if (!slots[k].length) return;
    const [bg, fg] = BRANDS[name] || ['#ffffff', '#111111'];
    const tex = canvasTex(512, 44, (c, w, h) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.fillStyle = fg; c.font = 'bold 30px Arial, Helvetica, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(name.toUpperCase(), w * 0.25, h / 2 + 1); c.fillText(name.toUpperCase(), w * 0.75, h / 2 + 1);
    }, { aniso });
    const inst = new THREE.InstancedMesh(boardGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), slots[k].length);
    slots[k].forEach((sl, n) => {
      const i = sl.i;
      p3.set(track.x[i] + track.nx[i] * sl.d * sl.side, 0.58, track.z[i] + track.nz[i] * sl.d * sl.side);
      qt.setFromAxisAngle(yAxis, Math.atan2(-track.nx[i] * sl.side, -track.nz[i] * sl.side));
      inst.setMatrixAt(n, m4.compose(p3, qt, sc));
    });
    inst.frustumCulled = false;
    group.add(inst);
  });

  // ---- grandstands --------------------------------------------------------------------------
  const crowdTex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#3b3d42'; c.fillRect(0, 0, w, h);
    const cols = ['#c8102e', '#d9d9d9', '#e23a3a', '#2b4c9b', '#f2c230', '#8a1010', '#f4f4f4', '#1f1f1f', '#c8102e', '#c8102e'];
    const dens = q.crowd;
    for (let y = 2; y < h; y += 5) for (let x = 2; x < w; x += 4) {
      if (rng() > 0.86 * dens + 0.08) continue;
      c.fillStyle = cols[(rng() * cols.length) | 0];
      c.fillRect(x + rng() * 1.5, y + rng() * 1.5, 2.6, 3.4);
    }
  }, { aniso, rx: 1, ry: 1 });
  const seatMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.95, side: THREE.DoubleSide });
  const standMat = new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.8, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xd8dadd, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
  const seatGeo = [], standGeo = [], roofGeo = [];
  const zones = [];
  for (const gs of (meta.scenery && meta.scenery.grandstands) || []) {
    const side = gs.side === 'left' ? 1 : -1;
    const wall = side > 0 ? track.wallL : track.wallR, edge = side > 0 ? track.wl : track.wr;
    const a = track.idx(gs.from), len = Math.round((((gs.to - gs.from + L) % L) || L) / ds);
    const idx = range(a, a + len, N);
    const sOf = (k) => k * ds;
    const d0 = (i) => Math.max(edge[i] + gs.offset, wall[i] + 1.5);
    const P = (i, extra, y) => [side * (d0(i) + extra), y];
    standGeo.push(strip(track, idx, sOf, (i) => P(i, 0, 2.2), (i) => P(i, 0, 0), 6));
    seatGeo.push(strip(track, idx, sOf, (i) => P(i, gs.depth, gs.height), (i) => P(i, 0, 2.2), 14));
    standGeo.push(strip(track, idx, sOf, (i) => P(i, gs.depth, 0), (i) => P(i, gs.depth, gs.height), 6));
    if (gs.roof) roofGeo.push(strip(track, idx, sOf, (i) => P(i, gs.depth + 1, gs.height + 4.6), (i) => P(i, -2.5, gs.height + 3.4), 6));
    zones.push({ from: gs.from, to: gs.to, side, far: gs.offset + gs.depth + 8 });
  }
  if (seatGeo.length) add(merge(seatGeo), seatMat, { cast: false });
  if (standGeo.length) add(merge(standGeo), standMat, { cast: true });
  if (roofGeo.length) add(merge(roofGeo), roofMat, { cast: true });

  // ---- pit lane and pit building ------------------------------------------------------------
  const pl = meta.pitLane;
  if (pl) {
    const side = pl.side === 'left' ? 1 : -1;
    const edge = side > 0 ? track.wl : track.wr, wall = side > 0 ? track.wallL : track.wallR;
    const a = track.idx(pl.entryS), len = Math.round((((pl.exitS - pl.entryS + L) % L) || L) / ds);
    const idx = range(a, a + len, N);
    const sOf = (k) => k * ds;
    const laneIn = (i) => wall[i] + 0.5, laneOut = (i) => edge[i] + pl.laneOffset + pl.laneWidth;
    const A = (f, y) => (i) => [side * f(i), y];
    const laneGeo = side > 0 ? strip(track, idx, sOf, A(laneOut, -0.01), A(laneIn, -0.01), 7) : strip(track, idx, sOf, A(laneIn, -0.01), A(laneOut, -0.01), 7);
    add(laneGeo, new THREE.MeshStandardMaterial({ map: asphaltTex, color: 0xc9c9cc, roughness: 0.9 }));
    const bIdx = range(a + Math.round(110 / ds), a + len - Math.round(70 / ds), N);
    const garageTex = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#d4d6d9'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1b1c1f'; c.fillRect(10, 6, w - 20, h * 0.42);
      c.fillStyle = '#c21a26'; c.fillRect(0, h * 0.5, w, 6);
      c.fillStyle = '#2a3340'; for (let k = 0; k < 4; k++) c.fillRect(8 + k * 30, h * 0.62, 22, h * 0.26);
    }, { aniso });
    garageTex.center.set(0.5, 0.5); garageTex.rotation = Math.PI / 2;
    const BH = 9, depth = 15;
    const front = (i) => laneOut(i) + 1, back = (i) => laneOut(i) + 1 + depth;
    add(merge([
      strip(track, bIdx, sOf, A(front, BH), A(front, 0), 9),
    ]), new THREE.MeshStandardMaterial({ map: garageTex, roughness: 0.7, side: THREE.DoubleSide }), { cast: true });
    add(merge([
      strip(track, bIdx, sOf, A(back, BH), A(front, BH), 9),
      strip(track, bIdx, sOf, A(back, 0), A(back, BH), 9),
    ]), roofMat, { cast: true });
    zones.push({ from: pl.entryS, to: pl.exitS, side, far: pl.laneOffset + pl.laneWidth + depth + 10 });
  }

  // ---- start line, grid boxes, start lights --------------------------------------------------
  const chk = canvasTex(64, 16, (c, w, h) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#f2f2f2' : '#111'; c.fillRect(x * 8, y * 8, 8, 8); }
  }, { aniso });
  chk.center.set(0.5, 0.5); chk.rotation = Math.PI / 2; chk.repeat.set(1, 3);
  add(strip(track, [0, 1], (k) => k, (i) => [track.wl[i], 0.008], (i) => [-track.wr[i], 0.008], 1),
    new THREE.MeshStandardMaterial({ map: chk, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), { order: 3 });
  const slotsN = 22, poleLeft = (meta.gridPoleSide || 'left') === 'left';
  const gridMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.012, 0.16), lineMat, slotsN * 2);
  const pp = { x: 0, z: 0, psi: 0 };
  for (let k = 0; k < slotsN; k++) {
    const s = L - (meta.gridFirstSlotM || 8) - k * (meta.gridSpacingM || 8) + 2.9;
    const side = (k % 2 === 0) === poleLeft ? 1 : -1;
    track.posAt(s, side * 2.7, pp);
    qt.setFromAxisAngle(yAxis, pp.psi);
    gridMesh.setMatrixAt(k * 2, m4.compose(p3.set(pp.x, 0.008, pp.z), qt, sc));
    track.posAt(s - 0.55, side * 2.7 + side * 1.17, pp);
    qt.setFromAxisAngle(yAxis, pp.psi + Math.PI / 2);
    gridMesh.setMatrixAt(k * 2 + 1, m4.compose(p3.set(pp.x, 0.008, pp.z), qt, sc.set(0.5, 1, 1)));
    sc.set(1, 1, 1);
  }
  gridMesh.receiveShadow = true;
  group.add(gridMesh);

  const gantry = new THREE.Group();
  track.posAt(6, 0, pp);
  gantry.position.set(pp.x, 0, pp.z);
  gantry.rotation.y = pp.psi;
  const gw = track.wl[3] + track.wr[3] + 3, gOff = (track.wl[3] - track.wr[3]) / 2;
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.5, metalness: 0.6 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.5, 0.5), steel);
  beam.position.set(gOff, 6.4, 0);
  gantry.add(beam);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6.4, 0.4), steel);
    post.position.set(gOff + (sx * gw) / 2, 3.2, 0);
    gantry.add(post);
  }
  const lampOff = new THREE.MeshStandardMaterial({ color: 0x1a0505, roughness: 0.4 });
  const lampOn = new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0xff0000, emissiveIntensity: 6, roughness: 0.4 });
  const lamps = [];
  for (let k = 0; k < 5; k++) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.25, 0.3), new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.6 }));
    pod.position.set(gOff + (k - 2) * 0.86, 5.55, -0.1);
    gantry.add(pod);
    const pair = [];
    for (const y of [0.3, -0.3]) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), lampOff);
      lamp.position.set(pod.position.x, 5.55 + y, -0.26);
      lamp.rotation.y = Math.PI; // faces the cars on the grid (they look along +forward)
      gantry.add(lamp);
      pair.push(lamp);
    }
    lamps.push(pair);
  }
  gantry.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(gantry);

  // ---- trees --------------------------------------------------------------------------------
  const want = Math.round(((meta.scenery && meta.scenery.trees) || 1500) * q.trees);
  if (want > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 4, 5);
    trunkGeo.translate(0, 2, 0);
    const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
    canopyGeo.scale(3.1, 4.0, 3.1);
    canopyGeo.translate(0, 6.6, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }), want);
    const canopies = new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), want);
    const loc = { i: 0, s: 0, d: 0 };
    const c = new THREE.Color();
    let n = 0, tries = 0;
    while (n < want && tries < want * 6) {
      tries++;
      const i = (rng() * N) | 0, side = rng() < 0.5 ? 1 : -1;
      const wall = side > 0 ? track.wallL[i] : track.wallR[i];
      const off = wall + 7 + rng() * rng() * 120;
      const x = track.x[i] + track.nx[i] * off * side, z = track.z[i] + track.nz[i] * off * side;
      track.locate(x, z, -1, loc);
      const w2 = loc.d > 0 ? track.wallL[loc.i] : track.wallR[loc.i];
      if (Math.abs(loc.d) < w2 + 6) continue;
      const sd = loc.d > 0 ? 1 : -1, edge = sd > 0 ? track.wl[loc.i] : track.wr[loc.i];
      if (zones.some((zn) => zn.side === sd && Track.inRange(loc.s, zn.from - 30, (zn.to + 30) % L) && Math.abs(loc.d) < edge + zn.far)) continue;
      const sz = 0.75 + rng() * 0.9;
      qt.setFromAxisAngle(yAxis, rng() * 6.28);
      m4.compose(p3.set(x, -0.05, z), qt, sc.set(sz, sz * (0.85 + rng() * 0.4), sz));
      trunks.setMatrixAt(n, m4);
      canopies.setMatrixAt(n, m4);
      canopies.setColorAt(n, c.setHSL(0.25 + rng() * 0.08, 0.42 + rng() * 0.2, 0.2 + rng() * 0.12));
      n++;
    }
    sc.set(1, 1, 1);
    trunks.count = canopies.count = n;
    canopies.castShadow = false;
    trunks.frustumCulled = canopies.frustumCulled = false;
    group.add(trunks, canopies);
  }

  group.traverse((o) => { if (o.isMesh && !o.matrixAutoUpdate) o.updateMatrix(); });

  return {
    group,
    ready: Promise.resolve(null),
    /** Light up the first n of the five red start lights. */
    setStartLights(n) {
      lamps.forEach((pair, k) => pair.forEach((l) => { l.material = k < n ? lampOn : lampOff; }));
    },
  };
}
