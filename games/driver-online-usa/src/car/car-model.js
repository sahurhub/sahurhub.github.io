// Driver Online USA - car models (GLB files made by tools/blender/do_car.py, see docs/CAR-SETUP.md).
//
// What the game looks for in a car file (names are exact):
//   LOD0 .. LOD3          groups: full detail (with interior) down to a tiny far-away version
//     INT_*               interior parts inside LOD0 (hidden in third person / far away)
//     STEERING_WHEEL      turns with the steering (extras do_center / do_axis give the hub and column)
//     HOOD_HIDE_*         parts hidden in the hood camera
//   WHEEL_FL/FR/RL/RR     empties at each wheel centre, with WHEEL_xx_LOD0..2 meshes inside
//   CAM_COCKPIT, CAM_HOOD empties for the cockpit and hood cameras
//   materials LIGHT_HEAD, LIGHT_BRAKE, LIGHT_REVERSE, LIGHT_IND_L, LIGHT_IND_R, GLASS*
// Anything missing gets a sensible fallback and a warning in the console.
import * as THREE from 'three';
import { loadGLB, loadJSON } from '../core/assets.js';
import { asset } from '../config.js';

let catalog = null;
export async function loadCatalog() {
  if (!catalog) catalog = await loadJSON(asset('cars/cars.json'));
  return catalog;
}
export function getCatalog() { return catalog; }
export function carSpec(id) {
  const list = (catalog && catalog.cars) || [];
  return list.find((c) => c.id === id) || list[0];
}

const templates = new Map();
const WHEELS = ['FL', 'FR', 'RL', 'RR'];
export const LOD_DIST = [150, 300, 600]; // metres: LOD0 up to 150 m, LOD1 to 300 m, ...

/** Load and prepare a car type once; every car of that type shares its meshes. */
export function loadCarTemplate(id, onProgress) {
  const spec = carSpec(id);
  if (!spec) return Promise.reject(new Error('No cars are set up yet.'));
  if (templates.has(spec.id)) return templates.get(spec.id);
  const p = loadGLB(asset('cars/' + spec.file), onProgress).then((gltf) => prepare(spec, gltf.scene));
  templates.set(spec.id, p);
  p.catch(() => templates.delete(spec.id));
  return p;
}

