// TURBO TOWN - Blender GLB model library.
// Each GLB file holds many models; every top-level node is one model, found by name.
// Models are "baked" for drawing: all meshes of a part are merged into one geometry with
// the material colours stored as vertex colours (paint / paint2 replaced by the player's
// colours). Glowing materials (names starting with "glow") become a second emissive mesh.
// That keeps each kart, prop or tree to one or two draw calls.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vcMaterial } from './materials.js';

const BASE = new URL('../../assets/models/', import.meta.url).href;
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder); // karts.glb is meshopt-compressed
    this.models = new Map();   // name -> template Object3D
    this.files = new Map();    // file -> Promise
    this.failed = [];
    this.mergedCache = new Map();
  }

  load(file) {
    if (this.files.has(file)) return this.files.get(file);
    const p = this.loader.loadAsync(BASE + file).then((g) => {
      // mark real glTF nodes (Blender objects); the other meshes are material pieces of a node
      g.scene.traverse((o) => {
        const a = g.parser.associations.get(o);
        o.userData.isNode = !!(a && a.nodes !== undefined);
      });
      for (const child of [...g.scene.children]) this.models.set(child.name, child);
      g.scene.updateMatrixWorld(true);
      return true;
    }).catch((e) => {
      console.warn('[assets] could not load', file, e && e.message);
      this.failed.push(file);
      return false;
    });
    this.files.set(file, p);
    return p;
  }

  async loadAll(files, onProgress) {
    let done = 0;
    await Promise.all(files.map((f) => this.load(f).then(() => { done++; if (onProgress) onProgress(done / files.length, f); })));
  }

  has(name) { return this.models.has(name); }
  node(name) { return this.models.get(name) || null; }

  // Merge every mesh under `root` (in root's local space) into vertex-coloured geometry.
  // colors: { materialName: '#hex' } overrides. skip(node) -> true leaves a subtree out.
  bake(root, colors = {}, skip = null) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const normal = [], glow = new Map(), textured = new Map();
    const visit = (o) => {
      if (o !== root && skip && skip(o)) return;
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const geo = o.geometry;
        const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : geo.attributes.position.count, materialIndex: 0 }];
        _m.multiplyMatrices(inv, o.matrixWorld);
        for (const gr of groups) {
          const mat = mats[gr.materialIndex] || mats[0];
          const name = (mat.name || '').replace(/\.\d+$/, '');
          const map = mat.map || null; // a textured part (a car's real livery)
          const seeThrough = mat.transparent || mat.alphaTest > 0;
          // see-through parts without a texture are glass: light covers vanish, windows go dark
          if (!map && seeThrough && /light/i.test(name)) continue;
          const part = subGeometry(geo, gr.start, gr.count, !!map).applyMatrix4(_m);
          const isGlow = name.startsWith('glow');
          // 'paint_70' = the main colour at 70 % brightness (shading painted into the model)
          const shade = /^(paint2?)_(\d+)$/.exec(name);
          if (map) _c.set('#ffffff');
          else if (seeThrough) _c.set('#1d2433');
          else if (colors[name]) _c.set(colors[name]);
          else if (shade && colors[shade[1]]) _c.set(colors[shade[1]]).convertLinearToSRGB().multiplyScalar(+shade[2] / 100).convertSRGBToLinear();
          else _c.copy(mat.color || _c.set('#ffffff'));
          paint(part, _c);
          if (map) {
            // decals and numbers keep their see-through parts (cut out, so they stay cheap)
            const key = map.uuid + (seeThrough ? '|cut' : '');
            if (!textured.has(key)) textured.set(key, { map, cut: seeThrough, parts: [] });
            textured.get(key).parts.push(part);
          } else if (isGlow) {
            const key = '#' + (mat.emissive ? mat.emissive.getHexString() : _c.getHexString());
            if (!glow.has(key)) glow.set(key, []);
            glow.get(key).push(part);
          } else normal.push(part);
        }
      }
      for (const c of o.children) visit(c);
    };
    visit(root);
    const out = [];
    if (normal.length) out.push({ geometry: finishGeo(mergeGeometries(normal, false)), glow: null });
    for (const [key, parts] of glow) out.push({ geometry: finishGeo(mergeGeometries(parts, false)), glow: key });
    for (const t of textured.values()) out.push({ geometry: finishGeo(mergeGeometries(t.parts, false)), glow: null, map: t.map, cut: t.cut });
    return out;
  }

  // Baked parts of a whole model (cached), for instanced props.
  merged(name) {
    if (this.mergedCache.has(name)) return this.mergedCache.get(name);
    const n = this.node(name);
    if (!n) return null;
    const res = { parts: this.bake(n) }; // relative to the model's own origin
    this.mergedCache.set(name, res);
    return res;
  }

  // Meshes for a baked result.
  meshes(parts, { toon = true, shadow = true } = {}) {
    const g = new THREE.Group();
    for (const p of parts) {
      const m = new THREE.Mesh(p.geometry, p.glow ? vcMaterial({ toon: false, emissive: p.glow }) : vcMaterial({ toon, map: p.map || null, alphaTest: p.cut ? 0.5 : 0 }));
      m.castShadow = shadow && !p.glow;
      g.add(m);
    }
    return g;
  }

  // A drawable copy of a model that keeps its node hierarchy (for animated props and
  // drivers): every node with meshes gets its own baked mesh.
  clone(name, colors = {}) {
    const n = this.node(name);
    if (!n) return null;
    const build = (src) => {
      const dst = new THREE.Group();
      dst.name = src.name;
      dst.position.copy(src.position); dst.quaternion.copy(src.quaternion); dst.scale.copy(src.scale);
      // this node's own mesh pieces (the node itself, and child meshes that are not nodes)
      const tmp = new THREE.Group();
      if (src.isMesh) tmp.add(meshCopy(src, true));
      for (const c of src.children) if (c.isMesh && !c.userData.isNode) tmp.add(meshCopy(c));
      if (tmp.children.length) for (const c of this.meshes(this.bake(tmp, colors)).children) dst.add(c);
      for (const c of src.children) if (c.userData.isNode) dst.add(build(c));
      return dst;
    };
    return build(n);
  }

  // ------------------------------------------------------------ karts

  // Car model with its own livery and wheels, plus the chosen accessory. Returns null if not
  // loaded. The cars keep their real liveries: paint can not be changed any more.
  buildKart(def, opts = {}) {
    const cos = opts.cosmetics || {};
    const t = this.node('kart_' + def.id);
    if (!t) return null;
    const colors = { paint: def.colors[0], paint2: def.colors[1] };
    const object = new THREE.Group();
    object.name = 'kartModel';
    const find = (prefix) => t.children.find((c) => c.name.startsWith(prefix));
    // body: everything except the steering wheel and the empties
    const bodyParts = this.bake(t, colors, (o) => o.name.startsWith('steer'));
    object.add(this.meshes(bodyParts));
    // steering wheel (turns with the player's steering)
    let steer = null;
    const st = find('steer');
    if (st) {
      steer = new THREE.Group();
      steer.position.copy(st.position); steer.quaternion.copy(st.quaternion);
      steer.userData.base = st.quaternion.clone();
      const tmp = new THREE.Group(); tmp.add(meshCopy(st, true));
      steer.add(this.meshes(this.bake(tmp, colors)));
      object.add(steer);
    }
    // wheels: the car's own wheel model
    const wheelName = this.has('wheel_' + def.id) ? 'wheel_' + def.id : 'wheel_std';
    const wheelParts = this.cacheTinted(wheelName, colors);
    const wheels = [], steerGroups = [], rearWheels = [];
    let wheelRadius = 0.32;
    for (const key of ['fl', 'fr', 'rl', 'rr']) {
      const e = find('wheel_' + key);
      if (!e) continue;
      const holder = new THREE.Group();
      holder.position.copy(e.position);
      const w = this.meshes(wheelParts.parts);
      w.scale.copy(e.scale);
      // wheel models show their outside at +X: turn the right-hand wheels round so their
      // rims and tyre writing face outwards too (and spin them the other way)
      if (e.position.x < 0) {
        const turn = new THREE.Group();
        turn.rotation.y = Math.PI;
        turn.add(w);
        holder.add(turn);
        w.userData.flip = true;
      } else holder.add(w);
      object.add(holder);
      wheels.push(w);
      if (key[0] === 'f') steerGroups.push(holder);
      else rearWheels.push(new THREE.Vector3(e.position.x, 0.05, e.position.z));
      wheelRadius = e.scale.y;
    }
    // accessory
    const accE = find('acc');
    if (cos.acc && this.has(cos.acc) && accE) {
      const a = this.meshes(this.cacheTinted(cos.acc, colors).parts);
      a.position.copy(accE.position);
      object.add(a);
    }
    const exhaust = ['exhaust_l', 'exhaust_r'].map((n) => find(n)).filter(Boolean).map((e) => e.position.clone());
    const seatE = find('seat');
    return {
      object,
      parts: {
        wheels, steerGroups, wheelRadius, steerWheel: steer,
        seat: seatE ? seatE.position.clone() : new THREE.Vector3(0, 0.4, 0.15),
        anchors: { exhaust: exhaust.length ? exhaust : [new THREE.Vector3(0, 0.4, -1)], rearWheels },
      },
    };
  }

  // merged() with colour overrides, cached per colour set
  cacheTinted(name, colors) {
    const key = name + '|' + JSON.stringify(colors);
    if (this.mergedCache.has(key)) return this.mergedCache.get(key);
    const n = this.node(name);
    const res = { parts: n ? this.bake(n, colors) : [] };
    this.mergedCache.set(key, res);
    return res;
  }

}

