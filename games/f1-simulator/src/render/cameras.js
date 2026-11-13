// Camera views. On-board cameras are placed per car model (see CarVisual._fitCameras), so no
// camera ends up inside bodywork, and they ride with the car body over hills, kerbs and bumps.
import * as THREE from 'three';
import { clamp, wrapPi } from '../core/math.js';

export const CAMERAS = [
  { id: 'chase', name: 'Chase', type: 'chase', back: 6.4, up: 2.1, lookUp: 0.9, fov: 62 },
  { id: 'farchase', name: 'Far Chase', type: 'chase', back: 10.5, up: 3.5, lookUp: 0.8, fov: 58 },
  { id: 'halo', name: 'Halo', type: 'onboard', anchor: 'halo', fov: 64, haloHud: true },
  { id: 'halooffset', name: 'Halo Offset', type: 'onboard', anchor: 'haloOffset', fov: 64, haloHud: true },
  { id: 'cockpit', name: 'Cockpit', type: 'onboard', anchor: 'eye', fov: 78, cockpit: true },
  { id: 'nose', name: 'Nose', type: 'onboard', anchor: 'nose', fov: 72 },
  { id: 'frontwing', name: 'Front Wing', type: 'onboard', anchor: 'frontWing', fov: 80 },
  { id: 'rearwing', name: 'Rear Wing (looking back)', type: 'onboard', anchor: 'rearWing', fov: 70 },
];

const t = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.yaw = 0;
    this.first = true;
    this.lookBack = false;
    this.shake = 0;
    this.gx = 0; this.gz = 0;
    this.fovOffset = 0; // user camera customisation
    this.heightOffset = 0;
  }

  next() { this.mode = (this.mode + 1) % CAMERAS.length; this.first = true; return CAMERAS[this.mode]; }
  set(id) { const k = CAMERAS.findIndex((c) => c.id === id); if (k >= 0) { this.mode = k; this.first = true; } }
  get current() { return CAMERAS[this.mode]; }

  /** @param vis the player's CarVisual (its group / body world matrices must be up to date) */
  update(veh, dt, vis) {
    const cam = this.camera;
    let c = CAMERAS[this.mode];
    const speedK = clamp(veh.speed / 90, 0, 1);
    const fit = vis && vis.fit;
    if (c.type === 'onboard' && this.lookBack) c = CAMERAS.find((x) => x.id === 'rearwing');
    if (c.type === 'chase' || !fit) {
      // the camera swings round behind the car with a little lag, and looks where it is going
      const cc = c.type === 'chase' ? c : CAMERAS[0];
      const slip = veh.speed > 3 ? Math.atan2(veh.vy, Math.max(veh.vx, 1)) : 0;
      const want = veh.psi + clamp(slip, -0.5, 0.5) * 0.6;
      if (this.first) { this.yaw = want; this.first = false; }
      this.yaw += wrapPi(want - this.yaw) * Math.min(1, dt * 7);
      const dir = this.lookBack ? -1 : 1;
      const back = cc.back * (1 + 0.06 * speedK);
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const y0 = veh.y || 0;
      cam.position.set(veh.x - sy * back * dir, y0 + cc.up + this.heightOffset - (veh.slopeF || 0) * back * dir, veh.z - cy * back * dir);
      t.set(veh.x + sy * 4 * dir, y0 + cc.lookUp + (veh.slopeF || 0) * 4 * dir, veh.z + cy * 4 * dir);
      cam.up.set(0, 1, 0);
      cam.lookAt(t);
    } else {
      // on-board: a point fixed to the car body, plus a little movement from g-forces
      const a = fit[c.anchor];
      const k = Math.min(1, dt * 10);
      this.gx += (clamp(veh.ayF, -50, 50) * (c.cockpit ? 0.0005 : 0.00015) - this.gx) * k;
      this.gz += (clamp(veh.axF, -55, 20) * (c.cockpit ? 0.0008 : 0.00025) - this.gz) * k;
      p.set(a.pos.x - this.gx, a.pos.y + this.heightOffset, a.pos.z - this.gz);
      vis.body.localToWorld(cam.position.copy(p));
      vis.body.localToWorld(t.copy(a.look));
      up.set(0, 1, 0).applyQuaternion(vis.body.getWorldQuaternion(this._q || (this._q = new THREE.Quaternion())));
      cam.up.copy(up);
      cam.lookAt(t);
    }
    // vibration from kerbs, gravel and sheer speed
    const amp = (veh.rumble * 0.01 + speedK * speedK * 0.002) * (c.type === 'chase' ? 0.4 : 1);
    if (amp > 0) {
      this.shake += dt * 55;
      cam.position.y += Math.sin(this.shake * 1.7) * amp;
      cam.position.x += Math.sin(this.shake * 2.3) * amp * 0.5;
    }
    const fov = c.fov + this.fovOffset + (c.type === 'chase' ? speedK * 7 : speedK * 2);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    return c;
  }
}
