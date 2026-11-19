// UK Simulator - events on real roads: races, night races, time trials, checkpoint hunts,
// stunt jumps (humpback bridges, ramps), the drift zone, the off-road course, and delivery jobs
// between real shops and businesses. Signed-in players are paid by the server.
import * as THREE from 'three';
import { VEHICLES } from '../shared/vehicles.js';
import { eventAllows, medalTimes, eventReward, vehicleClass, levelOk } from '../shared/rules.js';
import { route, nearestNode } from '../shared/route.js';

const TYPE_COLOUR = { race: 0xff5544, timetrial: 0x55aaff, checkpoints: 0xffcc33, stunt: 0xff66cc, drift: 0xaa66ff, offroad: 0x88cc44, delivery: 0x44ddcc };
const TYPE_NAME = { race: 'Race', timetrial: 'Time trial', checkpoints: 'Checkpoint hunt', stunt: 'Stunt jump', drift: 'Drift zone', offroad: 'Off-road course', delivery: 'Delivery' };
const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
export { TYPE_COLOUR, TYPE_NAME, fmt };

export class Events {
  constructor(game) {
    this.g = game;
    this.list = game.missions.events;
    this.places = game.missions.places;
    this.active = null;     // running event state
    this.job = null;        // delivery job
    this.frozen = false;
    this.group = new THREE.Group(); this.group.name = 'event markers';
    game.scene.add(this.group);
    this.beams = new Map();
    const beamGeo = new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true).translate(0, 30, 0);
    for (const ev of this.list) {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: TYPE_COLOUR[ev.type], transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.position.set(ev.start[0], 0, ev.start[1]);
      m.visible = false;
      this.group.add(m);
      this.beams.set(ev.id, m);
    }
    // checkpoint ring + target marker
    this.cpMesh = new THREE.Mesh(new THREE.TorusGeometry(6, 0.35, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.75 }));
    this.cpNext = new THREE.Mesh(new THREE.TorusGeometry(6, 0.25, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
    this.target = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 40, 16, 1, true).translate(0, 20, 0), new THREE.MeshBasicMaterial({ color: 0x44ddcc, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    for (const m of [this.cpMesh, this.cpNext, this.target]) { m.visible = false; this.group.add(m); }
    this.addRamps(game.missions.ramps || []);
    this.stuntCooldown = {};
    this.air = null;
    this.drift = null;
    this.routeTimer = 0;
    this.gps = null; // [[x,z],...] route to the current target
  }

  addRamps(ramps) {
    const ph = this.g.physics;
    for (const r of ramps) {
      // wedge: length l, width w, height h, facing angle a
      const geo = new THREE.BufferGeometry();
      const l = r.l, w = r.w, h = r.h;
      const v = [-w / 2, 0, -l / 2, w / 2, 0, -l / 2, w / 2, 0, l / 2, -w / 2, 0, l / 2, -w / 2, h, l / 2, w / 2, h, l / 2];
      const idx = [0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.8 }));
      const y = this.g.world.heightAt(r.x, r.z) - 0.05;
      mesh.position.set(r.x, y, r.z);
      mesh.rotation.y = Math.PI / 2 - r.a;
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      mesh.updateMatrixWorld();
      const verts = new Float32Array(v.length);
      const p = new THREE.Vector3();
      for (let k = 0; k < v.length; k += 3) { p.set(v[k], v[k + 1], v[k + 2]).applyMatrix4(mesh.matrixWorld); verts[k] = p.x; verts[k + 1] = p.y; verts[k + 2] = p.z; }
      ph.addTrimesh(verts, new Uint32Array(idx), 'static');
    }
  }

  available(ev) {
    const p = this.g.profile;
    return levelOk(p.level, ev.level);
  }

  // ------------------------------------------------------------------ starting
  async start(ev) {
    const g = this.g;
    if (!g.vehicle) { g.hud.toast('Get in a vehicle first.'); return; }
    if (!eventAllows(ev, g.vehicle.id)) { g.hud.toast(`${ev.name} needs a ${ev.mode === 'car' ? 'car' : ev.mode === 'bike' ? 'bike or scooter' : 'off-road vehicle'}.`, 'bad'); return; }
    if (!this.available(ev)) { g.hud.toast(`Reach level ${ev.level} to unlock this event.`, 'bad'); return; }
    this.cancelJob(true);
    if (ev.type === 'stunt') { g.hud.toast('Stunt jumps are always on - just hit the ramp or the bridge fast!'); this.gps = null; return; }
    let ticket = null;
    if (g.profile.online) {
      try { ticket = (await g.net.request('eventStart', { id: ev.id, vehicle: g.vehicle.id })).ticket; } catch (e) { g.hud.toast(e.message, 'bad'); return; }
    }
    // put the player on the start line, facing the first checkpoint
    const v = g.vehicle;
    const sx = ev.start[0], sz = ev.start[1];
    const head = ev.startDir !== undefined ? Math.PI / 2 - ev.startDir : 0;
    if (ev.night) g.weather.setHour(22);
    v.phys.reset(sx, g.world.heightAt(sx, sz) + 0.5, sz, head);
    v.capture(); v.capture();
    const cps = ev.cps.slice();
    if (ev.type === 'timetrial') { const loop = cps.concat([ev.start]); cps.length = 0; for (let l = 0; l < (ev.laps || 1); l++) cps.push(...loop); }
    this.active = { ev, ticket, cps, next: 0, done: new Set(), t: -3, started: false, vehicle: v.id, medals: ev.type === 'drift' ? null : medalTimes(ev, v.id), score: 0, resets: 0 };
    this.frozen = true;
    g.hud.setEvent(this.active);
  }

  cancel(reason) {
    if (!this.active) return;
    if (reason) this.g.hud.toast(reason, 'bad');
    if (this.active.ticket && this.g.profile.online) this.g.net.send('eventCancel', { ticket: this.active.ticket });
    this.active = null; this.frozen = false;
    this.cpMesh.visible = this.cpNext.visible = false;
    this.g.hud.setEvent(null);
  }

  onExit() { if (this.active) this.cancel('Event cancelled - you got out.'); }
  onReset() { if (this.active) this.active.resets++; }

  // ------------------------------------------------------------------ delivery jobs
  async startJob() {
    const g = this.g;
    if (this.active) return;
    const p = g.playerPos();
    let job;
    if (g.profile.online) {
      try { job = (await g.net.request('jobStart', { x: p.x, z: p.z })).job; } catch (e) { g.hud.toast(e.message, 'bad'); return; }
    } else {
      const near = this.places.filter((q) => Math.hypot(q.dx - p.x, q.dz - p.z) < 700);
      const from = (near.length ? near : this.places)[Math.floor(Math.random() * (near.length || this.places.length))];
      const far = this.places.filter((q) => { const d = Math.hypot(q.dx - from.dx, q.dz - from.dz); return d > 700 && d < 2500; });
      const to = far[Math.floor(Math.random() * far.length)] || this.places[0];
      const dist = Math.hypot(to.dx - from.dx, to.dz - from.dz) * 1.3;
      job = { id: 'local' + Date.now(), from, to, dist, par: Math.round(dist / 8 + 45) };
    }
    this.job = { ...job, stage: 'pickup', t: 0 };
    g.hud.toast(`Delivery: pick up a parcel from ${job.from.name}.`);
    this.routeTimer = 0;
  }

  cancelJob(silent) {
    if (!this.job) return;
    if (!silent) this.g.hud.toast('Delivery cancelled.');
    if (this.g.profile.online) this.g.net.send('jobCancel', { id: this.job.id });
    this.job = null; this.target.visible = false; this.gps = null;
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const g = this.g;
    const p = g.playerPos();
    const v = g.vehicle;
    // start beams near the player
    for (const ev of this.list) {
      const m = this.beams.get(ev.id);
      const d = Math.hypot(ev.start[0] - p.x, ev.start[1] - p.z);
      m.visible = !this.active && d < 450 && ev.type !== 'stunt';
      if (m.visible) m.position.y = g.world.heightAt(ev.start[0], ev.start[1]);
    }
    // "press G" prompts
    let prompt = null;
    if (!this.active && v) {
      const ev = this.list.find((e) => e.type !== 'stunt' && Math.hypot(e.start[0] - p.x, e.start[1] - p.z) < 12);
      if (ev) prompt = `${TYPE_NAME[ev.type]}: ${ev.name} - press G to start${this.available(ev) ? '' : ` (level ${ev.level})`}`;
      if (g.input.take('action')) { if (ev) this.start(ev); else if (this.job) this.cancelJob(); else this.startJob(); }
    } else if (this.active && g.input.take('action')) this.cancel('Event cancelled.');
    g.hud.prompt(prompt);
    this.updateJob(dt, p, v);
    this.updateStunts(dt, p, v);
    this.updateDrift(dt, p, v);
    if (this.active) this.updateActive(dt, p, v);
    // GPS route to whatever we are heading for
    this.routeTimer -= dt;
    const tgt = this.currentTarget();
    if (tgt && this.routeTimer <= 0) {
      this.routeTimer = 2.5;
      const mode = !v ? 'foot' : v.isCar && v.spec.road ? 'car' : v.isCar ? 'offroad' : 'bike';
      const a = nearestNode(g.graph, p.x, p.z, mode), b = nearestNode(g.graph, tgt[0], tgt[1], mode);
      const r = route(g.graph, a, b, mode);
      this.gps = r ? [[p.x, p.z], ...r.points, tgt] : [[p.x, p.z], tgt];
    } else if (!tgt) this.gps = null;
  }

  currentTarget() {
    if (this.active) { const a = this.active; if (a.ev.type === 'checkpoints') return null; return a.cps[a.next] || null; }
    if (this.job) return this.job.stage === 'pickup' ? [this.job.from.dx, this.job.from.dz] : [this.job.to.dx, this.job.to.dz];
    return this.waypoint || null;
  }

  updateActive(dt, p, v) {
    const a = this.active, g = this.g, ev = a.ev;
    if (!v) return;
    a.t += dt;
    if (!a.started) {
      if (a.t >= 0) { a.started = true; a.t = 0; this.frozen = false; g.hud.centre('GO!', '', 0.8); g.audio.beep(880); }
      else { const n = Math.ceil(-a.t); if (n !== a.count) { a.count = n; g.hud.centre(String(n), ev.name, 0.9); g.audio.beep(440); } }
      return;
    }
    if (ev.type === 'drift') {
      if (a.t > ev.time || !pointInPoly(p.x, p.z, ev.zone)) return this.finish({ score: Math.round(a.score), time: a.t });
      const w = v.phys.wheels;
      const vel = v.phys.lin, sp = Math.hypot(vel[0], vel[2]);
      const ang = Math.abs(Math.atan2(v3dot(vel, v.phys.right), Math.max(0.5, Math.abs(v.speed))));
      if (sp > 6 && ang > 0.2 && ang < 1.4) { a.combo = Math.min(5, (a.combo || 1) + dt * 0.5); a.score += ang * 57 * sp * dt * 0.2 * a.combo; } else a.combo = Math.max(1, (a.combo || 1) - dt * 2);
      g.hud.setEvent(a);
      return;
    }
    const radius = v.isCar ? 9 : 6;
    this.cpMesh.visible = true;
    if (ev.anyOrder) {
      for (let k = 0; k < a.cps.length; k++) {
        if (a.done.has(k)) continue;
        const c = a.cps[k];
        if (Math.hypot(c[0] - p.x, c[1] - p.z) < radius) { a.done.add(k); g.audio.beep(1200); g.hud.toast(`Checkpoint ${a.done.size} of ${a.cps.length}`); }
      }
      if (a.done.size >= a.cps.length) return this.finish({ time: a.t });
      if (a.t > ev.timeLimit) return this.finish({ time: a.t });
      // nearest remaining checkpoint gets the ring
      let best = null, bd = Infinity;
      a.cps.forEach((c, k) => { if (a.done.has(k)) return; const d = Math.hypot(c[0] - p.x, c[1] - p.z); if (d < bd) { bd = d; best = c; } });
      this.placeRing(this.cpMesh, best, p);
      this.cpNext.visible = false;
      this.waypoint = best;
    } else {
      const c = a.cps[a.next];
      if (Math.hypot(c[0] - p.x, c[1] - p.z) < radius) {
        a.next++;
        g.audio.beep(1200);
        if (a.next >= a.cps.length) return this.finish({ time: a.t });
      }
      this.placeRing(this.cpMesh, a.cps[a.next], p);
      const n2 = a.cps[a.next + 1];
      this.cpNext.visible = !!n2;
      if (n2) this.placeRing(this.cpNext, n2, null, a.cps[a.next]);
    }
    g.hud.setEvent(a);
  }

  placeRing(mesh, c, p, from) {
    if (!c) { mesh.visible = false; return; }
    mesh.visible = true;
    const y = this.g.world.heightAt(c[0], c[1]);
    mesh.position.set(c[0], y + 5, c[1]);
    const ref = from || (p ? [p.x, p.z] : c);
    mesh.rotation.set(0, Math.atan2(c[0] - ref[0], c[1] - ref[1]), 0);
  }

  async finish(result) {
    const a = this.active, g = this.g;
    this.active = null; this.frozen = false; this.waypoint = null;
    this.cpMesh.visible = this.cpNext.visible = false;
    g.hud.setEvent(null);
    let r;
    if (g.profile.online) {
      try {
        const res = await g.net.request('eventFinish', { ticket: a.ticket, id: a.ev.id, ...result });
        r = res.reward; g.profile.fromServer(res.profile);
      } catch (e) { g.hud.toast(e.message, 'bad'); return; }
    } else r = g.profile.awardLocal(a.ev, result, a.vehicle);
    const what = result.score !== undefined && a.ev.type === 'drift' ? `Score ${result.score}` : fmt(result.time);
    g.hud.centre(r.medal ? r.medal.toUpperCase() + '!' : 'Finished', `${what}   +£${r.money}  +${r.xp} XP`, 3.5);
    g.audio.beep(r.medal ? 1500 : 600);
  }

  updateJob(dt, p, v) {
    const j = this.job;
    if (!j) { this.target.visible = false; return; }
    const g = this.g;
    j.t += dt;
    const tg = j.stage === 'pickup' ? j.from : j.to;
    this.target.visible = true;
    this.target.position.set(tg.dx, g.world.heightAt(tg.dx, tg.dz), tg.dz);
    const d = Math.hypot(tg.dx - p.x, tg.dz - p.z);
    const slow = !v || Math.abs(v.speed) < 2.5;
    if (d < 9 && slow) {
      if (j.stage === 'pickup') {
        j.stage = 'drop'; j.t = 0;
        g.hud.toast(`Parcel collected from ${j.from.name}. Take it to ${j.to.name}.`, 'good');
        g.audio.beep(1000);
        if (g.profile.online) g.net.send('jobPickup', { id: j.id });
        this.routeTimer = 0;
      } else {
        this.job = null; this.target.visible = false;
        this.completeJob(j);
      }
    }
  }

  async completeJob(j) {
    const g = this.g;
    let r;
    if (g.profile.online) {
      try { const res = await g.net.request('jobDone', { id: j.id }); r = res.reward; g.profile.fromServer(res.profile); } catch (e) { g.hud.toast(e.message, 'bad'); return; }
    } else {
      r = eventReward({ type: 'delivery', id: 'delivery' }, { time: j.t, par: j.par, dist: j.dist }, g.vehicle ? g.vehicle.id : 'pushbike');
      g.profile.data.money += r.money; g.profile.data.xp += r.xp; g.profile.data.stats.deliveries++;
      g.profile.addDaily('deliveries', 1); g.profile.save();
    }
    g.hud.toast(`Delivered to ${j.to.name}! +£${r.money}${r.medal ? ' (on time bonus)' : ''}`, 'good');
    g.audio.beep(1400);
    g.hud.refresh();
  }

  // stunt jumps: measure air time near a jump spot
  updateStunts(dt, p, v) {
    if (!v) { this.air = null; return; }
    const g = this.g;
    const airborne = v.phys.airborne;
    if (airborne && !this.air) {
      const spot = this.list.find((e) => e.type === 'stunt' && Math.hypot(e.at[0] - p.x, e.at[1] - p.z) < 35 && !(this.stuntCooldown[e.id] > g.time));
      if (spot && Math.abs(v.speed) > 5) this.air = { ev: spot, t: 0, x: p.x, z: p.z, maxH: 0 };
    }
    if (this.air) {
      if (airborne) {
        this.air.t += dt;
        this.air.maxH = Math.max(this.air.maxH, p.y - g.world.heightAt(p.x, p.z));
      } else {
        const a = this.air; this.air = null;
        const dist = Math.hypot(p.x - a.x, p.z - a.z);
        const clean = !(v.phys.crashed) && v.phys.up[1] > 0.8;
        this.stuntCooldown[a.ev.id] = g.time + 20;
        if (a.t >= a.ev.minAir && clean) this.payStunt(a.ev, { air: a.t, dist, clean, height: a.maxH });
        else if (a.t > 0.3) g.hud.toast(`${a.t.toFixed(2)} s in the air - need ${a.ev.minAir.toFixed(1)} s${clean ? '' : ' and a clean landing'}.`);
      }
    }
  }

  async payStunt(ev, result) {
    const g = this.g;
    let r;
    if (g.profile.online) {
      try { const res = await g.net.request('stunt', { id: ev.id, ...result }); r = res.reward; g.profile.fromServer(res.profile); } catch (e) { g.hud.toast(e.message, 'bad'); return; }
    } else { r = g.profile.awardLocal(ev, result, g.vehicle.id); g.profile.data.stats.jumps++; g.profile.addDaily('jumps', 1); }
    g.hud.centre('STUNT JUMP!', `${result.air.toFixed(2)} s air, ${result.dist.toFixed(0)} m   +£${r.money}`, 2.6);
  }

  updateDrift(dt, p, v) {
    // the drift zone starts by itself when you slide inside it in a car
    if (this.active || !v || !v.isCar) return;
    const ev = this.list.find((e) => e.type === 'drift');
    if (!ev || !pointInPoly(p.x, p.z, ev.zone)) return;
    const vel = v.phys.lin, sp = Math.hypot(vel[0], vel[2]);
    const ang = Math.abs(Math.atan2(v3dot(vel, v.phys.right), Math.max(0.5, Math.abs(v.speed))));
    if (sp > 7 && ang > 0.35 && this.available(ev)) {
      this.active = { ev, ticket: null, cps: [], next: 0, done: new Set(), t: 0, started: true, vehicle: v.id, score: 0, combo: 1, resets: 0 };
      if (this.g.profile.online) this.g.net.request('eventStart', { id: ev.id, vehicle: v.id }).then((r) => { if (this.active && this.active.ev === ev) this.active.ticket = r.ticket; }).catch(() => {});
      this.g.hud.toast('Drift zone! Keep sliding for points.');
      this.g.hud.setEvent(this.active);
    }
  }
}

function v3dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}
