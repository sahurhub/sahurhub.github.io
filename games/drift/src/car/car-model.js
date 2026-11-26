// Drift! - car models (GLB files made by tools/blender/do_car.py, see docs/CAR-SETUP.md).
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
//   loose panels (Drift!, tools/blender/car_panels.py): nodes in LOD0 with extras
//     do_panel ("hood", "trunk", "doorFL"...), do_pivot + do_axis (the hinge), do_max (widest opening)
import * as THREE from 'three';
import { loadGLB, loadJSON } from '../core/assets.js';
import { asset } from '../config.js';
import { PANELS } from '../shared/protocol.js';

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
export const LOD_DIST = [150, 300, 600]; // metres: LOD0 up to 150 m, LOD1 to 300 m, ... (High)
// Other players' cars by graphics level. Each car is 30-60 draw calls close up (one per material) and
// 10-25 far away, so on Low (school Chromebooks) a full room near the spawn needs the simple models early.
const CAR_DETAIL = {
  // interior 0: the windows are black, so other cars' interiors only show with a door hanging open
  low: { lod: [15, 90, 250], hide: 800, interior: 0 },
  medium: { lod: [80, 220, 500], hide: 1200, interior: 0 },
  high: { lod: LOD_DIST, hide: 1500, interior: 0 },
};
let carDetail = CAR_DETAIL.high;
export function setCarDetail(level) { carDetail = CAR_DETAIL[level] || CAR_DETAIL.high; }
/** How close (m) another player's car must be before its interior is drawn (0 = only with a door open). */
export function remoteInteriorDist() { return carDetail.interior; }

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

  // windows are opaque black (the user asked); lamp lenses that share the glass material stay clear
  blackWindows(scene);
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
      // "transmission" glass makes three.js draw the whole scene a second time every frame a car with it
      // is on screen: plain see-through glass looks the same here (lamp lenses are simply solid)
      if (m.transmission > 0) { m.transmission = 0; if (!/^GLASS/i.test(m.name)) { m.transparent = false; m.depthWrite = true; } }
      // Low graphics (school Chromebooks): no clear-coat layer on the paint, a much cheaper shader
      if (carDetail === CAR_DETAIL.low && m.clearcoat > 0) m.clearcoat = 0;
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

// ---- windows ---------------------------------------------------------------------------
// Every car's windows are drawn as glossy black glass you can't see through. From the cockpit camera
// your own car's windows switch to a light see-through tint so you can still see out.
export const WINDOW_MAT = new THREE.MeshStandardMaterial({ name: 'WINDOW', color: 0x07090c, roughness: 0.07, metalness: 0.35, envMapIntensity: 1.4 });
const WINDOW_INSIDE = new THREE.MeshStandardMaterial({ name: 'WINDOW_INSIDE', color: 0x0d1116, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false });

/**
 * Give the window triangles of every GLASS material the black window material. Glass within 15 cm of a
 * light (LIGHT_* materials) is a headlight or tail-light lens and keeps the clear glass, so the lights
 * still show. Each glass group is re-ordered into "window" then "lens" triangles and split in two.
 */
