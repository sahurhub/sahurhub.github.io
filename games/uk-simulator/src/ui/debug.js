// UK Simulator - physics overlay (F3): per-wheel load, suspension, slip, tyre forces, surface,
// engine / motor, g-forces, plus force arrows drawn on the vehicle and a friction-circle plot.
import * as THREE from 'three';
import { SURFACE_NAMES } from '../physics/tyre.js';
import { FLAGS } from '../config.js';

export class DebugOverlay {
  constructor(game) {
    this.g = game; this.el = document.getElementById('hud-debug'); this.on = FLAGS.debug; this.el.hidden = !this.on; this.t = 0;
    this.cv = document.createElement('canvas'); this.cv.width = 260; this.cv.height = 130;
    this.text = document.createElement('div');
    this.el.append(this.text, this.cv);
    this.arrows = [];
    this.group = new THREE.Group(); game.scene.add(this.group);
    for (let k = 0; k < 4; k++) {
      const a = { load: new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0x33ff66), force: new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xff4444) };
      this.group.add(a.load, a.force); this.arrows.push(a);
    }
    this.group.visible = this.on;
  }

  toggle() { this.on = !this.on; this.el.hidden = !this.on; this.group.visible = this.on; }

  update(dt) {
    if (!this.on) return;
    const v = this.g.vehicle;
    // arrows every frame
    if (v) v.phys.wheels.forEach((w, k) => {
      const a = this.arrows[k];
      if (!a) return;
      const vis = w.contact;
      a.load.visible = a.force.visible = vis;
      if (!vis) return;
      const p = new THREE.Vector3(...w.p);
      a.load.position.copy(p); a.load.setLength(Math.max(0.05, w.load / 5000), 0.12, 0.06);
      const f = new THREE.Vector3(w.f[0] * w.fx + w.sd[0] * w.fy, w.f[1] * w.fx + w.sd[1] * w.fy, w.f[2] * w.fx + w.sd[2] * w.fy);
      const L = f.length();
      a.force.position.copy(p).add(new THREE.Vector3(0, 0.05, 0));
      if (L > 1) { a.force.setDirection(f.divideScalar(L)); a.force.setLength(Math.max(0.05, L / 5000), 0.12, 0.06); }
    });
    for (let k = v ? v.phys.wheels.length : 0; k < 4; k++) { this.arrows[k].load.visible = this.arrows[k].force.visible = false; }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.1;
    const st = this.g.world.stats();
    let s = `${st.chunks} chunks (${st.pending} loading), ${(st.tris / 1e6).toFixed(2)} M triangles, ${this.g.renderer.info.render.calls} draw calls\n`;
    if (!v) { this.text.textContent = s + 'On foot'; return; }
    const t = v.phys.telemetry();
    s += `${v.spec.name}\nspeed ${(t.speed * 3.6).toFixed(1)} km/h   g lat ${t.g[0].toFixed(2)} long ${t.g[1].toFixed(2)} vert ${t.g[2].toFixed(2)}\n`;
    if (v.phys.engine) s += `engine ${Math.round(t.rpm)} rpm  gear ${t.gear}  clutch ${(v.phys.engine.clutch * 100 | 0)}%  throttle ${(v.phys.engine.throttle * 100 | 0)}%${t.tc !== undefined && t.tc < 0.99 ? '  TC cut ' + Math.round((1 - t.tc) * 100) + '%' : ''}\n`;
    if (t.battery !== null && t.battery !== undefined) s += `battery ${(t.battery * 100).toFixed(1)}%  motor ${Math.round(t.watts)} W  used ${v.phys.battery.usedWh.toFixed(1)} Wh  regen ${v.phys.battery.regenWh.toFixed(1)} Wh\n`;
    if (t.stamina !== null && t.stamina !== undefined) s += `rider ${Math.round(t.watts)} W  stamina ${(t.stamina * 100) | 0}%\n`;
    if (t.lean !== undefined) s += `lean ${(t.lean * 57.3).toFixed(1)} deg  pitch ${(t.pitch * 57.3).toFixed(1)} deg  steer ${(t.steer * 57.3).toFixed(1)} deg${t.wobble > 0.01 ? '  wobble ' + t.wobble.toFixed(3) : ''}\n`;
    s += `damage F ${pct(t.damage.front)} R ${pct(t.damage.rear)} L ${pct(t.damage.left)} R ${pct(t.damage.right)}\n`;
    s += 'wheel  load N  susp mm  slip   angle   Fx N   Fy N   surface\n';
    const names = t.wheels.length === 4 ? ['FL', 'FR', 'RL', 'RR'] : ['F', 'R'];
    t.wheels.forEach((w, k) => {
      s += `${names[k].padEnd(5)} ${w.contact ? String(Math.round(w.load)).padStart(6) : '   air'} ${String(Math.round(w.x * 1000)).padStart(7)} ${w.slip.toFixed(3).padStart(6)} ${(w.angle * 57.3).toFixed(1).padStart(6)} ${String(Math.round(w.fx)).padStart(6)} ${String(Math.round(w.fy)).padStart(6)}  ${SURFACE_NAMES[w.surface] || '-'}\n`;
    });
    this.text.textContent = s;
    // friction circles: each tyre's (Fx, Fy) against its grip limit
    const c = this.cv.getContext('2d');
    c.clearRect(0, 0, 260, 130);
    t.wheels.forEach((w, k) => {
      const cx = 32 + k * 64, cy = 60, R = 26;
      c.strokeStyle = '#666'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
      const lim = Math.max(1, w.load * 1.1);
      c.fillStyle = w.contact ? '#ffcc33' : '#555';
      c.beginPath(); c.arc(cx + (-w.fy / lim) * R, cy - (w.fx / lim) * R, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#aaa'; c.font = '11px monospace'; c.fillText(names[k], cx - 6, 112);
    });
  }
}
const pct = (x) => Math.round(x * 100) + '%';
