// Halo graphics drawn IN the 3D world, on top of the car's halo (like the 2026 TV on-boards):
//  - a curved strip laid along the top of the halo hoop (left arm: position and driver names;
//    middle: brake / recharge and throttle / deploy bars; right arm: active aero, gears, rpm)
//  - a round speed dial floating above the front of the halo (km/h, boost, overtake, mph)
// Both are textures painted on a canvas a few times a second and attached to the car body, so
// they stay on the halo from any camera, including Halo Offset.
import * as THREE from 'three';

const W = 2048, H = 192;          // strip canvas
const D = 320;                    // dial canvas
const MODE = ['HARVEST', 'MEDIUM', 'HOTLAP'];

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export class HaloHud3D {
  /**
   * @param vis   the player's CarVisual (needs vis.hoop and vis.fit from _fitCameras)
   * @param team  team record (colour)
   */
  constructor(vis, team) {
    this.vis = vis;
    this.color = team.color;
    this.group = new THREE.Group();
    this.group.name = 'haloHud';
    // ---- strip along the hoop -----------------------------------------------------------
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    this.strip = new THREE.Mesh(this._stripGeometry(vis.hoop, vis.helmet), mat);
    this.strip.renderOrder = 10;
    this.group.add(this.strip);
    // ---- dial above the front of the halo --------------------------------------------------
    this.dc = document.createElement('canvas');
    this.dc.width = D; this.dc.height = D;
    this.dctx = this.dc.getContext('2d');
    this.dtex = new THREE.CanvasTexture(this.dc);
    this.dtex.colorSpace = THREE.SRGBColorSpace;
    const front = this.front;
    this.dial = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshBasicMaterial({ map: this.dtex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.dial.position.set(front.x, front.y + 0.15, front.z + 0.06);
    this.dial.renderOrder = 11;
    // face the centre halo camera
    if (vis.fit) this.dial.lookAt(vis.fit.halo.pos);
    this.group.add(this.dial);
    vis.body.add(this.group);
    this.group.visible = false;
    this.t = 0;
  }

  /** Ribbon geometry following the measured top of the hoop, left end (u=0) to right end. */
  _stripGeometry(hoop, Hc) {
    let pts = hoop && hoop.length >= 10 ? hoop : null;
    if (!pts) {   // fallback: a typical halo shape around the helmet
      pts = [];
      for (let deg = 100; deg >= -100; deg -= 5) pts.push({ deg, r: 0.3, w: 0.06, y: Hc.y + 0.1 });
    }
    pts = [...pts].sort((a, b) => b.deg - a.deg);            // +deg (car's left) first
    const n = pts.length;
    const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
    const d0 = pts[0].deg, d1 = pts[n - 1].deg;
    for (let k = 0; k < n; k++) {
      const p = pts[k], a = (p.deg * Math.PI) / 180, dx = Math.sin(a), dz = Math.cos(a);
      // a band sitting on the hoop and tilted up towards the halo cameras (outer edge raised),
      // wider than the hoop itself like the TV graphic, so it reads clearly from behind
      const rin = p.r - 0.025, rout = p.r + 0.105;
      const y = p.y + 0.008;
      const cx = Hc.x + dx * p.r, cz = Hc.z + dz * p.r;
      pos.set([Hc.x + dx * rin, y, Hc.z + dz * rin, Hc.x + dx * rout, y + 0.085, Hc.z + dz * rout], k * 6);   // inner, outer
      const u = (d0 - p.deg) / (d0 - d1);
      uv.set([u, 0, u, 1], k * 4);
      if (k < n - 1) { const i = k * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
      if (p.deg === 0 || (k > 0 && pts[k - 1].deg > 0 && p.deg <= 0)) this.front = { x: cx, y, z: cz };
    }
    if (!this.front) { const p = pts[Math.floor(n / 2)]; const a = (p.deg * Math.PI) / 180; this.front = { x: Hc.x + Math.sin(a) * p.r, y: p.y, z: Hc.z + Math.cos(a) * p.r }; }
    this.uOf = (deg) => (d0 - deg) / (d0 - d1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  setVisible(v) { this.group.visible = v; }

  /** Repaint (a few times a second). info: { pos, name, ahead } */
  update(dt, veh, info) {
    if (!this.group.visible) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1 / 20;
    this._paintStrip(veh, info);
    this._paintDial(veh);
  }

  _x(deg) { return this.uOf(deg) * W; }

  _paintStrip(veh, info) {
    const g = this.ctx, eng = veh.p.engine, col = this.color;
    g.clearRect(0, 0, W, H);
    // band
    g.fillStyle = 'rgba(6, 22, 21, 0.72)';
    roundRect(g, 4, 8, W - 8, H - 16, 40); g.fill();
    g.fillStyle = col; g.fillRect(30, 8, W - 60, 7);              // team colour along the outer edge
    g.textBaseline = 'middle';
    const top = 62, bot = 140;
    // left arm: position and names
    let x = this._x(80);
    g.fillStyle = '#e10600'; roundRect(g, x, top - 34, 60, 64, 8); g.fill();
    g.fillStyle = '#fff'; g.font = '900 52px Arial, sans-serif'; g.textAlign = 'center';
    g.fillText(String(info.pos || '-'), x + 30, top);
    g.textAlign = 'left'; g.font = '900 56px Arial, sans-serif';
    g.fillText((info.name || '').toUpperCase(), x + 76, top + 2);
    g.font = '700 38px Arial, sans-serif'; g.fillStyle = '#cfe3df';
    g.fillText(info.ahead || '', x + 76, bot + 4);
    // brake / recharge
    const bar = (deg0, deg1, y, f, color, label, right) => {
      const a = this._x(deg0), b = this._x(deg1);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(a, y - 13, b - a, 26);
      g.fillStyle = color; const w = (b - a) * Math.max(0, Math.min(1, f));
      if (right) g.fillRect(b - w, y - 13, w, 26); else g.fillRect(a, y - 13, w, 26);
      g.font = '700 26px Arial, sans-serif'; g.fillStyle = '#e8f6f3'; g.textAlign = right ? 'right' : 'left';
      g.fillText(label, right ? b : a, y + (y < H / 2 ? -30 : 34));
    };
    bar(30, 9, top, veh.brake, '#ff3b30', 'BRAKE', true);
    bar(30, 9, bot, veh.harvestKw / (eng.mgukKw || 350), '#3fa8ff', 'RECHARGE', true);
    bar(-9, -30, top, veh.throttle, '#36e07a', 'THROTTLE', false);
    bar(-9, -30, bot, veh.deployKw / (eng.mgukKw || 350), '#33e1c5', 'DEPLOY', false);
    // active aero
    x = this._x(-34);
    const open = veh.aeroK > 0.5;
    g.textAlign = 'left'; g.font = '800 30px Arial, sans-serif'; g.fillStyle = open ? '#7dffb0' : '#cfe3df';
    g.fillText('ACTIVE AERO', x, top);
    g.fillStyle = open ? '#36e07a' : 'rgba(255,255,255,0.25)';
    g.fillRect(x, bot - 14, 150, 9); g.fillRect(x, bot + 6, 150, 9);
    // gears
    const gears = ['N', '1', '2', '3', '4', '5', '6', '7', '8'];
    const gx0 = this._x(-56), gx1 = this._x(-96), step = (gx1 - gx0) / gears.length;
    g.textAlign = 'center'; g.font = '800 40px Arial, sans-serif';
    gears.forEach((n, k) => {
      const cx = gx0 + step * (k + 0.5);
      if (k === Math.max(0, veh.gear)) { g.fillStyle = '#8bdc3a'; roundRect(g, cx - step * 0.42, top - 28, step * 0.84, 56, 6); g.fill(); g.fillStyle = '#0b1a07'; }
      else g.fillStyle = '#cfe3df';
      g.fillText(n, cx, top + 2);
    });
    g.font = '700 22px Arial, sans-serif'; g.fillStyle = '#e8f6f3'; g.textAlign = 'left';
    g.fillText('GEARS', gx0, top - 46 < 14 ? 30 : top - 46);
    // rpm bar with ticks 0..15
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(gx0, bot - 10, gx1 - gx0, 20);
    g.fillStyle = col; g.fillRect(gx0, bot - 10, (gx1 - gx0) * Math.min(1, veh.rpm / 15000), 20);
    g.fillStyle = '#dff'; for (let k = 0; k <= 15; k++) { const tx = gx0 + ((gx1 - gx0) * k) / 15; g.fillRect(tx - 1.5, bot + 12, 3, k % 5 === 0 ? 18 : 9); }
    g.font = '700 22px Arial, sans-serif'; g.textAlign = 'right'; g.fillText('RPM x1000', gx1, bot + 44 > H - 12 ? H - 14 : bot + 44);
    // ERS mode under the centre
    g.textAlign = 'center'; g.font = '800 26px Arial, sans-serif'; g.fillStyle = '#ffe45e';
    g.fillText('ERS ' + (MODE[veh.ersMode] || ''), this._x(0), bot + 2);
    this.tex.needsUpdate = true;
  }

  _paintDial(veh) {
    const g = this.dctx, c = D / 2, eng = veh.p.engine;
    g.clearRect(0, 0, D, D);
    g.fillStyle = 'rgba(6, 20, 19, 0.88)'; g.beginPath(); g.arc(c, c, c - 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = this.color; g.lineWidth = 8; g.stroke();
    // battery ring
    const soc = eng.batteryMj ? veh.battery / (eng.batteryMj * 1e6) : 0;
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 10; g.beginPath(); g.arc(c, c, c - 26, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
    g.strokeStyle = '#ffe45e'; g.beginPath(); g.arc(c, c, c - 26, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * soc)); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#bfe6df'; g.font = '700 24px Arial, sans-serif';
    g.fillText('KM/H', c, 72);
    g.fillStyle = '#fff'; g.font = '900 88px Arial, sans-serif'; g.fillText(String(Math.round(veh.kph)), c, 124);
    const chip = (y, on, label) => {
      g.fillStyle = on ? '#3ad36d' : 'rgba(255,255,255,0.1)'; roundRect(g, c - 92, y - 17, 184, 34, 6); g.fill();
      g.fillStyle = on ? '#04220f' : '#e8f6f3'; g.font = '800 22px Arial, sans-serif'; g.fillText(label, c, y + 1);
    };
    chip(180, !!veh.boosting, 'BOOST');
    chip(220, !!veh.overtakeAvail, 'OVERTAKE');
    g.fillStyle = '#fff'; g.font = '800 34px Arial, sans-serif'; g.fillText(String(Math.round(veh.kph * 0.621371)), c, 262);
    g.fillStyle = '#bfe6df'; g.font = '700 18px Arial, sans-serif'; g.fillText('MPH', c, 290);
    this.dtex.needsUpdate = true;
  }
}
