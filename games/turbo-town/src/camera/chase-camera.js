// TURBO TOWN - chase camera: follows behind the kart with a little lag, looks ahead,
// widens with speed and boosts, swings slightly into drifts, and looks behind on Q.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _t = new THREE.Vector3();

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.yaw = 0;
    this.fov = 70;
    this.shake = 0;
    this.distance = 4.3;
    this.height = 1.85;
    this.baseFov = 68;
    this.snapNext = true;
  }

  snap() { this.snapNext = true; }

  // kv: interpolated kart visual state { x, y, z, yaw, speed, top, boost, drift, back, air }
  update(kv, dt, groundAt) {
    const snap = this.snapNext;
    this.snapNext = false;
    // the camera yaw trails the kart heading (faster when the kart turns a lot)
    let dy = kv.yaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw = snap ? kv.yaw : this.yaw + dy * (1 - Math.exp(-dt * (kv.air ? 2.5 : 5.5)));
    const back = kv.back;
    const yaw = this.yaw + (back ? Math.PI : 0) + (kv.drift || 0) * 0.18;
    const spd = Math.max(0, kv.speed) / (kv.top || 28);
    const dist = this.distance + spd * 0.5 + (kv.boost ? 0.45 : 0);
    const hgt = this.height + spd * 0.2;
    _t.set(kv.x - Math.sin(yaw) * dist, kv.y + hgt, kv.z - Math.cos(yaw) * dist);
    // never dip below the ground behind the kart (hills)
    if (groundAt) {
      const gy = groundAt(_t.x, _t.z, kv.y + 6);
      if (_t.y < gy + 1.2) _t.y = gy + 1.2;
    }
    if (snap) this.pos.copy(_t);
    else {
      const k = 1 - Math.exp(-dt * 9);
      this.pos.x += (_t.x - this.pos.x) * k;
      this.pos.z += (_t.z - this.pos.z) * k;
      this.pos.y += (_t.y - this.pos.y) * (1 - Math.exp(-dt * (kv.air ? 3 : 6)));
    }
    const ahead = back ? -2 : 3.0;
    _v.set(kv.x + Math.sin(yaw) * ahead, kv.y + 1.15, kv.z + Math.cos(yaw) * ahead);
    if (snap) this.look.copy(_v); else this.look.lerp(_v, 1 - Math.exp(-dt * 14));

    const targetFov = this.baseFov + spd * 8 + (kv.boost ? 9 : 0);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * 4));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    this.camera.position.copy(this.pos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.look);
  }

  bump(amount) { this.shake = Math.min(1.2, this.shake + amount); }
}
