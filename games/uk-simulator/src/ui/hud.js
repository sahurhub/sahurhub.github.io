// UK Simulator - heads-up display: money, level, clock, road name, speed / gear / rpm, battery,
// event panel, toasts, prompts, minimap with GPS route, chat box.
import { VEHICLES } from '../shared/vehicles.js';
import { levelFromXp, xpForLevel } from '../shared/rules.js';
import { TYPE_COLOUR, TYPE_NAME, fmt } from '../game/events.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.g = game;
    this.el = { money: $('hud-money'), level: $('hud-level'), clock: $('hud-clock'), road: $('hud-road'), speed: $('hud-speed'), unit: $('hud-unit'), gear: $('hud-gear'), rpm: $('hud-rpm'), extra: $('hud-extra'), event: $('hud-event'), toasts: $('hud-toasts'), prompt: $('hud-prompt'), centre: $('hud-centre'), mini: $('minimap'), chatLog: $('chat-log'), chatIn: $('chat-input'), fps: $('fps') };
    this.mapImg = new Image();
    this.mapImg.src = game.base + 'data/map.webp';
    this.timer = 0; this.centreTimer = 0; this.frames = 0; this.fpsT = 0;
    this.event = null;
    const ci = this.el.chatIn;
    ci.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = ci.value.trim(); if (t) game.net.chat(t); ci.value = ''; this.closeChat(); }
      if (e.key === 'Escape') this.closeChat();
    });
    if (new URLSearchParams(location.search).has('fps')) this.el.fps.hidden = false;
  }

  openChat() {
    if (!this.g.net.online) { this.toast('Sign in (Menu > Account) to chat with other players.'); return; }
    this.el.chatIn.hidden = false; this.el.chatIn.focus(); this.g.input.blocked = true;
  }
  closeChat() { this.el.chatIn.hidden = true; this.el.chatIn.blur(); this.g.input.blocked = false; }
  chatLine(name, text, system) {
    const d = document.createElement('div'); d.className = 'msg';
    if (system) d.textContent = text; else { const b = document.createElement('b'); b.textContent = name + ': '; d.append(b, document.createTextNode(text)); }
    this.el.chatLog.appendChild(d);
    while (this.el.chatLog.children.length > 8) this.el.chatLog.firstChild.remove();
    setTimeout(() => d.remove(), 30000);
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind; d.textContent = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), 5200);
  }

  prompt(text) { if (text) { this.el.prompt.textContent = text; this.el.prompt.hidden = false; } else this.el.prompt.hidden = true; }

  centre(big, small = '', secs = 2) {
    this.el.centre.innerHTML = '';
    this.el.centre.append(document.createTextNode(big));
    if (small) { const s = document.createElement('small'); s.textContent = small; this.el.centre.appendChild(s); }
    this.el.centre.hidden = false; this.centreTimer = secs;
  }

  levelUp(L) { this.centre(`LEVEL ${L}`, 'New vehicles and events may be unlocked', 3); this.g.audio.beep(1600); }

  refresh() {
    const p = this.g.profile;
    this.el.money.textContent = '£' + Math.round(p.data.money).toLocaleString('en-GB');
    const L = levelFromXp(p.data.xp), a = xpForLevel(L), b = xpForLevel(L + 1);
    this.el.level.textContent = `Lv ${L}  ${Math.round((p.data.xp - a) / (b - a) * 100)}%`;
    this.el.level.title = `${p.data.xp} XP`;
  }

  setEvent(a) {
    this.event = a;
    if (!a) { this.el.event.hidden = true; return; }
    const ev = a.ev;
    this.el.event.hidden = false;
    let lines = '';
    if (ev.type === 'drift') lines = `<div class="ev-big">${Math.round(a.score)}</div><div class="ev-line">x${(a.combo || 1).toFixed(1)} combo - ${Math.max(0, ev.time - a.t).toFixed(0)} s left - target ${ev.target}</div>`;
    else if (ev.anyOrder) lines = `<div class="ev-big">${fmt(Math.max(0, a.t))}</div><div class="ev-line">${a.done.size} / ${a.cps.length} checkpoints - limit ${fmt(ev.timeLimit)}</div>`;
    else {
      const m = a.medals;
      lines = `<div class="ev-big">${fmt(Math.max(0, a.t))}</div><div class="ev-line">Checkpoint ${Math.min(a.next + 1, a.cps.length)} / ${a.cps.length}</div>` + (m ? `<div class="ev-line">Gold ${fmt(m.gold)} - Silver ${fmt(m.silver)} - Bronze ${fmt(m.bronze)}</div>` : '');
    }
    this.el.event.innerHTML = `<div class="ev-name" style="color:#${TYPE_COLOUR[ev.type].toString(16).padStart(6, '0')}">${TYPE_NAME[ev.type]}</div><div class="ev-line">${escapeHtml(ev.name)}</div>${lines}<div class="ev-line">G to cancel</div>`;
  }

  update(dt) {
    const g = this.g;
    this.frames++; this.fpsT += dt;
    if (this.fpsT > 0.5) { this.el.fps.textContent = `${Math.round(this.frames / this.fpsT)} fps`; this.frames = 0; this.fpsT = 0; }
    if (this.centreTimer > 0) { this.centreTimer -= dt; if (this.centreTimer <= 0) this.el.centre.hidden = true; }
    this.timer -= dt;
    const v = g.vehicle;
    // speedo every frame (cheap)
    const units = g.profile.settings.units || 'mph';
    if (v) {
      const sp = Math.abs(v.speed) * (units === 'mph' ? 2.23694 : 3.6);
      this.el.speed.textContent = Math.round(sp);
      this.el.unit.textContent = units;
      const ph = v.phys;
      const gear = ph.gear;
      this.el.gear.textContent = v.spec.pedal ? '' : ph.motor ? `M${ph.motor.mode}` : gear < 0 ? 'R' : gear === 0 ? 'N' : String(gear);
      const e = ph.engine;
      this.el.rpm.style.width = e ? Math.min(100, e.rpm / e.e.redline * 100) + '%' : ph.motor ? Math.min(100, ph.motor.watts / ph.motor.s.peakW * 100) + '%' : ph.rider ? ph.rider.watts / ph.rider.s.sprintW * 100 + '%' : '0%';
      let extra = '';
      if (ph.battery) {
        const b = ph.battery;
        const usedKm = Math.max(0.01, (ph.odometer || 0) / 1000);
        extra += `Battery ${Math.round(b.charge * 100)}%  ${Math.round(ph.motor.watts)} W`;
        if (b.usedWh > 2) extra += `\n~${Math.round(b.charge * b.wh / Math.max(5, (b.usedWh - b.regenWh) / Math.max(0.2, (g.profile.data.stats.distance - (this.startDist ?? (this.startDist = g.profile.data.stats.distance))) / 1000)))} km left`;
      }
      if (ph.rider) extra += (extra ? '\n' : '') + `Legs ${Math.round(ph.rider.stamina * 100)}%`;
      if (ph.damage && ph.damage.total > 0.05) extra += (extra ? '\n' : '') + `Damage ${Math.round(ph.damage.total * 100)}%`;
      if (ph.crashed) extra += (extra ? '\n' : '') + ph.crashReason;
      if (ph.wobble > 0.04) extra += (extra ? '\n' : '') + 'Speed wobble! Ease off';
      this.el.extra.textContent = extra;
    } else { this.el.speed.textContent = '0'; this.el.gear.textContent = ''; this.el.rpm.style.width = '0%'; this.el.extra.textContent = 'On foot - F to get in'; }
    if (this.timer > 0) { this.drawMini(); return; }
    this.timer = 0.25;
    this.el.clock.textContent = g.weather.clock() + (g.weather.rain > 0.3 ? '  Rain' : '');
    const p = g.playerPos();
    this.el.road.textContent = g.world.roadNameAt(p.x, p.z) || '';
    if (this.event) this.setEvent(this.event);
    this.refresh();
    this.drawMini();
  }

  drawMini() {
    const cv = this.el.mini, c = cv.getContext('2d'), W = cv.width, H = cv.height;
    const g = this.g, man = g.manifest.map, p = g.playerPos();
    const heading = g.vehicle ? Math.atan2(g.vehicle.phys.fwd[0], g.vehicle.phys.fwd[2]) : g.rig.yaw;
    const zoom = 1.6 + Math.min(1.2, Math.abs(g.vehicle ? g.vehicle.speed : 0) / 25); // metres per pixel
    c.save();
    c.fillStyle = '#2b3238'; c.fillRect(0, 0, W, H);
    c.translate(W / 2, H / 2);
    c.rotate(Math.PI + heading);
    c.scale(1 / zoom * man.s, 1 / zoom * man.s);
    if (this.mapImg.complete) c.drawImage(this.mapImg, -(p.x - man.x0) / man.s, -(p.z - man.z0) / man.s);
    c.restore();
    // world -> minimap
    const tx = (x, z) => { const dx = (x - p.x) / zoom, dz = (z - p.z) / zoom; const a = -(Math.PI + heading); return [W / 2 + dx * Math.cos(a) - dz * Math.sin(a) * -1 * -1, H / 2 + dx * Math.sin(a) + dz * Math.cos(a)]; };
    const T = (x, z) => { const dx = (x - p.x) / zoom, dz = (z - p.z) / zoom; const a = Math.PI + heading; const cs = Math.cos(a), sn = Math.sin(a); return [W / 2 + dx * cs - dz * sn, H / 2 + dx * sn + dz * cs]; };
    // GPS route
    const route = g.events.gps;
    if (route && route.length > 1) {
      c.strokeStyle = '#8a5cff'; c.lineWidth = 4; c.lineJoin = 'round'; c.beginPath();
      route.forEach((q, k) => { const [x, y] = T(q[0], q[1]); if (k) c.lineTo(x, y); else c.moveTo(x, y); });
      c.stroke();
    }
    // events, other players
    for (const ev of g.events.list) {
      const [x, y] = T(ev.start[0], ev.start[1]);
      if (x < -6 || y < -6 || x > W + 6 || y > H + 6) continue;
      c.fillStyle = '#' + TYPE_COLOUR[ev.type].toString(16).padStart(6, '0'); c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
    }
    for (const r of g.remotes.list()) { const [x, y] = T(r.pos.x, r.pos.z); c.fillStyle = '#5aa9ff'; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); }
    const tgt = g.events.currentTarget();
    if (tgt) { let [x, y] = T(tgt[0], tgt[1]); const dx = x - W / 2, dy = y - H / 2, L = Math.hypot(dx, dy), R = W / 2 - 8; if (L > R) { x = W / 2 + dx / L * R; y = H / 2 + dy / L * R; } c.fillStyle = '#ffcc33'; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); }
    // player arrow
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(W / 2, H / 2 - 9); c.lineTo(W / 2 + 6, H / 2 + 6); c.lineTo(W / 2, H / 2 + 3); c.lineTo(W / 2 - 6, H / 2 + 6); c.closePath(); c.fill();
    // round mask
    c.globalCompositeOperation = 'destination-in'; c.beginPath(); c.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = 'source-over';
    // north marker
    const [nx, ny] = T(p.x, p.z - 1e4); const dx = nx - W / 2, dy = ny - H / 2, L = Math.hypot(dx, dy) || 1;
    c.fillStyle = '#ff6b5b'; c.font = 'bold 12px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', W / 2 + dx / L * (W / 2 - 10), H / 2 + dy / L * (H / 2 - 10));
  }
}

export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
