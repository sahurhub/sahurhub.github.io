// Traffic: cars follow lanes on the road graph (right-hand traffic), turn at junctions,
// obey traffic lights, keep distance, brake for the player and pedestrians, and honk.
import * as THREE from 'three';
import { assets, mergeParts, tintMaterial } from './assets.js';
import { CITY } from './config.js';
import { rng, clamp } from './utils.js';

const MAX_PER_MODEL = 40;
const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _r = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0), _col = new THREE.Color();

// All cars of one model are drawn with two instanced meshes (body + wheels).
function buildModelRender(scene, model, material) {
  const key = 'vehicles/car_' + model;
  let parts = assets.parts(key);
  let body, wheel, offsets;
  if (parts) {
    const wheelParts = parts.filter(p => p.name.startsWith('wheel_'));
    const bodyParts = parts.filter(p => !p.name.startsWith('wheel_'));
    body = mergeParts(bodyParts).geometry;
    // wheel centres from each wheel's bounding box; one centred wheel geometry for instancing
    const groups = {};
    for (const p of wheelParts) { const k = p.name.slice(0, 8); (groups[k] ||= []).push(p); }
    offsets = [];
    let template = null;
    for (const [k, list] of Object.entries(groups)) {
      const box = new THREE.Box3();
      list.forEach(p => { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); });
      const c = box.getCenter(new THREE.Vector3());
      offsets.push(c);
      if (!template || k === 'wheel_FL') template = { list, c };
    }
    if (template) {
      const moved = template.list.map(p => ({ ...p, geometry: p.geometry.clone().translate(-template.c.x, -template.c.y, -template.c.z) }));
      wheel = mergeParts(moved).geometry;
    }
  }
  if (!body) {
    const mk = (geo, color, matName) => ({ geometry: geo, material: new THREE.MeshStandardMaterial({ color }), matName });
    body = mergeParts([mk(new THREE.BoxGeometry(1.8, 1.2, 4.2).translate(0, 0.9, 0), '#ffffff', 'paint')]).geometry;
    wheel = mergeParts([mk(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12).rotateZ(Math.PI / 2), '#24262b', 'tire')]).geometry;
    offsets = [new THREE.Vector3(0.78, 0.34, 1.3), new THREE.Vector3(-0.78, 0.34, 1.3), new THREE.Vector3(0.78, 0.34, -1.3), new THREE.Vector3(-0.78, 0.34, -1.3)];
  }
  const make = (geo, count) => {
    const g = geo.clone();
    g.setAttribute('instTint2', new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3));
    g.setAttribute('instGlow', new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2));
    const im = new THREE.InstancedMesh(g, material, count);
    im.count = 0;
    im.castShadow = true;
    im.frustumCulled = false;
    im.setColorAt(0, _col.set('#ffffff'));
    scene.add(im);
    return im;
  };
  return { bodyIM: make(body, MAX_PER_MODEL), wheelIM: wheel ? make(wheel, MAX_PER_MODEL * offsets.length) : null, offsets };
}

const MODELS = ['sedan', 'hatch', 'pickup', 'taxi'];
const COLORS = ['#e5383b', '#2b7de9', '#f4f1ea', '#22252e', '#52d6a3', '#ffd60a', '#8f4bd6', '#ff7a1f', '#9aa3ad', '#5c80bc', '#c2185b'];
const PHASE = [11, 3, 1.5, 11, 3, 1.5];
const CYCLE = PHASE.reduce((a, b) => a + b, 0);
const LANE = CITY.laneOffset, STOP = CITY.roadHalf + 1.2;

export function lightState(node, axis, clock) {
  let t = ((clock + node.id * 7.3) % CYCLE + CYCLE) % CYCLE;
  let i = 0;
  while (t > PHASE[i]) { t -= PHASE[i]; i++; }
  // phases: 0 H green, 1 H amber, 2 all red, 3 V green, 4 V amber, 5 all red
  if (axis === 'h') return i === 0 ? 'green' : i === 1 ? 'amber' : 'red';
  return i === 3 ? 'green' : i === 4 ? 'amber' : 'red';
}

