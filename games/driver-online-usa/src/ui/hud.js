// Driver Online USA - heads-up display: round speedometer with gear and revs, round minimap
// that turns with the car (players as coloured arrows, names on hover), room info, join/leave
// notices, FPS counter, camera name, spectate bar and the "locate" arrow.
import { el, $, clamp } from '../core/util.js';
import { settings, CAMERA_NAMES } from '../core/settings.js';
import { WEATHER_NAMES, TRAFFIC_NAMES } from '../shared/protocol.js';

export const PLAYER_COLORS = ['#5fb2ff', '#ff6b6b', '#ffd25a', '#36d399', '#c084fc', '#ff9f43', '#4dd4e6', '#f472b6', '#a3e635', '#fb7185', '#60a5fa', '#facc15', '#34d399', '#e879f9', '#f97316', '#22d3ee', '#a78bfa', '#fda4af', '#bef264', '#93c5fd'];
export const colorFor = (pid) => PLAYER_COLORS[(pid * 7) % PLAYER_COLORS.length];

export class HUD {
  constructor(game) {
    this.g = game;
    const root = $('#hud');
    this.root = root;
    this.roomInfo = el('div#room-info.hud-box', { onclick: () => game.players.open(true), title: 'Players (Tab)' });
    this.speedo = el('canvas#speedo', { width: 420, height: 420 });
    this.minimap = el('canvas#minimap', { width: 380, height: 380 });
    this.mapTip = el('div#minimap-tip', { hidden: true });
    this.fps = el('div#fps.hud-box', { hidden: true });
    this.notices = el('div#notices');
    this.centre = el('div#centre-msg.hud-box', { hidden: true });
    this.spectateBar = el('div#spectate-bar.hud-box', { hidden: true });
    this.locate = el('div#locate', { hidden: true }, el('div.arrow'), el('div.txt'));
    this.camLabel = el('div#cam-label.hud-box', { style: { opacity: 0 } });
    root.append(this.roomInfo, this.speedo, this.minimap, this.mapTip, this.fps, this.notices, this.centre, this.spectateBar, this.locate, this.camLabel);
    this.sctx = this.speedo.getContext('2d');
    this.mctx = this.minimap.getContext('2d');
    this.timer = 0; this.mapTimer = 0;
    this.frames = 0; this.fpsT = 0; this.fpsVal = 60;
    this.mouse = null;
    this.minimap.addEventListener('mousemove', (e) => { const r = this.minimap.getBoundingClientRect(); this.mouse = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, cx: e.clientX - r.left + r.left, cy: e.clientY - r.top + r.top }; });
    this.minimap.addEventListener('mouseleave', () => { this.mouse = null; this.mapTip.hidden = true; });
    this.minimap.style.pointerEvents = 'auto';
  }

  show(on) { this.root.hidden = !on; }

  notice(text, kind = '', ms = 4000) {
    const n = el('div.notice.hud-box' + (kind ? '.' + kind : ''), { text });
    this.notices.append(n);
    while (this.notices.children.length > 5) this.notices.firstChild.remove();
    setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 400); }, ms);
  }

  centreMsg(text) { this.centre.hidden = !text; if (text) this.centre.textContent = text; }

  showCamera(mode) {
    this.camLabel.textContent = CAMERA_NAMES[mode] || mode;
    this.camLabel.style.opacity = 1;
    clearTimeout(this.camT);
    this.camT = setTimeout(() => { this.camLabel.style.opacity = 0; }, 1400);
  }

  updateRoomInfo() {
    const g = this.g, r = g.room;
    if (!r) return;
    const me = g.playerList.get(g.myPid);
    const ping = me ? me.ping : 0;
    this.roomInfo.innerHTML = '';
    this.roomInfo.append(
      el('b', { text: r.name }),
      el('span', { text: `${g.playerList.size}/${r.max}` }),
      el('span', { text: WEATHER_NAMES[r.weather] + (r.weather === 'dynamic' ? ` (${WEATHER_NAMES[g.weather.name] || ''})` : '') }),
      el('span', { text: 'Traffic: ' + TRAFFIC_NAMES[r.traffic] }),
      el('span.ping', { text: ping ? `${ping} ms` : '' }));
  }

  // ---- map picture --------------------------------------------------------------------
  /** Draw the whole map once (roads, water, buildings) at 1 pixel per metre. */
  buildMapImage(layout) {
    const size = layout.size || 2000, px = 1;
    const c = document.createElement('canvas'); c.width = c.height = Math.round(size * px);
    const x = c.getContext('2d');
    const T = (v) => (v + size / 2) * px;
    x.fillStyle = '#1b2a1c'; x.fillRect(0, 0, c.width, c.height);
    for (const a of layout.areas || []) {
      x.fillStyle = a.kind === 'town' ? '#232a33' : a.kind === 'field' ? '#2a3320' : a.kind === 'forest' ? '#14241a' : '#1e2b20';
      x.beginPath(); a.p.forEach((pt, i) => (i ? x.lineTo(T(pt[0]), T(pt[1])) : x.moveTo(T(pt[0]), T(pt[1])))); x.closePath(); x.fill();
    }
    x.fillStyle = '#244b6b';
    for (const w of layout.water || []) { x.beginPath(); w.forEach((pt, i) => (i ? x.lineTo(T(pt[0]), T(pt[1])) : x.moveTo(T(pt[0]), T(pt[1])))); x.closePath(); x.fill(); }
    x.fillStyle = '#3a4250';
    for (const b of (layout.colliders && layout.colliders.boxes) || []) {
      if (b[4] < 1.5) continue;
      x.save(); x.translate(T(b[0]), T(b[2])); x.rotate(-(b[6] || 0)); x.fillRect(-b[3] * px, -b[5] * px, b[3] * 2 * px, b[5] * 2 * px); x.restore();
    }
    const style = { highway: ['#d9c27a', 1.0], ramp: ['#c8b26e', 1.0], main: ['#e8ecf2', 1.0], street: ['#b9c2cf', 1.0], hill: ['#b9c2cf', 1.0], dirt: ['#8a7356', 1.0], lot: ['#6d7685', 1] };
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const r of layout.roads || []) {
        const [col] = style[r.kind] || style.street;
        x.strokeStyle = pass ? col : 'rgba(0,0,0,0.55)';
        x.lineWidth = Math.max(3, r.w * px) + (pass ? 0 : 3);
        x.beginPath();
        for (let i = 0; i < r.p.length; i += 3) { const px2 = T(r.p[i]), pz = T(r.p[i + 2]); if (i) x.lineTo(px2, pz); else x.moveTo(px2, pz); }
        x.stroke();
      }
    }
    this.mapImg = c; this.mapSize = size; this.mapPx = px;
    this.layout = layout;
    return c;
  }

  // ---- per frame ----------------------------------------------------------------------
  update(dt, info) {
    // FPS
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fpsVal = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; this.fps.textContent = `${this.fpsVal} FPS`; }
    this.fps.hidden = !settings.get('fps');
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 1 / 30; this.drawSpeedo(info); }
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) { this.mapTimer = 1 / 20; this.drawMinimap(info); }
    this.updateLocate(info);
  }

  drawSpeedo(info) {
    const c = this.sctx, W = 420, cx = 210, cy = 210, R = 180;
    c.clearRect(0, 0, W, W);
    const kmh = settings.get('units') === 'kmh';
    const speed = Math.abs(info.speed) * (kmh ? 3.6 : 2.237);
    const top = Math.max(kmh ? 160 : 100, Math.ceil(((info.topSpeed || 60) * (kmh ? 3.6 : 2.237) * 1.08) / 20) * 20);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    // face
    c.beginPath(); c.arc(cx, cy, R + 12, 0, Math.PI * 2); c.fillStyle = 'rgba(6, 12, 28, 0.78)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(120, 160, 255, 0.25)'; c.stroke();
    // rev ring
    const rpmK = clamp(info.rpm / (info.maxRpm || 7000), 0, 1), red = (info.redline || 6500) / (info.maxRpm || 7000);
    c.lineWidth = 10; c.lineCap = 'butt';
    c.beginPath(); c.arc(cx, cy, R, a0, a0 + (a1 - a0) * red); c.strokeStyle = 'rgba(255,255,255,0.08)'; c.stroke();
    c.beginPath(); c.arc(cx, cy, R, a0 + (a1 - a0) * red, a1); c.strokeStyle = 'rgba(255, 70, 80, 0.35)'; c.stroke();
    c.beginPath(); c.arc(cx, cy, R, a0, a0 + (a1 - a0) * rpmK); c.strokeStyle = rpmK > red ? '#ff4d5e' : '#2f8cff'; c.stroke();
    // speed ticks and numbers
    c.lineCap = 'round';
    const step = top <= 120 ? 10 : 20;
    for (let v = 0; v <= top; v += step / 2) {
      const a = a0 + ((a1 - a0) * v) / top, major = v % step === 0;
      const r1 = R - 18, r2 = R - (major ? 34 : 26);
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      c.lineWidth = major ? 3 : 1.5; c.strokeStyle = major ? '#dfe8ff' : 'rgba(223,232,255,0.5)'; c.stroke();
      if (major && (v % (step * 2) === 0 || top <= 120)) {
        c.font = '700 19px Inter, system-ui, sans-serif'; c.fillStyle = '#c9d6f5'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(v), cx + Math.cos(a) * (R - 56), cy + Math.sin(a) * (R - 56));
      }
    }
    // needle
    const an = a0 + (a1 - a0) * clamp(speed / top, 0, 1.02);
    c.save(); c.translate(cx, cy); c.rotate(an);
    c.beginPath(); c.moveTo(-14, -4); c.lineTo(R - 30, -1.5); c.lineTo(R - 30, 1.5); c.lineTo(-14, 4); c.closePath();
    c.fillStyle = '#ff4d5e'; c.shadowColor = 'rgba(255, 77, 94, 0.7)'; c.shadowBlur = 12; c.fill(); c.restore();
    c.beginPath(); c.arc(cx, cy, 16, 0, Math.PI * 2); c.fillStyle = '#121c36'; c.fill(); c.strokeStyle = '#2f8cff'; c.lineWidth = 3; c.stroke();
    // digital speed + gear
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '900 54px Inter, system-ui, sans-serif'; c.fillStyle = '#ffffff';
    c.fillText(String(Math.round(speed)), cx, cy + 62);
    c.font = '700 16px Inter, system-ui, sans-serif'; c.fillStyle = '#93a3c7';
    c.fillText(kmh ? 'km/h' : 'mph', cx, cy + 96);
    const gear = info.gear === -1 ? 'R' : info.gear === 0 ? 'N' : String(info.gear);
    c.font = '900 34px Inter, system-ui, sans-serif'; c.fillStyle = info.gear === -1 ? '#ffbe3d' : '#5fb2ff';
    c.fillText(gear, cx, cy - 58);
    if (info.manual) { c.font = '700 12px Inter, system-ui, sans-serif'; c.fillStyle = '#93a3c7'; c.fillText('MANUAL', cx, cy - 32); }
    // little lights row
    const icons = [];
    if (info.lights) icons.push(['#7fd0ff', 'LIGHTS']);
    if (info.hazard) icons.push(['#ffbe3d', 'HAZARD']);
    else { if (info.indL && info.blink) icons.push(['#36d399', '<']); if (info.indR && info.blink) icons.push(['#36d399', '>']); }
    if (info.handbrake) icons.push(['#ff4d5e', 'P']);
    c.font = '800 13px Inter, system-ui, sans-serif';
    icons.forEach(([col, t], i) => { c.fillStyle = col; c.fillText(t, cx + (i - (icons.length - 1) / 2) * 62, cy + 128); });
  }

  drawMinimap(info) {
    const c = this.mctx, S = 380, cx = S / 2, cy = S / 2;
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(cx, cy, S / 2 - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#0b1428'; c.fillRect(0, 0, S, S);
    const zoom = (S / 2) / (info.mapRadius || 230); // px per metre on the minimap
    const heading = info.heading;
    if (this.mapImg) {
      c.save();
      c.translate(cx, cy);
      c.rotate(heading);
      c.scale(zoom / this.mapPx, zoom / this.mapPx);
      c.drawImage(this.mapImg, -(info.x + this.mapSize / 2) * this.mapPx, -(info.z + this.mapSize / 2) * this.mapPx);
      c.restore();
    }
    // landmarks: gas stations
    const toScreen = (x, z) => {
      const dx = (x - info.x) * zoom, dz = (z - info.z) * zoom;
      const cs = Math.cos(heading), sn = Math.sin(heading);
      return [cx + dx * cs - dz * sn, cy + dx * sn + dz * cs];
    };
    if (this.layout) {
      for (const gs of this.layout.gasStations || []) {
        const [sx, sy] = toScreen(gs.x, gs.z);
        c.fillStyle = '#36d399'; c.beginPath(); c.arc(sx, sy, 7, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#04140c'; c.font = '800 10px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('G', sx, sy + 0.5);
      }
    }
    // other players
    let hover = null;
    for (const p of info.players) {
      let [sx, sy] = toScreen(p.x, p.z);
      const d = Math.hypot(sx - cx, sy - cy), maxR = S / 2 - 12;
      const edge = d > maxR;
      if (edge) { sx = cx + ((sx - cx) / d) * maxR; sy = cy + ((sy - cy) / d) * maxR; }
      c.save(); c.translate(sx, sy); c.rotate(heading - p.h);
      c.fillStyle = p.color; c.strokeStyle = '#000'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 8); c.lineTo(0, 4); c.lineTo(-8, 8); c.closePath();
      if (edge) c.globalAlpha = 0.7;
      c.stroke(); c.fill(); c.restore();
      if (p.locate) { c.strokeStyle = '#ffd25a'; c.lineWidth = 3; c.beginPath(); c.arc(sx, sy, 16 + Math.sin(performance.now() / 150) * 3, 0, Math.PI * 2); c.stroke(); }
      if (this.mouse && Math.hypot(this.mouse.x * S - sx, this.mouse.y * S - sy) < 16) hover = { p, sx, sy };
    }
    // me
    c.fillStyle = '#ffffff'; c.strokeStyle = '#2f8cff'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx, cy - 13); c.lineTo(cx + 9, cy + 10); c.lineTo(cx, cy + 5); c.lineTo(cx - 9, cy + 10); c.closePath(); c.stroke(); c.fill();
    c.restore();
    // north marker (north = -z)
    const NR = S / 2 - 18;
    c.font = '800 18px Inter, sans-serif'; c.fillStyle = '#ff6b6b'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', cx + NR * Math.sin(heading), cy - NR * Math.cos(heading));
    if (hover) {
      const r = this.minimap.getBoundingClientRect();
      this.mapTip.hidden = false; this.mapTip.textContent = hover.p.name;
      this.mapTip.style.left = r.left + (hover.sx / S) * r.width + 'px';
      this.mapTip.style.top = r.top + (hover.sy / S) * r.height + 'px';
    } else this.mapTip.hidden = true;
  }

  updateLocate(info) {
    const t = info.locate;
    if (!t) { this.locate.hidden = true; return; }
    this.locate.hidden = false;
    const dx = t.x - info.camX, dz = t.z - info.camZ;
    const ang = Math.atan2(dx, -dz) + info.camYaw;
    this.locate.querySelector('.arrow').style.transform = `rotate(${ang}rad)`;
    const d = Math.hypot(dx, dz);
    const kmh = settings.get('units') === 'kmh';
    this.locate.querySelector('.txt').textContent = `${t.name} - ${kmh ? Math.round(d) + ' m' : Math.round(d * 1.094) + ' yd'}`;
  }
}
