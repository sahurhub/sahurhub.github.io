// UK Simulator - vehicle models. Loads the user's .glb files from models/ (set up in
// models/models.json: file, scale, offset, rotation, wheel node names, physics overrides,
// credits) and falls back to simple placeholder shapes until a model exists.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let config = null;
const cache = new Map();
const loader = new GLTFLoader();

export async function loadModelConfig(base) {
  try { config = await (await fetch(base + 'models/models.json', { cache: 'no-cache' })).json(); } catch (e) { config = { vehicles: {}, credits: [] }; }
  return config;
}
export function modelConfig(id) { return (config && config.vehicles && config.vehicles[id]) || null; }
export function modelCredits() { return (config && config.credits) || []; }

// apply physics overrides from models.json (mass, centre of mass, top speed, grip, off-road)
export function applyOverrides(id, spec) {
  const c = modelConfig(id);
  if (!c || !c.physics) return spec;
  const p = c.physics, s = structuredClone(spec);
  if (p.mass) s.mass = p.mass;
  if (p.com) s.com = p.com;
  if (p.grip) s.tyre = { ...s.tyre, mu: p.grip };
  if (p.offroad !== undefined) s.tyre = { ...s.tyre, offroad: p.offroad };
  if (p.topSpeedKmh) { s.real = { ...s.real, top: p.topSpeedKmh / 3.6 }; if (s.motor) s.motor = { ...s.motor, cutoff: p.topSpeedKmh / 3.6 }; }
  if (p.wheels && s.wheels && p.wheels.length === s.wheels.length) s.wheels = s.wheels.map((w, k) => ({ ...w, pos: p.wheels[k].pos || w.pos, r: p.wheels[k].r || w.r }));
  return s;
}

// returns { root, wheels: [Object3D per physics wheel], body, lights, rider? }
export async function buildModel(id, spec, base, colour) {
  const c = modelConfig(id);
  if (c && c.file) {
    try { return await fromGlb(id, c, spec, base); } catch (e) { console.warn('model failed, using placeholder', id, e); }
  }
  return placeholder(spec, colour);
}

async function fromGlb(id, c, spec, base) {
  let gltf = cache.get(c.file);
  if (!gltf) { gltf = await loader.loadAsync(base + 'models/' + c.file); cache.set(c.file, gltf); }
  const root = new THREE.Group();
  const body = gltf.scene.clone(true);
  // own copies of geometry so dents on one car do not show on another
  body.traverse((o) => { if (o.isMesh) { o.geometry = o.geometry.clone(); o.castShadow = true; o.receiveShadow = true; } });
  const s = c.scale || 1;
  body.scale.setScalar(s);
  if (c.rotateY) body.rotation.y = c.rotateY * Math.PI / 180;
  if (c.offset) body.position.set(...c.offset);
  root.add(body);
  const wheels = [];
  if (c.wheelNodes && c.wheelNodes.length === spec.wheels.length) {
    root.updateMatrixWorld(true);
    c.wheelNodes.forEach((name, k) => {
      const node = body.getObjectByName(name);
      const holder = new THREE.Group();
      holder.position.set(...spec.wheels[k].pos);
      root.add(holder);
      if (node) {
        // move the wheel node under a holder at the physics wheel centre (centre on centre)
        root.updateMatrixWorld(true);
        const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
        const spinner = new THREE.Group(); holder.add(spinner);
        root.updateMatrixWorld(true);
        spinner.attach(node);
        node.position.add(holder.getWorldPosition(new THREE.Vector3()).sub(centre));
        wheels.push({ holder, spinner });
      } else wheels.push(placeholderWheel(spec.wheels[k], holder));
    });
  } else {
    // model with fixed wheels: invisible holders (physics still works)
    for (const w of spec.wheels) { const holder = new THREE.Group(); holder.position.set(...w.pos); root.add(holder); const spinner = new THREE.Group(); holder.add(spinner); wheels.push({ holder, spinner }); }
  }
  return { root, wheels, body, lights: addLights(root, spec), rider: spec.kind !== 'car' || spec.handlebar ? makeRider(spec) : null, glb: true };
}

// ------------------------------------------------------------------ placeholders
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.1, ...o });

