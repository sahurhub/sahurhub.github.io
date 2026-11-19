// UK Simulator - other players: their vehicles (or them on foot) drawn smoothly about 120 ms
// behind real time, with a name tag above.
import * as THREE from 'three';
import { VEHICLES } from '../shared/vehicles.js';
import { PAINTS } from '../shared/rules.js';
import { buildModel, makeRider } from '../vehicles/models.js';

const DELAY = 120;

function nameTag(text) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 30px system-ui, Arial'; const w = Math.min(250, g.measureText(text).width + 24);
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 18); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.6, 1); s.renderOrder = 10;
  return s;
}

export class Remotes {
  constructor(game) { this.g = game; this.map = new Map(); }
  list() { return [...this.map.values()].filter((r) => r.pos); }
  get(id) { return this.map.get(id); }
  clear() { for (const id of [...this.map.keys()]) this.leave(id); }

  join(p) {
    if (this.map.has(p.id)) this.leave(p.id);
    const r = { id: p.id, name: p.name, kind: null, colour: p.colour || 'blue', buf: [], root: new THREE.Group(), pos: null, tag: nameTag(p.name) };
    r.root.add(r.tag);
    this.g.scene.add(r.root);
    this.map.set(p.id, r);
  }

  leave(id) {
    const r = this.map.get(id);
    if (!r) return;
    this.g.scene.remove(r.root);
    r.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.map.delete(id);
  }

  look(m) { const r = this.map.get(m.id); if (r) { r.colour = m.colour; r.kind = null; } }

  async setKind(r, k) {
    r.kind = k; r.loading = true;
    if (r.model) { r.root.remove(r.model.root); r.model = null; }
    if (k === 'foot' || !VEHICLES[k]) {
      const person = makeRider({ kind: 'person', rider: { standing: true } }, 0x3f6f3f);
      person.userData.parts.hel.visible = false;
      person.position.y = 0;
      r.model = { root: person, wheels: [] };
    } else {
      const paint = PAINTS.find((p) => p.id === r.colour) || PAINTS[0];
      r.model = await buildModel(k, VEHICLES[k], this.g.base, paint.hex);
      if (r.model.rider) { r.model.root.add(r.model.rider); }
      if (r.model.lights) r.model.lights.spot.intensity = 0;
    }
    r.root.add(r.model.root);
    r.tag.position.y = (VEHICLES[k] ? VEHICLES[k].dims.height : 1.8) + 0.9;
    r.loading = false;
  }

  // server snapshot: { ts, list: [[id, x, y, z, qx, qy, qz, qw, speed, steer, flags, kind], ...] }
  snapshot(m) {
    const now = performance.now();
    for (const e of m.list) {
      const r = this.map.get(e[0]);
      if (!r || e[0] === (this.g.net.me && this.g.net.me.uid)) continue;
      if (r.kind !== e[11] && !r.loading) this.setKind(r, e[11]);
      r.buf.push({ t: now, p: [e[1], e[2], e[3]], q: [e[4], e[5], e[6], e[7]], sp: e[8], st: e[9], f: e[10] });
      if (r.buf.length > 30) r.buf.shift();
    }
  }

  update(dt) {
    const t = performance.now() - DELAY;
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    for (const r of this.map.values()) {
      const b = r.buf;
      if (!b.length) continue;
      let i = b.length - 1;
      while (i > 0 && b[i - 1].t > t) i--;
      const s1 = b[i], s0 = b[Math.max(0, i - 1)];
      const span = s1.t - s0.t;
      const a = span > 0 ? Math.max(0, Math.min(1.5, (t - s0.t) / span)) : 1;
      const p = new THREE.Vector3(s0.p[0] + (s1.p[0] - s0.p[0]) * a, s0.p[1] + (s1.p[1] - s0.p[1]) * a, s0.p[2] + (s1.p[2] - s0.p[2]) * a);
      qa.set(...s0.q); qb.set(...s1.q);
      r.root.position.copy(p);
      r.root.quaternion.slerpQuaternions(qa, qb, Math.min(1, a));
      r.pos = p;
      // turn the tag back upright
      r.tag.quaternion.copy(r.root.quaternion).invert();
      if (r.model && r.model.wheels) {
        r.spin = (r.spin || 0) + s1.sp * dt / 0.32;
        r.model.wheels.forEach((w, k) => { w.spinner.rotation.x = r.spin; if (k < 2 && VEHICLES[r.kind] && VEHICLES[r.kind].kind === 'car') w.holder.rotation.y = s1.st; });
        if (r.model.root.userData.steer) r.model.root.userData.steer.rotation.y = s1.st;
        if (r.model.lights) { r.model.lights.tail.emissiveIntensity = 0.25 + (s1.f & 1 ? 2.2 : 0) + (s1.f & 2 ? 0.6 : 0); r.model.lights.head.emissiveIntensity = s1.f & 2 ? 3 : 0.15; }
        if (r.model.rider) r.model.rider.visible = !(s1.f & 4);
      }
      // hide players far away (cheap)
      const pp = this.g.playerPos();
      r.root.visible = Math.hypot(p.x - pp.x, p.z - pp.z) < 900;
    }
  }
}
