// Loads the Blender-made GLB files and turns every model into one vertex-coloured geometry
// (one material for everything = very few draw calls). Rigs keep their moving parts separate.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const FILES = [['mowers', 70], ['characters', 65], ['props', 135], ['buildings', 50]]; // name, KB (for the progress bar)
const sources = {}; // model name -> original Object3D
const merged = {};  // model name -> merged BufferGeometry (whole model, for static props)

// Shared flat-shaded material. Vertex attribute aGlow makes windows/lamps glow (stronger in the evening).
export const glowUniform = { value: 0.25 };
export const tintUniform = { value: new THREE.Color(1, 1, 1) };
function makeMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = glowUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;');
  };
  return m;
}
export const propMat = makeMaterial();

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const totalKB = FILES.reduce((a, f) => a + f[1], 0);
  const got = {};
  const report = () => onProgress && onProgress(Object.values(got).reduce((a, b) => a + b, 0) / totalKB);
  await Promise.all(FILES.map(([name, kb]) => new Promise((resolve, reject) => {
    loader.load(`models/${name}.glb`, (gltf) => {
      got[name] = kb; report();
      gltf.scene.updateMatrixWorld(true);
      for (const child of gltf.scene.children) sources[child.name] = child;
      resolve();
    }, (ev) => {
      if (ev && ev.total) { got[name] = (ev.loaded / ev.total) * kb * 0.95; report(); }
    }, (err) => reject(new Error(`Could not load ${name}.glb`)));
  })));
}

export const hasModel = (name) => !!sources[name];

function tintOf(name) { return name === 'paint' ? 1 : name === 'shirt' ? 2 : name === 'pants' ? 3 : 0; }

// Merge meshes into one geometry, positions relative to `relTo`.
function mergeMeshes(meshes, relTo) {
  relTo.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(relTo.matrixWorld).invert();
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), glow = new Float32Array(nv), tint = new Uint8Array(nv);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const v = new THREE.Vector3(), mat = new THREE.Matrix4();
  let vo = 0, io = 0, anyTint = false;
  for (const m of meshes) {
    const g = m.geometry, p = g.attributes.position;
    mat.multiplyMatrices(inv, m.matrixWorld);
    const material = Array.isArray(m.material) ? m.material[0] : m.material;
    const c = material.color || new THREE.Color(1, 1, 1);
    const isGlow = material.name && material.name.startsWith('glow') ? 1 : 0;
    const t = tintOf(material.name);
    if (t) anyTint = true;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mat);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b;
      glow[vo + i] = isGlow; tint[vo + i] = t;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
    vo += p.count; io += g.index ? g.index.count : p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  if (anyTint) geo.userData.tint = tint;
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

function meshesUnder(root) {
  const out = [];
  root.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

// The whole model as one geometry (shared, do not modify).
export function modelGeo(name) {
  if (merged[name]) return merged[name];
  const src = sources[name];
  if (!src) return null;
  merged[name] = mergeMeshes(meshesUnder(src), src);
  merged[name].userData.shared = true; // used by many objects: never dispose
  return merged[name];
}

// A rig: same node tree as in Blender, each node with its own merged mesh (geometry is copied,
// so it can be recoloured). Returns { root, parts: { nodeName: Group } }.
export function buildRig(name, material = propMat) {
  const src = sources[name];
  if (!src) return null;
  const parts = {};
  const rec = (node) => {
    const g = new THREE.Group();
    g.name = node.name;
    g.position.copy(node.position); g.quaternion.copy(node.quaternion); g.scale.copy(node.scale);
    const own = [];
    if (node.isMesh) own.push(node);
    for (const c of node.children) if (c.isMesh && c.name.startsWith('lm_')) own.push(c);
    if (own.length) {
      const mesh = new THREE.Mesh(mergeMeshes(own, node), material);
      g.add(mesh);
      g.userData.mesh = mesh;
    }
    for (const c of node.children) if (!(c.isMesh && c.name.startsWith('lm_'))) g.add(rec(c));
    parts[node.name] = g;
    return g;
  };
  const root = rec(src);
  root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1);
  return { root, parts };
}

// Recolour the paint / shirt / pants parts of a rig. colors = { paint, shirt, pants } as hex strings.
export function recolor(rigRoot, colors) {
  const cs = { 1: colors.paint && new THREE.Color(colors.paint), 2: colors.shirt && new THREE.Color(colors.shirt), 3: colors.pants && new THREE.Color(colors.pants) };
  rigRoot.traverse((o) => {
    if (!o.isMesh || !o.geometry.userData.tint) return;
    const t = o.geometry.userData.tint, c = o.geometry.attributes.color;
    for (let i = 0; i < t.length; i++) {
      const col = cs[t[i]];
      if (col) c.setXYZ(i, col.r, col.g, col.b);
    }
    c.needsUpdate = true;
  });
}

// Static batching: many props merged into a few meshes, split into square chunks so the
// camera can skip chunks it cannot see. items = [{ m, x, y, z, rot, s, sx, sz }]
export function batchProps(items, { chunk = 32, material = propMat } = {}) {
  const groups = new Map();
  for (const it of items) {
    const geo = modelGeo(it.m);
    if (!geo) continue;
    const key = Math.floor(it.x / chunk) + ',' + Math.floor(it.z / chunk);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([it, geo]);
  }
  const out = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), tr = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
  for (const list of groups.values()) {
    let nv = 0, ni = 0;
    for (const [, g] of list) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), glow = new Float32Array(nv);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const [it, g] of list) {
      const s = it.s || 1;
      m4.compose(tr.set(it.x, it.y || 0, it.z), q.setFromAxisAngle(up, it.rot || 0), sc.set(s * (it.sx || 1), s, s * (it.sz || 1)));
      const p = g.attributes.position, c = g.attributes.color, gl = g.attributes.aGlow;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m4);
        pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        col[(vo + i) * 3] = c.getX(i); col[(vo + i) * 3 + 1] = c.getY(i); col[(vo + i) * 3 + 2] = c.getZ(i);
        glow[vo + i] = gl.getX(i);
      }
      for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
      vo += p.count; io += g.index.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  return out;
}

// free GPU memory of everything under obj except shared model geometries
export function disposeTree(obj) {
  obj.traverse((o) => { if ((o.isMesh || o.isLineSegments) && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
}