function prepare(spec, scene) {
  const warnings = [];
  const find = (name) => scene.getObjectByName(name);
  const lods = [0, 1, 2, 3].map((i) => find('LOD' + i)).filter(Boolean);
  if (!lods.length) throw new Error(`Car ${spec.id} has no LOD0 group.`);
  scene.updateMatrixWorld(true);

  // wheels: centre and radius in car space
  const wheels = [];
  for (const k of WHEELS) {
    const w = find('WHEEL_' + k);
    if (!w) { warnings.push(`missing WHEEL_${k}`); continue; }
    const box = new THREE.Box3().setFromObject(w);
    const size = box.getSize(new THREE.Vector3());
    const c = new THREE.Vector3(); w.getWorldPosition(c);
    wheels.push({ key: k, x: c.x, y: c.y, z: c.z, r: Math.max(0.2, size.y / 2), w: size.x });
  }
  const lod0 = lods[0];
  const box = new THREE.Box3();
  lod0.traverse((o) => { if (o.isMesh && !/^INT_/.test(o.name)) box.expandByObject(o); });
  for (const k of WHEELS) { const w = find('WHEEL_' + k); if (w) box.expandByObject(w); }
  if (wheels.length < 4) {
    // no separate wheels: guess them from the body box so the car can still drive
    warnings.push('wheels guessed from the body size');
    const r = 0.34, x = (box.max.x - box.min.x) / 2 - 0.25, zf = box.min.z + (box.max.z - box.min.z) * 0.2, zr = box.max.z - (box.max.z - box.min.z) * 0.2;
    wheels.length = 0;
    wheels.push({ key: 'FL', x: -x, y: r, z: zf, r }, { key: 'FR', x, y: r, z: zf, r }, { key: 'RL', x: -x, y: r, z: zr, r }, { key: 'RR', x, y: r, z: zr, r });
  }
  const geo = { wheels, box: { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z } };

  // camera anchors
  const anchors = {};
  const width = box.max.x - box.min.x, length = box.max.z - box.min.z, height = box.max.y - box.min.y;
  for (const [name, key, fallback] of [
    ['CAM_COCKPIT', 'cockpit', new THREE.Vector3(-width * 0.2, height * 0.78, box.min.z + length * 0.52)],
    ['CAM_HOOD', 'hood', new THREE.Vector3(0, height * 0.72, box.min.z + length * 0.3)],
  ]) {
    const o = find(name);
    if (o) { anchors[key] = new THREE.Vector3(); o.getWorldPosition(anchors[key]); }
    else { anchors[key] = fallback; warnings.push(`missing ${name} (using a default position)`); }
  }

  // materials: glass looks right from every side, lights are found by name
  const lightNames = new Set();
  let hasInterior = false, hasSteering = false;
  scene.traverse((o) => {
    if (/^INT_/.test(o.name)) hasInterior = true;
    if (o.name === 'STEERING_WHEEL') hasSteering = true;
    if (!o.isMesh) return;
    o.frustumCulled = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (/^GLASS/i.test(m.name)) {
        m.transparent = true; m.depthWrite = false;
        m.opacity = Math.min(m.opacity, 0.42); m.roughness = 0.05; m.metalness = 0.1;
        m.envMapIntensity = 1.6;
        o.renderOrder = 2;
      }
      if (/^LIGHT_/.test(m.name)) lightNames.add(m.name.replace(/\.\d+$/, ''));
    }
  });
  if (!hasInterior) warnings.push('no interior (INT_ parts)');
  if (!hasSteering) warnings.push('no STEERING_WHEEL');
  for (const n of ['LIGHT_HEAD', 'LIGHT_BRAKE']) if (![...lightNames].some((x) => x.startsWith(n))) warnings.push(`no ${n} material`);
  if (warnings.length) console.warn(`[car ${spec.id}] ` + warnings.join('; '));
  return { spec, scene, geo, anchors, warnings, lightNames, hasIndicators: [...lightNames].some((x) => x.startsWith('LIGHT_IND')) };
}

// ---------------------------------------------------------------------------------------
const glowTex = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size);
  s.visible = false;
  return s;
}

