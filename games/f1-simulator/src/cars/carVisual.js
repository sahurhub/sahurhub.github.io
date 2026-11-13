// Loads the 3D car models (GLB files made by tools/blender/process_car.py) and shows each car:
// body movement (pitch, roll, ride height), four spinning wheels, steering front wheels,
// turning steering wheel, and automatic switching between detail levels by distance.
import * as THREE from 'three';
import { getGltfLoader } from '../render/gltf.js';

const WHEELS = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);

export class CarLibrary {
  constructor(season, onProgress = () => {}) {
    this.season = season;
    this.base = new URL(`../../assets/cars/${season.year}/`, import.meta.url).href;
    this.loader = getGltfLoader();
    this.cache = new Map();
    this.meta = new Map();
    this.onProgress = onProgress;
    this.available = null;
  }

  /** Which team models exist on disk (assets/cars/<year>/index.json). */
  async init() {
    try {
      const r = await fetch(this.base + 'index.json');
      this.available = r.ok ? await r.json() : { models: [] };
    } catch { this.available = { models: [] }; }
    return this.available;
  }

  /** Model id to really use for a team (falls back to the first available model). */
  resolve(modelId) {
    const a = this.available, list = a.models;
    if (list.includes(modelId)) return modelId;
    const s = a.standIns && a.standIns[modelId];
    return s && list.includes(s) ? s : list[0];
  }

  _load(file) {
    if (!this.cache.has(file)) {
      this.cache.set(file, new Promise((res, rej) => this.loader.load(this.base + file, (g) => res(g.scene), undefined, rej)));
    }
    return this.cache.get(file);
  }

  async preload(modelIds, playerModel) {
    const files = new Set(modelIds.map((m) => `${this.resolve(m)}_lod1.glb`));
    files.add(`${this.resolve(playerModel)}_lod0.glb`);
    let done = 0;
    const list = [...files];
    await Promise.all(list.map((f) => this._load(f).then(() => this.onProgress(++done / list.length, f))));
  }

  _meta(model) {
    const key = model + '.json';
    if (!this.cache.has(key)) this.cache.set(key, fetch(this.base + key).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    return this.cache.get(key);
  }

  async make(team, isPlayer, quality, driver = null) {
    const real = this.resolve(team.model);
    const lod1 = await this._load(`${real}_lod1.glb`);
    const lod0 = isPlayer ? await this._load(`${real}_lod0.glb`) : null;
    const meta = await this._meta(real);
    return new CarVisual(lod0, lod1, { standIn: real !== team.model, color: team.color, quality, meta, team, driver });
  }
}

function prep(root, { standIn, color, shadows }) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = shadows;
    o.receiveShadow = false;
    const m = o.material;
    const name = (m.name || '').toLowerCase();
    if (/decals|number/.test(name)) {
      if (!m.userData.fixed) {
        m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -3;
        m.userData.fixed = true;
      }
      o.renderOrder = 2;
      o.castShadow = false;
      if (standIn) o.visible = false; // another team's sponsors would be wrong
    }
    if (standIn && /paint|_color/.test(name)) {
      // temporary repaint in the team's colour until that team's own model is exported
      const c = m.clone();
      c.map = null; c.color = new THREE.Color(color); c.metalness = 0.35; c.roughness = 0.3;
      o.material = c;
    } else if (/paint/.test(name) && !m.userData.tuned) {
      // glossy paint, but not a mirror (the source material is half metallic)
      m.metalness = Math.min(m.metalness, 0.18); m.roughness = Math.max(m.roughness, 0.3); m.envMapIntensity = 1.1;
      m.userData.tuned = true;
    }
    if (/glass/.test(name)) { m.transparent = true; m.opacity = 0.35; m.depthWrite = false; }
    if (/^black/.test(name) && !m.map) m.color.set(0x070707);
  });
}

