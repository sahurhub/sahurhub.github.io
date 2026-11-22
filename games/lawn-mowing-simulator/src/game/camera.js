// Third-person, top-down and first-person cameras. Drag (mouse or trackpad) to look around,
// scroll or pinch to zoom.
import * as THREE from 'three';

export const CAM_MODES = ['third', 'top', 'first'];
export const CAM_NAMES = { third: 'Behind', top: 'Top-down', first: 'First person' };

export class CameraRig {
  constructor(camera, canvas) {
    this.cam = camera;
    this.mode = 'third';
    this.yaw = 0; this.yawOff = 0; this.pitchOff = 0; this.zoom = 1;
    this.look = new THREE.Vector3();
    this.pos = new THREE.Vector3(0, 10, -10);
    this.idle = 0;
    this.orbitT = 0;
    this.dragging = false;
    let lx = 0, ly = 0, pid = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // touch uses the on-screen stick; one-finger drags on the canvas still orbit below
      pid = e.pointerId; lx = e.clientX; ly = e.clientY; this.dragging = true;
    });
    addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== pid) return;
      this.yawOff -= (e.clientX - lx) * 0.006;
      this.pitchOff = Math.max(-0.5, Math.min(0.7, this.pitchOff + (e.clientY - ly) * 0.004));
      lx = e.clientX; ly = e.clientY; this.idle = 0;
    });
    addEventListener('pointerup', (e) => { if (e.pointerId === pid) { this.dragging = false; pid = null; } });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(0.55, Math.min(1.9, this.zoom * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: false });
    // touch: drag on the canvas (not the stick) to look around, pinch to zoom
    const touches = new Map();
    canvas.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) touches.set(t.identifier, [t.clientX, t.clientY]); }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (touches.size === 2 && e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (this.pinch) this.zoom = Math.max(0.55, Math.min(1.9, this.zoom * (this.pinch / d)));
        this.pinch = d;
      } else for (const t of e.changedTouches) {
        const p = touches.get(t.identifier);
        if (!p) continue;
        this.yawOff -= (t.clientX - p[0]) * 0.008;
        touches.set(t.identifier, [t.clientX, t.clientY]);
        this.idle = 0;
      }
    }, { passive: true });
    canvas.addEventListener('touchend', (e) => { for (const t of e.changedTouches) touches.delete(t.identifier); if (touches.size < 2) this.pinch = 0; }, { passive: true });
  }

  setMode(m) { this.mode = m; this.yawOff = 0; this.pitchOff = 0; this.snap = true; }
  next() { const i = CAM_MODES.indexOf(this.mode); this.setMode(CAM_MODES[(i + 1) % CAM_MODES.length]); return this.mode; }

  // t = { x, y, z, h, speed }, spec = mower data (camDist, camHeight, rider), terrain(x, z)
  update(dt, t, spec, terrain) {
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 4);
    this.snap = false;
    // the yaw follows the mower heading smoothly; drag offsets drift back while driving
    let dh = t.h - this.yaw;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.yaw += dh * (k > 0.99 ? 1 : 1 - Math.exp(-dt * 3));
    if (!this.dragging) {
      this.idle += dt;
      if (this.idle > 1.2 && t.speed > 0.3) { this.yawOff *= Math.exp(-dt * 1.5); this.pitchOff *= Math.exp(-dt * 1.5); }
    }
    const cam = this.cam;
    const want = new THREE.Vector3(), look = new THREE.Vector3();
    if (this.mode === 'top') {
      const hgt = (spec.camDist * 2.6 + 6) * this.zoom;
      want.set(t.x, t.y + hgt, t.z - hgt * 0.32);
      look.set(t.x, t.y, t.z + 0.5);
    } else if (this.mode === 'first') {
      const fx = Math.sin(t.h + this.yawOff), fz = Math.cos(t.h + this.yawOff);
      if (spec.rider === 'walk') want.set(t.x - Math.sin(t.h) * 1.55, t.y + 1.75, t.z - Math.cos(t.h) * 1.55);
      else if (spec.rider === 'seat') want.set(t.x - Math.sin(t.h) * 0.25, t.y + 1.75, t.z - Math.cos(t.h) * 0.25);
      else want.set(t.x - Math.sin(t.h) * 0.2, t.y + 0.45, t.z - Math.cos(t.h) * 0.2);
      look.set(want.x + fx * 4, want.y - 1.1 - this.pitchOff * 3, want.z + fz * 4);
      this.pos.copy(want); this.look.copy(look);
      cam.position.copy(want); cam.lookAt(look);
      return;
    } else {
      const yaw = this.yaw + this.yawOff;
      const dist = spec.camDist * this.zoom;
      const hgt = spec.camHeight * this.zoom * (1 + this.pitchOff);
      want.set(t.x - Math.sin(yaw) * dist, t.y + hgt, t.z - Math.cos(yaw) * dist);
      look.set(t.x + Math.sin(yaw) * 1.8, t.y + 0.7, t.z + Math.cos(yaw) * 1.8);
    }
    const ground = terrain(want.x, want.z) + 0.8;
    if (want.y < ground) want.y = ground;
    const kp = this.mode === 'top' ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 10);
    this.pos.lerp(want, k > 0.99 ? 1 : kp);
    this.look.lerp(look, k > 0.99 ? 1 : 1 - Math.exp(-dt * 12));
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
  }

  // slow orbit for the title screen
  orbit(dt, center, r, h) {
    this.orbitT += dt * 0.08;
    this.pos.set(center.x + Math.sin(this.orbitT) * r, center.y + h, center.z + Math.cos(this.orbitT) * r);
    this.look.copy(center);
    this.cam.position.copy(this.pos);
    this.cam.lookAt(center);
  }
}
