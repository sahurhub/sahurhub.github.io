// Player vehicles: model setup (wheels, steering pivots, lights, cargo slots, customisation)
// and arcade driving physics. The simulation reads a plain controls object, so a remote player
// could be driven by network snapshots instead of the keyboard.
import * as THREE from 'three';
import { assets, findNode, mergedModel, tintMaterial } from './assets.js';
import { vehicleStats, PAINTS, WHEELS, VEHICLE_BY_ID } from './config.js';
import { clamp, smooth, wrapAngle } from './utils.js';
import { textTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0), YA = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

// ------------------------------------------------------------------ model
export function createVehicleModel(def, custom = {}) {
  const key = def.model ? def.model.replace('.glb', '') : null;
  let obj = key ? assets.clone(key, true) : null;
  const fallback = !obj;
  if (!obj) obj = buildFallbackVehicle(def);
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const root = new THREE.Group();
  root.name = 'vehicle_' + def.id;
  const tilt = new THREE.Group();        // lean / pitch / roll / suspension live here
  root.add(tilt);
  tilt.add(obj);

  const M = { root, tilt, obj, def, fallback, wheels: [], mats: {}, extras: new THREE.Group() };
  tilt.add(M.extras);
  obj.traverse(o => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) (M.mats[m.name] ||= []).push(m);
  });
  for (const m of M.mats.paint || []) m.userData.stock = m.color.getHex();
  for (const m of M.mats.rim || []) m.userData.stock = m.color.getHex();
  for (const m of M.mats.headlight || []) { m.emissive = new THREE.Color('#fff3c8'); m.emissiveIntensity = 0.3; }
  for (const m of M.mats.brakelight || []) { m.emissive = new THREE.Color('#ff2a2a'); m.emissiveIntensity = 0.35; }
  for (const m of M.mats.indicator || []) { m.emissive = new THREE.Color('#ff9d1a'); m.emissiveIntensity = 0.2; }
  for (const m of M.mats.glass || []) { m.roughness = 0.08; m.metalness = 0.4; }
  obj.updateMatrixWorld(true);

  // wheels
  const names = ['wheel_F', 'wheel_R', 'wheel_FL', 'wheel_FR', 'wheel_ML', 'wheel_MR', 'wheel_RL', 'wheel_RR'];
  for (const n of names) {
    const w = findNode(obj, n);
    if (!w) continue;
    const box = new THREE.Box3().setFromObject(w);
    const r = (box.max.y - box.min.y) / 2;
    const entry = { node: w, rest: w.quaternion.clone(), r: r || 0.3, name: n, restScale: w.scale.clone(),
      front: n === 'wheel_F' || n === 'wheel_FL' || n === 'wheel_FR' };
    // car front wheels get a steering pivot
    if ((n === 'wheel_FL' || n === 'wheel_FR')) {
      const pivot = new THREE.Group();
      pivot.position.copy(w.position);
      w.parent.add(pivot);
      w.position.set(0, 0, 0);
      pivot.add(w);
      entry.pivot = pivot;
    }
    M.wheels.push(entry);
  }
  M.steer = findNode(obj, 'steer_F');
  if (M.steer) M.steerRest = M.steer.quaternion.clone();
  const local = n => { const e = findNode(obj, n); if (!e) return null; const p = new THREE.Vector3(); e.getWorldPosition(p); return { pos: p, node: e }; };
  const seat = local('seat');
  M.seat = seat ? seat.pos : new THREE.Vector3(0, def.kind === 'van' || def.kind === 'truck' ? 1.2 : 1.0, 0);
  const lamp = local('headlamp');
  M.headlamp = lamp ? lamp.pos : new THREE.Vector3(0, 0.8, 1.2);
  const ex = local('exhaust');
  M.exhaust = ex ? ex.pos : null;
  const cargo = findNode(obj, 'cargo');
  if (cargo) {
    const p = new THREE.Vector3(); cargo.getWorldPosition(p);
    const s = new THREE.Vector3(); cargo.getWorldScale(s);
    M.cargo = { pos: p, w: Math.abs(s.x), h: Math.abs(s.y), l: Math.abs(s.z) };
  } else M.cargo = { pos: new THREE.Vector3(0, 1.0, -0.4), w: 0.5, h: 1, l: 0.5 };
  // wheelbase / length from the wheels
  obj.updateMatrixWorld(true);
  const zs = M.wheels.map(w => (w.pivot || w.node).getWorldPosition(new THREE.Vector3()).z);
  M.wheelbase = zs.length ? Math.max(0.6, Math.max(...zs) - Math.min(...zs)) : 1.0;
  const bb = new THREE.Box3().setFromObject(obj);
  M.size = bb.getSize(new THREE.Vector3());
  M.center = bb.getCenter(new THREE.Vector3());
  M.top = bb.max.y;
  M.frontZ = bb.max.z; M.backZ = bb.min.z;
  // parcel instances in the cargo area
  buildCargoMesh(M);
  applyCustomization(M, custom);
  return M;
}

