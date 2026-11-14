// GLB loading with graceful fallbacks, model cloning and instancing helpers.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLAGS } from './utils.js';

const BASE = 'assets/models/';

// Every model the game can use. "required: false" everywhere: a missing file never stops the game.
export const MODEL_LIST = [
  'characters/courier.glb',
  'characters/acc_cap.glb', 'characters/acc_beanie.glb', 'characters/acc_helmet.glb', 'characters/acc_crown.glb',
  'characters/acc_tophat.glb', 'characters/acc_headphones.glb', 'characters/acc_shades.glb', 'characters/acc_bag.glb',
  'characters/acc_jetpack.glb',
  'vehicles/bicycle.glb', 'vehicles/bmx.glb', 'vehicles/escooter.glb', 'vehicles/mtb.glb', 'vehicles/moped.glb',
  'vehicles/motorbike.glb', 'vehicles/van_small.glb', 'vehicles/van_large.glb', 'vehicles/truck.glb',
  'vehicles/truck_super.glb', 'vehicles/car_sedan.glb', 'vehicles/car_hatch.glb', 'vehicles/car_pickup.glb',
  'vehicles/car_taxi.glb', 'vehicles/airplane.glb',
  'buildings/house_a.glb', 'buildings/house_b.glb', 'buildings/house_c.glb', 'buildings/shop.glb',
  'buildings/restaurant.glb', 'buildings/warehouse.glb', 'buildings/hangar.glb', 'buildings/control_tower.glb',
  'buildings/garage.glb', 'buildings/dealership.glb',
  'props/package.glb', 'props/streetlight.glb', 'props/trafficlight.glb', 'props/bench.glb', 'props/tree_round.glb',
  'props/tree_pine.glb', 'props/tree_palm.glb', 'props/tree_bush.glb', 'props/bin.glb', 'props/hydrant.glb',
  'props/mailbox.glb', 'props/cone.glb', 'props/container.glb', 'props/crates.glb', 'props/signpost.glb',
  'props/jobboard.glb', 'props/fence.glb', 'props/fence_metal.glb', 'props/cafe_table.glb',
];

class AssetStore {
  constructor() {
    this.gltf = {};
    this.failed = [];
    this.loader = new GLTFLoader();
  }

  async loadAll(onProgress) {
    let done = 0;
    const total = MODEL_LIST.length;
    await Promise.all(MODEL_LIST.map(async path => {
      const key = path.replace('.glb', '');
      try {
        if (FLAGS.failAssets.some(f => key.includes(f))) throw new Error('simulated failure (?failassets)');
        const g = await this.loader.loadAsync(BASE + path);
        g.scene.traverse(o => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.gltf[key] = g;
      } catch (e) {
        this.failed.push(key);
        console.warn('[assets] optional model unavailable, using fallback:', path, e && e.message ? e.message : e);
      }
      done++;
      if (onProgress) onProgress(done / total, path);
    }));
    return this.failed;
  }

  has(key) { return !!this.gltf[key]; }
  get(key) { return this.gltf[key] || null; }

  // deep clone (skinned meshes keep working). Materials are cloned too when cloneMaterials.
  clone(key, cloneMaterials = false) {
    const g = this.gltf[key];
    if (!g) return null;
    const obj = SkeletonUtils.clone(g.scene);
    if (cloneMaterials) {
      const cache = new Map();
      obj.traverse(o => {
        if (o.isMesh) {
          o.material = Array.isArray(o.material)
            ? o.material.map(m => cloneMat(m, cache))
            : cloneMat(o.material, cache);
        }
      });
    }
    return obj;
  }

  animations(key) { return this.gltf[key] ? this.gltf[key].animations : []; }

  // Flatten a model into parts: [{geometry (baked to model space), material, name}]
  parts(key) {
    const g = this.gltf[key];
    if (!g) return null;
    if (g._parts) return g._parts;
    const out = [];
    g.scene.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.scene.matrixWorld).invert();
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const geo = o.geometry.clone().applyMatrix4(m);
      out.push({ geometry: geo, material: o.material, name: o.name, matName: o.material.name || '' });
    });
    g._parts = out;
    return out;
  }
}