export class Traffic {
  constructor(game, max) {
    this.g = game;
    this.L = game.layout;
    this.max = max;
    this.cars = [];
    this.r = rng(1234);
    this.spawnTimer = 0;
    this.lightTimer = 0;
    this.material = tintMaterial({ glowA: '#fff3c8', glowB: '#ff2a2a', glowScale: 1.6 });
    this.renders = {};
    for (const m of MODELS) this.renders[m] = buildModelRender(game.scene, m, this.material);
  }
  setMax(n) { this.max = Math.min(n, MAX_PER_MODEL * MODELS.length); }

  allowedNode(n) { return this.g.isAccessible(n.x, n.z); }

  makeCar() {
    // keep the per-model instance limit
    const counts = {};
    for (const c of this.cars) counts[c.model] = (counts[c.model] || 0) + 1;
    const models = MODELS.filter(m => (counts[m] || 0) < MAX_PER_MODEL);
    const model = this.r.pick(models.length ? models : MODELS);
    return { model, spin: 0, color: '#ffffff' };
  }

  spawn(focus) {
    // pick a random allowed segment 60..250 m from the focus
    const segs = this.L.segments;
    for (let tries = 0; tries < 12; tries++) {
      const s = segs[Math.floor(this.r() * segs.length)];
      const a = this.L.nodes[s.a], b = this.L.nodes[s.b];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const d = Math.hypot(mx - focus.x, mz - focus.z);
      if (d < 70 || d > 250) continue;
      if (!this.allowedNode(a) || !this.allowedNode(b)) continue;
      const forward = this.r() < 0.5;
      const car = this.makeCar();
      car.color = car.model === 'taxi' ? '#ffd23f' : this.r.pick(COLORS);
      Object.assign(car, { seg: s, from: forward ? a : b, to: forward ? b : a, phase: 'lane', s: this.r() * 40, speed: 8, target: 11 + this.r() * 3, wait: 0, honk: 0, braking: false });
      this.setupLane(car);
      car.s = Math.min(car.s, car.len * 0.6);
      this.cars.push(car);
      this.place(car);
      return;
    }
  }

  setupLane(car) {
    const f = car.from, t = car.to;
    const dx = Math.sign(t.x - f.x), dz = Math.sign(t.z - f.z);
    car.dx = dx; car.dz = dz;
    const rx = -dz, rz = dx;
    car.p0 = { x: f.x + dx * STOP + rx * LANE, z: f.z + dz * STOP + rz * LANE };
    car.p1 = { x: t.x - dx * STOP + rx * LANE, z: t.z - dz * STOP + rz * LANE };
    car.len = Math.hypot(car.p1.x - car.p0.x, car.p1.z - car.p0.z);
    car.axis = car.seg.horizontal ? 'h' : 'v';
  }

  chooseNext(car) {
    const node = car.to;
    const options = node.segs.map(id => this.L.segments[id]).filter(s => s !== car.seg && this.allowedNode(this.L.nodes[s.a === node.id ? s.b : s.a]));
    let next = options.length ? options[Math.floor(this.r() * options.length)] : car.seg;
    const other = this.L.nodes[next.a === node.id ? next.b : next.a];
    const dx2 = Math.sign(other.x - node.x), dz2 = Math.sign(other.z - node.z);
    const rx2 = -dz2, rz2 = dx2;
    const start = { x: node.x + dx2 * STOP + rx2 * LANE, z: node.z + dz2 * STOP + rz2 * LANE };
    let ctrl;
    if (dx2 === car.dx && dz2 === car.dz) ctrl = { x: (car.p1.x + start.x) / 2, z: (car.p1.z + start.z) / 2 };
    else if (dx2 === -car.dx && dz2 === -car.dz) ctrl = { x: node.x + car.dx * 6, z: node.z + car.dz * 6 };
    else ctrl = { x: node.x + (-car.dz) * LANE + rx2 * LANE, z: node.z + car.dx * LANE + rz2 * LANE };
    car.turn = { a: car.p1, c: ctrl, b: start, next, nextTo: other };
    // approximate curve length
    let L = 0, px = car.p1.x, pz = car.p1.z;
    for (let i = 1; i <= 8; i++) { const p = bez(car.turn, i / 8); L += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; }
    car.turn.len = Math.max(1, L);
  }