function buildFallbackVehicle(def) {
  const g = new THREE.Group();
  const big = def.kind === 'van' || def.kind === 'truck';
  const two = def.twoWheel;
  const L = big ? (def.kind === 'truck' ? 7.5 : 4.6) : 1.6, W = big ? 2.1 : 0.3, H = big ? 2.2 : 0.6;
  const paint = new THREE.MeshStandardMaterial({ color: def.color || '#ff7a1f', name: 'paint' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L).translate(0, H / 2 + (big ? 0.4 : 0.35), 0), paint);
  body.name = 'body';
  g.add(body);
  const tire = new THREE.MeshStandardMaterial({ color: '#24262b', name: 'tire' });
  const r = big ? 0.42 : 0.32;
  const mk = (name, x, z) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, big ? 0.3 : 0.08, 14).rotateZ(Math.PI / 2), tire);
    w.name = name; w.position.set(x, r, z); g.add(w);
  };
  if (two) { mk('wheel_F', 0, L / 2 - 0.1); mk('wheel_R', 0, -L / 2 + 0.1); }
  else { const tr = W / 2 - 0.15; mk('wheel_FL', tr, L / 2 - 0.8); mk('wheel_FR', -tr, L / 2 - 0.8); mk('wheel_RL', tr, -L / 2 + 0.8); mk('wheel_RR', -tr, -L / 2 + 0.8); }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), new THREE.MeshStandardMaterial({ name: 'headlight', color: '#fff6d6' }));
  head.position.set(0, big ? 1.0 : 0.9, L / 2 + 0.03); g.add(head);
  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), new THREE.MeshStandardMaterial({ name: 'brakelight', color: '#c4161c' }));
  brake.position.set(0, big ? 1.0 : 0.8, -L / 2 - 0.03); g.add(brake);
  const seat = new THREE.Object3D(); seat.name = 'seat'; seat.position.set(big ? 0.5 : 0, big ? 1.3 : 1.0, big ? L / 2 - 1.2 : -0.1); g.add(seat);
  const cargo = new THREE.Object3D(); cargo.name = 'cargo';
  cargo.position.set(0, big ? H + 0.45 : 0.95, big ? -0.4 : -L / 2 + 0.25);
  cargo.scale.set(big ? W - 0.3 : 0.4, 1.2, big ? L * 0.6 : 0.45); g.add(cargo);
  return g;
}

function buildCargoMesh(M) {
  // one merged, tintable parcel mesh ('box' faces take the rarity colour)
  const mm = mergedModel('props/package', () => [{ geometry: new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 0.25, 0), material: new THREE.MeshStandardMaterial({ name: 'box', color: '#ffffff' }), matName: 'box' }]);
  const MAX = 64;
  M.cargoGroup = new THREE.Group();
  M.cargoGroup.position.copy(M.cargo.pos);
  M.tilt.add(M.cargoGroup);
  const geo = mm.geometry.clone();
  const tm = geo.attributes.tintMask, col = geo.attributes.color;
  // make the cardboard faces white so the instance colour shows the rarity colour exactly
  for (let i = 0; i < tm.count; i++) if (tm.getX(i) > 0.5) col.setXYZ(i, 1, 1, 1);
  geo.setAttribute('instTint2', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3));
  geo.setAttribute('instGlow', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2));
  const mat = tintMaterial({});
  const im = new THREE.InstancedMesh(geo, mat, MAX);
  im.count = 0;
  im.castShadow = true;
  im.frustumCulled = false;
  im.setColorAt(0, new THREE.Color('#ffffff'));
  M.cargoGroup.add(im);
  M.cargoMeshes = [im];
}