/** Helmet texture: team colour, white crown stripe, car number on both sides and the top. */
function helmetTexture(color, number) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(0, 26, 256, 10);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 36, 256, 3);
  g.fillStyle = '#ffffff'; g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.55)';
  for (const x of [64, 192]) { g.strokeText(String(number), x, 78); g.fillText(String(number), x, 78); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Simple driver: helmet with visor, HANS collar, shoulders, arms and gloves on the wheel. */
function makeDriver(team, driver, H, S, shadows) {
  const g = new THREE.Group();
  g.name = 'driver';
  const suit = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6 });
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 28, 18),
    new THREE.MeshStandardMaterial({ map: helmetTexture(team.color, driver ? driver.number : ''), roughness: 0.25, metalness: 0.15 }));
  helmet.scale.set(1, 1.02, 1.16);
  helmet.position.copy(H);
  helmet.rotation.y = Math.PI / 2;
  g.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.139, 24, 10, Math.PI / 2 - 0.85, 1.7, 1.15, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.05, metalness: 0.6 }));
  visor.scale.set(1, 1.02, 1.16);
  visor.position.copy(H);
  visor.rotation.y = 0;
  g.add(visor);
  const hans = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.09, 20, 1, true), dark);
  hans.position.set(H.x, H.y - 0.15, H.z - 0.04);
  g.add(hans);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.12, 6, 12), suit);
  torso.rotation.x = 0.35;
  torso.position.set(H.x, H.y - 0.32, H.z - 0.05);
  g.add(torso);
  const armGeo = new THREE.CylinderGeometry(0.045, 0.05, 1, 10);
  for (const side of [1, -1]) {
    const sh = new THREE.Vector3(H.x + side * 0.19, H.y - 0.24, H.z - 0.02);
    const hand = new THREE.Vector3(S.x + side * 0.13, S.y + 0.01, S.z - 0.03);
    const arm = new THREE.Mesh(armGeo, suit);
    arm.position.copy(sh).add(hand).multiplyScalar(0.5);
    arm.scale.y = sh.distanceTo(hand);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hand.clone().sub(sh).normalize());
    g.add(arm);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), dark);
    glove.position.copy(hand);
    g.add(glove);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = false; } });
  return g;
}