/** One car in the world: drawing only (physics lives in physics/vehicle.js). */
export class CarView {
  constructor(template, { local = false, shadows = false } = {}) {
    this.t = template;
    this.spec = template.spec;
    this.local = local;
    this.root = new THREE.Group();
    this.root.name = 'car-' + this.spec.id;
    const model = template.scene.clone(true);
    this.model = model;
    this.root.add(model);
    const find = (name) => model.getObjectByName(name);
    this.lods = [0, 1, 2, 3].map((i) => find('LOD' + i)).filter(Boolean);
    this.lod = -1;
    this.interior = [];
    this.hoodHide = [];
    this.bodyMeshes = [];
    this.lights = {}; // name -> [materials]
    this.lightOn = {};
    const matClones = new Map();
    model.traverse((o) => {
      if (/^INT_/.test(o.name)) this.interior.push(o);
      if (/^HOOD_HIDE/.test(o.name)) this.hoodHide.push(o);
      if (!o.isMesh) return;
      o.castShadow = shadows;
      o.receiveShadow = false;
      // per-car copies of light materials so each car's lights work on their own
      const swap = (m) => {
        if (!m || !/^LIGHT_/.test(m.name)) return m;
        if (!matClones.has(m)) {
          const c = m.clone();
          const key = m.name.replace(/\.\d+$/, '').replace(/_\d+$/, '');
          (this.lights[key] || (this.lights[key] = [])).push(c);
          c.userData.baseEmissive = (m.emissive ? m.emissive.clone() : new THREE.Color(0));
          matClones.set(m, c);
        }
        return matClones.get(m);
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    if (this.lods[0]) this.lods[0].traverse((o) => { if (o.isMesh && !/^INT_/.test(o.name) && !/^INT_/.test(o.parent && o.parent.name)) this.bodyMeshes.push(o); });

    // wheels: steer pivot -> spin pivot -> meshes (brake calipers steer but don't spin).
    // Extra axles (e.g. a 6-wheel truck: WHEEL_ML / WHEEL_MR) spin like the rear wheels.
    this.wheels = [];
    this.extraWheels = [];
    const makeWheel = (k, w) => {
      const steer = new THREE.Group(), spin = new THREE.Group();
      steer.position.copy(w.position);
      w.parent.add(steer);
      steer.add(spin);
      for (const kid of [...w.children]) (/CALIPER/.test(kid.name) ? steer : spin).add(kid);
      w.parent.remove(w);
      const lodMeshes = [0, 1, 2].map((i) => spin.getObjectByName(`WHEEL_${k}_LOD${i}`)).filter(Boolean);
      const calipers = steer.children.filter((c) => /CALIPER/.test(c.name));
      return { key: k, steer, spin, baseY: w.position.y, lodMeshes, calipers, front: k[0] === 'F' };
    };
    for (const k of WHEELS) {
      const w = find('WHEEL_' + k);
      const info = template.geo.wheels.find((x) => x.key === k);
      this.wheels.push(w && info ? makeWheel(k, w) : null);
    }
    for (const k of ['ML', 'MR', 'RL2', 'RR2']) {
      const w = find('WHEEL_' + k);
      if (w) this.extraWheels.push(makeWheel(k, w));
    }
    // steering wheel turns around its column
    const sw = find('STEERING_WHEEL');
    if (sw) {
      const ex = sw.userData || {};
      const centre = ex.do_center ? new THREE.Vector3().fromArray(ex.do_center) : new THREE.Box3().setFromObject(sw).getCenter(new THREE.Vector3());
      const axis = ex.do_axis ? new THREE.Vector3().fromArray(ex.do_axis).normalize() : new THREE.Vector3(0, 0.35, 1).normalize();
      const pivot = new THREE.Group();
      model.updateMatrixWorld(true);
      pivot.position.copy(centre);
      model.add(pivot);
      pivot.updateMatrixWorld(true);
      pivot.attach(sw);
      this.steeringWheel = { pivot, axis, q: new THREE.Quaternion() };
    }
    // indicator glows if the car has no indicator materials (and to make all lights visible far away)
    const b = template.geo.box;
    const hw = (b.maxX - b.minX) / 2 - 0.12, yF = b.minY + (b.maxY - b.minY) * 0.42, yR = b.minY + (b.maxY - b.minY) * 0.48;
    this.glows = {
      indFL: glowSprite(0xffa020, 0.5), indFR: glowSprite(0xffa020, 0.5), indRL: glowSprite(0xffa020, 0.5), indRR: glowSprite(0xffa020, 0.5),
      headL: glowSprite(0xfff4dd, 1.1), headR: glowSprite(0xfff4dd, 1.1), brakeL: glowSprite(0xff2010, 0.8), brakeR: glowSprite(0xff2010, 0.8),
    };
    const G = this.glows;
    G.indFL.position.set(-hw, yF, b.minZ + 0.1); G.indFR.position.set(hw, yF, b.minZ + 0.1);
    G.indRL.position.set(-hw, yR, b.maxZ - 0.1); G.indRR.position.set(hw, yR, b.maxZ - 0.1);
    G.headL.position.set(-hw + 0.2, yF, b.minZ - 0.05); G.headR.position.set(hw - 0.2, yF, b.minZ - 0.05);
    G.brakeL.position.set(-hw + 0.1, yR, b.maxZ + 0.05); G.brakeR.position.set(hw - 0.1, yR, b.maxZ + 0.05);
    for (const s of Object.values(G)) this.root.add(s);
    this.blink = 0;
    this.dents = null;
    this.setLOD(0);
  }

  get anchors() { return this.t.anchors; }

  setLOD(level) {
    level = Math.min(level, this.lods.length - 1);
    if (level === this.lod) return;
    this.lod = level;
    this.lods.forEach((g, i) => { g.visible = i === level; });
    for (const w of [...this.wheels, ...this.extraWheels]) {
      if (!w) continue;
      w.lodMeshes.forEach((m, i) => { m.visible = i === Math.min(level, w.lodMeshes.length - 1); });
      for (const c of w.calipers) c.visible = level === 0;
      w.steer.visible = level < 3;
    }
  }

  /** distance = from the camera. Players' cars stay full detail within 150 m. */
  updateLOD(distance) {
    const l = distance < LOD_DIST[0] ? 0 : distance < LOD_DIST[1] ? 1 : distance < LOD_DIST[2] ? 2 : 3;
    this.setLOD(l);
    this.root.visible = distance < 1500;
  }

  setInteriorVisible(on) { for (const o of this.interior) o.visible = on; }
  setHoodHidden(on) { for (const o of this.hoodHide) o.visible = !on; }

  /**
   * v = { wheels: [{ spin, steer, len }], steer (-1..1), lights, brake, reverse, indL, indR, hazard, dt, restLen }
   */
  updateParts(v) {
    const dt = v.dt || 0.016;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i], s = v.wheels && v.wheels[i];
      if (!w || !s) continue;
      w.spin.rotation.x = -s.spin;
      w.steer.rotation.y = -(s.steer || 0);
      w.steer.position.y = w.baseY + Math.max(-0.12, Math.min(0.1, (v.restLen || 0.22) - s.len));
    }
    // extra axles copy the rear wheels
    const rear = v.wheels && v.wheels[2];
    for (const w of this.extraWheels) if (rear) { w.spin.rotation.x = -rear.spin; w.steer.position.y = w.baseY + Math.max(-0.12, Math.min(0.1, (v.restLen || 0.22) - rear.len)); }
    if (this.steeringWheel) {
      const sw = this.steeringWheel;
      sw.q.setFromAxisAngle(sw.axis, -(v.steer || 0) * 7);
      sw.pivot.quaternion.copy(sw.q);
    }
    this.blink = (this.blink + dt) % 0.8;
    const blinkOn = this.blink < 0.42;
    const lightsOn = !!v.lights && !this.spec.noLights; // race cars have no headlights
    const indL = (v.indL || v.hazard) && blinkOn, indR = (v.indR || v.hazard) && blinkOn;
    this.setLight('LIGHT_HEAD', lightsOn ? 3 : 0, 0xfff1d6);
    this.setLight('LIGHT_BRAKE', v.brake ? 3.2 : lightsOn ? 0.9 : 0, 0xff1a0a);
    this.setLight('LIGHT_TAIL', lightsOn || v.brake ? 1.2 : 0, 0xff1a0a);
    this.setLight('LIGHT_REVERSE', v.reverse ? 2 : 0, 0xffffff);
    this.setLight('LIGHT_IND_L', indL ? 3 : 0, 0xff9a10);
    this.setLight('LIGHT_IND_R', indR ? 3 : 0, 0xff9a10);
    const G = this.glows, far = this.lod >= 1;
    const hasInd = this.t.hasIndicators;
    G.indFL.visible = G.indRL.visible = indL && (!hasInd || far);
    G.indFR.visible = G.indRR.visible = indR && (!hasInd || far);
    const names = this.t.lightNames;
    const hasHead = [...names].some((n) => n.startsWith('LIGHT_HEAD')), hasBrake = [...names].some((n) => n.startsWith('LIGHT_BRAKE'));
    G.headL.visible = G.headR.visible = lightsOn && (far || !hasHead);
    G.brakeL.visible = G.brakeR.visible = (v.brake || lightsOn) && (far || !hasBrake);
    const bs = v.brake ? 1 : 0.55;
    G.brakeL.material.opacity = G.brakeR.material.opacity = bs;
  }

  setLight(name, intensity, color) {
    const on = intensity > 0;
    const key = name + ':' + intensity;
    if (this.lightOn[name] === key) return;
    this.lightOn[name] = key;
    for (const [k, mats] of Object.entries(this.lights)) {
      if (!k.startsWith(name)) continue;
      for (const m of mats) {
        if (!m.emissive) continue;
        if (on) { m.emissive.setHex(color); m.emissiveIntensity = intensity; }
        else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = 1; }
      }
    }
  }