// show `n` parcels of colour `color` in the cargo slots (capacity decides the slot grid)
export function setCargo(M, n, color, capacity, glow = 0) {
  const c = M.cargo;
  const cap = Math.max(1, capacity);
  let s = 0.62, cols = 1, rows = 1, layers = 1;
  for (; s >= 0.14; s -= 0.02) {
    cols = Math.max(1, Math.floor(c.w / s));
    rows = Math.max(1, Math.floor(c.l / s));
    layers = Math.max(1, Math.floor(c.h / s));
    if (cols * rows * layers >= cap) break;
  }
  const count = Math.min(n, cols * rows * layers, 64);
  const m = new THREE.Matrix4(), col = new THREE.Color(color || '#b07a45');
  const scale = s * 0.94 / 0.5;
  for (const im of M.cargoMeshes) {
    for (let i = 0; i < count; i++) {
      const layer = Math.floor(i / (cols * rows));
      const k = i % (cols * rows);
      const cx = k % cols, cz = Math.floor(k / cols);
      const x = (cx - (cols - 1) / 2) * s, z = (cz - (rows - 1) / 2) * s, y = layer * s;
      m.makeRotationY(((i * 37) % 7 - 3) * 0.03).scale(new THREE.Vector3(scale, scale, scale)).setPosition(x, y, z);
      im.setMatrixAt(i, m);
      im.setColorAt(i, col);
    }
    im.count = count;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.material.emissive = col.clone();
    im.material.emissiveIntensity = glow * 0.3;
  }
}

