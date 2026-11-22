// The player's mower, character, hat and pet as 3D objects, animated from the physics body.
import * as THREE from 'three';
import { buildRig, recolor, modelGeo, propMat, disposeTree } from '../render/assets.js';
import { MOWERS } from '../shared/mowers.js';
import { PAINTS, HATS, OUTFITS, PETS } from '../shared/cosmetics.js';

const STEER_AXIS = new THREE.Vector3(0, 0.906, -0.423).normalize();
const CHAR_SCALE = 0.92;

export class Vehicle {
  constructor(scene, blobs) {
    this.scene = scene;
    this.blobs = blobs;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.pet = null;
    this.phase = 0;
    this.spinL = 0; this.spinR = 0;
    this.pitch = 0; this.roll = 0;
  }

  set(mowerId, look = {}) {
    disposeTree(this.root);
    this.root.clear();
    this.mowerId = mowerId;
    const M = MOWERS[mowerId];
    this.M = M;
    const rig = buildRig(M.model);
    this.rig = rig;
    this.root.add(rig.root);
    const P = rig.parts, base = M.model;
    this.wheels = ['wfl', 'wfr', 'wrl', 'wrr'].map((k) => P[`${base}_${k}`]).filter(Boolean).map((w) => { w.rotation.order = 'YXZ'; return w; });
    this.steer = P[`${base}_steer`] || null;
    this.lapL = P[`${base}_lapl`] || null; this.lapR = P[`${base}_lapr`] || null;
    const hands = P[`${base}_hands`], seat = P[`${base}_seat`];
    // character
    this.char = null;
    if (M.rider !== 'none') {
      const c = buildRig('char');
      this.char = c;
      c.root.scale.setScalar(CHAR_SCALE);
      rig.root.add(c.root);
      const shoulderY = 1.36 * CHAR_SCALE, armL = 0.7 * CHAR_SCALE;
      if (M.rider === 'walk' && hands) {
        const dy = hands.position.y - shoulderY;
        const back = Math.sqrt(Math.max(0.05, armL * armL - dy * dy));
        c.root.position.set(0, 0, hands.position.z - back);
        this.armAngle = -Math.atan2(back, -dy);
        this.sitting = false;
      } else if (seat) {
        c.root.position.set(seat.position.x, seat.position.y - 0.78 * CHAR_SCALE, seat.position.z + 0.04);
        const sy = c.root.position.y + shoulderY;
        const tgt = hands ? hands.position : new THREE.Vector3(0, sy - 0.4, seat.position.z + 0.5);
        this.armAngle = -Math.atan2(tgt.z - c.root.position.z, sy - tgt.y);
        this.sitting = true;
      }
      for (const s of ['char_arm_l', 'char_arm_r']) if (c.parts[s]) c.parts[s].rotation.x = this.armAngle;
      if (this.sitting) for (const s of ['char_leg_l', 'char_leg_r']) if (c.parts[s]) c.parts[s].rotation.x = -1.45;
    }
    this.applyLook(look);
    // the mower's rough size for shadows / grass bending
    const box = new THREE.Box3().setFromObject(rig.root);
    this.size = box.getSize(new THREE.Vector3());
  }

  applyLook(look) {
    this.look = { ...look };
    if (!this.rig) return;
    recolor(this.rig.root, { paint: (PAINTS[look.paint] || PAINTS.red).color });
    if (this.char) {
      const o = OUTFITS[look.outfit] || OUTFITS.casual;
      recolor(this.char.root, { shirt: o.shirt, pants: o.pants });
      const holder = this.char.parts.char_hat;
      if (holder) {
        holder.clear();
        const h = HATS[look.hat];
        if (h && h.model && modelGeo(h.model)) holder.add(new THREE.Mesh(modelGeo(h.model), propMat));
      }
    }
    // pet
    if (this.pet) { this.scene.remove(this.pet.mesh); this.pet = null; }
    const p = PETS[look.pet];
    if (p && p.model && modelGeo(p.model)) {
      const mesh = new THREE.Mesh(modelGeo(p.model), propMat);
      this.scene.add(mesh);
      this.pet = { mesh, x: null, z: 0, h: 0, hop: 0, blob: -1 };
    }
    this.addBlobs();
  }

  // shadow slots are reused until the world is rebuilt (blobs.gen changes)
  addBlobs() {
    const B = this.blobs;
    if (this.blobGen !== B.gen || this.blob == null || this.blob < 0) { this.blob = B.add(0, -100, 0, 1); this.petBlob = -1; this.blobGen = B.gen; }
    if (this.pet) {
      if (this.petBlob == null || this.petBlob < 0) this.petBlob = B.add(0, -100, 0, 0.3);
      this.pet.blob = this.petBlob;
    } else if (this.petBlob >= 0) B.set(this.petBlob, 0, -100, 0, 0.01);
  }

