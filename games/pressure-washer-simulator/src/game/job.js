// One job in the world: builds the scenery and washable objects from the job's GLB, the collision
// boxes, the tap and step platforms, and keeps track of the cleaning progress.
import * as THREE from 'three';
import { bakeNode, sceneMaterial } from '../render/assets.js';
import { makeWashMaterial, LAYER } from '../render/washmat.js';
import { WashSurface, DONE_AT } from './dirt.js';
import { makeBox } from './player.js';

export const FINISH_AT = 0.95; // the job can be finished from here (Enter); 100% finishes it by itself

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();

export class Job {
  constructor(app, def, gltf, models) {
    this.app = app;
    this.def = def;
    this.id = def.id;
    this.group = new THREE.Group();
    this.group.name = 'job_' + def.id;
    this.surfaces = [];
    this.rayTargets = [];
    this.boxes = [];
    this.hideBoxes = [];
    this.points = {};
    this.platforms = [];
    this.geos = [];
    this.mats = [];
    this.time = 0;
    this.started = false;
    this.state = 'idle'; // idle | play | done
    gltf.updateMatrixWorld(true);
    const root = gltf.children.find((o) => /root$/.test(o.name)) || gltf;
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const strip = (n) => n.replace(/^j\d+_/, '');
    for (const node of root.children) {
      const name = strip(node.name);
      _m.multiplyMatrices(inv, node.matrixWorld);
      _m.decompose(_p, _q, _s);
      const yaw = _e.setFromQuaternion(_q, 'YXZ').y;
      if (name.startsWith('col_')) {
        const b = makeBox(_p.x, _p.z, _s.x / 2, _s.z / 2, yaw, _p.y - _s.y / 2, _p.y + _s.y / 2);
        this.boxes.push(b);
        if (name.endsWith('h') || (def.hideCols && def.hideCols.includes(name))) this.hideBoxes.push(b);
      } else if (name === 'bounds') {
        this.bounds = { x0: _p.x - _s.x / 2, z0: _p.z - _s.z / 2, x1: _p.x + _s.x / 2, z1: _p.z + _s.z / 2 };
      } else if (name === 'bg') {
        const baked = bakeNode(node, false, inv);
        if (!baked) continue;
        const mesh = new THREE.Mesh(baked.geo, baked.keys.map((k) => sceneMaterial(k)));
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        this.rayTargets.push(mesh);
        this.geos.push(baked.geo);
      } else if (name.startsWith('w_')) {
        const baked = bakeNode(node, true, inv);
        if (!baked) continue;
        const wd = (def.objects && def.objects[name]) || { name };
        const surf = new WashSurface(name, wd, baked.geo);
        const kind = wd.layer ? LAYER[wd.layer.kind] || 0 : 0;
        const mats = baked.keys.map((k) => makeWashMaterial(k, surf.uniforms, kind));
        const mesh = new THREE.Mesh(baked.geo, mats);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.userData.surface = surf;
        surf.mesh = mesh;
        this.group.add(mesh);
        this.rayTargets.push(mesh);
        this.surfaces.push(surf);
        this.geos.push(baked.geo);
        this.mats.push(...mats);
      } else if (name.startsWith('platform')) {
        this.platforms.push({ x: _p.x, z: _p.z, yaw });
      } else {
        this.points[name] = { x: _p.x, y: _p.y, z: _p.z, yaw, scale: _s.x };
      }
    }
    if (!this.bounds) this.bounds = { x0: -10, z0: -10, x1: 10, z1: 10 };
    // the tap
    const tp = this.points.tap;
    if (tp && models.pw_tap) {
      const t = cloneStatic(models.pw_tap);
      // the tap faces where the player starts
      const sp = this.points.spawn || { x: tp.x, z: tp.z + 1 };
      const yawT = Math.atan2(sp.x - tp.x, sp.z - tp.z);
      t.position.set(tp.x, 0, tp.z); t.rotation.y = yawT;
      this.group.add(t);
      this.tap = { x: tp.x + Math.sin(yawT) * 0.3, z: tp.z + Math.cos(yawT) * 0.3 };
      this.tapObj = t;
    }
    // step platforms: two steps (0.45 m and 0.9 m) and rails at the back and sides
    for (const pf of this.platforms) {
      if (models.pw_platform) {
        const o = cloneStatic(models.pw_platform);
        o.position.set(pf.x, 0, pf.z); o.rotation.y = pf.yaw;
        this.group.add(o);
        this.rayTargets.push(...meshesOf(o));
      }
      const c = Math.cos(pf.yaw), s = Math.sin(pf.yaw);
      const at = (lx, lz) => [pf.x + lx * c + lz * s, pf.z - lx * s + lz * c];
      const add = (lx, lz, hx, hz, y0, y1, hide) => { const [x, z] = at(lx, lz); const b = makeBox(x, z, hx, hz, pf.yaw, y0, y1); this.boxes.push(b); if (hide) this.hideBoxes.push(b); };
      add(0, 0.32, 0.55, 0.18, 0, 0.45, true);
      add(0, -0.18, 0.55, 0.32, 0, 0.9, true);
      add(0, -0.5, 0.56, 0.03, 0.9, 1.9);
      add(-0.56, -0.18, 0.03, 0.33, 0.9, 1.9);
      add(0.56, -0.18, 0.03, 0.33, 0.9, 1.9);
    }
    this.app.R.scene.add(this.group);
    this.total = 0;
    this.resetDirt();
  }

