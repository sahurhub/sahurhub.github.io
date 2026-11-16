// TURBO TOWN - prop kit: draws many copies of a model with instancing. Copies are grouped
// into map chunks so the camera only draws chunks in view and within each prop's draw
// distance (flowers fade out sooner than trees). Every model is baked into one
// vertex-coloured geometry (assets.js), so a chunk of a prop type is one draw call.
import * as THREE from 'three';
import { vcMaterial } from './materials.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const CHUNK = 140;

export class PropKit {
  constructor(group, assets, world, quality) {
    this.group = group;
    this.assets = assets;
    this.world = world;
    this.quality = quality;
    this.chunks = [];   // { mesh, x, z, r, view }
  }

  // items: [{ x, y, z, ry, s, sx, sy, sz, rx, rz }]
  // opts: collide (radius, scaled), collideY, shadow, toon, thin (fewer on low settings),
  //       view (draw distance in metres), minDetail
  place(name, items, opts = {}) {
    if (!items.length) return null;
    if (opts.minDetail && this.quality.detail < opts.minDetail) return null;
    const model = this.assets && this.assets.merged(name);
    if (!model) { console.warn('[props] missing model', name); return null; }
    // solid props never stand on a road (at their own height), unless a map puts them
    // there on purpose (opts.inRoad), e.g. bushes to weave through on a shortcut
    if (opts.collide && this.world && !opts.inRoad) {
      items = items.filter((it) => { const e = this.world.edge(it.x, it.y ?? 0, it.z, 0, {}); return !e || e.excess > -0.2; });
      if (!items.length) return null;
    }
    // colliders use every item, even ones thinned out on low settings
    if (opts.collide && this.world) {
      for (const it of items) {
        const s = it.s || 1;
        this.world.addCircle({ x: it.x, z: it.z, r: opts.collide * (it.sx || s), y0: it.y - 1, y1: it.y + (opts.collideY || 4) * (it.sy || s), kind: name });
      }
    }
    if (opts.thin && this.quality.detail < 1) items = items.filter((_, i) => ((i * 7919) % 100) < this.quality.detail * 100);
    const out = new THREE.Group();
    out.name = 'props_' + name;
    const cells = new Map();
    if (opts.animated) cells.set('all', items);
    else for (const it of items) {
      const k = Math.floor(it.x / CHUNK) + ',' + Math.floor(it.z / CHUNK);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(it);
    }
    const shadow = opts.shadow !== false && this.quality.detail >= 0.8;
    for (const list of cells.values()) {
      for (const part of model.parts) {
        const mat = part.glow ? vcMaterial({ toon: false, emissive: part.glow }) : vcMaterial({ toon: opts.toon !== false && this.quality.toon });
        const im = new THREE.InstancedMesh(part.geometry, mat, list.length);
        im.name = name;
        im.castShadow = shadow && !part.glow;
        list.forEach((it, i) => im.setMatrixAt(i, matrixOf(it)));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        out.add(im);
        if (!opts.animated) {
          const bs = im.boundingSphere;
          this.chunks.push({ mesh: im, x: bs.center.x, z: bs.center.z, r: bs.radius, view: opts.view || 0 });
        }
      }
    }
    this.group.add(out);
    return out;
  }

  // a single (non-instanced) copy that keeps its parts, e.g. a windmill with turning sails
  single(name, it, opts = {}) {
    const obj = this.assets && this.assets.clone(name);
    if (!obj) { console.warn('[props] missing model', name); return null; }
    obj.position.set(it.x, it.y, it.z);
    obj.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    obj.scale.setScalar(it.s || 1);
    obj.traverse((o) => { if (o.isMesh) o.castShadow = opts.shadow !== false; });
    this.group.add(obj);
    if (opts.collide && this.world) this.world.addCircle({ x: it.x, z: it.z, r: opts.collide * (it.s || 1), y0: it.y - 1, y1: it.y + (opts.collideY || 6) * (it.s || 1), kind: name });
    return obj;
  }

  // hide chunks that are further away than their draw distance
  update(cam, viewDistance) {
    for (const c of this.chunks) {
      const d = Math.hypot(c.x - cam.x, c.z - cam.z) - c.r;
      c.mesh.visible = d < (c.view ? Math.min(c.view, viewDistance) : viewDistance);
    }
  }
}

export function matrixOf(it, target = _m) {
  _p.set(it.x, it.y || 0, it.z);
  _e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
  _q.setFromEuler(_e);
  const s = it.s || 1;
  _s.set(it.sx || s, it.sy || s, it.sz || s);
  return target.compose(_p, _q, _s);
}