  pos(car) {
    if (car.phase === 'lane') {
      const t = clamp(car.s / car.len, 0, 1);
      return { x: car.p0.x + (car.p1.x - car.p0.x) * t, z: car.p0.z + (car.p1.z - car.p0.z) * t, hx: car.dx, hz: car.dz };
    }
    const t = clamp(car.s / car.turn.len, 0, 1);
    const p = bez(car.turn, t);
    const q = bez(car.turn, Math.min(1, t + 0.05));
    const p2 = t > 0.95 ? bez(car.turn, t - 0.05) : p;
    const hx = t > 0.95 ? p.x - p2.x : q.x - p.x, hz = t > 0.95 ? p.z - p2.z : q.z - p.z;
    return { x: p.x, z: p.z, hx, hz };
  }
  place(car) {
    const p = this.pos(car);
    car.x = p.x; car.z = p.z;
    car.h = Math.atan2(p.hx, p.hz);
  }

  // write every car into its model's instanced meshes
  draw(night) {
    const idx = {};
    for (const m of MODELS) idx[m] = 0;
    for (const car of this.cars) {
      const R = this.renders[car.model];
      const i = idx[car.model]++;
      if (i >= MAX_PER_MODEL) continue;
      _p.set(car.x, 0, car.z);
      _q.setFromAxisAngle(_up, car.h);
      _m.compose(_p, _q, _one);
      R.bodyIM.setMatrixAt(i, _m);
      R.bodyIM.setColorAt(i, _col.set(car.color));
      const gl = R.bodyIM.geometry.attributes.instGlow;
      gl.setXY(i, night > 0.3 ? 1.3 : 0.05, car.braking ? 1.6 : (night > 0.3 ? 0.5 : 0.05));
      if (R.wheelIM) {
        _r.makeRotationX(car.spin);
        R.offsets.forEach((o, k) => {
          _w.makeTranslation(o.x, o.y, o.z).multiply(_r);
          R.wheelIM.setMatrixAt(i * R.offsets.length + k, _w.premultiply(_m));
        });
      }
    }
    for (const m of MODELS) {
      const R = this.renders[m];
      const n = Math.min(idx[m], MAX_PER_MODEL);
      R.bodyIM.count = n;
      R.bodyIM.instanceMatrix.needsUpdate = true;
      if (R.bodyIM.instanceColor) R.bodyIM.instanceColor.needsUpdate = true;
      R.bodyIM.geometry.attributes.instGlow.needsUpdate = true;
      if (R.wheelIM) { R.wheelIM.count = n * R.offsets.length; R.wheelIM.instanceMatrix.needsUpdate = true; }
    }
  }