  // Texels nobody can reach don't count: ground under solid things (car, ramps, plinth...), and anything
  // facing straight into a wall or solid object close by (the back of the bin, the back of the garage door).
  hidden(x, y, z, nx, ny, nz) {
    const inBox = (b, px, py, pz, m) => {
      if (py < b.y0 - m || py > b.y1 + m) return false;
      const dx = px - b.cx, dz = pz - b.cz;
      const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      return Math.abs(lx) < b.hx + m && Math.abs(lz) < b.hz + m;
    };
    if (ny > 0.7) {
      for (const b of this.hideBoxes) {
        if (y > b.y0 + 0.12) continue;
        const dx = x - b.cx, dz = z - b.cz;
        const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
        if (Math.abs(lx) < b.hx - 0.03 && Math.abs(lz) < b.hz - 0.03) return true;
      }
    }
    // probe 0.4 m out along the normal; boxes the texel itself sits in (its own object) don't count
    const px = x + nx * 0.4, py = y + ny * 0.4, pz = z + nz * 0.4;
    for (const b of this.boxes) {
      if (inBox(b, x, y, z, 0.03)) continue;
      if (inBox(b, px, py, pz, -0.02)) return true;
    }
    return false;
  }

  resetDirt() {
    const opts = { seed: this.def.seed || 1, groundY: 0, reachTop: this.def.reachTop || 2.8, hidden: (x, y, z, nx, ny, nz) => this.hidden(x, y, z, nx, ny, nz) };
    this.total = 0;
    for (const s of this.surfaces) { s.initDirt(opts); s.flash = 0; s.uniforms.uFlash.value = 0; this.total += s.total; }
    this.time = 0;
    this.started = false;
    this.state = 'idle';
    this.uploadAll();
  }

  uploadAll() { for (const s of this.surfaces) s.upload(); }

  get progress() {
    let c = 0, t = 0;
    for (const s of this.surfaces) { c += Math.min(s.clean, s.total); t += s.total; }
    return t ? c / t : 1;
  }

  get allDone() { return this.surfaces.every((s) => s.done); }

  // returns events: [{ type: 'done', surface }]
  update(dt, uploads = 3) {
    const ev = [];
    if (this.state === 'play' && this.started) this.time += dt;
    for (const s of this.surfaces) {
      if (!s.done && s.total && s.progress >= DONE_AT) { s.finishOff(); ev.push({ type: 'done', surface: s }); }
      if (s.flash > 0) { s.flash = Math.max(0, s.flash - dt * 1.4); s.uniforms.uFlash.value = s.flash * s.flash * 0.7; }
    }
    // mask uploads: a few per frame, round robin
    let n = 0;
    const L = this.surfaces.length;
    this.rr = this.rr || 0;
    for (let k = 0; k < L && n < uploads; k++) {
      const s = this.surfaces[(this.rr + k) % L];
      if (s.upload()) n++;
    }
    this.rr = (this.rr + 1) % Math.max(1, L);
    return ev;
  }

  refreshShadow() { this.app.env.refreshShadow(); }

  centre() {
    const c = this.points.cam;
    if (c) return { x: c.x, y: c.y, z: c.z, r: c.scale || 10 };
    const b = this.bounds;
    return { x: (b.x0 + b.x1) / 2, y: 1, z: (b.z0 + b.z1) / 2, r: 10 };
  }

  dispose() {
    this.app.R.scene.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const s of this.surfaces) s.dispose();
    this.surfaces = []; this.rayTargets = []; this.geos = []; this.mats = [];
  }
}

function cloneStatic(node) {
  const c = node.clone(true);
  c.position.set(0, 0, 0); c.quaternion.identity(); c.scale.set(1, 1, 1);
  c.traverse((o) => {
    if (!o.isMesh) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const k = ((mat && mat.name) || '').replace(/^pw_/, '').replace(/\.\d+$/, '') || 'plain';
    o.material = sceneMaterial(k === 'tint' ? 'paint' : k);
    o.castShadow = true; o.receiveShadow = true;
  });
  return c;
}

function meshesOf(o) { const out = []; o.traverse((m) => { if (m.isMesh) out.push(m); }); return out; }
