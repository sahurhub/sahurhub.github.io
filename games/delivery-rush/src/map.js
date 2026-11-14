// City map drawing: a static base image (roads, districts, buildings) plus live overlays for the
// minimap (rotating, around the player) and the full map (pan / zoom / waypoints / jobs).
import { CITY, DISTRICTS } from './config.js';
import { districtAtCell, gx } from './cityLayout.js';
import { TEX } from './textures.js';

const EXT = 640;               // map covers -EXT..EXT metres
const PPM = 1.4;               // base image pixels per metre

export class CityMap {
  constructor(game) {
    this.g = game;
    this.L = game.layout;
    this.size = Math.round(EXT * 2 * PPM);
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = this.size;
    this.drawBase();
    this.lockLayer = document.createElement('canvas');
    this.lockLayer.width = this.lockLayer.height = this.size;
    this.drawLocks();
  }
  w2p(x, z) { return [(x + EXT) * PPM, (z + EXT) * PPM]; }

  drawBase() {
    const c = this.base.getContext('2d'), L = this.L, s = PPM;
    c.fillStyle = '#7cc46a';
    c.fillRect(0, 0, this.size, this.size);
    const rect = (x0, z0, x1, z1, col) => { const [a, b] = this.w2p(x0, z0); c.fillStyle = col; c.fillRect(a, b, (x1 - x0) * s, (z1 - z0) * s); };
    // blocks tinted by district
    const tint = { downtown: '#e9ddd0', suburbs: '#bfe3a6', shopping: '#ead9f0', industrial: '#ddd6c2', airport: '#cfe3ea' };
    for (const b of L.blocks) {
      rect(b.outer.x0, b.outer.z0, b.outer.x1, b.outer.z1, '#d7d2c8');
      rect(b.inner.x0, b.inner.z0, b.inner.x1, b.inner.z1, tint[b.district]);
    }
    for (const g of L.grounds) {
      const col = { grass: '#a8d98c', plaza: null, concrete: '#c9c6bf', asphalt: '#8c9097', runway: '#5d626b' }[g.kind];
      if (col) rect(g.x0, g.z0, g.x1, g.z1, col);
    }
    for (const p of L.parking) rect(p.x0, p.z0, p.x1, p.z1, '#9ca0a6');
    for (const d of L.decals) {
      if (d.kind === 'pond') { const [a, b] = this.w2p(d.x, d.z); c.fillStyle = '#5ab4e8'; c.beginPath(); c.arc(a, b, d.r * s, 0, Math.PI * 2); c.fill(); }
      if (d.kind === 'path') rect(d.x0, d.z0, d.x1, d.z1, '#e6d9bf');
    }
    // roads
    c.fillStyle = '#5f646c';
    const RH = CITY.roadHalf;
    for (const sg of L.segments) {
      const a = L.nodes[sg.a], b = L.nodes[sg.b];
      rect(Math.min(a.x, b.x) - RH, Math.min(a.z, b.z) - RH, Math.max(a.x, b.x) + RH, Math.max(a.z, b.z) + RH, '#5f646c');
    }
    c.strokeStyle = 'rgba(255,214,90,0.7)';
    c.lineWidth = 1;
    c.setLineDash([6, 6]);
    for (const sg of L.segments) {
      const a = L.nodes[sg.a], b = L.nodes[sg.b];
      const [x0, y0] = this.w2p(a.x, a.z), [x1, y1] = this.w2p(b.x, b.z);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.setLineDash([]);
    // buildings
    for (const b of L.buildings) {
      const col = b.type === 'house' ? '#e8a87c' : b.type === 'tower' ? '#8fa3b8' : b.type === 'warehouse' || b.type === 'factory' ? '#a59e8c'
        : b.type === 'mall' || b.type === 'supermarket' ? '#c08fd0' : b.type === 'garage' ? '#ff7a1f' : b.type === 'dealership' ? '#3a86ff'
          : b.type === 'terminal' || b.type === 'hangar' ? '#7fb3c9' : '#b4a596';
      const [a, bb] = this.w2p(b.x - b.sx / 2, b.z - b.sz / 2);
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(a + 2, bb + 2, b.sx * s, b.sz * s);
      c.fillStyle = col;
      c.fillRect(a, bb, b.sx * s, b.sz * s);
    }
    // district names
    c.font = `700 ${Math.round(22 * s / 1.4)}px "Fredoka", sans-serif`;
    c.textAlign = 'center';
    const centers = { downtown: [-50, -50], suburbs: [-400, -250], shopping: [-200, 350], industrial: [350, 150], airport: [200, -470] };
    for (const [d, [x, z]] of Object.entries(centers)) {
      const [a, b] = this.w2p(x, z);
      c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.strokeText(DISTRICTS[d].name.toUpperCase(), a, b);
      c.fillStyle = DISTRICTS[d].color;
      c.fillText(DISTRICTS[d].name.toUpperCase(), a, b);
    }
  }

  drawLocks() {
    const c = this.lockLayer.getContext('2d');
    c.clearRect(0, 0, this.size, this.size);
    const eco = this.g.eco;
    for (let r = 0; r < CITY.cells; r++) for (let col = 0; col < CITY.cells; col++) {
      const d = districtAtCell(col, r);
      if (!d || eco.isUnlocked(d)) continue;
      const [a, b] = this.w2p(gx(col) + CITY.roadHalf, gx(r) + CITY.roadHalf);
      const w = (CITY.cell - CITY.roadHalf * 2) * PPM;
      c.fillStyle = 'rgba(30,20,40,0.45)';
      c.fillRect(a, b, w, w);
      c.strokeStyle = 'rgba(255,61,110,0.35)';
      c.lineWidth = 3;
      c.save();
      c.beginPath(); c.rect(a, b, w, w); c.clip();
      for (let k = -w; k < w; k += 14) { c.beginPath(); c.moveTo(a + k, b); c.lineTo(a + k + w, b + w); c.stroke(); }
      c.restore();
    }
  }

  // ---------------------------------------------------------------- overlays
  overlays() {
    const g = this.g;
    const out = [];
    const a = g.jobs.active;
    for (const jb of this.L.pois.jobBoards) out.push({ x: jb.x, z: jb.z, icon: 'job', size: 18 });
    out.push({ x: this.L.pois.garage.x, z: this.L.pois.garage.z, icon: 'garage', size: 18 });
    out.push({ x: this.L.pois.dealership.x, z: this.L.pois.dealership.z, icon: 'dealer', size: 18 });
    if (g.jobs.event && !g.jobs.event.taken) out.push({ x: g.jobs.event.building.door.x, z: g.jobs.event.building.door.z, icon: 'event', size: 26, pulse: true });
    if (a) {
      if (a.state === 'pickup') out.push({ x: a.pickupB.door.x, z: a.pickupB.door.z, icon: 'pickup', size: 24, pulse: true });
      a.dropBs.forEach((b, i) => { if (a.state === 'pickup' || i >= a.dropIndex) out.push({ x: b.door.x, z: b.door.z, icon: 'drop', size: i === a.dropIndex && a.state === 'deliver' ? 24 : 16, pulse: i === a.dropIndex && a.state === 'deliver' }); });
    }
    if (g.jobs.trial) { const p = g.jobs.trial.pts[g.jobs.trial.index]; if (p) out.push({ x: p.x, z: p.z, icon: 'trial', size: 22, pulse: true }); }
    if (g.jobs.waypoint) out.push({ x: g.jobs.waypoint.x, z: g.jobs.waypoint.z, icon: 'waypoint', size: 22 });
    return out;
  }

  drawRoute(c, toScreen, width) {
    const g = this.g;
    if (!g.route || !g.navTarget) return;
    const fp = g.player.vehicle ? { x: g.player.vehicle.x, z: g.player.vehicle.z } : g.player.pos;
    const pts = [fp, ...g.route];
    c.strokeStyle = g.navTarget.kind === 'pickup' ? '#4ea3ff' : g.navTarget.kind === 'deliver' ? '#3ddc84' : g.navTarget.kind === 'trial' ? '#ff5d5d' : '#ff70b8';
    c.lineWidth = width;
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    pts.forEach((p, i) => { const [x, y] = toScreen(p.x, p.z); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.stroke();
  }

  drawPlayer(c, x, y, angle, size) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#ff7a1f';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, -size); c.lineTo(size * 0.75, size * 0.8); c.lineTo(0, size * 0.4); c.lineTo(-size * 0.75, size * 0.8);
    c.closePath();
    c.fill(); c.stroke();
    c.restore();
  }

  icon(c, name, x, y, size) {
    const img = TEX.icons[name + '_canvas'];
    if (img) c.drawImage(img, x - size / 2, y - size / 2, size, size);
  }

  // circular minimap
  drawMinimap(canvas, rotate) {
    const c = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, R = W / 2;
    const g = this.g;
    const fp = g.player.vehicle ? { x: g.player.vehicle.x, z: g.player.vehicle.z } : g.player.pos;
    const zoom = g.player.vehicle ? 0.95 : 1.6;     // screen px per metre
    const camYaw = g.cam.yaw;
    const rot = rotate ? camYaw : 0;                 // rotate so the camera's forward points up
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#7cc46a'; c.fillRect(0, 0, W, H);
    c.translate(R, R);
    c.rotate(rot);
    const k = zoom / PPM;
    c.scale(k, k);
    const [px, py] = this.w2p(fp.x, fp.z);
    c.drawImage(this.base, -px, -py);
    c.drawImage(this.lockLayer, -px, -py);
    c.restore();
    // overlays in screen space
    const toScreen = (x, z) => {
      const dx = (x - fp.x) * zoom, dz = (z - fp.z) * zoom;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      return [R + dx * cs - dz * sn, R + dx * sn + dz * cs];
    };
    c.save();
    c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
    this.drawRoute(c, toScreen, 5);
    const t = performance.now() / 1000;
    for (const o of this.overlays()) {
      let [x, y] = toScreen(o.x, o.z);
      const dx = x - R, dy = y - R, d = Math.hypot(dx, dy);
      const edge = R - 14;
      if (d > edge) { if (!o.pulse) continue; x = R + dx / d * edge; y = R + dy / d * edge; }
      const s = o.size * (o.pulse ? 1 + Math.sin(t * 5) * 0.08 : 1) * 0.8;
      this.icon(c, o.icon, x, y, s);
    }
    c.restore();
    // player arrow
    const heading = g.player.vehicle ? g.player.vehicle.h : g.player.heading;
    this.drawPlayer(c, R, R, -heading + Math.PI + rot, 8);
    // north marker (world -Z after the map rotation)
    const nx = R + Math.sin(rot) * (R - 11), ny = R - Math.cos(rot) * (R - 11);
    c.fillStyle = 'rgba(20,24,36,0.8)'; c.beginPath(); c.arc(nx, ny, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff5d5d'; c.font = '700 12px "Fredoka", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', nx, ny + 1);
  }

  // full map: view = {cx, cz, zoom (px per metre)}
  drawFull(canvas, view, hover, jobs) {
    const c = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    c.fillStyle = '#5c9e4f';
    c.fillRect(0, 0, W, H);
    const k = view.zoom / PPM;
    const [px, py] = this.w2p(view.cx, view.cz);
    c.save();
    c.translate(W / 2, H / 2);
    c.scale(k, k);
    c.drawImage(this.base, -px, -py);
    c.drawImage(this.lockLayer, -px, -py);
    c.restore();
    const toScreen = (x, z) => [W / 2 + (x - view.cx) * view.zoom, H / 2 + (z - view.cz) * view.zoom];
    this.drawRoute(c, toScreen, Math.max(3, view.zoom * 3));
    // available jobs (pickup icons, small)
    for (const j of jobs) {
      const b = this.L.buildings[j.pickup];
      const [x, y] = toScreen(b.door.x, b.door.z);
      c.globalAlpha = hover && hover.id === j.id ? 1 : 0.8;
      this.icon(c, 'pickup', x, y, hover && hover.id === j.id ? 26 : 16);
      c.globalAlpha = 1;
    }
    const t = performance.now() / 1000;
    for (const o of this.overlays()) {
      const [x, y] = toScreen(o.x, o.z);
      this.icon(c, o.icon, x, y, (o.size + 6) * (o.pulse ? 1 + Math.sin(t * 5) * 0.08 : 1));
    }
    const g = this.g;
    const fp = g.player.vehicle ? { x: g.player.vehicle.x, z: g.player.vehicle.z } : g.player.pos;
    const heading = g.player.vehicle ? g.player.vehicle.h : g.player.heading;
    const [sx, sy] = toScreen(fp.x, fp.z);
    this.drawPlayer(c, sx, sy, -heading + Math.PI, 11);
    return toScreen;
  }
  screenToWorld(view, canvas, x, y) {
    return { x: view.cx + (x - canvas.width / 2) / view.zoom, z: view.cz + (y - canvas.height / 2) / view.zoom };
  }
}