export class CarVisual {
  constructor(lod0Scene, lod1Scene, opts) {
    const shadows = opts.quality.shadows;
    this.group = new THREE.Group();
    this.near = new THREE.Group();   // moving parts
    this.body = new THREE.Group();   // pitches and rolls
    this.near.add(this.body);
    this.group.add(this.near);
    const src = (lod0Scene || lod1Scene).clone(true);
    prep(src, { ...opts, shadows });
    const bodyNode = src.getObjectByName('body');
    this.body.add(bodyNode);
    this.steer = src.getObjectByName('steer') || null;
    if (this.steer) { this.body.add(this.steer); this.steerQ = this.steer.quaternion.clone(); }
    // Each wheel node is already turned so its local X axis is the real (cambered) axle.
    // Spin happens about that axis, steering about the car's vertical axis on top of it.
    this.wheels = WHEELS.map((n) => {
      const w = src.getObjectByName(n);
      this.near.add(w);
      return w;
    });
    this.wheelRest = this.wheels.map((w) => w.quaternion.clone());
    // Active aero flaps (cut out in Blender, origin on the hinge line). They ride on the body.
    this.flaps = [];
    for (const [name, angle] of [['rw_flap', -0.5], ['fw_flap', -0.26]]) {
      const f = src.getObjectByName(name);
      if (f) { this.body.add(f); this.flaps.push({ node: f, rest: f.quaternion.clone(), angle }); }
    }
    // far model: one light static mesh
    const farSrc = lod1Scene.getObjectByName('far');
    this.far = farSrc ? farSrc.clone(true) : null;
    if (this.far) {
      prep(this.far, { ...opts, shadows: false });
      this.far.visible = false;
      this.group.add(this.far);
    }
    // soft blob shadow so every car sits on the road even where shadow maps do not reach
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 5.9), CarVisual.blobMat());
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(0, 0.012, -0.25);
    blob.renderOrder = 1;
    this.group.add(blob);
    this.isPlayer = !!lod0Scene;
    this.lodNear = opts.quality.lodNear;
    this.showNear = true;
    this.group.rotation.order = 'YXZ';
    // driver position: measured from the steering wheel (seat is ~0.6 m behind it)
    const sc = opts.meta && opts.meta.steer ? opts.meta.steer.centre : [0, 0.61, 0.62];
    this.helmet = new THREE.Vector3(0, sc[1] + 0.25, sc[2] - 0.6);
    this.steerC = new THREE.Vector3(...sc);
    if (this.isPlayer) {
      // the roof camera pod (T-cam) would sit right in front of the halo cameras
      this.tcam = [];
      this.body.traverse((o) => { if (o.isMesh && /(^|_)color(\.|$)|colordriver|driver_color/i.test(o.material.name || '')) this.tcam.push(o); });
      this._fitCameras(opts.meta);
    }
    if (opts.team) {
      const drv = makeDriver(opts.team, opts.driver, this.helmet, this.steerC, opts.quality.shadows && this.isPlayer);
      this.body.add(drv);
      this.driverFig = drv;
    }
    this._q = new THREE.Quaternion();
    this._qs = new THREE.Quaternion();
    this._qy = new THREE.Quaternion();
    this._axis = new THREE.Vector3(0, 1, 0);
    this._aeroShown = -1;
  }

  static blobMat() {
    if (!CarVisual._blob) {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 128;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 64, 4, 32, 64, 62);
      grd.addColorStop(0, 'rgba(0,0,0,0.62)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.scale(1, 2); g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c);
      CarVisual._blob = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    }
    return CarVisual._blob;
  }

  /**
   * Work out where each on-board camera goes on THIS car model, by probing the 3D shape with
   * downward rays (nose height, halo top, rear wing top...), so no camera sits inside bodywork.
   * Positions are in car space: x left, y up, z forward.
   */
  _fitCameras(meta) {
    this.group.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const hits = [this.body];
    const topAt = (x, z, fallback) => {
      rc.set(new THREE.Vector3(x, 3, z), down);
      const h = rc.intersectObjects(hits, true);
      return h.length ? h[0].point.y : fallback;
    };
    const H = this.helmet;
    const wf = meta && meta.wheels ? meta.wheels.fl[2] : 1.65;
    const len = meta ? meta.frontOverhang : 2.9;
    const rw = meta && meta.flaps && meta.flaps.rw ? meta.flaps.rw : [0, 0.95, -2.3];
    const haloTop = topAt(0, H.z + 0.12, H.y + 0.1);
    const noseZ = wf + 0.25, noseY = topAt(0, noseZ, 0.5);
    const fwZ = Math.min(len - 0.25, wf + 0.9), fwY = topAt(0.45, fwZ, 0.3);
    const rwY = topAt(0, rw[2] + 0.05, rw[1] + 0.05);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // halo cameras: just behind and above the driver's helmet, looking over the halo
    const camY = H.y + 0.4;
    this.fit = {
      halo: { pos: V(0, camY, H.z - 0.42), look: V(0, -0.35, H.z + 12) },
      haloOffset: { pos: V(-0.16, camY - 0.02, H.z - 0.4), look: V(-0.16, -0.35, H.z + 12) },
      eye: { pos: V(0, H.y + 0.03, H.z + 0.1), look: V(0, H.y - 0.12, H.z + 10) },
      nose: { pos: V(0, noseY + 0.07, noseZ), look: V(0, noseY - 0.05, noseZ + 10) },
      frontWing: { pos: V(0.48, fwY + 0.09, fwZ), look: V(0.42, fwY, fwZ + 10) },
      rearWing: { pos: V(0, rwY + 0.09, rw[2] - 0.05), look: V(0, rwY - 0.25, rw[2] - 10) },
      haloTop,
    };
  }

  setTcamVisible(v) {
    if (this.tcam && this._tcamShown !== v) { this._tcamShown = v; for (const m of this.tcam) m.visible = v; }
  }

  /** Copy the physics state onto the model. camPos decides the detail level. */
  update(veh, camPos, hideBodyForCockpit = false) {
    const g = this.group;
    g.position.set(veh.x, veh.y || 0, veh.z);
    g.rotation.set(-Math.atan(veh.slopeF || 0), veh.psi, Math.atan(veh.slopeL || 0));
    if (!this.isPlayer && camPos) {
      const dx = veh.x - camPos.x, dz = veh.z - camPos.z;
      const d2 = dx * dx + dz * dz;
      const lim = this.showNear ? this.lodNear * 1.1 : this.lodNear;
      const near = d2 < lim * lim || !this.far;
      if (near !== this.showNear) {
        this.showNear = near;
        this.near.visible = near;
        if (this.far) this.far.visible = !near;
      }
      if (!near) return;
    }
    const b = this.body;
    b.rotation.x = veh.pitch;
    b.rotation.z = veh.roll;
    b.position.y = veh.heave + (veh.rumble > 0 ? Math.sin(veh.dist * 6.2) * 0.006 * veh.rumble : 0);
    const st = veh.steer, qs = this._qs, qy = this._qy;
    for (let i = 0; i < 4; i++) {
      qs.setFromAxisAngle(AX, veh.wheelAngle[i] % 6.283185);
      qy.setFromAxisAngle(AY, i < 2 ? st : 0);
      this.wheels[i].quaternion.copy(qy).multiply(this.wheelRest[i]).multiply(qs);
    }
    // straight mode: flaps swing open as the aero state (0 = corner, 1 = straight) changes
    const k = veh.aeroK || 0;
    if (k !== this._aeroShown) {
      this._aeroShown = k;
      const e = k * k * (3 - 2 * k);
      for (const f of this.flaps) { qs.setFromAxisAngle(AX, f.angle * e); f.node.quaternion.copy(f.rest).multiply(qs); }
    }
    if (this.steer) {
      // steering wheel turns about its own column (local Y after export)
      this._q.setFromAxisAngle(this._axis, st * 9);
      this.steer.quaternion.copy(this.steerQ).multiply(this._q);
    }
  }
}
