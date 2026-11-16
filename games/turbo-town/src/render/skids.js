// TURBO TOWN - skid marks: dark strips left on the road by the rear wheels while a kart
// drifts. One mesh with a ring buffer of quads, so old marks are reused (and fade out
// naturally as they get overwritten).
import * as THREE from 'three';

const MAX = 1400; // quads (segments) kept on the road

export class SkidMarks {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 6 * 3);
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: '#1d1a2a', transparent: true, opacity: 0.45, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'skids';
    scene.add(this.mesh);
    this.next = 0; this.count = 0;
    this.last = new Map(); // "kartId:wheel" -> last point
  }

  // a wheel at (x, y, z) heading (dx, dz); on = whether it is leaving a mark this frame
  wheel(key, x, y, z, on, width = 0.26) {
    const prev = this.last.get(key);
    if (!on) { if (prev) this.last.delete(key); return; }
    if (!prev) { this.last.set(key, { x, y, z }); return; }
    const dx = x - prev.x, dz = z - prev.z, d = Math.hypot(dx, dz);
    if (d < 0.35) return;          // wait until it has moved a little
    if (d > 4) { this.last.set(key, { x, y, z }); return; } // teleported (respawn)
    const rx = -dz / d * width / 2, rz = dx / d * width / 2;
    const p = this.pos, o = this.next * 18;
    const a = [prev.x - rx, prev.y + 0.03, prev.z - rz], b = [prev.x + rx, prev.y + 0.03, prev.z + rz];
    const c = [x + rx, y + 0.03, z + rz], e = [x - rx, y + 0.03, z - rz];
    const v = [a, b, c, a, c, e];
    for (let i = 0; i < 6; i++) { p[o + i * 3] = v[i][0]; p[o + i * 3 + 1] = v[i][1]; p[o + i * 3 + 2] = v[i][2]; }
    this.next = (this.next + 1) % MAX;
    this.count = Math.min(MAX, this.count + 1);
    this.mesh.geometry.setDrawRange(0, this.count * 6);
    this.attr.needsUpdate = true;
    this.last.set(key, { x, y, z });
  }

  clear() {
    this.next = 0; this.count = 0; this.last.clear();
    this.mesh.geometry.setDrawRange(0, 0);
  }
}
