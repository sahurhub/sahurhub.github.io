// TURBO TOWN - Time Trial ghosts: record the player's run (position + heading 10 times a
// second) and replay the best run as a see-through kart. Stored compactly as base64.
import * as THREE from 'three';
import { KartVisual } from '../karts/kart-visual.js';
import { KART_BY_ID } from '../shared/karts.js';

const HZ = 10;

export class GhostRecorder {
  constructor() { this.data = []; this.next = 0; }
  sample(t, k) {
    if (t < this.next) return;
    this.next = t + 1 / HZ;
    this.data.push(t, k.x, k.y, k.z, k.yaw);
  }
  // compact: Float32 -> base64
  encode(meta) {
    const f = new Float32Array(this.data);
    const bytes = new Uint8Array(f.buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return { v: 1, hz: HZ, kart: meta.kart, driver: meta.driver, paint: meta.paint, data: btoa(s) };
  }
}

export function decodeGhost(g) {
  if (!g || !g.data) return null;
  const s = atob(g.data);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return { ...g, f: new Float32Array(bytes.buffer) };
}

export class GhostPlayer {
  constructor(ghost, assets, scene) {
    this.g = decodeGhost(ghost);
    const def = KART_BY_ID[ghost.kart] || KART_BY_ID.starter;
    this.vis = new KartVisual(def, { assets, driver: ghost.driver, paint: ghost.paint, blob: false });
    const mat = new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.38, depthWrite: false });
    this.vis.root.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    scene.add(this.vis.root);
    this.i = 0;
    this.fake = { snx: 0, sny: 1, snz: 0 };
  }
  update(t) {
    if (!this.g) { this.vis.root.visible = false; return; }
    const f = this.g.f, n = f.length / 5;
    if (n < 2) return;
    while (this.i < n - 2 && f[(this.i + 1) * 5] < t) this.i++;
    while (this.i > 0 && f[this.i * 5] > t) this.i--;
    const a = this.i * 5, b = a + 5;
    const u = Math.max(0, Math.min(1, (t - f[a]) / Math.max(1e-4, f[b] - f[a])));
    let dy = f[b + 4] - f[a + 4];
    if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
    const r = this.vis.root;
    r.position.set(f[a + 1] + (f[b + 1] - f[a + 1]) * u, f[a + 2] + (f[b + 2] - f[a + 2]) * u, f[a + 3] + (f[b + 3] - f[a + 3]) * u);
    r.rotation.set(0, f[a + 4] + dy * u, 0);
    r.visible = t <= f[(n - 1) * 5] + 0.5;
  }
  dispose() { this.vis.dispose(); }
}