function placeholderWheel(w, holder) {
  const spinner = new THREE.Group();
  holder.add(spinner);
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(w.r, w.r, w.w, 20, 1).rotateZ(Math.PI / 2), mat(0x1a1a1a, { roughness: 0.9 }));
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(w.r * 0.62, w.r * 0.62, w.w * 1.02, 10, 1).rotateZ(Math.PI / 2), mat(0xb8bcc0, { metalness: 0.7, roughness: 0.3 }));
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(w.w * 1.04, w.r * 1.1, w.r * 0.12), mat(0x7a7e82, { metalness: 0.6 }));
  tyre.castShadow = true;
  spinner.add(tyre, rim, spoke);
  return { holder, spinner };
}

function bikeWheel(w, holder, spokes) {
  const spinner = new THREE.Group();
  holder.add(spinner);
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(w.r - w.w * 0.5, w.w * 0.5, 8, 28).rotateY(Math.PI / 2), mat(0x151515, { roughness: 0.9 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(w.r - w.w * 1.05, w.w * 0.18, 6, 28).rotateY(Math.PI / 2), mat(0x9a9ea2, { metalness: 0.8, roughness: 0.3 }));
  tyre.castShadow = true;
  spinner.add(tyre, rim);
  if (spokes) {
    for (let k = 0; k < 8; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.004, (w.r - w.w) * 2, 0.01), mat(0xcccccc, { metalness: 0.8 })); s.rotation.x = k * Math.PI / 8; spinner.add(s); }
  } else {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(w.r * 0.55, w.r * 0.55, w.w * 0.6, 12).rotateZ(Math.PI / 2), mat(0x2a2a2a, { metalness: 0.5 }));
    spinner.add(disc);
  }
  return { holder, spinner };
}

function box(w, h, d, m, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; }
function cyl(r, h, m, x, y, z, rx = 0, rz = 0, seg = 10) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; return o; }