  update(dt, clock) {
    const g = this.g;
    const focus = g.player.vehicle ? { x: g.player.vehicle.x, z: g.player.vehicle.z } : g.player.pos;
    // traffic lights visuals (cheap: twice a second)
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.25;
      g.world.setTrafficLights(it => lightState(this.L.nodes[it.node], it.axis, clock));
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.4;
      this.cars = this.cars.filter(c => Math.hypot(c.x - focus.x, c.z - focus.z) <= 320);
      if (this.cars.length < this.max) this.spawn(focus);
    }
    const pv = g.player.vehicle;
    const ppos = pv ? { x: pv.x, z: pv.z } : g.player.pos;
    const night = g.world.night;
    for (const car of this.cars) {
      let target = car.target;
      const fx = Math.sin(car.h), fz = Math.cos(car.h);
      // red light ahead
      if (car.phase === 'lane' && car.to.signal) {
        const st = lightState(car.to, car.axis, clock);
        const toStop = car.len - car.s;
        if (st === 'red' || (st === 'amber' && toStop > 7)) {
          target = Math.min(target, Math.sqrt(Math.max(0, 2 * 5 * (toStop - 1.5))));
          if (toStop < 1.5) target = 0;
        }
      }
      // cars ahead (any car in a narrow cone)
      let blockedByPlayer = false;
      for (const o of this.cars) {
        if (o === car) continue;
        const ox = o.x - car.x, oz = o.z - car.z;
        const fwd = ox * fx + oz * fz;
        if (fwd <= 0 || fwd > 22) continue;
        const lat = Math.abs(ox * fz - oz * fx);
        if (lat > 2.0) continue;
        target = Math.min(target, Math.max(0, (fwd - 7) * 1.1));
      }
      // player ahead
      {
        const ox = ppos.x - car.x, oz = ppos.z - car.z;
        const fwd = ox * fx + oz * fz;
        const lat = Math.abs(ox * fz - oz * fx);
        if (fwd > 0 && fwd < 16 && lat < (pv ? 2.4 : 1.6)) { target = Math.min(target, Math.max(0, (fwd - (pv ? 6 : 4)) * 1.2)); blockedByPlayer = true; }
      }
      if (g.npcs.nearPoint(car.x + fx * 5, car.z + fz * 5, 2.2)) target = 0;
      // speed control
      if (target > car.speed) car.speed = Math.min(target, car.speed + 3.5 * dt);
      else car.speed = Math.max(target, car.speed - 10 * dt);
      if (car.speed < 0.05) car.speed = 0;
      car.braking = target < car.speed - 0.5 || car.speed < 0.2;
      // honk when stuck behind the player
      if (blockedByPlayer && car.speed < 0.3) {
        car.wait += dt;
        if (car.wait > 2.5 && car.honk <= 0) { g.audio.horn(car.x, car.z, 'car'); car.honk = 4 + this.r() * 3; }
      } else car.wait = 0;
      car.honk -= dt;
      // advance along lane / turn
      car.s += car.speed * dt;
      if (car.phase === 'lane' && car.s >= car.len) {
        car.s -= car.len;
        this.chooseNext(car);
        car.phase = 'turn';
      }
      if (car.phase === 'turn' && car.s >= car.turn.len) {
        car.s -= car.turn.len;
        const node = car.to;
        car.seg = car.turn.next;
        car.from = node;
        car.to = car.turn.nextTo;
        this.setupLane(car);
        car.phase = 'lane';
      }
      this.place(car);
      car.spin += car.speed / 0.34 * dt;
      // collisions with the player
      if (pv) {
        const dx = pv.x - car.x, dz = pv.z - car.z;
        const along = dx * fx + dz * fz;
        const side = dx * fz - dz * fx;
        if (Math.abs(along) < 2.4 + pv.M.size.z * 0.4 && Math.abs(side) < 0.95 + pv.radius) {
          const l = Math.hypot(dx, dz) || 1;
          const nx = dx / l, nz = dz / l;
          const rel = (pv.vx - fx * car.speed) * nx + (pv.vz - fz * car.speed) * nz;
          pv.push(nx, nz, 0.3);
          pv.x += nx * 0.08; pv.z += nz * 0.08;
          car.speed *= 0.3;
          if (rel < -1.5) g.onVehicleImpact(-rel, 'car');
        }
      } else {
        const dx = ppos.x - car.x, dz = ppos.z - car.z;
        if (Math.abs(dx * fx + dz * fz) < 2.4 && Math.abs(dx * fz - dz * fx) < 1.3) {
          const l = Math.hypot(dx, dz) || 1;
          g.player.pos.x += dx / l * 0.15; g.player.pos.z += dz / l * 0.15;
        }
      }
    }
    this.draw(night);
  }

  nearestCar(x, z) {
    let best = Infinity;
    for (const c of this.cars) best = Math.min(best, Math.hypot(c.x - x, c.z - z));
    return best;
  }
}

function bez(t, u) {
  const a = t.a, c = t.c, b = t.b, v = 1 - u;
  return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, z: v * v * a.z + 2 * v * u * c.z + u * u * b.z };
}
