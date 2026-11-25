// Driver Online USA - other players' cars. Their positions arrive ~15 times a second; we draw
// them slightly in the past (about 120 ms) and slide smoothly between the updates, guessing ahead
// with their speed if an update is late. Each car also gets a kinematic collision box, a name
// tag above it (fades with distance, hidden far away) and its dents.
import * as THREE from 'three';
import { readState, SNAP_HEADER, SNAP_ENTRY, F, F2 } from '../shared/protocol.js';
import { loadCarTemplate, CarView } from '../car/car-model.js';
import { GROUPS } from '../physics/physics.js';
import { clamp, smoothstep } from '../core/util.js';

const DELAY = 120;     // ms behind the newest data
const KEEP = 1000;     // ms of history to keep

export class Remotes {
  constructor(game) {
    this.g = game;
    this.players = new Map(); // pid -> remote
    this.tmpS = {};
    this.q1 = new THREE.Quaternion(); this.q2 = new THREE.Quaternion();
  }

  clear() { for (const pid of [...this.players.keys()]) this.remove(pid); }

  /** p = { pid, name, owner, car } */
  add(p) {
    if (p.pid === this.g.myPid) return;
    if (this.players.has(p.pid)) { this.players.get(p.pid).info = p; return; }
    const r = { pid: p.pid, info: p, buf: [], view: null, body: null, tag: null, car: null, pose: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3() }, spin: [0, 0, 0, 0], flags: 0, flags2: 0, dents: [], seen: false };
    this.players.set(p.pid, r);
    this.makeTag(r);
    this.setCar(p.pid, p.car);
  }

  remove(pid) {
    const r = this.players.get(pid);
    if (!r) return;
    this.players.delete(pid);
    if (r.view) r.view.dispose();
    if (r.body) this.g.physics.remove(r.body.body);
    if (r.tag) { this.g.scene.remove(r.tag); r.tag.material.map.dispose(); r.tag.material.dispose(); }
    if (this.g.audio) this.g.audio.removeVoice('p' + pid);
  }

  async setCar(pid, carId) {
    const r = this.players.get(pid);
    if (!r || !carId) return;
    r.info.car = carId;
    const token = (r.loadToken = Symbol());
    let tpl;
    try { tpl = await loadCarTemplate(carId); } catch (e) { console.warn('remote car', carId, e); return; }
    if (r.loadToken !== token || !this.players.has(pid)) return;
    if (r.view) r.view.dispose();
    if (r.body) { this.g.physics.remove(r.body.body); r.body = null; }
    r.view = new CarView(tpl, { local: false, shadows: this.g.quality.carShadows });
    r.view.setInteriorVisible(false);
    r.view.root.visible = false;
    this.g.scene.add(r.view.root);
    r.tpl = tpl;
    // collision box like the player's own car
    const b = tpl.geo.box;
    const wheelBottom = Math.min(...tpl.geo.wheels.map((w) => w.y - w.r));
    const bottom = wheelBottom + 0.2, top = Math.min(b.maxY, bottom + 1.25);
    r.body = this.g.physics.addKinematicBox((b.maxX - b.minX) / 2 - 0.04, Math.max(0.25, (top - bottom) / 2), (b.maxZ - b.minZ) / 2 - 0.05, (top + bottom) / 2, GROUPS.remote, { kind: 'remote', pid });
    r.tagY = b.maxY + 0.7;
    for (const d of r.dents) r.view.addDent(d.p, d.d, d.s);
    this.updateGhost(r);
  }

  addDent(pid, d) {
    const r = this.players.get(pid);
    if (!r) return;
    r.dents.push(d); if (r.dents.length > 24) r.dents.shift();
    if (r.view) r.view.addDent(d.p, d.d, d.s);
  }
  repair(pid) { const r = this.players.get(pid); if (r) { r.dents = []; if (r.view) r.view.repair(); } }

  updateGhost(r) {
    if (!r.body) return;
    const ghost = this.g.room && this.g.room.ghost || (r.flags2 & F2.GHOST) || (r.flags2 & F2.SPECTATING);
    r.body.col.setCollisionGroups(ghost ? GROUPS.remoteGhost : GROUPS.remote);
    r.ghost = !!ghost;
  }
  refreshGhosts() { for (const r of this.players.values()) this.updateGhost(r); }

  makeTag(r) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: true, transparent: true, sizeAttenuation: false });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.2, 0.0375, 1);
    s.center.set(0.5, 0);
    s.renderOrder = 5;
    r.tag = s; r.tagCanvas = c; r.tagKey = '';
    this.g.scene.add(s);
    this.drawTag(r);
  }

  drawTag(r) {
    const typing = !!r.info.typing, leader = this.g.room && this.g.room.leader === r.pid, owner = !!r.info.owner;
    const key = `${r.info.name}|${typing}|${leader}|${owner}`;
    if (key === r.tagKey) return;
    r.tagKey = key;
    const c = r.tagCanvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.font = '800 40px Inter, system-ui, sans-serif';
    const name = r.info.name || 'Player';
    let w = g.measureText(name).width;
    const badgeW = owner ? 118 : 0, crownW = leader ? 44 : 0;
    const total = Math.min(500, w + badgeW + crownW + 40);
    const x0 = (c.width - total) / 2;
    g.fillStyle = 'rgba(6, 12, 28, 0.72)';
    roundRect(g, x0, 20, total, 62, 16); g.fill();
    let x = x0 + 20;
    if (leader) { g.fillStyle = '#ffd25a'; g.font = '800 34px Inter, system-ui, sans-serif'; g.fillText('♛', x, 63); x += crownW; }
    g.font = '800 40px Inter, system-ui, sans-serif'; g.fillStyle = '#ffffff';
    g.fillText(name, x, 65, 500 - badgeW - crownW - 40); x += Math.min(w, 500 - badgeW - crownW - 40) + 12;
    if (owner) { g.fillStyle = '#f5c242'; roundRect(g, x, 34, 102, 34, 8); g.fill(); g.fillStyle = '#1d1500'; g.font = '800 24px Inter, system-ui, sans-serif'; g.fillText('OWNER', x + 9, 60); }
    if (typing) { g.fillStyle = '#5fb2ff'; g.font = '800 30px Inter, system-ui, sans-serif'; g.fillText('...', c.width / 2 - 14, 16); }
    r.tag.material.map.needsUpdate = true;
  }

  onSnapshot(view) {
    const n = view.getUint8(1), t = view.getUint32(2, true);
    for (let i = 0; i < n; i++) {
      const o = SNAP_HEADER + i * SNAP_ENTRY;
      const pid = view.getUint16(o, true);
      if (pid === this.g.myPid) continue;
      const r = this.players.get(pid);
      if (!r) continue;
      const s = readState(view, o + 1, {});
      s.t = t;
      const last = r.buf[r.buf.length - 1];
      if (last && last.t >= t) continue;
      r.buf.push(s);
      while (r.buf.length > 2 && t - r.buf[0].t > KEEP) r.buf.shift();
    }
  }

  /** Where each remote car is right now (called before the physics step). */
  update(dt, camPos) {
    const now = this.g.net.serverNow() - DELAY;
    const tagsOn = this.g.settings.get('nameTags');
    for (const r of this.players.values()) {
      const b = r.buf;
      if (!b.length) continue;
      let a = null, c = null;
      for (let i = b.length - 1; i >= 0; i--) { if (b[i].t <= now) { a = b[i]; c = b[i + 1] || null; break; } }
      const P = r.pose;
      if (!a) { a = b[0]; c = null; }
      if (c) {
        const k = clamp((now - a.t) / Math.max(1, c.t - a.t), 0, 1);
        // smooth curve using both positions and speeds (Hermite)
        const T = (c.t - a.t) / 1000, k2 = k * k, k3 = k2 * k;
        const h00 = 2 * k3 - 3 * k2 + 1, h10 = k3 - 2 * k2 + k, h01 = -2 * k3 + 3 * k2, h11 = k3 - k2;
        P.pos.set(
          h00 * a.x + h10 * T * a.vx + h01 * c.x + h11 * T * c.vx,
          h00 * a.y + h10 * T * a.vy + h01 * c.y + h11 * T * c.vy,
          h00 * a.z + h10 * T * a.vz + h01 * c.z + h11 * T * c.vz);
        this.q1.set(a.qx, a.qy, a.qz, a.qw); this.q2.set(c.qx, c.qy, c.qz, c.qw);
        P.quat.slerpQuaternions(this.q1, this.q2, k);
        P.vel.set(a.vx + (c.vx - a.vx) * k, a.vy + (c.vy - a.vy) * k, a.vz + (c.vz - a.vz) * k);
      } else {
        // no newer data yet: carry on with the last speed for a moment
        const ahead = clamp((now - a.t) / 1000, 0, 0.3);
        P.pos.set(a.x + a.vx * ahead, a.y + a.vy * ahead, a.z + a.vz * ahead);
        P.quat.set(a.qx, a.qy, a.qz, a.qw);
        P.vel.set(a.vx, a.vy, a.vz);
      }
      const s = c && (now - a.t) > (c.t - a.t) / 2 ? c : a;
      if (r.flags2 !== s.flags2) { r.flags2 = s.flags2; this.updateGhost(r); }
      r.flags = s.flags; r.state = s;
      r.seen = true;
      if (r.body) {
        r.body.body.setNextKinematicTranslation(P.pos);
        r.body.body.setNextKinematicRotation(P.quat);
      }
      if (r.view) {
        const V = r.view;
        V.root.position.copy(P.pos);
        V.root.quaternion.copy(P.quat);
        const d = camPos.distanceTo(P.pos);
        r.dist = d;
        V.updateLOD(d);
        V.setInteriorVisible(d < 25 || (this.g.spectating === r.pid && this.g.cameraRig.insideCar));
        // wheels roll with the car's speed
        const fwd = -(P.vel.x * 2 * (P.quat.x * P.quat.z + P.quat.w * P.quat.y)) - P.vel.z * (1 - 2 * (P.quat.x * P.quat.x + P.quat.y * P.quat.y)) - P.vel.y * 2 * (P.quat.y * P.quat.z - P.quat.w * P.quat.x);
        const wr = (r.tpl && r.tpl.geo.wheels[0].r) || 0.33;
        const steerMax = 0.55 / (1 + Math.max(0, Math.abs(fwd) - 4) / 20);
        const wheels = [0, 1, 2, 3].map((i) => {
          r.spin[i] += (s.flags & F.HANDBRAKE && i >= 2 ? 0 : fwd / wr) * dt;
          return { spin: r.spin[i], steer: i < 2 ? s.steer * steerMax : 0, len: 0.22 };
        });
        V.updateParts({ dt, wheels, steer: s.steer, lights: s.flags & F.LIGHTS, brake: s.flags & F.BRAKE, reverse: s.flags & F.REVERSE, indL: s.flags & F.IND_L, indR: s.flags & F.IND_R, hazard: s.flags & F.HAZARD });
        V.root.visible = d < 1500 && !(s.flags2 & F2.SPECTATING);
        // ghosts look a little see-through? keep them solid but skip the tag pulse
        if (this.g.audio) this.g.audio.voice('p' + r.pid, P.pos, P.vel, s.rpm, s.throttle, !!(s.flags & F.HORN), r.info.car, d);
      }
      // name tag
      if (r.tag) {
        this.drawTag(r);
        const d = r.dist || camPos.distanceTo(P.pos);
        const vis = tagsOn && d < 220 && !(r.flags2 & F2.SPECTATING) && this.g.spectating !== r.pid;
        r.tag.visible = vis;
        if (vis) {
          r.tag.position.set(P.pos.x, P.pos.y + (r.tagY || 2.1), P.pos.z);
          r.tag.material.opacity = 1 - smoothstep(90, 220, d);
        }
      }
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