  // first person: hide the character's head
  setFirstPerson(on) {
    if (this.char && this.char.parts.char_head) this.char.parts.char_head.visible = !on;
  }

  // body = MowerBody, terrain(x, z) = ground height
  update(dt, body, terrain, time) {
    const x = body.x, z = body.z, h = body.h;
    const fx = Math.sin(h), fz = Math.cos(h);
    const y = terrain(x, z);
    // tilt with the ground
    const e = 0.6;
    const pitch = Math.atan((terrain(x + fx * e, z + fz * e) - terrain(x - fx * e, z - fz * e)) / (2 * e));
    const rxv = -fz, rzv = fx;
    const roll = Math.atan((terrain(x + rxv * e, z + rzv * e) - terrain(x - rxv * e, z - rzv * e)) / (2 * e));
    this.pitch += (pitch - this.pitch) * Math.min(1, dt * 8);
    this.roll += (roll - this.roll) * Math.min(1, dt * 8);
    const r = this.rig.root;
    r.position.set(x, y, z);
    r.rotation.order = 'YXZ';
    r.rotation.set(-this.pitch, h, -this.roll);
    // wheels
    const M = this.M;
    const [rf, rr] = M.wheelR;
    this.spinL += body.lapL * dt; this.spinR += body.lapR * dt;
    const zt = M.turn.pivot && M.rider === 'seat';
    for (const w of this.wheels) {
      const front = w.name.endsWith('wfl') || w.name.endsWith('wfr');
      const left = w.name.endsWith('wfl') || w.name.endsWith('wrl');
      const dist = zt ? (left ? this.spinL : this.spinR) : body.wheelSpin;
      w.rotation.x = dist / (front ? rf : rr);
      if (front && !M.turn.pivot) w.rotation.y = -body.steerVis * 0.5;
      if (front && zt) w.rotation.y = Math.atan2(body.yawRate * 0.8, Math.max(0.3, Math.abs(body.vf))) * Math.sign(body.vf || 1);
    }
    if (this.steer) this.steer.quaternion.setFromAxisAngle(STEER_AXIS, -body.steerVis * 2.2);
    if (this.lapL) this.lapL.rotation.x = Math.max(-0.4, Math.min(0.4, (body.lapL / M.speed) * 0.35));
    if (this.lapR) this.lapR.rotation.x = Math.max(-0.4, Math.min(0.4, (body.lapR / M.speed) * 0.35));
    // character: walk behind push mowers, sit on ride-ons
    if (this.char && !this.sitting) {
      this.phase += body.vf * dt * 4.2;
      const s = Math.sin(this.phase) * Math.min(1, Math.abs(body.vf) * 1.5) * 0.55;
      const P = this.char.parts;
      if (P.char_leg_l) P.char_leg_l.rotation.x = s;
      if (P.char_leg_r) P.char_leg_r.rotation.x = -s;
      this.char.root.position.y = Math.abs(Math.sin(this.phase)) * 0.025 * Math.min(1, Math.abs(body.vf));
    }
    // shadow
    const sz = this.size;
    if (this.blob >= 0) this.blobs.set(this.blob, x - fx * (M.rider === 'walk' ? 0.55 : 0), y, z - fz * (M.rider === 'walk' ? 0.55 : 0), Math.max(sz.x, 0.4) * 0.62, Math.max(sz.z, 0.5) * 0.55);
    // pet follows behind and to the side
    const pet = this.pet;
    if (pet) {
      const back = this.size.z * 0.6 + 0.9;
      const tx = x - fx * back + rxv * 0.9, tz = z - fz * back + rzv * 0.9;
      if (pet.x == null) { pet.x = tx; pet.z = tz; }
      const dx = tx - pet.x, dz = tz - pet.z, d = Math.hypot(dx, dz);
      const moving = d > 0.35;
      if (moving) {
        const sp = Math.min(d * 3, Math.max(2, body.speed() * 1.3));
        pet.x += (dx / d) * sp * dt; pet.z += (dz / d) * sp * dt;
        const want = Math.atan2(dx, dz);
        let dh = want - pet.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
        pet.h += dh * Math.min(1, dt * 8);
        pet.hop += dt * 12;
      } else pet.hop = 0;
      const py = terrain(pet.x, pet.z);
      pet.mesh.position.set(pet.x, py + (moving ? Math.abs(Math.sin(pet.hop)) * 0.09 : 0), pet.z);
      pet.mesh.rotation.y = pet.h;
      if (pet.blob >= 0) this.blobs.set(pet.blob, pet.x, py, pet.z, 0.28);
    }
  }

  dispose() {
    disposeTree(this.root);
    this.root.clear();
    this.scene.remove(this.root);
    if (this.pet) { this.scene.remove(this.pet.mesh); if (this.pet.blob >= 0) this.blobs.set(this.pet.blob, 0, -100, 0, 0.01); }
    if (this.blob >= 0) this.blobs.set(this.blob, 0, -100, 0, 0.01);
    this.pet = null;
  }
}
