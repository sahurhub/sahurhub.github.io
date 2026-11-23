// Loads the Blender GLB files and the shared Poly Haven textures, and makes the cheap Lambert materials.
// Every model is "baked": its geometry is copied to plain Float32 arrays in world space (meshopt-decoded
// attributes can be interleaved or quantised), and meshes that share a texture are merged.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// texture key -> real-world size in metres (UV0 is in metres, so repeat = 1 / size)
export const TEX = {
  paving: 2.0, slabs: 1.825, wood: 1.2, brick: 1.4, render: 2.0, paint: 1.0, grass: 2.0, asphalt: 3.0,
  concrete: 2.0, roof: 2.5, stone: 1.5, dirt: 2.0, moss: 3.0,
};
const texCache = new Map();
const matCache = new Map();
let anisotropy = 1;
let whiteTex = null;

export function white() {
  if (!whiteTex) {
    whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    whiteTex.needsUpdate = true;
  }
  return whiteTex;
}

const loader = new THREE.TextureLoader();

// Colour grading per texture, done once when it loads (canvas filter, so it costs nothing per frame):
// the Poly Haven photos are realistic and a bit grey; the game wants bright, cheerful colours.
const GRADE = {
  grass: 'hue-rotate(28deg) saturate(1.9) brightness(1.35) contrast(1.05)',
  brick: 'saturate(1.55) brightness(1.32) contrast(1.02)',
  roof: 'saturate(1.6) brightness(1.3)',
  paving: 'saturate(1.5) brightness(1.4)',
  wood: 'saturate(1.65) brightness(1.35)',
  slabs: 'saturate(1.25) brightness(1.38)',
  asphalt: 'saturate(1.1) brightness(1.2)',
  concrete: 'saturate(0.85) brightness(1.4)',
  render: 'sepia(0.15) saturate(1.3) brightness(1.3)',
  paint: 'saturate(0.5) brightness(1.25) contrast(0.85)',
  stone: 'saturate(1.25) brightness(1.3)',
  dirt: 'saturate(0.95) contrast(1.1)',
  moss: 'saturate(1.9) brightness(1.3)',
  sky: 'saturate(1.35) brightness(1.08)',
};
export function grade(tex, key) {
  const f = GRADE[key], img = tex.image;
  if (!f || !img || !img.width) return tex;
  try {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    if (!('filter' in x)) return tex; // old Safari: leave as it is
    x.filter = f;
    x.drawImage(img, 0, 0);
    tex.image = c;
    tex.needsUpdate = true;
  } catch (e) { /* keep the original picture */ }
  return tex;
}

// Returns the texture at once; the picture fills in when it has downloaded.
export function texture(key) {
  if (!TEX[key]) return white();
  if (texCache.has(key)) return texCache.get(key).tex;
  const entry = { tex: null, promise: null };
  entry.promise = new Promise((resolve) => {
    entry.tex = loader.load(`textures/${key}.jpg`, (t) => { grade(t, key); resolve(t); }, undefined, () => { console.warn('texture failed: ' + key); resolve(entry.tex); });
  });
  const t = entry.tex;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  t.repeat.set(1 / TEX[key], 1 / TEX[key]);
  texCache.set(key, entry);
  return t;
}

export function loadTextures(keys, onProgress) {
  const list = [...new Set(keys)].filter((k) => TEX[k]);
  let done = 0;
  return Promise.all(list.map((k) => { texture(k); return texCache.get(k).promise.then(() => { done++; onProgress && onProgress(done / list.length); }); }));
}

export function setAnisotropy(a) {
  anisotropy = a;
  for (const { tex } of texCache.values()) { if (tex.anisotropy !== a) { tex.anisotropy = a; tex.needsUpdate = true; } }
}

export function loadSky() {
  return new Promise((resolve) => {
    loader.load('textures/sky.jpg', (t) => {
      grade(t, 'sky');
      t.colorSpace = THREE.SRGBColorSpace;
      t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
      resolve(t);
    }, undefined, () => resolve(null));
  });
}

// "pw_paving" / "pw_paving.001" -> "paving"
export function keyOf(material) {
  const n = (material && material.name) || '';
  return n.replace(/^pw_/, '').replace(/\.\d+$/, '') || 'plain';
}

// brightness / colour fix per texture (the "paint" plaster texture is a bit grey-beige on its own)
const KEY_COLOR = { paint: [1.18, 1.18, 1.2], concrete: [0.98, 1.02, 1.08], glass: [1.4, 1.5, 1.7] };
export function keyColor(key, out = new THREE.Color()) {
  const c = KEY_COLOR[key];
  return c ? out.setRGB(c[0], c[1], c[2]) : out.setRGB(1, 1, 1);
}

// Shared material for scenery and props (texture x vertex colour).
export function sceneMaterial(key) {
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({ map: texture(key), vertexColors: true });
  keyColor(key, m.color);
  if (key === 'glass') m.emissive.setRGB(0.05, 0.07, 0.09);
  if (key === 'water') { m.emissive.setRGB(0.02, 0.06, 0.09); }
  m.name = 'pw_' + key;
  matCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------- GLB
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

export function loadGLB(url, onProgress) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, (g) => { g.scene.updateMatrixWorld(true); resolve(g.scene); },
      (ev) => { if (ev && ev.total && onProgress) onProgress(ev.loaded / ev.total); },
      () => reject(new Error('Could not load ' + url)));
  });
}