// find a node by its original glTF name (GLTFLoader may add a suffix to keep names unique)
export function findNode(root, name) {
  let hit = null;
  root.traverse(o => {
    if (hit) return;
    if ((o.userData && o.userData.name === name) || o.name === name) hit = o;
  });
  return hit;
}

function cloneMat(m, cache) {
  if (cache.has(m)) return cache.get(m);
  const c = m.clone();
  cache.set(m, c);
  return c;
}

export const assets = new AssetStore();

// ------------------------------------------------------------------ instancing
// Build InstancedMeshes for a model at many transforms.
// items: [{x, y, z, ry, s, sx, sy, sz, tint, tint2}] ; tintMats: {materialName: 'tint'|'tint2'}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

export function instanceMatrix(it, target = _m) {
  _p.set(it.x, it.y || 0, it.z);
  _q.setFromAxisAngle(_up, it.ry || 0);
  const s = it.s || 1;
  _s.set(it.sx || s, it.sy || s, it.sz || s);
  return target.compose(_p, _q, _s);
}

// ------------------------------------------------------------------ merged "tint" models
// To keep draw calls low every multi-material model is merged into ONE geometry with the
// material colours baked into vertex colours. Two extra vertex attributes drive a small shader
// patch:  tintMask (0 none, 1 = instance colour, 2 = second instance colour)
//         glowMask (0 none, 1 = glow channel A, 2 = glow channel B)  -> emissive lights / windows
const TINT_SLOT = { wall: 1, paint: 1, box: 1, roof: 2, awning: 2 };
const GLOW_SLOT = { window: 1, lamp: 1, headlight: 1, screen: 1, taxi_sign: 1, brakelight: 2, indicator: 2, beacon: 2 };
const TRANSPARENT = new Set(['chainlink']);
const _mergeCache = new Map();

function toNonIndexedClean(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

// returns {geometry, extra:[{geometry, material}]} or null. exclude: material names to leave out
export function mergedModel(key, fallback, exclude = null) {
  const ck = key + (exclude ? '|' + exclude.join(',') : '');
  if (_mergeCache.has(ck)) return _mergeCache.get(ck);
  let parts = assets.parts(key);
  if (!parts && fallback) parts = fallback();
  if (!parts) return null;
  const out = mergeParts(exclude ? parts.filter(p => !exclude.includes(p.matName)) : parts);
  _mergeCache.set(ck, out);
  return out;
}

// merge a list of parts [{geometry, material, matName}] into one vertex-coloured geometry
export function mergeParts(parts) {
  const geos = [], extra = [];
  for (const p of parts) {
    if (TRANSPARENT.has(p.matName) || (p.material && p.material.transparent)) { extra.push({ geometry: p.geometry, material: p.material, matName: p.matName }); continue; }
    const g = toNonIndexedClean(p.geometry);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), tm = new Float32Array(n), gm = new Float32Array(n);
    const c = p.material && p.material.color ? p.material.color : new THREE.Color(1, 1, 1);
    const t = TINT_SLOT[p.matName] || 0, gl = GLOW_SLOT[p.matName] || 0;
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; tm[i] = t; gm[i] = gl; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('tintMask', new THREE.BufferAttribute(tm, 1));
    g.setAttribute('glowMask', new THREE.BufferAttribute(gm, 1));
    geos.push(g);
  }
  const geometry = geos.length ? mergeGeometries(geos, false) : null;
  if (geometry) geometry.computeBoundingSphere();
  return { geometry, extra };
}