export function applyCustomization(M, custom = {}) {
  const def = M.def;
  const paint = PAINTS.find(p => p.id === (custom.paint || 'stock'));
  for (const m of M.mats.paint || []) {
    if (paint && paint.color) m.color.set(paint.color); else m.color.setHex(m.userData.stock);
    m.metalness = paint && paint.metal ? 0.85 : 0.25;
    m.roughness = paint && paint.metal ? 0.22 : 0.35;
  }
  const wheel = WHEELS.find(w => w.id === (custom.wheels || 'standard')) || WHEELS[0];
  for (const m of M.mats.rim || []) {
    m.color.set(wheel.rim);
    m.metalness = wheel.metal ? 1 : 0.6;
    m.roughness = wheel.metal ? 0.12 : 0.35;
    m.emissive = new THREE.Color(wheel.glow ? wheel.rim : '#000000');
    m.emissiveIntensity = wheel.glow ? 1.2 : 0;
  }
  // rebuild extras (accessories + upgrade visuals)
  M.extras.clear();
  M.blinkers = [];
  M.underglow = null;
  const up = custom.upgrades || {};
  const acc = new Set(custom.accessories || []);
  const two = def.twoWheel;
  const top = M.top, fz = M.frontZ, bz = M.backZ, W = M.size.x;
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, ...o });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; M.extras.add(b); return b; };
  // handling: wider tyres + lower stance (4 wheels)
  const hl = up.handling || 0;
  for (const w of M.wheels) w.node.scale.set(w.restScale.x * (1 + 0.07 * hl), w.restScale.y, w.restScale.z);
  M.stanceDrop = two ? 0 : hl * 0.018;
  // braking: red callipers
  if ((up.braking || 0) >= 2) {
    const cm = mat((up.braking || 0) >= 4 ? '#ffd23f' : '#e5383b');
    for (const w of M.wheels) {
      const p = (w.pivot || w.node).position;
      const side = two ? 1 : Math.sign(p.x || 1);
      const b = box(0.05, w.r * 0.5, w.r * 0.45, cm, p.x + side * (two ? 0.06 : 0.02), p.y + w.r * 0.3, p.z);
      if (w.pivot) { M.extras.remove(b); b.position.set(side * 0.02, w.r * 0.3, 0); w.pivot.add(b); M.extras.userData.pivotBits = (M.extras.userData.pivotBits || []).concat(b); }
    }
  }
  // speed: spoiler (cars) / windscreen + stripe (bikes)
  const sp = up.speed || 0;
  if (sp >= 3) {
    const sm = mat(sp >= 5 ? '#ff7a1f' : '#2b2f36');
    if (two) box(0.32, 0.22, 0.04, mat('#9fd3ff', { transparent: true, opacity: 0.6 }), 0, M.seat.y + 0.15, fz - 0.25);
    else {
      box(Math.min(W * 0.9, 1.9), 0.06, 0.4, sm, 0, top + 0.18, bz + 0.35);
      box(0.06, 0.2, 0.06, sm, W * 0.3, top + 0.08, bz + 0.35);
      box(0.06, 0.2, 0.06, sm, -W * 0.3, top + 0.08, bz + 0.35);
    }
  }
  // acceleration: exhaust tips (motor) / battery booster (electric) / chainring guard (pedal)
  const ac = up.accel || 0;
  if (ac >= 2) {
    const chrome = mat('#e6eaef', { metalness: 1, roughness: 0.15 });
    if (M.exhaust) {
      const n = ac >= 4 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 10).rotateX(Math.PI / 2), chrome);
        pipe.position.set(M.exhaust.x + (k - (n - 1) / 2) * 0.14, M.exhaust.y, M.exhaust.z - 0.12);
        M.extras.add(pipe);
      }
    } else if (def.kind === 'electric') box(0.16, 0.08, 0.36, mat('#29d3ff', { emissive: new THREE.Color('#29d3ff'), emissiveIntensity: 0.6 }), 0, 0.1, 0);
    else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 16).rotateY(Math.PI / 2), chrome);
      ring.position.set(0.09, 0.32, 0.02);
      M.extras.add(ring);
    }
  }
  // cargo: rack frame around the parcel area grows with level
  const cg = up.cargo || 0;
  if (cg >= 1) {
    const f = 1 + 0.08 * cg;
    const rm = mat('#2b2f36');
    const c = M.cargo;
    const w = c.w * f, l = c.l * f, h = 0.08 + cg * 0.04;
    box(w, 0.03, 0.04, rm, 0, c.pos.y + h, c.pos.z + l / 2);
    box(w, 0.03, 0.04, rm, 0, c.pos.y + h, c.pos.z - l / 2);
    box(0.04, 0.03, l, rm, w / 2, c.pos.y + h, c.pos.z);
    box(0.04, 0.03, l, rm, -w / 2, c.pos.y + h, c.pos.z);
    M.cargo.visW = c.w * f; M.cargo.visL = c.l * f;
  }
  // accessories
  if (acc.has('lightbar')) {
    const am = mat('#ff9d1a', { emissive: new THREE.Color('#ff9d1a'), emissiveIntensity: 1 });
    if (two) M.blinkers.push(box(0.12, 0.08, 0.12, am, 0, M.cargo.pos.y + 0.75, M.cargo.pos.z - 0.1));
    else {
      box(Math.min(W * 0.7, 1.4), 0.06, 0.18, mat('#2b2f36'), 0, top + 0.05, fz - 1.0);
      M.blinkers.push(box(0.35, 0.12, 0.16, am.clone(), W * 0.18, top + 0.14, fz - 1.0));
      M.blinkers.push(box(0.35, 0.12, 0.16, am.clone(), -W * 0.18, top + 0.14, fz - 1.0));
    }
  }
  if (acc.has('flag')) {
    const px = two ? 0.14 : W / 2 - 0.15, pz = two ? M.cargo.pos.z - 0.2 : bz + 0.4, py = two ? M.cargo.pos.y : top;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 6), mat('#e6eaef'));
    pole.position.set(px, py + 0.8, pz);
    M.extras.add(pole);
    const fl = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, -0.15, -0.45)]), mat('#ff7a1f', { side: THREE.DoubleSide }));
    fl.geometry.computeVertexNormals();
    fl.position.set(px, py + 1.6, pz);
    M.extras.add(fl);
    M.flag = fl;
  } else M.flag = null;
  if (acc.has('underglow')) {
    const gm = new THREE.MeshBasicMaterial({ color: '#7c4dff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.6, W * 1.2), M.size.z * 1.05).rotateX(-Math.PI / 2), gm);
    pl.position.set(0, 0.04, M.center.z);
    M.extras.add(pl);
    M.underglow = pl;
  }
  if (acc.has('sign')) {
    const t = textTexture('DELIVERY RUSH', { w: 512, h: 128, bg: '#ff7a1f', size: 64 });
    const sm = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.5 });
    if (two) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.56), [mat('#ff7a1f'), mat('#ff7a1f'), mat('#ff7a1f'), mat('#ff7a1f'), sm, sm]);
      s.rotation.y = Math.PI / 2;
      s.position.set(0, M.cargo.pos.y + 0.6, M.cargo.pos.z - M.cargo.l / 2 - 0.05);
      M.extras.add(s);
    } else {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.32, 0.08), [mat('#ff7a1f'), mat('#ff7a1f'), mat('#ff7a1f'), mat('#ff7a1f'), sm, sm]);
      s.position.set(0, top + 0.26, fz - 0.5);
      M.extras.add(s);
    }
  }
  M.custom = custom;
}

