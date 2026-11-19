// UK Simulator - full-screen map: drag to pan, wheel / pinch to zoom, click to set a waypoint.
import { TYPE_COLOUR, TYPE_NAME } from '../game/events.js';
import { escapeHtml as esc } from './hud.js';

export class BigMap {
  constructor(game) {
    this.g = game; this.open = false;
    this.el = document.getElementById('bigmap'); this.cv = document.getElementById('bigmap-canvas'); this.info = document.getElementById('bigmap-info');
    this.img = new Image(); this.img.src = game.base + 'data/map.webp';
    this.cx = 0; this.cz = 0; this.scale = 1.2; // metres per screen pixel
    let drag = null, moved = 0;
    const pts = new Map();
    this.cv.addEventListener('pointerdown', (e) => { this.cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = [e.clientX, e.clientY]; moved = 0; });
    this.cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const before = Math.hypot(a[0] - b[0], a[1] - b[1]);
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        const [c, d] = [...pts.values()];
        const after = Math.hypot(c[0] - d[0], c[1] - d[1]);
        if (before > 0 && after > 0) this.scale = Math.max(0.3, Math.min(8, this.scale * before / after));
      } else {
        this.cx -= (e.clientX - prev[0]) * this.scale; this.cz -= (e.clientY - prev[1]) * this.scale; moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]);
        pts.set(e.pointerId, [e.clientX, e.clientY]);
      }
      this.draw();
    });
    this.cv.addEventListener('pointerup', (e) => {
      pts.delete(e.pointerId);
      if (moved < 6 && drag) {
        const r = this.cv.getBoundingClientRect();
        const x = this.cx + (e.clientX - r.width / 2) * this.scale, z = this.cz + (e.clientY - r.height / 2) * this.scale;
        this.g.events.waypoint = [x, z]; this.g.events.routeTimer = 0;
        this.g.hud.toast('Waypoint set - follow the purple line on the minimap.');
        this.draw();
      }
      drag = null;
    });
    this.cv.addEventListener('wheel', (e) => { e.preventDefault(); this.scale = Math.max(0.3, Math.min(8, this.scale * (e.deltaY > 0 ? 1.15 : 0.87))); this.draw(); }, { passive: false });
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.hidden = !this.open;
    if (this.open) { const p = this.g.playerPos(); this.cx = p.x; this.cz = p.z; this.draw(); }
  }

  draw() {
    const cv = this.cv, c = cv.getContext('2d');
    cv.width = cv.clientWidth; cv.height = cv.clientHeight;
    const W = cv.width, H = cv.height, m = this.g.manifest.map;
    const T = (x, z) => [W / 2 + (x - this.cx) / this.scale, H / 2 + (z - this.cz) / this.scale];
    c.fillStyle = '#cfdcb0'; c.fillRect(0, 0, W, H);
    const [ix, iz] = T(m.x0, m.z0);
    c.imageSmoothingEnabled = this.scale > 1;
    c.drawImage(this.img, ix, iz, m.w * m.s / this.scale, m.h * m.s / this.scale);
    // street names when zoomed in
    if (this.scale < 1.5) {
      c.font = '12px system-ui'; c.fillStyle = '#333'; c.textAlign = 'center';
      const seen = new Set();
      for (const ch of this.g.world.chunks.values()) for (const r of ch.named) {
        const name = this.g.world.names[r.n];
        const key = name + Math.round((ch.x0 + r.p[0]) / 300) + Math.round((ch.z0 + r.p[1]) / 300);
        if (seen.has(key) || r.p.length < 6) continue;
        seen.add(key);
        const k = Math.floor(r.p.length / 4) * 2;
        const [x, y] = T(ch.x0 + r.p[k], ch.z0 + r.p[k + 1]);
        if (x < 0 || y < 0 || x > W || y > H) continue;
        const ang = Math.atan2(r.p[k + 3] - r.p[k + 1], r.p[k + 2] - r.p[k]);
        c.save(); c.translate(x, y); c.rotate(ang > Math.PI / 2 || ang < -Math.PI / 2 ? ang + Math.PI : ang); c.fillText(name, 0, -3); c.restore();
      }
    }
    // route
    const route = this.g.events.gps;
    if (route) { c.strokeStyle = '#8a5cff'; c.lineWidth = 4; c.beginPath(); route.forEach((q, k) => { const [x, y] = T(q[0], q[1]); if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); }
    // events
    for (const ev of this.g.events.list) {
      const [x, y] = T(ev.start[0], ev.start[1]);
      c.fillStyle = '#' + TYPE_COLOUR[ev.type].toString(16).padStart(6, '0'); c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    for (const r of this.g.remotes.list()) { const [x, y] = T(r.pos.x, r.pos.z); c.fillStyle = '#5aa9ff'; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); c.fillStyle = '#000'; c.font = 'bold 12px system-ui'; c.fillText(r.name, x, y - 10); }
    const p = this.g.playerPos(); const [px, py] = T(p.x, p.z);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(px, py, 8, 0, Math.PI * 2); c.fill(); c.stroke();
    if (this.g.events.waypoint) { const [wx, wy] = T(...this.g.events.waypoint); c.fillStyle = '#ffcc33'; c.beginPath(); c.arc(wx, wy, 7, 0, Math.PI * 2); c.fill(); }
    this.info.innerHTML = `<b>Leighton Buzzard and Linslade</b><br>Drag to move, scroll or pinch to zoom, click to set a waypoint. M or Esc to close.<br>${Object.entries(TYPE_NAME).filter(([k]) => k !== 'delivery').map(([k, n]) => `<span style="color:#${TYPE_COLOUR[k].toString(16).padStart(6, '0')}">&#9679;</span> ${esc(n)}`).join(' &nbsp; ')}`;
  }
}