function placeholder(spec, colour) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = mat(colour ?? 0x2b5fa8, { metalness: 0.4, roughness: 0.35 });
  const glass = mat(0x1b2530, { metalness: 0.2, roughness: 0.08 });
  const trim = mat(0x1d1d1f, { roughness: 0.6 });
  const wheels = [];
  const d = spec.dims;
  if (spec.kind === 'car' && !spec.handlebar) {
    const r = spec.wheels[0].r;
    const sill = r * 0.75;
    const sports = spec.dims.height < 1.35, truck = spec.dims.height > 1.7;
    const lowerH = (d.height - sill) * (sports ? 0.55 : 0.5);
    body.add(box(d.width, lowerH, d.length * 0.98, paint, 0, sill + lowerH / 2, 0));
    // bonnet slope + cabin
    const cabL = d.length * (truck ? 0.4 : sports ? 0.45 : 0.55), cabZ = truck ? 0.35 : sports ? -0.25 : -0.15;
    const cabH = d.height - sill - lowerH;
    const cab = box(d.width * 0.86, cabH, cabL, paint, 0, sill + lowerH + cabH / 2, cabZ);
    body.add(cab);
    body.add(box(d.width * 0.865, cabH * 0.72, cabL * 0.98, glass, 0, sill + lowerH + cabH * 0.45, cabZ));
    if (truck) body.add(box(d.width * 0.96, 0.45, d.length * 0.38, paint, 0, sill + lowerH + 0.22, -d.length * 0.29)); // load bed sides
    body.add(box(d.width * 1.0, 0.12, 0.12, trim, 0, sill + 0.1, d.length / 2));
    body.add(box(d.width * 1.0, 0.12, 0.12, trim, 0, sill + 0.1, -d.length / 2));
    // number plates (UK: white front, yellow back)
    body.add(box(0.52, 0.11, 0.02, mat(0xf2f2f2), 0, sill + 0.25, d.length / 2 + 0.01));
    body.add(box(0.52, 0.11, 0.02, mat(0xf2c400), 0, sill + 0.3, -d.length / 2 - 0.01));
    for (const w of spec.wheels) { const h = new THREE.Group(); h.position.set(...w.pos); root.add(h); wheels.push(placeholderWheel(w, h)); }
  } else if (spec.handlebar) {
    // quad bike
    const r = spec.wheels[0].r;
    body.add(box(d.width * 0.55, 0.3, d.length * 0.8, paint, 0, r + 0.15, 0));
    body.add(box(d.width * 0.95, 0.08, 0.5, paint, 0, r * 2 + 0.05, spec.wheels[0].pos[2]));
    body.add(box(d.width * 0.95, 0.08, 0.5, paint, 0, r * 2 + 0.05, spec.wheels[2].pos[2]));
    body.add(box(0.35, 0.12, 0.6, trim, 0, r + 0.45, -0.15));
    body.add(cyl(0.02, 0.7, trim, 0, r + 0.75, 0.35, 0, Math.PI / 2));
    for (const w of spec.wheels) { const h = new THREE.Group(); h.position.set(...w.pos); root.add(h); wheels.push(placeholderWheel(w, h)); }
  } else {
    // two-wheelers
    const [wf, wr] = spec.wheels;
    const frame = mat(colour ?? 0x2a7a4a, { metalness: 0.5, roughness: 0.35 });
    const steerGroup = new THREE.Group();
    steerGroup.position.set(0, wf.pos[1], wf.pos[2]);
    root.add(steerGroup);
    const hf = new THREE.Group(); steerGroup.add(hf);
    wheels.push(spec.kind === 'escooter' ? bikeWheel(wf, hf, false) : bikeWheel(wf, hf, spec.pedal));
    const hrr = new THREE.Group(); hrr.position.set(...wr.pos); root.add(hrr);
    wheels.push(spec.kind === 'escooter' ? bikeWheel(wr, hrr, false) : bikeWheel(wr, hrr, spec.pedal));
    if (spec.kind === 'escooter') {
      body.add(box(0.2, 0.06, spec.wheelbase * 0.78, mat(0x111111), 0, wr.r + 0.08, -0.02));
      // stem leans with the steering (child of steerGroup)
      const stem = cyl(0.025, 1.05, frame, 0, 0.55, -0.05); steerGroup.add(stem);
      const bar = cyl(0.018, 0.6, trim, 0, 1.05, -0.08, 0, Math.PI / 2); steerGroup.add(bar);
      steerGroup.add(box(0.1, 0.05, 0.08, mat(0xeeeeee, { emissive: 0xffffff, emissiveIntensity: 0.3 }), 0, 0.85, 0.02));
    } else {
      const seatY = spec.kind === 'bike' && spec.pedal ? 0.95 : 0.8;
      body.add(cyl(0.025, spec.wheelbase * 0.75, frame, 0, wf.r + 0.25, 0, Math.PI / 2 - 0.15));
      body.add(cyl(0.022, 0.55, frame, 0, wr.r + 0.3, -spec.wheelbase * 0.25, 0.35));
      body.add(box(0.12, 0.05, 0.28, trim, 0, seatY, -spec.wheelbase * 0.2));
      if (!spec.pedal) {
        // motor scooter / dirt bike bodywork
        body.add(box(0.3, 0.35, spec.wheelbase * 0.6, frame, 0, wf.r + 0.2, -0.05));
        if (spec.engine && spec.engine.kind === 'cvt') body.add(box(0.36, 0.5, 0.35, frame, 0, wf.r + 0.35, spec.wheelbase * 0.3));
      }
      const fork = cyl(0.02, wf.r + 0.55, trim, 0, 0.3, 0.02, -0.25); steerGroup.add(fork);
      const bar = cyl(0.016, 0.62, trim, 0, wf.r + 0.62 - wf.pos[1] + 0.35, -0.1, 0, Math.PI / 2); steerGroup.add(bar);
    }
    root.userData.steer = steerGroup;
    body.userData.frame = true;
  }
  return { root, wheels, body, lights: addLights(root, spec), rider: spec.kind !== 'car' || spec.handlebar ? makeRider(spec) : null, glb: false };
}

function addLights(root, spec) {
  const d = spec.dims;
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dd, emissiveIntensity: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1100, emissiveIntensity: 0.3 });
  const y = spec.kind === 'car' ? spec.wheels[0].r * 0.75 + 0.35 : 0.8;
  const zF = d.length / 2 + 0.005, zR = -d.length / 2 - 0.005;
  const g = new THREE.Group();
  const lamp = (w, h, dd, m, x, yy, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); o.position.set(x, yy, z); g.add(o); };
  if (spec.kind === 'car') {
    for (const s of [1, -1]) {
      lamp(0.28, 0.1, 0.03, head, s * d.width * 0.36, y, zF);
      lamp(0.22, 0.1, 0.03, tail, s * d.width * 0.38, y + 0.05, zR);
    }
  } else {
    lamp(0.1, 0.08, 0.04, head, 0, spec.kind === 'escooter' ? 0.85 : 0.9, spec.wheels[0].pos[2] + 0.1);
    lamp(0.08, 0.05, 0.03, tail, 0, spec.kind === 'escooter' ? 0.3 : 0.75, spec.wheels[spec.wheels.length - 1].pos[2] - 0.15);
  }
  root.add(g);
  // headlight beam (one spot light, switched on at night or with L)
  const spot = new THREE.SpotLight(0xfff1dd, 0, 60, 0.55, 0.45, 1.6);
  spot.position.set(0, y, zF);
  spot.target.position.set(0, y - 0.6, zF + 10);
  root.add(spot, spot.target);
  return { head, tail, spot };
}

