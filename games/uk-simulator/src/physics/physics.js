// UK Simulator - physics world (Rapier) with a fixed time step.
// The town is static colliders (ground height fields, building walls, kerbs, bridge decks,
// walls, posts); vehicles are rigid bodies whose wheels, tyres and engines are simulated by
// our own code (car.js, bike.js) and applied as forces each step.
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/+esm';

export const STEP = 1 / 120;
export const GROUPS = { world: 0x0001, vehicle: 0x0002, rider: 0x0004, prop: 0x0008, ground: 0x0010 };
const groups = (member, filter) => ((member << 16) | filter) >>> 0;

export class Physics {
  async init() {
    await RAPIER.init();
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.world.numSolverIterations = 6;
    this.events = new RAPIER.EventQueue(true);
    this.kinds = new Map();   // collider handle -> { kind, owner }
    this.contactListeners = new Map(); // collider handle -> fn(force, other)
    this.acc = 0;
    this.time = 0;
  }

  tag(collider, kind, owner = null) { this.kinds.set(collider.handle, { kind, owner }); return collider; }
  untag(collider) { this.kinds.delete(collider.handle); this.contactListeners.delete(collider.handle); }
  kindOf(handle) { return this.kinds.get(handle); }

  // static height field for one terrain chunk: heights[row * n + col], spacing s, origin at (x0, z0)
  addHeightfield(x0, z0, n, s, heights) {
    const R = this.R;
    // Rapier height fields are column-major with rows along x
    const h = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) h[c * n + r] = heights[r * n + c];
    const size = (n - 1) * s;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x0 + size / 2, 0, z0 + size / 2));
    const desc = R.ColliderDesc.heightfield(n - 1, n - 1, h, { x: size, y: 1, z: size }).setFriction(0.9).setCollisionGroups(groups(GROUPS.ground, 0xffff));
    const col = this.world.createCollider(desc, body);
    this.tag(col, 'ground');
    return { body, col };
  }

  addTrimesh(vertices, indices, kind = 'static', friction = 0.6) {
    const R = this.R;
    if (!indices.length) return null;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    const col = this.world.createCollider(R.ColliderDesc.trimesh(vertices, indices).setFriction(friction).setCollisionGroups(groups(GROUPS.world, 0xffff)), body);
    this.tag(col, kind);
    return { body, col };
  }

  addStaticCylinder(x, y, z, halfH, r, kind = 'post') {
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y + halfH, z));
    const col = this.world.createCollider(R.ColliderDesc.cylinder(halfH, r).setFriction(0.5).setCollisionGroups(groups(GROUPS.world, 0xffff)), body);
    this.tag(col, kind);
    return { body, col };
  }

  addStaticBox(x, y, z, hx, hy, hz, rotY = 0, kind = 'box', rotX = 0) {
    const R = this.R;
    const q = quatFromEuler(rotX, rotY, 0);
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(q));
    const col = this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.8).setCollisionGroups(groups(GROUPS.world, 0xffff)), body);
    this.tag(col, kind);
    return { body, col };
  }

  remove(obj) {
    if (!obj) return;
    if (obj.col) this.untag(obj.col);
    if (obj.body) this.world.removeRigidBody(obj.body);
  }

  // ray: returns { dist, point:[x,y,z], normal:[x,y,z], kind, handle } or null
  // mask = which collider groups the ray may hit (default: everything except the ground height
  // fields, which the vehicles test exactly against the ground mesh instead)
  castRay(ox, oy, oz, dx, dy, dz, maxDist, excludeBody = null, mask = GROUPS.world | GROUPS.prop | GROUPS.vehicle) {
    const R = this.R;
    const ray = this._ray || (this._ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }));
    ray.origin.x = ox; ray.origin.y = oy; ray.origin.z = oz; ray.dir.x = dx; ray.dir.y = dy; ray.dir.z = dz;
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, ((0xffff << 16) | mask) >>> 0, undefined, excludeBody || undefined);
    if (!hit) return null;
    const t = hit.timeOfImpact ?? hit.toi;
    const info = this.kinds.get(hit.collider.handle);
    return { dist: t, point: [ox + dx * t, oy + dy * t, oz + dz * t], normal: [hit.normal.x, hit.normal.y, hit.normal.z], kind: info ? info.kind : 'other', owner: info ? info.owner : null, handle: hit.collider.handle };
  }

  onContact(collider, fn) { this.contactListeners.set(collider.handle, fn); }

  // run as many fixed steps as the frame time needs (max 8, so a slow frame cannot spiral)
  update(frameDt, beforeStep, afterStep) {
    this.acc = Math.min(this.acc + frameDt, STEP * 8);
    let n = 0;
    while (this.acc >= STEP) {
      beforeStep(STEP);
      this.world.step(this.events);
      if (afterStep) afterStep(STEP);
      this.events.drainContactForceEvents((e) => {
        const a = this.contactListeners.get(e.collider1()), b = this.contactListeners.get(e.collider2());
        const f = e.totalForceMagnitude(), dir = e.maxForceDirection();
        if (a) a(f, dir, e.collider2());
        if (b) b(f, dir, e.collider1());
      });
      this.events.drainCollisionEvents(() => {});
      this.acc -= STEP;
      this.time += STEP;
      n++;
    }
    return n;
  }

  get alpha() { return this.acc / STEP; }
}

export function quatFromEuler(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  // order YXZ (yaw, then pitch, then roll) like three.js 'YXZ'
  return { x: s1 * c2 * c3 + c1 * s2 * s3, y: c1 * s2 * c3 - s1 * c2 * s3, z: c1 * c2 * s3 - s1 * s2 * c3, w: c1 * c2 * c3 + s1 * s2 * s3 };
}

export { RAPIER, groups };
