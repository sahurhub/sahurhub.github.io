// UK Simulator - chase camera (third person, swings with the vehicle, mouse / stick to look
// around, never goes through walls) and first-person view (driver's seat / rider's eyes).
import * as THREE from 'three';

export class CameraRig {
  constructor(camera, physics) {
    this.cam = camera; this.ph = physics;
    this.mode = 'chase';   // 'chase' | 'first'
    this.yaw = 0; this.pitch = 0.2; this.orbitYaw = 0; this.orbitPitch = 0; this.orbitTimer = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.first = true;
    this.shake = 0;
  }

  toggle() { this.mode = this.mode === 'chase' ? 'first' : 'chase'; }

  // target: { pos (Vector3), quat (Quaternion), speed, spec (camera settings), kind, onFoot }
  update(dt, t, input) {
    const cam = this.cam;
    // mouse / right stick orbit, eases back behind after a moment
    if (input && (Math.abs(input.lookX) > 0.01 || Math.abs(input.lookY) > 0.01)) {
      this.orbitYaw -= input.lookX * 0.004; this.orbitPitch = Math.max(-0.5, Math.min(1.1, this.orbitPitch + input.lookY * 0.003)); this.orbitTimer = 2.0;
    } else if ((this.orbitTimer -= dt) <= 0 && !t.onFoot) { this.orbitYaw *= Math.pow(0.04, dt); this.orbitPitch *= Math.pow(0.04, dt); }
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(t.quat);
    const heading = Math.atan2(fwd.x, fwd.z);
    if (this.mode === 'first' && !t.onFoot) {
      const fp = t.spec.camera.fp;
      const p = new THREE.Vector3(fp[0], fp[1], fp[2]).applyQuaternion(t.quat).add(t.pos);
      cam.position.copy(p);
      const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.orbitPitch * 0.6, this.orbitYaw + (input && input.look ? Math.PI : 0), 0, 'YXZ'));
      // two-wheelers: keep the horizon a bit steadier than the bike's lean
      const q = t.quat.clone().multiply(look);
      if (t.kind !== 'car') {
        const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); e.z *= 0.6; q.setFromEuler(e);
      }
      cam.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      cam.fov = 75;
      this.first = true;
    } else {
      const s = t.spec ? t.spec.camera : { dist: 4.5, height: 1.8 };
      const speed = Math.abs(t.speed || 0);
      // follow the direction of travel when moving fast (looks good in slides)
      let yaw = heading;
      if (!t.onFoot && t.vel && speed > 4) { const vy = Math.atan2(t.vel.x, t.vel.z); let d = vy - heading; d = Math.atan2(Math.sin(d), Math.cos(d)); if (t.speed < 0) d = 0; yaw = heading + d * 0.35; }
      if (t.onFoot) yaw = this.yaw; // on foot the camera is free
      let dy = yaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      if (!t.onFoot) this.yaw += dy * Math.min(1, dt * (2.5 + speed * 0.06));
      const lookBack = input && input.look ? Math.PI : 0;
      const ya = this.yaw + this.orbitYaw + lookBack;
      const dist = s.dist + Math.min(2.5, speed * 0.035), height = s.height + this.orbitPitch * s.dist * 0.6;
      const target = new THREE.Vector3(t.pos.x, t.pos.y + (t.onFoot ? 1.5 : s.height * 0.55), t.pos.z);
      const want = new THREE.Vector3(target.x - Math.sin(ya) * dist, t.pos.y + height, target.z - Math.cos(ya) * dist);
      // keep the camera out of buildings and walls
      const dir = want.clone().sub(target), L = dir.length(); dir.divideScalar(L || 1);
      const hit = this.ph.castRay(target.x, target.y, target.z, dir.x, dir.y, dir.z, L, t.body || null, 0x0001);
      if (hit) want.copy(target).addScaledVector(dir, Math.max(0.8, hit.dist - 0.3));
      if (this.first) { this.pos.copy(want); this.first = false; }
      this.pos.lerp(want, Math.min(1, dt * 10));
      // ground clearance
      if (t.groundAt) { const g = t.groundAt(this.pos.x, this.pos.z) + 0.4; if (this.pos.y < g) this.pos.y = g; }
      cam.position.copy(this.pos);
      if (this.shake > 0) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.pow(0.02, dt); }
      cam.lookAt(target);
      cam.fov = 62 + Math.min(14, speed * 0.25);
    }
    cam.updateProjectionMatrix();
  }

  // on foot: the camera yaw follows the mouse
  turn(dx) { this.yaw -= dx; }
}