  // ---- dents -----------------------------------------------------------------------
  /** p, d in car space; s 0..1. Pushes the body in around p along d. */
  addDent(p, d, s) {
    if (!this.dents) {
      this.dents = [];
      for (const m of this.bodyMeshes) {
        const g = m.geometry.clone();
        const pos = g.attributes.position;
        const arr = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) { arr[i * 3] = pos.getX(i); arr[i * 3 + 1] = pos.getY(i); arr[i * 3 + 2] = pos.getZ(i); }
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        if (g.attributes.normal && g.attributes.normal.normalized) {
          const n = g.attributes.normal, na = new Float32Array(n.count * 3);
          for (let i = 0; i < n.count; i++) { na[i * 3] = n.getX(i); na[i * 3 + 1] = n.getY(i); na[i * 3 + 2] = n.getZ(i); }
          g.setAttribute('normal', new THREE.BufferAttribute(na, 3));
        }
        m.geometry = g;
        this.dents.push({ mesh: m, orig: arr.slice() });
      }
    }
    const depth = 0.03 + 0.11 * s, radius = 0.3 + 0.35 * s;
    this.model.updateMatrixWorld(true);
    const P = new THREE.Vector3(), D = new THREE.Vector3(), inv = new THREE.Matrix4();
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    for (const dn of this.dents) {
      const m = dn.mesh;
      // car space -> mesh space
      inv.copy(m.matrixWorld).invert().multiply(this.root.matrixWorld);
      P.set(p[0], p[1], p[2]).applyMatrix4(inv);
      D.set(d[0], d[1], d[2]).transformDirection(inv);
      const sc = new THREE.Vector3().setFromMatrixScale(inv);
      const r = radius * sc.x, dep = depth * sc.x, cap = 0.16 * sc.x;
      const g = m.geometry, arr = g.attributes.position.array, o = dn.orig;
      let touched = false;
      for (let i = 0; i < arr.length; i += 3) {
        const dx = arr[i] - P.x, dy = arr[i + 1] - P.y, dz = arr[i + 2] - P.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r * r) continue;
        const f = 1 - d2 / (r * r);
        const k = dep * f * f;
        let nx = arr[i] + D.x * k, ny = arr[i + 1] + D.y * k, nz = arr[i + 2] + D.z * k;
        const ox = nx - o[i], oy = ny - o[i + 1], oz = nz - o[i + 2], ol = Math.sqrt(ox * ox + oy * oy + oz * oz);
        if (ol > cap) { nx = o[i] + (ox / ol) * cap; ny = o[i + 1] + (oy / ol) * cap; nz = o[i + 2] + (oz / ol) * cap; }
        arr[i] = nx; arr[i + 1] = ny; arr[i + 2] = nz;
        touched = true;
      }
      if (touched) { g.attributes.position.needsUpdate = true; dn.dirty = true; }
    }
    void rootInv;
    clearTimeout(this.normalTimer);
    this.normalTimer = setTimeout(() => {
      for (const dn of this.dents || []) if (dn.dirty) { dn.mesh.geometry.computeVertexNormals(); dn.mesh.geometry.computeBoundingSphere(); dn.dirty = false; }
    }, 250);
  }

  repair() {
    if (!this.dents) return;
    for (const dn of this.dents) {
      const g = dn.mesh.geometry;
      g.attributes.position.array.set(dn.orig);
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    }
  }

  dispose() {
    clearTimeout(this.normalTimer);
    if (this.root.parent) this.root.parent.remove(this.root);
    if (this.dents) for (const dn of this.dents) dn.mesh.geometry.dispose();
    for (const mats of Object.values(this.lights)) for (const m of mats) m.dispose();
    for (const s of Object.values(this.glows)) s.material.dispose();
  }
}