function blackWindows(scene) {
  scene.updateMatrixWorld(true);
  const CELL = 0.2, R2 = 0.15 * 0.15, grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const centre = (o, idx, t) => {
    const pos = o.geometry.attributes.position;
    a.fromBufferAttribute(pos, idx ? idx.getX(t * 3) : t * 3);
    b.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 1) : t * 3 + 1);
    c.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 2) : t * 3 + 2);
    return a.add(b).add(c).divideScalar(3).applyMatrix4(o.matrixWorld);
  };
  const groupsOf = (o) => {
    const g = o.geometry, n = g.index ? g.index.count : g.attributes.position.count;
    return g.groups.length ? g.groups : [{ start: 0, count: n, materialIndex: 0 }];
  };
  const matOf = (o, grp) => (Array.isArray(o.material) ? o.material[grp.materialIndex] : o.material);
  // where the lights are
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const grp of groupsOf(o)) {
      const m = matOf(o, grp);
      if (!m || !/^LIGHT_/.test(m.name)) continue;
      for (let t = grp.start / 3; t < (grp.start + grp.count) / 3; t++) {
        const p = centre(o, o.geometry.index, t), k = key(p.x, p.y, p.z);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(p.x, p.y, p.z);
      }
    }
  });
  const nearLight = (p) => {
    const ix = Math.floor(p.x / CELL), iy = Math.floor(p.y / CELL), iz = Math.floor(p.z / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(`${ix + dx},${iy + dy},${iz + dz}`);
      if (!list) continue;
      for (let i = 0; i < list.length; i += 3) if ((list[i] - p.x) ** 2 + (list[i + 1] - p.y) ** 2 + (list[i + 2] - p.z) ** 2 < R2) return true;
    }
    return false;
  };
  // split the glass
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry.index) return;
    const g = o.geometry, idx = g.index, groups = groupsOf(o);
    if (!groups.some((grp) => { const m = matOf(o, grp); return m && /^GLASS/i.test(m.name); })) return;
    const mats = Array.isArray(o.material) ? o.material.slice() : [o.material];
    let wi = mats.indexOf(WINDOW_MAT);
    if (wi < 0) { mats.push(WINDOW_MAT); wi = mats.length - 1; }
    const out = [];
    for (const grp of groups) {
      const m = matOf(o, grp);
      if (!m || !/^GLASS/i.test(m.name)) { out.push(grp); continue; }
      const win = [], lens = [];
      for (let t = grp.start / 3; t < (grp.start + grp.count) / 3; t++) {
        const tri = [idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2)];
        (nearLight(centre(o, idx, t)) ? lens : win).push(tri);
      }
      let w = grp.start;
      for (const tri of [...win, ...lens]) { idx.setX(w, tri[0]); idx.setX(w + 1, tri[1]); idx.setX(w + 2, tri[2]); w += 3; }
      if (win.length) out.push({ start: grp.start, count: win.length * 3, materialIndex: wi });
      if (lens.length) out.push({ start: grp.start + win.length * 3, count: lens.length * 3, materialIndex: grp.materialIndex });
    }
    g.clearGroups();
    for (const grp of out) g.addGroup(grp.start, grp.count, grp.materialIndex);
    idx.needsUpdate = true;
    o.material = mats;
  });
}

/**
 * A wheel's real axle (and centre) in its holder's space. The tyre's two sidewalls are found all the way
 * round; the plane halfway between them is the wheel's face and the axle is square to it. Done three
 * times, each in the last answer's frame. Worked out once per car type and only used when it clearly
 * makes the tyre run truer than spinning about the holder's own sideways line.
 */
const WB = 36;
function wheelAxle(template, k, w) {
  const cache = template.wheelAxles || (template.wheelAxles = {});
  if (cache[k]) return cache[k];
  const none = (cache[k] = { c: new THREE.Vector3(), q: new THREE.Quaternion() });
  const pts = [];
  w.traverse((o) => {
    if (!o.isMesh || !/LOD0/.test(o.name + ' ' + (o.parent ? o.parent.name : ''))) return;
    const m = new THREE.Matrix4();
    const chain = [];
    for (let n = o; n && n !== w; n = n.parent) chain.unshift(n);
    for (const n of chain) { n.updateMatrix(); m.multiply(n.matrix); }
    const pa = o.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pa, i).applyMatrix4(m));
  });
  if (pts.length < 60) return none;
  let c = new THREE.Vector3(), q = new THREE.Quaternion();
  const before = tyreFit(pts, c, q);
  if (!before) return none;
  for (let it = 0; it < 3; it++) {
    const f = tyreFit(pts, c, q);
    if (!f) return none;
    q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), f.axle);
    c = f.centre;
  }
  const after = tyreFit(pts, c, q);
  const tilt = new THREE.Vector3(1, 0, 0).applyQuaternion(q).angleTo(new THREE.Vector3(1, 0, 0));
  // must swing much less side to side, and must not run more off-centre (hop) than before
  if (!after || tilt > 0.21 || after.wobble > Math.max(0.002, before.wobble * 0.5) || after.runout > before.runout + 0.001) return none;
  return (cache[k] = { c, q });
}

