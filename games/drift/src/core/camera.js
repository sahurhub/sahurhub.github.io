// Drift! - the four camera views: cockpit, third person close, third person far, hood.
// Smooth blend when switching (C), free look in every view (hold right mouse or V), look back
// (hold Left Shift), speed FOV boost, crash shake, and the chase cameras stop at walls and the ground.
// The chase cameras follow the direction the car is TRAVELLING (not where its nose points), so in
// a drift you see the car side-on at its drift angle. Slow or reversing, they follow the nose.
import * as THREE from 'three';
import { CAMERA_MODES } from './settings.js';
import { clamp, damp, wrapAngle } from './util.js';
import { GROUPS } from '../physics/physics.js';

const V = () => new THREE.Vector3();
const CHASE = {
  close: { dist: 5.6, height: 1.75, look: 1.0, ahead: 1.6, fovBoost: 8, follow: 4.2 },
  far: { dist: 9.5, height: 3.2, look: 1.2, ahead: 2.6, fovBoost: 6, follow: 3.4 },
};

export class CameraRig {
  constructor(camera, physics, settings) {
    this.cam = camera;
    this.ph = physics;
    this.settings = settings;
    this.mode = settings.get('camera');
    if (!CAMERA_MODES.includes(this.mode)) this.mode = 'close';
    this.yaw = 0;            // chase camera heading (lags behind the car)
    this.pos = V();          // chase camera position (smoothed)
    this.lookYaw = 0; this.lookPitch = 0; // free look offsets
    this.head = V(); this.headVel = V(); // cockpit head movement
    this.prevVel = V();
    this.blend = 1; this.blendFrom = { p: V(), q: new THREE.Quaternion(), fov: 70 };
    this.shakeAmt = 0;
    this.fov = 70;
    this.first = true;
    this.tmp = { a: V(), b: V(), c: V(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ'), m: new THREE.Matrix4() };
  }

  setMode(mode, instant = false) {
    if (!CAMERA_MODES.includes(mode) || mode === this.mode) return;
    this.blendFrom.p.copy(this.cam.position);
    this.blendFrom.q.copy(this.cam.quaternion);
    this.blendFrom.fov = this.cam.fov;
    this.blend = instant ? 1 : 0;
    this.mode = mode;
    this.settings.set('camera', mode);
  }

  cycle() { this.setMode(CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length]); }

  shake(a) { this.shakeAmt = Math.min(1, this.shakeAmt + a); }

  snap() { this.first = true; }

  get insideCar() { return this.mode === 'cockpit'; }

  /**
   * t = { pos, quat, vel, anchors: {cockpit, hood}, body (rapier body to ignore) }
   * look = { dx, dy, active, back }
   */
  update(dt, t, look) {
    const T = this.tmp, cam = this.cam;
    const sens = 0.0024 * this.settings.get('mouseSens');
    // free look: mouse moves the view while held, springs back when let go
    if (look.active) {
      this.lookYaw = clamp(this.lookYaw - look.dx * sens, -Math.PI * 0.95, Math.PI * 0.95);
      this.lookPitch = clamp(this.lookPitch - look.dy * sens, -0.9, 0.7);
    } else {
      this.lookYaw = damp(this.lookYaw, 0, 6, dt);
      this.lookPitch = damp(this.lookPitch, 0, 6, dt);
    }
    const back = look.back ? Math.PI : 0;
    const speed = t.vel.length();
    const baseFov = this.settings.get('fov');

    // car orientation
    const fwd = T.a.set(0, 0, -1).applyQuaternion(t.quat);
    const carYaw = Math.atan2(-fwd.x, -fwd.z);
    let pos = V(), quat = new THREE.Quaternion(), fov = baseFov, near = 0.3;

    if (this.mode === 'close' || this.mode === 'far') {
      const c = CHASE[this.mode], k = this.settings.get('camDistance');
      // follow the direction of travel - right through a spin, so the car turns on screen instead of
      // the world turning round it. Nearly stopped: hold still, then ease back behind the car.
      // Reversing on purpose (reverse gear): follow the nose.
      let tgtYaw = carYaw, rate = c.follow;
      const hs = Math.hypot(t.vel.x, t.vel.z);
      if (!t.reverse && hs > 3) {
        const vYaw = Math.atan2(-t.vel.x, -t.vel.z);
        const fwdSpeed = -(t.vel.x * Math.sin(carYaw)) - t.vel.z * Math.cos(carYaw);
        tgtYaw = fwdSpeed > 0 ? carYaw + wrapAngle(vYaw - carYaw) * 0.92 : vYaw;
        rate = c.follow * clamp((hs - 3) / 4, 0.2, 1);
      } else if (!t.reverse) rate = 0.8;
      if (this.first) this.yaw = tgtYaw;
      this.yaw += wrapAngle(tgtYaw - this.yaw) * (1 - Math.exp(-rate * dt));
      const yaw = this.yaw + this.lookYaw + back;
      const pitch = 0.12 + this.lookPitch * 0.8;
      const dist = c.dist * k, height = c.height * Math.sqrt(k);
      const target = T.b.copy(t.pos).add(T.c.set(0, c.look, 0));
      const want = V().set(
        target.x + Math.sin(yaw) * dist * Math.cos(pitch),
        target.y + height - c.look + Math.sin(pitch) * dist * 0.6,
        target.z + Math.cos(yaw) * dist * Math.cos(pitch));
      if (this.first) this.pos.copy(want);
      this.pos.x = damp(this.pos.x, want.x, 14, dt);
      this.pos.z = damp(this.pos.z, want.z, 14, dt);
      this.pos.y = damp(this.pos.y, want.y, 8, dt);
      if (look.back || look.active) this.pos.copy(want);
      // don't go through walls or the ground
      const dir = T.c.copy(this.pos).sub(target);
      const len = dir.length();
      dir.divideScalar(len || 1);
      const hit = this.ph.castRay(target.x, target.y, target.z, dir.x, dir.y, dir.z, len + 0.3, GROUPS.camRay, t.body);
      pos.copy(this.pos);
      if (hit >= 0 && hit < len + 0.3) pos.copy(target).addScaledVector(dir, Math.max(0.6, hit - 0.35));
      const down = this.ph.castRay(pos.x, pos.y + 2, pos.z, 0, -1, 0, 6, GROUPS.camRay, t.body);
      if (down >= 0) pos.y = Math.max(pos.y, pos.y + 2 - down + 0.45);
      // look at a point a little ahead of the car
      const lookAt = T.a.copy(target).add(T.c.set(-Math.sin(yaw - back) * c.ahead * (back ? -1 : 1), 0, -Math.cos(yaw - back) * c.ahead * (back ? -1 : 1)));
      if (back) lookAt.copy(target);
      T.m.lookAt(pos, lookAt, T.c.set(0, 1, 0));
      quat.setFromRotationMatrix(T.m);
      fov = baseFov + c.fovBoost * clamp((speed - 8) / 50, 0, 1);
      near = 0.25;
    } else {
      // cockpit and hood: fixed to the car, with head movement in the cockpit
      const anchor = this.mode === 'cockpit' ? t.anchors.cockpit : t.anchors.hood;
      const local = T.b.copy(anchor);
      if (this.mode === 'cockpit') {
        // acceleration pushes the head the other way (in car space)
        const acc = T.c.copy(t.vel).sub(this.prevVel).divideScalar(Math.max(dt, 1e-3));
        const inv = T.q.copy(t.quat).invert();
        acc.applyQuaternion(inv);
        const target = V().set(clamp(-acc.x * 0.0035, -0.05, 0.05), clamp(-acc.y * 0.002, -0.03, 0.03), clamp(-acc.z * 0.003, -0.05, 0.05));
        this.headVel.addScaledVector(target.sub(this.head), 90 * dt);
        this.headVel.multiplyScalar(Math.exp(-12 * dt));
        this.head.addScaledVector(this.headVel, dt);
        local.add(this.head);
        near = 0.04;
        fov = baseFov - 4 + 5 * clamp((speed - 8) / 50, 0, 1);
      } else { near = 0.1; fov = baseFov + 4 * clamp((speed - 8) / 50, 0, 1); }
      pos.copy(local).applyQuaternion(t.quat).add(t.pos);
      T.e.set(this.lookPitch, this.lookYaw + back, 0);
      quat.copy(t.quat).multiply(T.q2.setFromEuler(T.e));
    }
    this.prevVel.copy(t.vel);

    // crash shake
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.12;
      pos.x += (Math.random() - 0.5) * s; pos.y += (Math.random() - 0.5) * s; pos.z += (Math.random() - 0.5) * s;
      this.shakeAmt = damp(this.shakeAmt, 0, 7, dt);
    }

    // blend from the previous view when switching
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.45);
      const e = this.blend * this.blend * (3 - 2 * this.blend);
      pos.lerpVectors(this.blendFrom.p, pos, e);
      quat.slerpQuaternions(this.blendFrom.q, quat, e);
      fov = this.blendFrom.fov + (fov - this.blendFrom.fov) * e;
    }
    cam.position.copy(pos);
    cam.quaternion.copy(quat);
    this.fov = damp(this.fov, fov, 6, dt);
    if (this.first) this.fov = fov;
    if (Math.abs(cam.fov - this.fov) > 0.01 || cam.near !== near) { cam.fov = this.fov; cam.near = near; cam.updateProjectionMatrix(); }
    this.first = false;
  }
}