const _v = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

// Copy a mesh's geometry into plain arrays, transformed by `matrix` (default: its world matrix).
// Result attributes: position, normal, uv, color (rgb) and, if the mesh has it, aMaskUv (= glTF TEXCOORD_1).
// Brighter, more saturated vertex colours (the models' tints), done once per colour at load:
// textures are multiplied by these tints, which made everything come out dark and dull.
const colorBoost = new Map();
const _c = new THREE.Color(), _hsl = { h: 0, s: 0, l: 0 };
function boost(r, g, b, out) {
  const key = ((r * 255) | 0) * 65536 + ((g * 255) | 0) * 256 + ((b * 255) | 0);
  let v = colorBoost.get(key);
  if (!v) {
    _c.setRGB(r, g, b);
    _c.getHSL(_hsl, THREE.SRGBColorSpace);
    if (_hsl.s > 0.08) { _hsl.s = Math.min(1, _hsl.s * 1.25 + 0.06); _hsl.l = Math.min(0.9, _hsl.l * 1.2 + 0.05); }
    else _hsl.l = Math.min(0.97, _hsl.l * 1.1 + 0.02);
    _c.setHSL(_hsl.h, _hsl.s, _hsl.l, THREE.SRGBColorSpace);
    v = [_c.r, _c.g, _c.b];
    colorBoost.set(key, v);
  }
  out[0] = v[0]; out[1] = v[1]; out[2] = v[2];
}
const _rgb = [0, 0, 0];

// Models with 3D text carry an extra UV map from the text, so there are three UV sets:
// [text, tiling, mask] for washables and [text, tiling] for scenery. Pick the right ones.
export function bake(mesh, matrix = mesh.matrixWorld, withMask = false) {
  const g = mesh.geometry;
  const A = g.attributes;
  const extra = withMask ? !!A.uv2 : !!A.uv1;
  const U = extra ? A.uv1 : A.uv;
  const U1 = withMask ? (A.uv2 || A.uv1) : null;
  const P = A.position, N = A.normal, C = A.color;
  const n = P.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), colr = new Float32Array(n * 3);
  const uv1 = U1 ? new Float32Array(n * 2) : null;
  _m3.getNormalMatrix(matrix);
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(P, i).applyMatrix4(matrix);
    pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
    if (N) { _v.fromBufferAttribute(N, i).applyMatrix3(_m3).normalize(); nrm[i * 3] = _v.x; nrm[i * 3 + 1] = _v.y; nrm[i * 3 + 2] = _v.z; }
    if (U) { uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i); }
    if (uv1) { uv1[i * 2] = U1.getX(i); uv1[i * 2 + 1] = U1.getY(i); }
    if (C) { boost(C.getX(i), C.getY(i), C.getZ(i), _rgb); colr[i * 3] = _rgb[0]; colr[i * 3 + 1] = _rgb[1]; colr[i * 3 + 2] = _rgb[2]; } else { colr[i * 3] = colr[i * 3 + 1] = colr[i * 3 + 2] = 1; }
  }
  let index;
  if (g.index) { index = new Uint32Array(g.index.count); for (let i = 0; i < g.index.count; i++) index[i] = g.index.getX(i); }
  else { index = new Uint32Array(n); for (let i = 0; i < n; i++) index[i] = i; }
  return { pos, nrm, uv, uv1, colr, index, n };
}

// Merge baked parts [{ b, key }] into one geometry with one group per texture key.
export function mergeBaked(parts, withMask = false) {
  const keys = [...new Set(parts.map((p) => p.key))];
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.b.n; ni += p.b.index.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), colr = new Float32Array(nv * 3);
  const uv1 = withMask ? new Float32Array(nv * 2) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const geo = new THREE.BufferGeometry();
  let vo = 0, io = 0;
  for (let k = 0; k < keys.length; k++) {
    const start = io;
    for (const p of parts) {
      if (p.key !== keys[k]) continue;
      const b = p.b;
      pos.set(b.pos, vo * 3); nrm.set(b.nrm, vo * 3); uv.set(b.uv, vo * 2); colr.set(b.colr, vo * 3);
      if (uv1 && b.uv1) uv1.set(b.uv1, vo * 2);
      for (let i = 0; i < b.index.length; i++) idx[io + i] = b.index[i] + vo;
      vo += b.n; io += b.index.length;
    }
    geo.addGroup(start, io - start, k);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  if (uv1) geo.setAttribute('aMaskUv', new THREE.BufferAttribute(uv1, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geo, keys };
}

// All meshes under a node, baked in world space and merged by texture key.
export function bakeNode(node, withMask = false, matrix = null) {
  const parts = [];
  node.traverse((o) => {
    if (!o.isMesh) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    parts.push({ b: bake(o, matrix ? new THREE.Matrix4().multiplyMatrices(matrix, o.matrixWorld) : o.matrixWorld, withMask), key: keyOf(mat) });
  });
  if (!parts.length) return null;
  return mergeBaked(parts, withMask);
}

export function disposeCaches() {
  for (const { tex } of texCache.values()) tex.dispose();
  texCache.clear();
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
  if (whiteTex) { whiteTex.dispose(); whiteTex = null; }
}
