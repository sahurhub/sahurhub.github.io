// Driver Online USA - drawing the room's traffic (simulated on the server, see server/lib/traffic.js).
// Each traffic car arrives as (lane, distance, small crash offset). We turn that into a position
// with the same lane data as the server, slide between updates, and draw all cars of a kind with
// one instanced mesh. Cars near the player get a collision box so you can bump into them.
import * as THREE from 'three';
import { loadGLB } from '../core/assets.js';
import { asset } from '../config.js';
import { lanePoint } from '../shared/lanes.js';
import { TRAFFIC_HEADER, TRAFFIC_ENTRY, TF } from '../shared/protocol.js';
import { GROUPS } from '../physics/physics.js';
import { patchMaterial } from './weather-mat.js';

// same order as the server's KINDS (server/lib/traffic.js)
export const KINDS = ['sedan', 'suv', 'pickup', 'semi', 'bus', 'schoolbus', 'police', 'van'];
// width, height, length (m) for collision boxes and the stand-in boxes
const DIMS = { sedan: [1.85, 1.5, 4.8], suv: [1.95, 1.75, 4.5], pickup: [2.05, 1.85, 5.7], semi: [2.6, 4.2, 16], bus: [2.55, 3.4, 12.2], schoolbus: [2.45, 3.1, 11], police: [1.9, 1.55, 4.9], van: [2.0, 2.1, 4.9] };
const COLORS = { sedan: 0x8a2b2b, suv: 0x2d3e5c, pickup: 0x5a5f66, semi: 0xb8bcc2, bus: 0x2f6fbf, schoolbus: 0xf2b519, police: 0x1b1d22, van: 0xd9d9d9 };
const DELAY = 140;
const MAX_BODIES = 18;

export class TrafficView {
  constructor(game) {
    this.g = game;
    this.cars = new Map(); // id -> { kind, buf: [], pos, h, pitch, flags, honked }
    this.meshes = null;
    this.bodies = [];      // pool of kinematic boxes
    this.tmp = {}; this.tmp2 = {};
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.glows = [];
  }