// simple rider: body, head with helmet, arms and legs (posed for the vehicle)
export function makeRider(spec, shirt = 0x2f4f8f) {
  const g = new THREE.Group();
  const skin = mat(0xd8a888, { roughness: 0.7 }), cloth = mat(shirt, { roughness: 0.8 }), legs = mat(0x2a2c34, { roughness: 0.85 }), helmet = mat(0xe8e8e8, { roughness: 0.3 });
  const standing = spec.rider && spec.rider.standing;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 8), cloth); torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), skin); head.castShadow = true;
  const hel = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), helmet);
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.75, 4, 6), legs), legR = legL.clone();
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.5, 4, 6), cloth), armR = armL.clone();
  for (const o of [legL, legR, armL, armR]) o.castShadow = true;
  g.add(torso, head, hel, legL, legR, armL, armR);
  const wb = spec.wheelbase || 1.2;
  if (standing) {
    torso.position.set(0, 1.35, -0.02); torso.rotation.x = 0.12;
    head.position.set(0, 1.78, 0.04); hel.position.copy(head.position);
    legL.position.set(0.1, 0.62, -0.05); legR.position.set(-0.1, 0.62, 0.08);
    armL.position.set(0.22, 1.32, 0.16); armL.rotation.x = -0.9; armR.position.set(-0.22, 1.32, 0.16); armR.rotation.x = -0.9;
  } else if (spec.kind === 'car') {
    // quad: sitting astride
    torso.position.set(0, 1.0, -0.2); torso.rotation.x = 0.25;
    head.position.set(0, 1.45, -0.05); hel.position.copy(head.position);
    legL.position.set(0.22, 0.65, 0); legL.rotation.x = 1.0; legR.position.set(-0.22, 0.65, 0); legR.rotation.x = 1.0;
    armL.position.set(0.25, 1.0, 0.15); armL.rotation.x = -1.1; armR.position.set(-0.25, 1.0, 0.15); armR.rotation.x = -1.1;
  } else {
    const lean = spec.pedal ? 0.6 : 0.35;
    const seatZ = -wb * 0.2;
    torso.position.set(0, (spec.pedal ? 1.2 : 1.05), seatZ + 0.12); torso.rotation.x = lean;
    head.position.set(0, spec.pedal ? 1.55 : 1.45, seatZ + 0.35); hel.position.copy(head.position);
    legL.position.set(0.14, 0.62, seatZ + 0.2); legL.rotation.x = 0.4; legR.position.set(-0.14, 0.62, seatZ + 0.2); legR.rotation.x = 0.4;
    armL.position.set(0.24, 1.15, seatZ + 0.42); armL.rotation.x = -1.2; armR.position.set(-0.24, 1.15, seatZ + 0.42); armR.rotation.x = -1.2;
  }
  if (!spec.rider || spec.pedal || standing) hel.visible = !spec.pedal || true;
  g.userData.parts = { torso, head, hel, legL, legR, armL, armR };
  return g;
}

// dent: push vertices near a local point inwards (works for placeholders and .glb models)
export function dent(model, local, amount) {
  const p = new THREE.Vector3(local[0], local[1], local[2]);
  const radius = 0.45 + amount * 0.6;
  const push = Math.min(0.12, 0.04 + amount * 0.12);
  model.body.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const pos = o.geometry.attributes.position;
    o.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
    const rootM = model.root.matrixWorld;
    const pw = p.clone().applyMatrix4(rootM).applyMatrix4(inv);
    const dir = pw.clone().normalize().multiplyScalar(-1);
    let moved = false;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = v.distanceTo(pw);
      if (d > radius) continue;
      const k = (1 - d / radius) * push;
      pos.setXYZ(i, v.x + dir.x * k, v.y + dir.y * k * 0.5, v.z + dir.z * k);
      moved = true;
    }
    if (moved) { pos.needsUpdate = true; o.geometry.computeVertexNormals(); }
  });
}

export { mergeGeometries };