/** In the frame (centre c, rotation q, local x = axle): the tyre's side-to-side wobble over a turn (m),
 *  and the axle and centre that would remove it. */
function tyreFit(pts, c, q) {
  const iq = q.clone().invert(), v = new THREE.Vector3();
  let R = 0;
  const L = pts.map((p) => { v.copy(p).sub(c).applyQuaternion(iq); R = Math.max(R, Math.hypot(v.y, v.z)); return [v.x, v.y, v.z]; });
  const rmax = new Array(WB).fill(0), lo = new Array(WB).fill(1e9), hi = new Array(WB).fill(-1e9), rsum = new Array(WB).fill(0), rn = new Array(WB).fill(0);
  for (const [x, y, z] of L) {
    const r = Math.hypot(y, z), b = Math.floor((Math.atan2(z, y) + Math.PI) / (2 * Math.PI) * WB) % WB;
    rmax[b] = Math.max(rmax[b], r);
    if (r > R * 0.8) { lo[b] = Math.min(lo[b], x); hi[b] = Math.max(hi[b], x); rsum[b] += r; rn[b]++; }
  }
  // least squares: middle between the sidewalls = x0 + p*y + q*z
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bv = [0, 0, 0];
  let n = 0;
  for (let b = 0; b < WB; b++) {
    if (!rn[b]) continue;
    const mid = (lo[b] + hi[b]) / 2, r = rsum[b] / rn[b], a = (b + 0.5) / WB * 2 * Math.PI - Math.PI;
    const row = [1, r * Math.cos(a), r * Math.sin(a)];
    for (let i = 0; i < 3; i++) { bv[i] += row[i] * mid; for (let j = 0; j < 3; j++) A[i][j] += row[i] * row[j]; }
    n++;
  }
  if (n < WB * 0.6) return null;
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-12) return null;
  const s = [0, 1, 2].map((k) => det(A.map((row, i) => row.map((x, j) => (j === k ? bv[i] : x)))) / D);
  // the outline's centre (first harmonic of the tyre's radius all the way round)
  let cy = 0, cz = 0;
  rmax.forEach((r, b) => { const a = (b + 0.5) / WB * 2 * Math.PI - Math.PI; cy += r * Math.cos(a) * 2 / WB; cz += r * Math.sin(a) * 2 / WB; });
  return {
    wobble: Math.hypot(s[1], s[2]) * R * 2,
    runout: Math.hypot(cy, cz),
    axle: new THREE.Vector3(1, -s[1], -s[2]).normalize().applyQuaternion(q),
    centre: new THREE.Vector3(s[0], cy, cz).applyQuaternion(q).add(c),
  };
}

