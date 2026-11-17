// TURBO TOWN - chase camera: low and close behind the kart (like Kart Bros), locked to the
// kart's heading with a small 10 degree slack either way, a field of view that hardly
// changes with speed, and an instant look-behind on Shift.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _t = new THREE.Vector3();
const SLACK = 10 * Math.PI / 180; // the kart can turn this far before the camera follows

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.yaw = 0;
    this.fov = 62;
    this.shake = 0;
    this.distance = 3.7;
    this.height = 1.6;
    this.baseFov = 62;
    this.snapNext = true;
    this.wasBack = false;
  }

  snap() { this.snapNext = true; }

  // kv: interpolated kart visual state { x, y, z, yaw, speed, top, boost, drift, back, air }
  update(kv, dt, groundAt) {
    const back = !!kv.back;
    // looking behind (or back to the front) happens at once, no swing
    const snap = this.snapNext || back !== this.wasBack;
    this.snapNext = false;
    this.wasBack = back;
    // camera heading: locked to the kart with a little slack. Inside +-10 degrees it
    // eases back behind the kart; past that it turns with the kart straight away.
    let dy = kv.yaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    if (snap || Math.abs(dy) > Math.PI * 0.75) this.yaw = kv.yaw;
    else if (dy > SLACK) this.yaw = kv.yaw - SLACK;
    else if (dy < -SLACK) this.yaw = kv.yaw + SLACK;
    this.yaw += (kv.yaw - this.yaw) * (1 - Math.exp(-dt * (kv.air ? 1.5 : 3)));
    const yaw = this.yaw + (back ? Math.PI : 0);
    const spd = Math.max(0, kv.speed) / (kv.top || 28);
    const dist = this.distance + spd * 0.25 + (kv.boost ? 0.2 : 0);
    const hgt = this.height + spd * 0.08;
    _t.set(kv.x - Math.sin(yaw) * dist, kv.y + hgt, kv.z - Math.cos(yaw) * dist);
    // never dip below the ground behind the kart (hills)
    if (groundAt) {
      const gy = groundAt(_t.x, _t.z, kv.y + 6);
      if (_t.y < gy + 1.0) _t.y = gy + 1.0;
    }
    if (snap) this.pos.copy(_t);
    else {
      // follows closely: the kart stays put on screen
      const k = 1 - Math.exp(-dt * 18);
      this.pos.x += (_t.x - this.pos.x) * k;
      this.pos.z += (_t.z - this.pos.z) * k;
      this.pos.y += (_t.y - this.pos.y) * (1 - Math.exp(-dt * (kv.air ? 4 : 10)));
    }
    const ahead = back ? -2 : 4.5;
    _v.set(kv.x + Math.sin(yaw) * ahead, kv.y + 0.95, kv.z + Math.cos(yaw) * ahead);
    if (snap) this.look.copy(_v); else this.look.lerp(_v, 1 - Math.exp(-dt * 20));

    // the view only widens a little with speed and boosts (tall phone screens see wider)
    this.baseFov = this.camera.aspect < 1 ? 76 : 62;
    const targetFov = this.baseFov + spd * 2 + (kv.boost ? 2 : 0);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * 3));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    this.camera.position.copy(this.pos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.2;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.look);
  }

  bump(amount) { this.shake = Math.min(1.2, this.shake + amount); }
}
