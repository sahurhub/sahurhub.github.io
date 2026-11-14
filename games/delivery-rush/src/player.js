// The courier on foot: movement relative to the camera, sprint, jump (with standing on low
// objects), animation choice, and riding a vehicle.
import * as THREE from 'three';
import { CharacterModel } from './character.js';
import { clamp, smooth, smoothAngle } from './utils.js';

const GRAVITY = 22;

export class Player {
  constructor(scene, collision, layout) {
    this.coll = collision;
    this.layout = layout;
    this.char = new CharacterModel();
    this.object = this.char.root;
    scene.add(this.object);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.onGround = true;
    this.vehicle = null;           // Vehicle while riding
    this.carrying = null;          // parcel colour when carrying on foot
    this.walkSpeed = 4.4;
    this.sprintSpeed = 7.8;
    this.jumpV = 7.2;
    this.speedMult = 1;
    this.jumpMult = 1;
    this.distance = 0;
    this.moving = false;
    this.sprinting = false;
    this.char.play('idle');
  }

  place(x, z, h = 0) {
    this.pos.set(x, this.layout.heightAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.heading = h;
    this.object.position.copy(this.pos);
    this.object.rotation.set(0, h, 0);
  }

  // on-foot fixed step
  step(dt, c, camFwd) {
    if (this.vehicle) return;
    // desired horizontal direction from camera-relative input
    const fx = camFwd.x, fz = camFwd.z;
    const rx = -fz, rz = fx;          // camera right (facing +Z, right is -X)
    const mx = fx * c.forward + rx * c.right, mz = fz * c.forward + rz * c.right;
    const ml = Math.hypot(mx, mz);
    this.sprinting = c.sprint && ml > 0.1;
    const speed = (this.sprinting ? this.sprintSpeed : this.walkSpeed) * this.speedMult * (this.carrying ? 0.92 : 1);
    let tx = 0, tz = 0;
    if (ml > 0.01) { tx = mx / ml * speed; tz = mz / ml * speed; }
    const accel = this.onGround ? 14 : 4;
    this.vel.x = smooth(this.vel.x, tx, accel, dt);
    this.vel.z = smooth(this.vel.z, tz, accel, dt);
    if (ml > 0.01) this.heading = smoothAngle(this.heading, Math.atan2(mx, mz), 12, dt);
    // jump
    if (c.jumpPressed && this.onGround) {
      this.vel.y = this.jumpV * this.jumpMult;
      this.onGround = false;
      this.justJumped = true;
    }
    this.vel.y -= GRAVITY * dt;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    // walls (anything taller than a step above the feet)
    const r = this.coll.resolveCircle(this.pos.x, this.pos.z, 0.38, this.pos.y, 0.45);
    if (r.hit) { this.pos.x = r.x; this.pos.z = r.z; }
    // ground (can stand on containers, benches, parked cars...)
    const g = this.coll.groundAt(this.pos.x, this.pos.z, 0.3, this.pos.y, 0.45);
    if (this.pos.y <= g) {
      if (!this.onGround && this.vel.y < -9) this.landed = true;
      this.pos.y = g; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > g + 0.05) this.onGround = this.vel.y <= 0 && this.pos.y - g < 0.06;
    if (this.onGround && this.pos.y - g < 0.5) this.pos.y = Math.max(g, this.pos.y - 6 * dt); // stick to steps down
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.distance += moved;
    this.moving = moved / dt > 0.4;
  }

  // per-frame visuals
  update(dt) {
    if (this.vehicle) {
      const v = this.vehicle;
      const seat = v.seatWorld(new THREE.Vector3());
      this.object.position.set(seat.x, seat.y - 0.72, seat.z);
      this.object.quaternion.copy(v.M.tilt.getWorldQuaternion(new THREE.Quaternion()));
      const anim = v.def.rider || 'drive';
      if (anim === 'ride') this.char.play('ride', 0.2, clamp(Math.abs(v.vf) / 5, 0.15, 2.2) * (v.throttle > 0 ? 1 : 0.35));
      else this.char.play(anim, 0.2, 1);
      this.pos.set(v.x, v.y, v.z);
    } else {
      this.object.position.copy(this.pos);
      this.object.rotation.set(0, this.heading, 0);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const carry = !!this.carrying;
      let anim, ts = 1;
      if (!this.onGround && (this.vel.y > 0.5 || this.pos.y - this.layout.heightAt(this.pos.x, this.pos.z) > 0.6)) anim = 'jump';
      else if (hs > 5.8) { anim = carry ? 'carry_run' : 'run'; ts = hs / 7.8; }
      else if (hs > 0.5) { anim = carry ? 'carry_walk' : 'walk'; ts = hs / 4.4; }
      else anim = this.emote || (carry ? 'carry_idle' : 'idle');
      // emotes (cheer after a delivery) play for a moment, or until the player moves
      if (this.emote) {
        this.emoteT = (this.emoteT || 0) + dt;
        if (this.emoteT > 2.2 || anim !== this.emote) { this.emote = null; this.emoteT = 0; }
      }
      this.char.play(anim, anim === 'jump' ? 0.08 : 0.18, ts);
    }
    this.char.setCarry(!this.vehicle && this.carrying ? this.carrying : null);
    this.char.update(dt);
  }

  enter(vehicle) {
    this.vehicle = vehicle;
    vehicle.occupied = true;
    this.vel.set(0, 0, 0);
  }
  exit() {
    const v = this.vehicle;
    if (!v) return;
    const p = v.exitPoint();
    const r = this.coll.resolveCircle(p.x, p.z, 0.4, 0, 0.45);
    v.occupied = false;
    this.vehicle = null;
    this.place(r.x, r.z, v.h);
    this.pos.y = this.coll.groundAt(r.x, r.z, 0.3, 3, 0.45);
  }

  snapshot() {
    return { x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2), h: +this.heading.toFixed(3), anim: this.char.currentName() };
  }
}