// scratch vectors for the panel swing maths
const PT = {
  v: new THREE.Vector3(), a: new THREE.Vector3(), w: new THREE.Vector3(), dq: new THREE.Quaternion(), iq: new THREE.Quaternion(),
  aL: new THREE.Vector3(), vL: new THREE.Vector3(), wL: new THREE.Vector3(), gL: new THREE.Vector3(),
  r: new THREE.Vector3(), rc: new THREE.Vector3(), f: new THREE.Vector3(), cf: new THREE.Vector3(), sa: new THREE.Vector3(), tq: new THREE.Vector3(),
};

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
    // black window slots (see blackWindows); see-through only while the camera is inside this car
    this.windowSlots = [];
    model.traverse((o) => { if (o.isMesh && Array.isArray(o.material)) o.material.forEach((m, i) => { if (m === WINDOW_MAT) this.windowSlots.push([o, i]); }); });
    this.insideView = false;

    // wheels: steer pivot -> spin pivot -> meshes (brake calipers steer but don't spin).
    // Extra axles (e.g. a 6-wheel truck: WHEEL_ML / WHEEL_MR) spin like the rear wheels.
    this.wheels = [];
    this.extraWheels = [];
    const makeWheel = (k, w) => {
      // steer pivot -> axle (the tyre's real axle: many models have tilted wheels, which wobbled
      // when spun about a straight sideways line) -> spin -> meshes
      const steer = new THREE.Group(), axle = new THREE.Group(), spin = new THREE.Group();
      steer.position.copy(w.position);
      w.parent.add(steer);
      steer.add(axle);
      axle.add(spin);
      const fix = wheelAxle(template, k, w);
      axle.position.copy(fix.c);
      axle.quaternion.copy(fix.q);
      axle.updateMatrix();
      const toAxle = new THREE.Matrix4().copy(axle.matrix).invert();
      for (const kid of [...w.children]) {
        if (/CALIPER/.test(kid.name)) { steer.add(kid); continue; }
        kid.updateMatrix();
        kid.matrix.premultiply(toAxle);
        kid.matrix.decompose(kid.position, kid.quaternion, kid.scale);
        spin.add(kid);
      }
      // a wheel leaning more than 4 degrees (the F1 car's fronts lean 9) looks broken: stand it upright
      if (new THREE.Vector3(1, 0, 0).applyQuaternion(fix.q).angleTo(new THREE.Vector3(1, 0, 0)) > 0.07) axle.quaternion.identity();
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
    this.intWanted = false; this.doorsOpen = false;
    this.setupPanels();
    this.setLOD(0);
  }

  // ---- loose panels ------------------------------------------------------------------
  // Bonnet, boot and doors hang on hinges. A big hit breaks one loose (the local car decides and sends
  // the panels byte, everyone else follows it). Loose panels swing with the car's movement: braking,
  // turning, drifting, bumps, and the wind at speed (it lifts a loose bonnet, pushes open doors shut).
  setupPanels() {
    this.panels = {};
    this.panelBits = 0;
    const lod0 = this.lods[0];
    if (!lod0) return;
    this.model.updateMatrixWorld(true);
    const tagged = [];
    lod0.traverse((o) => { if (o !== lod0 && o.userData && o.userData.do_panel && PANELS.includes(o.userData.do_panel)) tagged.push(o); });
    const inv = new THREE.Matrix4().copy(lod0.matrixWorld).invert();
    for (const o of tagged) {
      const key = o.userData.do_panel, ud = o.userData;
      let P = this.panels[key];
      if (!P) {
        const pivot = new THREE.Group();
        pivot.position.fromArray(ud.do_pivot || [0, 0, 0]);
        lod0.add(pivot);
        pivot.updateMatrixWorld(true);
        P = this.panels[key] = {
          key, bit: 1 << PANELS.indexOf(key), pivot, axis: new THREE.Vector3().fromArray(ud.do_axis || [1, 0, 0]).normalize(),
          max: ud.do_max || 1.1, sign: 1, angle: 0, vel: 0, loose: false, hp: 1, door: key.startsWith('door'),
          rest: key === 'hood' ? 0.1 : key === 'trunk' ? 0.06 : 0, r0: new THREE.Vector3(), I: 1, zMin: 0, zMax: 0, parts: [],
        };
      }
      P.parts.push(o);
      P.pivot.attach(o);
    }
    // centre of each panel from its hinge (model space), its swing inertia, and which way is "open"
    const box = new THREE.Box3(), c = new THREE.Vector3(), r1 = new THREE.Vector3();
    for (const P of Object.values(this.panels)) {
      box.makeEmpty();
      for (const o of P.parts) if (!/^INT_/.test(o.name)) box.expandByObject(o);
      if (box.isEmpty()) for (const o of P.parts) box.expandByObject(o);
      box.getCenter(c).applyMatrix4(inv);
      P.zMin = box.min.z; P.zMax = box.max.z;
      P.r0.copy(c).sub(P.pivot.position);
      P.I = Math.max(0.05, P.r0.lengthSq() * 1.33);
      r1.copy(P.r0).applyAxisAngle(P.axis, 0.3);
      if (P.door) P.sign = Math.abs(P.pivot.position.x + r1.x) > Math.abs(P.pivot.position.x + P.r0.x) ? 1 : -1;
      else P.sign = r1.y > P.r0.y ? 1 : -1;
    }
  }

  get hasPanels() { return Object.keys(this.panels).length > 0; }

  /** Which panel a hit at p (car space) of strength s (0..1) breaks loose, if any. Returns its key. */
  hitPanel(p, s) {
    if (!this.hasPanels || s < 0.18) return null;
    const b = this.t.geo.box, L = b.maxZ - b.minZ, hw = (b.maxX - b.minX) / 2;
    if (p[1] < b.minY + 0.18) return null;             // landings and scrapes underneath
    const zf = (p[2] - b.minZ) / L;                    // 0 = front bumper, 1 = rear bumper
    const side = Math.abs(p[0]) > hw * 0.55;
    let key = null;
    if (side) {
      const s0 = p[0] < 0 ? 'L' : 'R';
      for (const k of ['doorF' + s0, 'doorR' + s0]) {
        const P = this.panels[k];
        if (P && p[2] > P.zMin - 0.25 && p[2] < P.zMax + 0.25) { key = k; break; }
      }
      if (!key && zf < 0.28 && s > 0.45) key = 'hood';
    } else if (zf < 0.32) key = 'hood';
    else if (zf > 0.72) key = 'trunk';
    const P = key && this.panels[key];
    if (!P || P.loose) return null;
    P.hp -= s * 1.5;                                   // a few medium hits or one big one
    if (P.hp > 0 && s < 0.6) return null;
    this.loosen(key, 2.5 + s * 4);
    return key;
  }

  loosen(key, kick = 3) {
    const P = this.panels[key];
    if (!P || P.loose) return;
    P.loose = true;
    P.angle = Math.max(P.angle, P.rest);
    P.vel = kick;
    this.panelBits |= P.bit;
  }

  /** Remote cars: follow the owner's panels byte. */
  setPanelBits(bits) {
    if (bits === this.panelBits) return;
    for (const P of Object.values(this.panels)) {
      if ((bits & P.bit) && !P.loose) this.loosen(P.key, 2 + Math.random() * 2);
      else if (!(bits & P.bit) && P.loose) this.closePanel(P);
    }
    this.panelBits = bits & Object.values(this.panels).reduce((m, P) => m | P.bit, 0);
  }

  closePanel(P) {
    P.loose = false; P.angle = 0; P.vel = 0; P.hp = 1;
    P.pivot.quaternion.identity();
    this.panelBits &= ~P.bit;
  }

  /** Swing the loose panels. Uses how the drawn car moved this frame, so it works the same for every car. */
  updatePanels(dt) {
    if (!this.panelBits || this.lod > 0 || dt <= 0) { if (this.doorsOpen) { this.doorsOpen = false; this.applyInterior(); } return; }
    dt = Math.min(dt, 0.05);
    const m = this.pm || (this.pm = { p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3(), a: new THREE.Vector3(), w: new THREE.Vector3(), n: 0 });
    const T = PT;
    const root = this.root;
    if (m.n === 0) { m.p.copy(root.position); m.q.copy(root.quaternion); m.n = 1; return; }
    // velocity, acceleration and spin of the car (smoothed; a teleport or reset is ignored)
    T.v.copy(root.position).sub(m.p).divideScalar(dt);
    const jump = T.v.length() > 120;
    m.p.copy(root.position);
    T.dq.copy(m.q).invert().premultiply(root.quaternion);     // world rotation this frame
    m.q.copy(root.quaternion);
    if (jump) { m.v.set(0, 0, 0); m.a.set(0, 0, 0); m.w.set(0, 0, 0); return; }
    if (m.n === 1) { m.v.copy(T.v); m.n = 2; }
    T.a.copy(T.v).sub(m.v).divideScalar(dt);
    if (T.a.length() > 60) T.a.setLength(60);
    m.v.lerp(T.v, 1 - Math.exp(-dt * 25));
    m.a.lerp(T.a, 1 - Math.exp(-dt * 10));
    const ang = 2 * Math.acos(Math.min(1, Math.abs(T.dq.w)));
    if (ang > 1e-5) { T.w.set(T.dq.x, T.dq.y, T.dq.z).normalize().multiplyScalar((T.dq.w < 0 ? -ang : ang) / dt); } else T.w.set(0, 0, 0);
    m.w.lerp(T.w, 1 - Math.exp(-dt * 15));
    // into car space
    T.iq.copy(root.quaternion).invert();
    T.aL.copy(m.a).applyQuaternion(T.iq);
    T.vL.copy(m.v).applyQuaternion(T.iq);
    T.wL.copy(m.w).applyQuaternion(T.iq);
    T.gL.set(0, -9.81, 0).applyQuaternion(T.iq);
    const fwd = -T.vL.z, fwd2 = fwd > 0 ? fwd * fwd : 0;
    let doorsOpen = false;
    for (const P of Object.values(this.panels)) {
      if (!P.loose) continue;
      T.r.copy(P.r0).applyAxisAngle(P.axis, P.sign * P.angle);
      // pseudo forces on the panel (per kilo): gravity, minus the car's acceleration, minus the spin's pull
      T.rc.copy(P.pivot.position).add(T.r);
      T.f.copy(T.gL).sub(T.aL);
      T.cf.copy(T.wL).cross(T.rc); T.cf.crossVectors(T.wL, T.cf);   // w x (w x r)
      T.f.sub(T.cf);
      T.sa.copy(P.axis).multiplyScalar(P.sign);
      let acc = T.tq.crossVectors(T.r, T.f).dot(T.sa) / P.I;
      // the wind: lifts a loose bonnet (more the further it is open), shuts open doors, lifts a boot a bit
      if (P.key === 'hood') acc += 0.55 * fwd2 * Math.sin(P.angle + 0.12);
      else if (P.door) acc -= 0.22 * fwd2 * Math.sin(P.angle);
      else acc += 0.12 * fwd2 * Math.sin(P.angle + 0.05);
      acc -= (P.door ? 1.1 : 2.2) * P.vel;                        // hinge friction
      P.vel += acc * dt;
      P.angle += P.vel * dt;
      if (P.angle < P.rest) { P.angle = P.rest; if (P.vel < 0) P.vel = -P.vel * 0.3; }
      if (P.angle > P.max) { P.angle = P.max; if (P.vel > 0) P.vel = -P.vel * 0.25; }
      P.pivot.quaternion.setFromAxisAngle(P.axis, P.sign * P.angle);
      if (P.door && P.angle > 0.04) doorsOpen = true;
    }
    if (doorsOpen !== this.doorsOpen) { this.doorsOpen = doorsOpen; this.applyInterior(); }
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

  /** distance = from the camera. How far each detail level reaches depends on the graphics level. */
  updateLOD(distance) {
    const L = carDetail.lod;
    const l = distance < L[0] ? 0 : distance < L[1] ? 1 : distance < L[2] ? 2 : 3;
    this.setLOD(l);
    this.root.visible = distance < carDetail.hide;
  }

  // the interior also shows while a door hangs open (otherwise you'd see into an empty shell)
  setInteriorVisible(on) { if (on === this.intWanted && this.intApplied !== undefined) return; this.intWanted = on; this.applyInterior(); }
  applyInterior() {
    const on = this.intWanted || this.doorsOpen;
    if (on === this.intApplied) return;
    this.intApplied = on;
    for (const o of this.interior) o.visible = on;
  }
  setHoodHidden(on) { for (const o of this.hoodHide) o.visible = !on; }
  /** Cockpit camera in this car: windows see-through (from outside they are black). */
  setInsideView(on) {
    if (on === this.insideView) return;
    this.insideView = on;
    for (const [o, i] of this.windowSlots) o.material[i] = on ? WINDOW_INSIDE : WINDOW_MAT;
  }

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
    const none = !!this.spec.noLights;   // the F1 car has no lights at all (no headlights, brake lights or indicators)
    const lightsOn = !!v.lights && !none;
    const indL = (v.indL || v.hazard) && blinkOn && !none, indR = (v.indR || v.hazard) && blinkOn && !none;
    if (none) v = { ...v, brake: false, reverse: false };
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
    for (const P of Object.values(this.panels || {})) this.closePanel(P);
    this.panelBits = 0;
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