// ------------------------------------------------------------------ geometry helpers

function subGeometry(geo, start, count, withUV = false) {
  const g = new THREE.BufferGeometry();
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = withUV ? geo.attributes.uv : null;
  const idx = geo.index;
  const P = new Float32Array(count * 3), N = new Float32Array(count * 3), U = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const v = idx ? idx.getX(start + i) : start + i;
    P[i * 3] = pos.getX(v); P[i * 3 + 1] = pos.getY(v); P[i * 3 + 2] = pos.getZ(v);
    if (nor) { N[i * 3] = nor.getX(v); N[i * 3 + 1] = nor.getY(v); N[i * 3 + 2] = nor.getZ(v); }
    if (uv) { U[i * 2] = uv.getX(v); U[i * 2 + 1] = uv.getY(v); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (withUV) g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  if (!nor) g.computeVertexNormals();
  return g;
}

function paint(g, c) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function finishGeo(g) {
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// a mesh copy without its children (and optionally reset to the origin)
function meshCopy(src, atOrigin = false) {
  if (src.isMesh) {
    const m = new THREE.Mesh(src.geometry, src.material);
    if (!atOrigin) { m.position.copy(src.position); m.quaternion.copy(src.quaternion); m.scale.copy(src.scale); }
    return m;
  }
  // a node whose meshes are child primitives
  const g = new THREE.Group();
  for (const c of src.children) if (c.isMesh) g.add(meshCopy(c));
  return g;
}

export const assets = new Assets();
