// UK Simulator - shared parts of every vehicle's physics: the chassis rigid body (real mass,
// centre of mass, inertia), raycast suspension per wheel (spring, bump / rebound damping,
// travel, bump stop), finding the ground / kerbs / bridges under each wheel, tyre forces at
// the contact patch, aero drag and downforce, water, and crash damage.
import { GROUPS } from './physics.js';
import { surfaceGrip, SURFACE } from './tyre.js';

export const G = 9.81, RHO = 1.225;

// small vector helpers on plain arrays (no allocations in the hot path)
export const v3 = {
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b, o) => { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; },
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; return a; },
};

export function rotate(q, x, y, z, o) {
  // rotate vector (x, y, z) by quaternion q {x, y, z, w}
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  o[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  o[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  o[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return o;
}

export class VehicleBody {
  // spec: vehicles.js entry; pose: { x, y, z, heading }
  constructor(spec, physics, world, pose, tune) {
    this.spec = spec; this.ph = physics; this.world = world; this.tune = tune;
    const R = physics.R;
    const d = spec.dims;
    const q = { x: 0, y: Math.sin(pose.heading / 2), z: 0, w: Math.cos(pose.heading / 2) };
    const bd = R.RigidBodyDesc.dynamic().setTranslation(pose.x, pose.y, pose.z).setRotation(q).setCanSleep(false).setCcdEnabled(true).setAngularDamping(0.02).setLinearDamping(0.0);
    this.body = physics.world.createRigidBody(bd);
    this.colliders = [];
    this.makeColliders();
    this.setMass(spec.com);
    this.pos = [0, 0, 0]; this.rot = q; this.right = [1, 0, 0]; this.up = [0, 1, 0]; this.fwd = [0, 0, 1];
    this.lin = [0, 0, 0]; this.ang = [0, 0, 0]; this.comW = [0, 0, 0];
    this.speed = 0; this.damage = { front: 0, rear: 0, left: 0, right: 0, total: 0 };
    this.tmp = [0, 0, 0]; this.tmp2 = [0, 0, 0];
    this.inWater = 0; this.drowned = false; this.airTime = 0; this.lastAccel = [0, 0, 0]; this.prevLin = [0, 0, 0];
    this.impacts = [];
  }

  makeColliders() {
    const spec = this.spec, R = this.ph.R, d = spec.dims;
    const groups = ((GROUPS.vehicle << 16) | 0xffff) >>> 0;
    const add = (desc) => {
      const c = this.ph.world.createCollider(desc.setDensity(0).setFriction(0.35).setRestitution(0.05).setCollisionGroups(groups).setActiveEvents(this.ph.R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(spec.mass * 4), this.body);
      this.ph.tag(c, 'vehicle', this);
      this.ph.onContact(c, (f, dir, other) => this.onImpact(f, dir, other));
      this.colliders.push(c);
      return c;
    };
    if (spec.kind === 'car') {
      const clear = spec.wheels[0].r * 0.75;
      const bodyH = (d.height - clear) * 0.55;
      add(R.ColliderDesc.cuboid(d.width / 2 * 0.96, bodyH / 2, d.length / 2 * 0.98).setTranslation(0, clear + bodyH / 2, 0));
      const cabH = d.height - clear - bodyH;
      add(R.ColliderDesc.cuboid(d.width / 2 * 0.82, cabH / 2, d.length / 2 * (spec.handlebar ? 0.25 : 0.55)).setTranslation(0, clear + bodyH + cabH / 2, spec.handlebar ? -0.1 : -0.15));
    } else {
      // two-wheelers: frame + rider body
      // narrow frame / deck so the vehicle can lean like the real one before anything scrapes
      const wb = spec.wheelbase, r = spec.wheels[0].r;
      const standing = spec.rider && spec.rider.standing;
      if (standing) add(R.ColliderDesc.cuboid(0.08, 0.035, wb / 2 - r * 0.6).setTranslation(0, r + 0.075, 0));
      else add(R.ColliderDesc.cuboid(0.09, 0.14, wb / 2).setTranslation(0, r + 0.3, 0));
      this.riderCol = add(R.ColliderDesc.capsule(standing ? 0.45 : 0.3, 0.2).setTranslation(0, standing ? 1.25 : 1.15, standing ? 0 : -0.15));
    }
  }

  // mass, centre of mass (local), inertia from the size, scaled by spec.inertiaScale
  setMass(com) {
    const spec = this.spec, d = spec.dims, m = spec.mass + (this.extraMass || 0);
    const s = spec.inertiaScale || [1, 1, 1];
    const k = spec.kind === 'car' ? 0.85 : 0.9;
    const L = spec.kind === 'car' ? d.length : spec.wheelbase * 1.2, W = spec.kind === 'car' ? d.width : 0.5, H = spec.kind === 'car' ? d.height * 0.8 : 1.4;
    const Ix = m / 12 * (H * H + L * L) * k * s[0];
    const Iy = m / 12 * (W * W + L * L) * k * s[1];
    const Iz = m / 12 * (W * W + H * H) * k * s[2];
    this.com = [com[0], com[1], com[2]];
    this.mass = m;
    this.body.setAdditionalMassProperties(m, { x: com[0], y: com[1], z: com[2] }, { x: Ix, y: Iy, z: Iz }, { x: 0, y: 0, z: 0, w: 1 }, true);
    this.inertia = [Ix, Iy, Iz];
  }

  readState(dt) {
    const b = this.body;
    const t = b.translation(), q = b.rotation(), l = b.linvel(), a = b.angvel();
    this.pos[0] = t.x; this.pos[1] = t.y; this.pos[2] = t.z;
    this.rot = q;
    // vehicle axes follow glTF models: +z forward, +y up, +x to the LEFT (so "right" is -x)
    rotate(q, -1, 0, 0, this.right); rotate(q, 0, 1, 0, this.up); rotate(q, 0, 0, 1, this.fwd);
    rotate(q, this.com[0], this.com[1], this.com[2], this.comW);
    this.comW[0] += t.x; this.comW[1] += t.y; this.comW[2] += t.z;
    this.prevLin[0] = this.lin[0]; this.prevLin[1] = this.lin[1]; this.prevLin[2] = this.lin[2];
    this.lin[0] = l.x; this.lin[1] = l.y; this.lin[2] = l.z;
    this.ang[0] = a.x; this.ang[1] = a.y; this.ang[2] = a.z;
    this.speed = v3.dot(this.lin, this.fwd);
    // acceleration in the car's frame (g-meter for the debug overlay)
    if (dt > 0) {
      const ax = (this.lin[0] - this.prevLin[0]) / dt, ay = (this.lin[1] - this.prevLin[1]) / dt + G, az = (this.lin[2] - this.prevLin[2]) / dt;
      const f = 0.1;
      this.lastAccel[0] += ((ax * this.right[0] + ay * this.right[1] + az * this.right[2]) / G - this.lastAccel[0]) * f;
      this.lastAccel[1] += ((ax * this.fwd[0] + ay * this.fwd[1] + az * this.fwd[2]) / G - this.lastAccel[1]) * f;
      this.lastAccel[2] += ((ax * this.up[0] + ay * this.up[1] + az * this.up[2]) / G - this.lastAccel[2]) * f;
    }
  }

  // world position of a local point
  toWorld(x, y, z, o) { rotate(this.rot, x, y, z, o); o[0] += this.pos[0]; o[1] += this.pos[1]; o[2] += this.pos[2]; return o; }

  // velocity of the body at world point p
  velAt(p, o) {
    const rx = p[0] - this.comW[0], ry = p[1] - this.comW[1], rz = p[2] - this.comW[2];
    const w = this.ang;
    o[0] = this.lin[0] + w[1] * rz - w[2] * ry;
    o[1] = this.lin[1] + w[2] * rx - w[0] * rz;
    o[2] = this.lin[2] + w[0] * ry - w[1] * rx;
    return o;
  }

  impulse(fx, fy, fz, px, py, pz) {
    this.body.applyImpulseAtPoint({ x: fx, y: fy, z: fz }, { x: px, y: py, z: pz }, true);
  }

  // ray down the suspension: nearest of the ground mesh and static / dynamic colliders
  probe(ox, oy, oz, dx, dy, dz, maxDist) {
    const g = this.world.groundRay(ox, oy, oz, dx, dy, dz, maxDist);
    const s = this.ph.castRay(ox, oy, oz, dx, dy, dz, maxDist, this.body);
    if (s && (!g || s.dist < g.dist)) return s;
    return g;
  }

  surface(x, y, z, hitKind) {
    if (hitKind === 'static' || hitKind === 'prop') return { surface: hitKind === 'static' ? SURFACE.paving : SURFACE.concrete, wet: this.world.wetness || 0, water: 0, road: 1 };
    if (hitKind === 'vehicle') return { surface: SURFACE.tarmac, wet: 0, water: 0, road: 1 };
    return this.world.surfaceAt(x, z, y);
  }

  grip(surf, offroad) { return surfaceGrip(surf.surface, offroad, surf.wet); }

  // drag, downforce (per axle: front at +zF, rear at zR), water
  aero(dt, cd, area, clF = 0, clR = 0, zF = 1, zR = -1) {
    const v = this.lin, sp = Math.hypot(v[0], v[1], v[2]);
    if (sp > 0.5) {
      const k = 0.5 * RHO * cd * area * sp;
      this.impulse(-k * v[0] * dt, -k * v[1] * dt, -k * v[2] * dt, this.comW[0], this.comW[1] + 0.1, this.comW[2]);
    }
    const fw = Math.max(0, this.speed);
    if ((clF || clR) && fw > 5) {
      const q = 0.5 * RHO * area * fw * fw;
      const pF = this.toWorld(0, 0.4, zF, this.tmp), u = this.up;
      this.impulse(-u[0] * q * clF * dt, -u[1] * q * clF * dt, -u[2] * q * clF * dt, pF[0], pF[1], pF[2]);
      const pR = this.toWorld(0, 0.4, zR, this.tmp);
      this.impulse(-u[0] * q * clR * dt, -u[1] * q * clR * dt, -u[2] * q * clR * dt, pR[0], pR[1], pR[2]);
    }
    // water: buoyancy and heavy drag when the body is in a river, the canal or a lake
    const s = this.world.surfaceAt(this.comW[0], this.comW[2], this.comW[1] - 0.3);
    this.inWater = s.water;
    if (s.water > 0.05) {
      const depth = Math.min(1.5, s.water);
      this.impulse(0, this.mass * G * 0.55 * depth * dt, 0, this.comW[0], this.comW[1], this.comW[2]);
      const k = 900 * depth;
      this.impulse(-v[0] * k * dt, -v[1] * k * 1.5 * dt, -v[2] * k * dt, this.comW[0], this.comW[1], this.comW[2]);
      if (depth > (this.spec.kind === 'car' ? 0.7 : 0.55)) this.drownTime = (this.drownTime || 0) + dt; else this.drownTime = 0;
      if (this.drownTime > 1.5) this.drowned = true;
    } else this.drownTime = 0;
  }

  onImpact(force, dir, otherHandle) {
    // force in newtons; only hard knocks count. Direction is in world space.
    const thr = this.mass * 14;
    if (force < thr) return;
    const local = [0, 0, 0];
    // world -> local (inverse rotation = conjugate)
    const q = this.rot;
    rotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, dir.x, dir.y, dir.z, local);
    const zone = Math.abs(local[2]) > Math.abs(local[0]) ? (local[2] > 0 ? 'rear' : 'front') : (local[0] > 0 ? 'left' : 'right');
    // one crash reports a force every physics step while touching: only the hardest moment counts
    const now = this.ph.time;
    const ep = this.episode || (this.episode = {});
    const e = ep[zone];
    let amount = Math.min(1, (force - thr) / (this.mass * 1800));
    if (e && now - e.t < 0.5) { const extra = Math.max(0, amount - e.peak); e.peak = Math.max(e.peak, amount); e.t = now; amount = extra; }
    else ep[zone] = { t: now, peak: amount };
    if (amount <= 0) return;
    this.damage[zone] = Math.min(1, this.damage[zone] + amount);
    this.damage.total = Math.min(1, (this.damage.front + this.damage.rear + this.damage.left + this.damage.right) / 2.5);
    this.impacts.push({ local, amount, force });
    if (this.onDamage) this.onDamage(zone, amount, local);
  }

  reset(x, y, z, heading) {
    const q = { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation(q, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.drowned = false; this.drownTime = 0;
  }

  destroy() {
    for (const c of this.colliders) this.ph.untag(c);
    this.ph.world.removeRigidBody(this.body);
  }
}

// Suspension for one wheel: returns contact info or null; updates w.x (compression), w.load
// w: { mount: [x,y,z] local, r, travel, k, preload, bump, rebound, bumpStop }
export function suspend(vb, w, dt, out) {
  const m = vb.toWorld(w.mount[0], w.mount[1], w.mount[2], out.mountW || (out.mountW = [0, 0, 0]));
  const u = vb.up;
  const maxD = w.travel + w.r + 0.08;
  const hit = vb.probe(m[0], m[1], m[2], -u[0], -u[1], -u[2], maxD);
  if (!hit || hit.dist > w.travel + w.r) {
    w.x = Math.max(0, w.x - dt * 3); w.contact = false; w.load = 0; w.xv = 0;
    w.len = w.travel; // full droop
    return null;
  }
  const len = hit.dist - w.r;
  const x = w.travel - len;
  const xv = (x - w.x) / dt;
  w.xv = xv;
  w.x = x;
  w.len = Math.max(0, len);
  let F = w.k * x + w.preload + (xv > 0 ? w.bump : w.rebound) * xv;
  if (x > w.travel) F += w.k * 12 * (x - w.travel) + w.bump * 4 * Math.max(0, xv); // bump stop
  w.contact = true;
  w.F = F;
  w.hit = hit;
  return hit;
}
