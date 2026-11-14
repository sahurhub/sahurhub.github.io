// Third-person camera: mouse orbit, smooth follow, driving mode that settles behind the
// vehicle, speed FOV, shake on impacts and collision with buildings.
import * as THREE from 'three';
import { clamp, smooth, smoothAngle, wrapAngle } from './utils.js';

export class CameraRig {
  constructor(camera, collision) {
    this.cam = camera;
    this.coll = collision;
    this.yaw = Math.PI;          // camera behind a player facing +Z
    this.pitch = 0.32;
    this.dist = 6.5;
    this.distTarget = 6.5;
    this.zoom = 1;
    this.height = 1.5;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.fovBase = 70;
    this.fovExtra = 0;
    this.shake = 0;
    this.idleLook = 0;
    this.mode = 'foot';
    this.first = true;
  }

  setMode(mode, opts = {}) {
    this.mode = mode;
    this.distTarget = opts.dist || 6.5;
    this.heightTarget = opts.height || 1.5;
    this.idleLook = 1.5;     // let the auto-follow wait a moment
  }

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }

  update(dt, focus, controls, info) {
    // mouse look
    const sens = 0.0025;
    if (controls.lookX || controls.lookY) {
      this.yaw -= controls.lookX * sens;
      this.pitch = clamp(this.pitch + controls.lookY * sens, -0.25, 1.25);
      this.idleLook = 0;
    } else this.idleLook += dt;
    if (controls.zoom) this.zoom = clamp(this.zoom + controls.zoom * 0.12, 0.55, 1.8);

    // driving: swing behind the vehicle after a short pause in mouse input
    if (this.mode === 'vehicle' && info) {
      const behind = info.heading + Math.PI;
      const moving = Math.abs(info.speed) > 1.5;
      if (moving && this.idleLook > 0.9) {
        const rate = clamp(Math.abs(info.speed) * 0.12, 0.6, 3.2);
        const reverse = info.speed < -1;
        this.yaw = smoothAngle(this.yaw, reverse ? info.heading : behind, rate, dt);
        this.pitch = smooth(this.pitch, 0.24, 1.5, dt);
      }
      this.fovExtra = smooth(this.fovExtra, clamp(Math.abs(info.speed) / 30, 0, 1) * 16, 3, dt);
    } else {
      this.fovExtra = smooth(this.fovExtra, info && info.sprint ? 5 : 0, 3, dt);
    }

    this.dist = smooth(this.dist, this.distTarget * this.zoom, 3.5, dt);
    this.height = smooth(this.height, this.heightTarget || 1.5, 3.5, dt);
    this.target.set(focus.x, focus.y + this.height, focus.z);
    if (this.first) { this.smoothTarget.copy(this.target); this.first = false; }
    // critically-damped follow, tighter vertically
    this.smoothTarget.x = smooth(this.smoothTarget.x, this.target.x, 14, dt);
    this.smoothTarget.z = smooth(this.smoothTarget.z, this.target.z, 14, dt);
    this.smoothTarget.y = smooth(this.smoothTarget.y, this.target.y, 9, dt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dx = Math.sin(this.yaw) * cp, dz = Math.cos(this.yaw) * cp;
    let d = this.dist;
    const t = this.smoothTarget;
    const wantX = t.x + dx * d, wantY = t.y + sp * d + 0.3, wantZ = t.z + dz * d;
    // pull in when a building is between target and camera
    if (this.coll) {
      const f = this.coll.raycast(t.x, t.y, t.z, wantX, wantY, wantZ);
      if (f < 1) d = Math.max(1.2, d * f - 0.4);
    }
    let cx = t.x + dx * d, cy = Math.max(0.6, t.y + sp * d + 0.3), cz = t.z + dz * d;
    if (this.shake > 0.001) {
      const s = this.shake * 0.25;
      cx += (Math.random() - 0.5) * s; cy += (Math.random() - 0.5) * s; cz += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.cam.position.set(cx, cy, cz);
    this.cam.lookAt(t.x, t.y, t.z);
    const fov = this.fovBase + this.fovExtra;
    if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
  }

  // world-space forward direction of the camera on the ground plane
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  snapBehind(heading) { this.yaw = wrapAngle(heading + Math.PI); }
}
