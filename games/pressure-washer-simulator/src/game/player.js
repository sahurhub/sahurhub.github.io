// First-person walker: mouse look, WASD, jump, and collision with boxes (rotated about Y).
// Low boxes (up to `step` above your feet) can be stepped on, so platforms and kerbs work.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// box = { cx, cz, hx, hz, c, s, y0, y1 } (centre, half sizes, cos/sin of its yaw, bottom, top)
export function makeBox(cx, cz, hx, hz, yaw, y0, y1) {
  return { cx, cz, hx, hz, c: Math.cos(yaw), s: Math.sin(yaw), y0, y1 };
}
// world -> box local (inverse of a yaw rotation about +Y)
function toLocal(b, x, z) {
  const dx = x - b.cx, dz = z - b.cz;
  return [dx * b.c - dz * b.s, dx * b.s + dz * b.c];
}
function toWorldDir(b, lx, lz) { return [lx * b.c + lz * b.s, -lx * b.s + lz * b.c]; }

export class Player {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.eye = 1.62; this.radius = 0.3; this.height = 1.8; this.step = 0.47;
    this.speed = 4.0;
    this.onGround = true;
    this.bob = 0; this.bobAmt = 0;
    this.boxes = [];
    this.bounds = null;     // { x0, z0, x1, z1 }
    this.tether = null;     // { x, z, len } hose limit around the washer
    this.stretched = false; // hose pulled tight this frame
    this.walked = 0;        // metres walked (tutorial)
    this.looked = 0;        // radians turned (tutorial)
  }

  setWorld(boxes, bounds) { this.boxes = boxes; this.bounds = bounds; }

  place(x, y, z, yaw, pitch = -0.12) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = pitch; this.onGround = true;
    this.updateCamera(0);
  }

  look(dx, dy, sens = 1, invert = false) {
    const k = 0.0022 * sens;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (invert ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.45, 1.4);
    this.looked += Math.abs(dx * k) + Math.abs(dy * k);
  }

  // highest box top under (x, z) that we can stand on from feet height fy
  groundAt(x, z, fy) {
    let g = 0;
    const m = this.radius * 0.35;
    for (const b of this.boxes) {
      if (b.y1 > fy + this.step + 0.001 || b.y1 <= g) continue;
      const [lx, lz] = toLocal(b, x, z);
      if (Math.abs(lx) <= b.hx + m && Math.abs(lz) <= b.hz + m) g = b.y1;
    }
    return g;
  }

  collideXZ() {
    const p = this.pos, r = this.radius;
    for (let it = 0; it < 2; it++) {
      for (const b of this.boxes) {
        if (b.y1 <= p.y + this.step + 0.001) continue; // low enough to step on
        if (b.y0 >= p.y + this.height) continue;       // overhead
        let [lx, lz] = toLocal(b, p.x, p.z);
        const qx = clamp(lx, -b.hx, b.hx), qz = clamp(lz, -b.hz, b.hz);
        let ox = lx - qx, oz = lz - qz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= r * r) continue;
        let nx, nz, push;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          nx = ox / d; nz = oz / d; push = r - d;
        } else {
          // centre inside the box: leave by the nearest side
          const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz);
          if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + r; } else { nx = 0; nz = Math.sign(lz) || 1; push = pz + r; }
        }
        const [wx, wz] = toWorldDir(b, nx * push, nz * push);
        p.x += wx; p.z += wz;
        // stop moving into the wall
        const [wnx, wnz] = toWorldDir(b, nx, nz);
        const vn = this.vel.x * wnx + this.vel.z * wnz;
        if (vn < 0) { this.vel.x -= vn * wnx; this.vel.z -= vn * wnz; }
      }
    }
  }

  limit() {
    const p = this.pos, r = this.radius;
    const b = this.bounds;
    if (b) { p.x = clamp(p.x, b.x0 + r, b.x1 - r); p.z = clamp(p.z, b.z0 + r, b.z1 - r); }
    this.stretched = false;
    const t = this.tether;
    if (t) {
      const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz);
      if (d > t.len) {
        p.x = t.x + (dx / d) * t.len; p.z = t.z + (dz / d) * t.len;
        this.stretched = true;
        const vn = (this.vel.x * dx + this.vel.z * dz) / d;
        if (vn > 0) { this.vel.x -= (vn * dx) / d; this.vel.z -= (vn * dz) / d; }
      }
    }
  }

  // move = { x: right, z: forward } in -1..1
  update(dt, move, jump) {
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const rgtX = Math.cos(this.yaw), rgtZ = -Math.sin(this.yaw);
    let wx = fwdX * move.z + rgtX * move.x, wz = fwdZ * move.z + rgtZ * move.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const k = Math.min(1, dt * (this.onGround ? 11 : 2.5));
    this.vel.x += (wx * this.speed - this.vel.x) * k;
    this.vel.z += (wz * this.speed - this.vel.z) * k;
    if (jump && this.onGround) { this.vel.y = 5.6; this.onGround = false; }
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / steps;
    const x0 = this.pos.x, z0 = this.pos.z;
    for (let i = 0; i < steps; i++) {
      this.vel.y -= 20 * h;
      this.pos.x += this.vel.x * h;
      this.pos.z += this.vel.z * h;
      this.collideXZ();
      this.limit();
      const g = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
      this.pos.y += this.vel.y * h;
      if (this.pos.y <= g) {
        // stepping up onto something low is instant but smoothed by the camera
        this.pos.y = g; this.vel.y = 0; this.onGround = true;
      } else if (this.pos.y - g > 0.05) {
        this.onGround = false;
      }
    }
    const moved = Math.hypot(this.pos.x - x0, this.pos.z - z0);
    this.walked += moved;
    const sp = moved / Math.max(dt, 1e-4);
    this.bobAmt += ((this.onGround && sp > 0.5 ? 1 : 0) - this.bobAmt) * Math.min(1, dt * 8);
    this.bob += dt * sp * 2.1;
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const c = this.cam;
    const targetY = this.pos.y + this.eye + Math.sin(this.bob * 2) * 0.028 * this.bobAmt;
    // smooth step-ups, follow jumps closely
    if (!dt || Math.abs(c.position.y - targetY) > 1.2) c.position.y = targetY;
    else c.position.y += (targetY - c.position.y) * Math.min(1, dt * 18);
    c.position.x = this.pos.x; c.position.z = this.pos.z;
    c.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * 0.004 * this.bobAmt, 'YXZ');
    c.updateMatrixWorld();
  }
}