// ------------------------------------------------------------------ vehicle (simulation + visuals)
export class Vehicle {
  constructor(def, custom, world) {
    this.def = def;
    this.world = world;
    this.M = createVehicleModel(def, custom);
    this.object = this.M.root;
    this.x = 0; this.z = 0; this.y = 0; this.h = 0;
    this.vx = 0; this.vz = 0; this.vf = 0; this.yawRate = 0; this.steer = 0;
    this.suspY = 0; this.suspV = 0; this.pitch = 0; this.roll = 0; this.lean = 0;
    this.wheelAngle = 0; this.throttle = 0; this.braking = false; this.rpm = 0; this.gear = 1;
    this.impact = 0; this.lastImpact = 0; this.occupied = false; this.lightsOn = false;
    this.lowSpeedTime = 0;
    this.setCustom(custom);
    this.radius = def.radius || 0.6;
    const len = Math.max(this.M.size.z, 1);
    // collision circles along the length
    const n = len > 6 ? 4 : len > 3 ? 3 : 2;
    this.circles = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      this.circles.push(this.M.backZ + this.radius * 0.9 + t * (len - this.radius * 1.8));
    }
    this.cargoCount = 0; this.cargoColor = null; this.cargoGlow = 0;
  }

  setCustom(custom) {
    this.custom = custom || {};
    this.stats = vehicleStats(this.def, this.custom.upgrades || {});
    applyCustomization(this.M, this.custom);
    this.refreshCargo();
  }

  place(x, z, h) {
    this.x = x; this.z = z; this.h = h;
    this.vx = this.vz = 0; this.vf = 0; this.yawRate = 0; this.steer = 0;
    this.y = this.world ? this.world.layout.heightAt(x, z) : 0;
    this.syncObject();
  }

  speed() { return Math.hypot(this.vx, this.vz); }

  // fixed-step physics
  step(dt, c, coll) {
    const st = this.stats, def = this.def;
    const hf = st.handling;
    const fwdX = Math.sin(this.h), fwdZ = Math.cos(this.h);
    const rX = -Math.cos(this.h), rZ = Math.sin(this.h);
    let vf = this.vx * fwdX + this.vz * fwdZ;
    let vr = this.vx * rX + this.vz * rZ;
    const prevVf = vf;
    const thr = Math.max(0, c.forward), brk = Math.max(0, -c.forward);
    const hand = c.jump;
    this.braking = false;
    if (thr > 0) {
      if (vf < -0.4) { vf = Math.min(0, vf + st.brake * dt); this.braking = true; }
      else {
        const frac = Math.max(0, vf) / st.top;
        vf += st.accel * thr * Math.max(0, 1 - frac * frac) * dt;
      }
    }
    if (brk > 0) {
      if (vf > 0.4) { vf = Math.max(0, vf - st.brake * brk * dt); this.braking = true; }
      else vf = Math.max(-st.top * 0.32, vf - st.accel * 0.7 * brk * dt);
    }
    // rolling + air resistance; off-road drag for road vehicles
    const onRoad = this.world ? this.world.layout.isRoad(this.x, this.z) : true;
    let drag = (thr || brk ? 0.15 : 0.7) + 0.004 * vf * vf;
    if (!onRoad && !def.curbProof && (def.kind === 'van' || def.kind === 'truck')) drag += 0.6;
    if (hand) { drag += 5.5; this.braking = true; }
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), drag * dt);
    // steering (speed-sensitive)
    const spd = Math.abs(vf);
    const base = def.twoWheel ? 0.52 : 0.58;
    const maxSteer = base * clamp(1.25 - spd / (st.top * 1.25), 0.32, 1) * clamp(hf, 0.4, 1.6);
    const target = -c.right * maxSteer;
    this.steer = smooth(this.steer, target, 7 + 5 * hf, dt);
    let yaw = vf * Math.tan(this.steer) / this.M.wheelbase;
    const latMax = 9.5 * hf * (hand ? 1.4 : 1);
    if (Math.abs(yaw * vf) > latMax && spd > 0.5) yaw = Math.sign(yaw) * latMax / spd;
    this.yawRate = smooth(this.yawRate, yaw, def.kind === 'truck' ? 6 : 10, dt);
    this.h = wrapAngle(this.h + this.yawRate * dt);
    // lateral grip (handbrake lets it slide)
    vr *= Math.exp(-(hand ? 1.6 : 9) * hf * dt);
    const nfX = Math.sin(this.h), nfZ = Math.cos(this.h), nrX = -Math.cos(this.h), nrZ = Math.sin(this.h);
    this.vx = nfX * vf + nrX * vr;
    this.vz = nfZ * vf + nrZ * vr;
    this.vf = vf;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.accelLong = (vf - prevVf) / dt;
    this.throttle = thr;
    // collisions with static world (several circles along the body)
    this.impact = 0;
    if (coll) this.collide(coll, dt);
    // ground + suspension spring
    const ground = this.world ? this.world.layout.heightAt(this.x, this.z) : 0;
    if (ground > this.y + 0.05 && spd > 2) {
      this.suspV += def.curbProof ? 0.6 : 1.4;                // curb bump
      if (!def.curbProof && def.twoWheel) { this.vx *= 0.97; this.vz *= 0.97; }
    }
    this.y = ground;
    const k = def.twoWheel ? 160 : 90, d = def.twoWheel ? 16 : 10;
    this.suspV += (-k * this.suspY - d * this.suspV) * dt;
    this.suspY += this.suspV * dt;
    this.suspY = clamp(this.suspY, -0.12, 0.12);
    // engine model for sound
    this.updateEngine(dt, spd);
  }

  collide(coll, dt) {
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    let cx = 0, cz = 0, hits = 0, nx = 0, nz = 0, tag = null;
    for (const off of this.circles) {
      const px = this.x + fx * off, pz = this.z + fz * off;
      const r = coll.resolveCircle(px, pz, this.radius, this.y, 0.3);
      if (r.hit) {
        cx += r.x - px; cz += r.z - pz; nx += r.nx; nz += r.nz; hits++; tag = r.tag;
      }
    }
    if (!hits) return;
    this.x += cx / hits * 1.0;
    this.z += cz / hits * 1.0;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) {
      this.vx -= nx * vn * 1.25;
      this.vz -= nz * vn * 1.25;
      this.vx *= 0.9; this.vz *= 0.9;
      this.impact = -vn;
      this.lastHitTag = tag;
    }
    void dt;
  }

  // apply an impulse from another body (traffic car / pedestrian)
  push(nx, nz, strength) {
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) {
      this.vx -= nx * vn * (1 + strength);
      this.vz -= nz * vn * (1 + strength);
      this.impact = Math.max(this.impact, -vn);
    }
  }

  updateEngine(dt, spd) {
    const top = this.stats.top;
    const def = this.def;
    if (def.kind === 'motor' || def.kind === 'van' || def.kind === 'truck') {
      const gears = def.id === 'moped' ? 1 : def.kind === 'truck' ? 6 : 5;
      if (gears === 1) this.rpm = smooth(this.rpm, 0.25 + 0.75 * spd / top, 6, dt);
      else {
        const g = clamp(Math.floor(spd / top * gears * 0.999) + 1, 1, gears);
        this.gear = g;
        const lo = (g - 1) / gears * top, hi = g / gears * top;
        const frac = (spd - lo) / Math.max(0.1, hi - lo);
        const target = 0.32 + 0.6 * clamp(frac, 0, 1) + (this.throttle > 0 ? 0.06 : 0);
        this.rpm = smooth(this.rpm, target, 9, dt);
      }
    } else this.rpm = spd / top;
  }

  setLights(night) {
    this.lightsOn = night > 0.3;
    const head = this.occupied ? (this.lightsOn ? 2.4 : 0.6) : (this.lightsOn ? 0.8 : 0.1);
    for (const m of this.M.mats.headlight || []) m.emissiveIntensity = head;
    const brake = this.braking ? 2.6 : (this.lightsOn ? 0.9 : 0.25);
    for (const m of this.M.mats.brakelight || []) m.emissiveIntensity = brake;
  }

  // visuals each render frame
  syncObject(dt = 0, time = 0) {
    const o = this.object, M = this.M, def = this.def;
    o.position.set(this.x, this.y, this.z);
    o.rotation.set(0, this.h, 0);
    const spd = this.vf;
    // lean (two wheels) / roll + pitch (four wheels)
    if (def.twoWheel) {
      const targetLean = -clamp(Math.atan2(spd * this.yawRate, 9.81), -0.6, 0.6);
      this.lean = smooth(this.lean, targetLean, 8, dt || 0.016);
      M.tilt.rotation.set(clamp(-this.accelLong * 0.004, -0.05, 0.05), 0, this.lean, 'YXZ');
    } else {
      const lat = spd * this.yawRate;
      this.roll = smooth(this.roll, clamp(lat * 0.012, -0.07, 0.07), 6, dt || 0.016);
      this.pitch = smooth(this.pitch, clamp(-(this.accelLong || 0) * 0.006, -0.05, 0.05), 6, dt || 0.016);
      M.tilt.rotation.set(this.pitch, 0, this.roll, 'YXZ');
    }
    M.tilt.position.y = this.suspY - (M.stanceDrop || 0);
    // wheels: spin + steer
    for (const w of M.wheels) {
      const spin = this.wheelAngle * (0.34 / w.r);
      _q.setFromAxisAngle(XA, spin);
      w.node.quaternion.copy(w.rest).multiply(_q);
      if (w.pivot) w.pivot.rotation.y = this.steer;
    }
    if (M.steer) {
      _q.setFromAxisAngle(YA, this.steer * 1.25);
      M.steer.quaternion.copy(M.steerRest).multiply(_q);
    }
    this.wheelAngle += (spd / 0.34) * (dt || 0);
    // accessory animation
    if (M.blinkers.length) {
      const on = Math.floor(time * 4) % 2 === 0;
      M.blinkers.forEach((b, i) => { b.material.emissiveIntensity = ((i % 2 === 0) === on) ? 2.2 : 0.1; });
    }
    if (M.flag) M.flag.rotation.y = Math.sin(time * 9) * 0.25 - clamp(spd * 0.03, 0, 0.5);
    if (M.underglow) M.underglow.material.opacity = 0.45 + Math.sin(time * 3) * 0.2;
  }

  setCargoCount(n, color, glow = 0) {
    this.cargoCount = n; this.cargoColor = color; this.cargoGlow = glow;
    this.refreshCargo();
  }
  refreshCargo() {
    if (!this.M) return;
    setCargo(this.M, this.cargoCount || 0, this.cargoColor, this.stats.capacity, this.cargoGlow || 0);
  }

  // world position of the rider seat
  seatWorld(out = new THREE.Vector3()) {
    out.copy(this.M.seat);
    this.M.tilt.updateMatrixWorld(true);
    return this.M.tilt.localToWorld(out);
  }
  exitPoint() {
    // to the left side of the vehicle
    const side = this.def.twoWheel ? 1.0 : this.M.size.x / 2 + 0.8;
    const lx = Math.cos(this.h), lz = -Math.sin(this.h);
    return { x: this.x + lx * side, z: this.z + lz * side };
  }

  // network / save snapshot
  snapshot() { return { id: this.def.id, x: +this.x.toFixed(2), z: +this.z.toFixed(2), h: +this.h.toFixed(3), vx: +this.vx.toFixed(2), vz: +this.vz.toFixed(2) }; }
  dispose() {
    this.object.removeFromParent();
    this.object.traverse(o => {
      if (o.isMesh) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(m => m.dispose && m.dispose());
      }
    });
  }
}

export function vehicleDef(id) { return VEHICLE_BY_ID[id]; }
