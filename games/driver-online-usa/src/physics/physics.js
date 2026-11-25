// Driver Online USA - physics world (Rapier, WebAssembly).
// The world (ground, roads, buildings, props) is static. The player's car is a dynamic body.
// Other players' cars and traffic are "kinematic" bodies we move to where the network says;
// they push the player's car but are not pushed by it on this PC.
import RAPIER from 'rapier';

export { RAPIER };

// Collision groups: membership in the upper 16 bits, "collides with" in the lower 16 bits.
export const G = { WORLD: 0x1, CAR: 0x2, REMOTE: 0x4, TRAFFIC: 0x8 };
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const GROUPS = {
  world: groups(G.WORLD, 0xffff),
  car: groups(G.CAR, G.WORLD | G.REMOTE | G.TRAFFIC),
  carGhost: groups(G.CAR, G.WORLD),            // spawn protection (3 s after spawn, reset, teleport)
  carNoPlayers: groups(G.CAR, G.WORLD | G.TRAFFIC), // ghost-car rooms: players pass through each other
  remote: groups(G.REMOTE, G.CAR),
  remoteGhost: groups(G.REMOTE, 0),
  traffic: groups(G.TRAFFIC, G.CAR),
  wheelRay: groups(G.CAR, G.WORLD),            // wheels only stand on the world
  camRay: groups(G.CAR, G.WORLD),              // camera only avoids the world
};

let ready = null;
export function initRapier() {
  if (!ready) ready = RAPIER.init();
  return ready;
}

export class Physics {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.dt = 1 / 60;
    this.acc = 0;
    this.events = new RAPIER.EventQueue(true);
    this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.colliderInfo = new Map(); // collider handle -> { kind, id }
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  tag(collider, info) { this.colliderInfo.set(collider.handle, info); return collider; }

  addHeightfield(nx, nz, heightsColMajor, sizeX, sizeZ, cx = 0, cz = 0) {
    const desc = RAPIER.ColliderDesc.heightfield(nz - 1, nx - 1, heightsColMajor, { x: sizeX, y: 1, z: sizeZ })
      .setTranslation(cx, 0, cz).setFriction(1).setCollisionGroups(GROUPS.world);
    return this.tag(this.world.createCollider(desc, this.staticBody), { kind: 'ground' });
  }

  addTrimesh(vertices, indices, kind = 'road') {
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(1).setCollisionGroups(GROUPS.world);
    return this.tag(this.world.createCollider(desc, this.staticBody), { kind });
  }

  addBox(x, y, z, hx, hy, hz, rotY = 0, kind = 'building') {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z)
      .setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) })
      .setFriction(0.5).setCollisionGroups(GROUPS.world);
    return this.tag(this.world.createCollider(desc, this.staticBody), { kind });
  }

  addBoxQ(x, y, z, hx, hy, hz, q, kind = 'building') {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(0.8).setCollisionGroups(GROUPS.world);
    return this.tag(this.world.createCollider(desc, this.staticBody), { kind });
  }

  addCylinder(x, y, z, r, halfH, kind = 'pole') {
    const desc = RAPIER.ColliderDesc.cylinder(halfH, r).setTranslation(x, y, z).setFriction(0.5).setCollisionGroups(GROUPS.world);
    return this.tag(this.world.createCollider(desc, this.staticBody), { kind });
  }

  /** A kinematic box we move ourselves (other players, traffic). */
  addKinematicBox(hx, hy, hz, offsetY, grp, info) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(Math.max(0.05, hx - 0.08), Math.max(0.05, hy - 0.08), Math.max(0.05, hz - 0.08), 0.08)
        .setTranslation(0, offsetY, 0).setFriction(0.4).setRestitution(0.05).setCollisionGroups(grp),
      body);
    this.tag(col, info);
    return { body, col };
  }

  remove(body) { if (body) this.world.removeRigidBody(body); }

  /** Ray cast against the world. Returns distance or -1. */
  castRay(ox, oy, oz, dx, dy, dz, maxDist, grp = GROUPS.camRay, excludeBody = null) {
    this.ray.origin.x = ox; this.ray.origin.y = oy; this.ray.origin.z = oz;
    this.ray.dir.x = dx; this.ray.dir.y = dy; this.ray.dir.z = dz;
    const hit = this.world.castRay(this.ray, maxDist, true, undefined, grp, undefined, excludeBody || undefined);
    return hit ? hit.timeOfImpact : -1;
  }

  castRayNormal(ox, oy, oz, dx, dy, dz, maxDist, grp, excludeBody) {
    this.ray.origin.x = ox; this.ray.origin.y = oy; this.ray.origin.z = oz;
    this.ray.dir.x = dx; this.ray.dir.y = dy; this.ray.dir.z = dz;
    return this.world.castRayAndGetNormal(this.ray, maxDist, true, undefined, grp, undefined, excludeBody || undefined);
  }

  /**
   * Advance the world in fixed steps. before(dt) runs before each step (car forces),
   * after() after each one. Returns the leftover fraction for smooth drawing.
   */
  update(frameDt, before, after) {
    this.acc = Math.min(this.acc + frameDt, this.dt * 4);
    let steps = 0;
    while (this.acc >= this.dt) {
      if (before) before(this.dt);
      this.world.step(this.events);
      if (after) after(this.dt);
      this.acc -= this.dt;
      steps++;
    }
    return { alpha: this.acc / this.dt, steps };
  }
}