// MeshStandardMaterial + vertex colours + tint / glow patch. One material can be shared by
// many instanced meshes (glow strength comes from uniforms and the per-instance instGlow).
export function tintMaterial({ roughness = 0.72, metalness = 0.05, glowA = '#ffcf7a', glowB = '#ff3030', glowScale = 0, instanced = true } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });
  const u = { uGlowScale: { value: glowScale }, uGlowA: { value: new THREE.Color(glowA) }, uGlowB: { value: new THREE.Color(glowB) }, uTint: { value: new THREE.Color(1, 1, 1) }, uTint2: { value: new THREE.Color(1, 1, 1) }, uGlow: { value: new THREE.Vector2(1, 1) } };
  m.userData.uniforms = u;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float tintMask; attribute float glowMask; varying vec3 vGlowCol;
        uniform vec3 uGlowA; uniform vec3 uGlowB; uniform vec3 uTint; uniform vec3 uTint2; uniform vec2 uGlow;
        ${instanced ? 'attribute vec3 instTint2; attribute vec2 instGlow;' : ''}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        ${instanced ? `
        vec3 tint1 = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          tint1 = instanceColor.rgb;
        #endif
        vec3 tint2 = instTint2; vec2 glw = instGlow;` : 'vec3 tint1 = uTint; vec3 tint2 = uTint2; vec2 glw = uGlow;'}
        vColor.rgb = color.rgb * (tintMask > 1.5 ? tint2 : (tintMask > 0.5 ? tint1 : vec3(1.0)));
        vGlowCol = glowMask > 1.5 ? uGlowB * glw.y : (glowMask > 0.5 ? uGlowA * glw.x : vec3(0.0));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlowCol; uniform float uGlowScale;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlowCol * uGlowScale;');
  };
  m.customProgramCacheKey = () => 'tint' + (instanced ? 'I' : 'S');
  return m;
}

let _worldTint = null;
export function worldTintMaterial() { return _worldTint || (_worldTint = tintMaterial({})); }

// Build instanced meshes of a merged model. items: [{x,y,z,ry,s,tint,tint2,glowA,glowB}]
export function buildInstanced(key, items, opts = {}) {
  const group = new THREE.Group();
  group.name = 'inst_' + key;
  if (!items.length) return group;
  const mm = mergedModel(key, opts.fallback, opts.exclude || null);
  if (!mm) return group;
  const n = items.length;
  if (mm.geometry) {
    const geo = mm.geometry.clone();
    const t2 = new Float32Array(n * 3), gl = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      _c.set(items[i].tint2 || '#ffffff');
      t2[i * 3] = _c.r; t2[i * 3 + 1] = _c.g; t2[i * 3 + 2] = _c.b;
      gl[i * 2] = items[i].glowA ?? 1; gl[i * 2 + 1] = items[i].glowB ?? 1;
    }
    geo.setAttribute('instTint2', new THREE.InstancedBufferAttribute(t2, 3));
    geo.setAttribute('instGlow', new THREE.InstancedBufferAttribute(gl, 2));
    const im = new THREE.InstancedMesh(geo, opts.material || worldTintMaterial(), n);
    im.name = key;
    im.castShadow = opts.castShadow !== false;
    im.receiveShadow = opts.receiveShadow !== false;
    for (let i = 0; i < n; i++) {
      im.setMatrixAt(i, instanceMatrix(items[i]));
      im.setColorAt(i, _c.set(items[i].tint || '#ffffff'));
    }
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
  }
  for (const p of mm.extra) {
    const im = new THREE.InstancedMesh(p.geometry, p.material, n);
    im.name = key + ':' + p.matName;
    for (let i = 0; i < n; i++) im.setMatrixAt(i, instanceMatrix(items[i]));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}

// simple fallback part sets for props that failed to load
export function fallbackParts(kind) {
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const part = (geo, color, name = 'fallback') => ({ geometry: geo, material: mat(color), name, matName: name });
  const box = (w, h, d, y = h / 2) => new THREE.BoxGeometry(w, h, d).translate(0, y, 0);
  const cyl = (r, h, y = h / 2) => new THREE.CylinderGeometry(r, r, h, 8).translate(0, y, 0);
  switch (kind) {
    case 'tree': return [part(cyl(0.2, 2.4), '#7a5234', 'bark'), part(new THREE.IcosahedronGeometry(1.6, 0).translate(0, 3.4, 0), '#4caf50', 'leaves')];
    case 'lamp': return [part(cyl(0.08, 6.6), '#3b4250', 'pole')];
    case 'bench': return [part(box(1.8, 0.5, 0.5), '#c98a4b', 'wood')];
    case 'box': return [part(box(0.5, 0.5, 0.5), '#b07a45', 'box')];
    case 'house': return [part(box(9, 6, 8), '#ffffff', 'wall'), part(new THREE.ConeGeometry(6.4, 3, 4).rotateY(Math.PI / 4).translate(0, 7.5, 0), '#ffffff', 'roof')];
    case 'building': return [part(box(12, 8, 10), '#ffffff', 'wall')];
    default: return [part(box(0.6, 1, 0.6), '#9aa3ad', 'fallback')];
  }
}