  async load() {
    let gltf = null;
    try { gltf = await loadGLB(asset('map/traffic.glb')); } catch (e) { console.warn('traffic models missing, using boxes'); }
    // meshes[kind] = [variant][lod] = [instanced meshes (one per material)]
    this.meshes = {};
    for (const kind of KINDS) {
      const variants = [];
      for (let v = 0; v < 8; v++) {
        const node = gltf && gltf.scene.getObjectByName(`TRAFFIC_${kind}_${v}`);
        if (!node) break;
        const lods = [];
        node.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
        for (let l = 0; l < 2; l++) {
          const ln = node.getObjectByName(`TRAFFIC_${kind}_${v}_LOD${l}`);
          if (!ln) continue;
          const parts = [];
          ln.traverse((o) => {
            if (!o.isMesh) return;
            const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
            patchMaterial(o.material, 'object');
            parts.push(this.makeIM(geo, o.material));
          });
          lods.push(parts);
        }
        if (lods.length) variants.push(lods);
      }
      if (!variants.length) {
        const [w, h, l] = DIMS[kind];
        const geo = new THREE.BoxGeometry(w, h * 0.75, l).translate(0, h * 0.45, 0);
        const cab = new THREE.BoxGeometry(w * 0.9, h * 0.35, l * (kind === 'semi' ? 0.18 : 0.5)).translate(0, h * 0.95, kind === 'semi' ? -l * 0.38 : 0.2);
        variants.push([[this.makeIM(geo, patchMaterial(new THREE.MeshStandardMaterial({ color: COLORS[kind], roughness: 0.4, metalness: 0.3 }), 'object')),
          this.makeIM(cab, patchMaterial(new THREE.MeshStandardMaterial({ color: 0x1a222e, roughness: 0.1, metalness: 0.4 }), 'object'))]]);
      }
      this.meshes[kind] = variants;
    }
    // brake light / indicator glows near the player
    const tex = this.g.glowTexture;
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff2010, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false; s.scale.setScalar(0.9);
      this.g.scene.add(s); this.glows.push(s);
    }
  }

  makeIM(geo, mat) {
    const im = new THREE.InstancedMesh(geo, mat, 64);
    im.count = 0; im.frustumCulled = false;
    im.castShadow = this.g.quality.shadows; im.receiveShadow = false;
    this.g.scene.add(im);
    return im;
  }

  clear() {
    this.cars.clear();
    if (this.meshes) for (const variants of Object.values(this.meshes)) for (const lods of variants) for (const parts of lods) for (const im of parts) { im.count = 0; im.visible = false; }
    for (const b of this.bodies) { b.body.setNextKinematicTranslation({ x: 0, y: -500, z: 0 }); b.id = 0; }
    for (const s of this.glows) s.visible = false;
  }

  onSnapshot(view) {
    const lanes = this.g.world.lanes;
    if (!lanes || !lanes.length) return;
    const n = view.getUint8(1), t = view.getUint32(2, true);
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const o = TRAFFIC_HEADER + i * TRAFFIC_ENTRY;
      const id = view.getUint8(o), k = view.getUint8(o + 1), lane = view.getUint16(o + 2, true);
      const s = view.getUint16(o + 4, true) / 10, flags = view.getUint8(o + 7);
      const offX = view.getInt8(o + 8) / 10, offZ = view.getInt8(o + 9) / 10, yawOff = view.getInt8(o + 10) / 50;
      const L = lanes[lane];
      if (!L) continue;
      seen.add(id);
      let car = this.cars.get(id);
      if (!car) { car = { id, buf: [], kind: KINDS[k] || 'sedan', pos: new THREE.Vector3(), h: 0, pitch: 0, flags: 0, honk: false }; this.cars.set(id, car); }
      car.kind = KINDS[k] || 'sedan';
      const p = lanePoint(L, s, this.tmp);
      const ahead = lanePoint(L, Math.min(L.len, s + 2), this.tmp2), behind = lanePoint(L, Math.max(0, s - 2), {});
      const pitch = Math.atan2(ahead.y - behind.y, Math.hypot(ahead.x - behind.x, ahead.z - behind.z) || 1);
      car.buf.push({ t, x: p.x + offX, y: p.y, z: p.z + offZ, h: p.h + yawOff, pitch, flags });
      while (car.buf.length > 6) car.buf.shift();
    }
    for (const id of [...this.cars.keys()]) if (!seen.has(id)) this.cars.delete(id);
  }

  update(dt, camPos, playerPos) {
    if (!this.meshes) return;
    const now = this.g.net.serverNow() - DELAY;
    const counts = {}; // kind -> [variant][lod] -> count
    for (const kind of KINDS) counts[kind] = this.meshes[kind].map(() => [0, 0]);
    const near = [];
    let glow = 0;
    const blink = (performance.now() % 800) < 420;
    for (const car of this.cars.values()) {
      const b = car.buf;
      if (!b.length) continue;
      let a = b[0], c = null;
      for (let i = b.length - 1; i >= 0; i--) { if (b[i].t <= now) { a = b[i]; c = b[i + 1] || null; break; } }
      if (c) {
        const k = Math.min(1, Math.max(0, (now - a.t) / Math.max(1, c.t - a.t)));
        car.pos.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
        let dh = c.h - a.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        car.h = a.h + dh * k; car.pitch = a.pitch + (c.pitch - a.pitch) * k;
      } else { car.pos.set(a.x, a.y, a.z); car.h = a.h; car.pitch = a.pitch; }
      car.flags = (c || a).flags;
      const d = car.pos.distanceTo(camPos);
      car.dist = d;
      if (d > 900) continue;
      const variants = this.meshes[car.kind];
      const vi = car.id % variants.length;           // the same car always gets the same model and colour
      const lods = variants[vi];
      const li = d < 90 * (this.g.quality.current.trafficLod || 1) || lods.length === 1 ? 0 : 1;
      this.e.set(car.pitch, car.h, 0); this.q.setFromEuler(this.e);
      this.m.compose(car.pos, this.q, this.one || (this.one = new THREE.Vector3(1, 1, 1)));
      const ci = counts[car.kind][vi];
      for (const im of lods[li]) { if (ci[li] < im.instanceMatrix.count) im.setMatrixAt(ci[li], this.m); }
      ci[li]++;
      if (playerPos && car.pos.distanceTo(playerPos) < 70) near.push(car);
      // honks
      if (car.flags & TF.HONK) { if (!car.honk && this.g.audio) this.g.audio.honk(car.pos, car.kind); car.honk = true; } else car.honk = false;
      // brake lights and indicators for close cars
      if (d < 70 && glow < this.glows.length - 2) {
        const [w, h, l] = DIMS[car.kind];
        const fx = -Math.sin(car.h), fz = -Math.cos(car.h), rx = -fz, rz = fx;
        const brake = car.flags & TF.BRAKE, indL = (car.flags & TF.IND_L) && blink, indR = (car.flags & TF.IND_R) && blink;
        for (const side of [-1, 1]) {
          const on = brake || (side < 0 ? indL : indR);
          if (!on) continue;
          const s = this.glows[glow++];
          s.visible = true;
          s.material.color.setHex(brake && !(side < 0 ? indL : indR) ? 0xff2010 : 0xffa020);
          s.position.set(car.pos.x - fx * l * 0.5 + rx * side * w * 0.38, car.pos.y + h * 0.42, car.pos.z - fz * l * 0.5 + rz * side * w * 0.38);
        }
      }
    }
    for (let i = glow; i < this.glows.length; i++) this.glows[i].visible = false;
    for (const kind of KINDS) {
      this.meshes[kind].forEach((lods, vi) => lods.forEach((parts, li) => {
        const n = counts[kind][vi][li];
        for (const im of parts) { im.count = Math.min(n, im.instanceMatrix.count); im.visible = n > 0; if (n) im.instanceMatrix.needsUpdate = true; }
      }));
    }
    this.updateBodies(near);
  }

  /** Collision boxes for the traffic cars closest to the player. */
  updateBodies(near) {
    near.sort((a, b) => a.dist - b.dist);
    const want = near.slice(0, MAX_BODIES);
    const ph = this.g.physics;
    // free bodies whose car is no longer near
    for (const b of this.bodies) if (b.id && !want.some((c) => c.id === b.id && c.kind === b.kind)) { b.id = 0; b.body.setNextKinematicTranslation({ x: b.home, y: -500, z: 0 }); }
    for (const car of want) {
      let b = this.bodies.find((x) => x.id === car.id && x.kind === car.kind);
      if (!b) {
        b = this.bodies.find((x) => !x.id && x.kind === car.kind);
        if (!b) {
          if (this.bodies.length >= MAX_BODIES * 2) continue;
          const [w, h, l] = DIMS[car.kind];
          const kb = ph.addKinematicBox(w / 2, h / 2 - 0.15, l / 2, h / 2 + 0.15, GROUPS.traffic, { kind: 'traffic', id: 0 });
          b = { body: kb.body, col: kb.col, kind: car.kind, id: 0, home: this.bodies.length * 10 };
          this.bodies.push(b);
        }
        b.id = car.id;
        b.body.setTranslation({ x: car.pos.x, y: car.pos.y, z: car.pos.z }, true);
        ph.colliderInfo.set(b.col.handle, { kind: 'traffic', id: car.id });
      }
      this.e.set(car.pitch, car.h, 0); this.q.setFromEuler(this.e);
      b.body.setNextKinematicTranslation(car.pos);
      b.body.setNextKinematicRotation(this.q);
    }
  }
}
