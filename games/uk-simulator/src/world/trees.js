// UK Simulator - trees (positions and sizes from the LiDAR). Crowns are clusters of leaf
// cards; far away they become two crossed cards. All trees share a few big instanced meshes
// that are re-packed when chunks load, unload or change detail level.
import * as THREE from 'three';

const KINDS = 4; // 0 broadleaf, 1 conifer, 2 poplar, 3 bush
const CAP = { near: 26000, far: 90000 };

function crownGeometry(kind, cards, far) {
  // unit crown: radius 1 around (0, 0, 0); conifer is a cone from y -1 to +1
  const pos = [], nrm = [], uv = [], idx = [];
  let s = 1234 + kind * 77 + (far ? 5 : 0);
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const addQuad = (cx, cy, cz, ax, ay, az, bx, by, bz, tri) => {
    const b0 = pos.length / 3;
    const corners = tri ? [[-1, -1], [1, -1], [0, 1]] : [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [u, v] of corners) {
      const x = cx + ax * u + bx * v, y = cy + ay * u + by * v, z = cz + az * u + bz * v;
      pos.push(x, y, z);
      // normals point out from the middle of the crown: soft, rounded lighting
      const L = Math.hypot(x, y * 0.7, z) || 1;
      nrm.push(x / L, Math.max(0.2, y * 0.7 / L + 0.3), z / L);
      uv.push((u + 1) / 2, (v + 1) / 2);
    }
    if (tri) idx.push(b0, b0 + 1, b0 + 2); else idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  };
  if (far) {
    const tri = kind === 1;
    addQuad(0, 0, 0, 1, 0, 0, 0, 1, 0, tri);
    addQuad(0, 0, 0, 0, 0, 1, 0, 1, 0, tri);
  } else if (kind === 1) {
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI; addQuad(0, 0, 0, Math.cos(a), 0, Math.sin(a), 0, 1, 0, true); }
    for (let k = 0; k < 3; k++) { const y = -0.6 + k * 0.5, r = 0.75 - k * 0.2; const a = rnd() * 3; addQuad(0, y, 0, Math.cos(a) * r, 0, Math.sin(a) * r, -Math.sin(a) * r, 0.0, Math.cos(a) * r, false); }
  } else {
    for (let k = 0; k < cards; k++) {
      // points spread over a sphere; each card faces roughly outward, random spin
      const th = Math.acos(1 - 2 * (k + 0.5) / cards), ph = k * 2.399963;
      const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
      const c = 0.55;
      const sz = 0.62 + rnd() * 0.15;
      // tangent frame
      let tx = -dz, tz = dx, ty = 0; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const bx = dy * tz - 0 * dz, by = dz * tx - dx * tz, bz = dx * 0 - dy * tx;
      const sp = rnd() * Math.PI;
      const cs = Math.cos(sp), sn = Math.sin(sp);
      addQuad(dx * c, dy * c, dz * c, (tx * cs + bx * sn) * sz, (ty * cs + by * sn) * sz, (tz * cs + bz * sn) * sz, (-tx * sn + bx * cs) * sz, (-ty * sn + by * cs) * sz, (-tz * sn + bz * cs) * sz, false);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Trees {
  constructor(mats) {
    this.mats = mats;
    this.group = new THREE.Group();
    this.group.name = 'trees';
    this.chunks = new Set();
    this.dirty = true;
    this.meshes = { crown: [], trunk: [], far: [] };
    const trunkGeo = new THREE.CylinderGeometry(0.6, 1, 1, 6, 1, true).translate(0, 0.5, 0);
    for (let k = 0; k < KINDS; k++) {
      const cap = CAP.near / (k === 0 ? 1 : 3) | 0;
      const crown = new THREE.InstancedMesh(crownGeometry(k, k === 2 ? 12 : k === 3 ? 7 : 14, false), k === 1 ? mats.needles : mats.leaves, cap);
      const trunk = new THREE.InstancedMesh(trunkGeo, mats.bark, cap);
      const far = new THREE.InstancedMesh(crownGeometry(k, 0, true), k === 1 ? mats.needles : mats.leaves, (CAP.far / (k === 0 ? 1 : 3)) | 0);
      for (const m of [crown, trunk, far]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
      crown.castShadow = true; trunk.castShadow = true; crown.receiveShadow = true;
      crown.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: (k === 1 ? mats.needles : mats.leaves).map, alphaTest: 0.45 });
      this.meshes.crown.push(crown); this.meshes.trunk.push(trunk); this.meshes.far.push(far);
    }
  }

  add(c, data) {
    const n = data.length / 8;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const per = Array.from({ length: KINDS }, () => ({ crown: [], trunk: [], far: [], col: [], n: 0 }));
    const col = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const o = k * 8;
      const x = data[o] + c.x0, y = data[o + 1], z = data[o + 2] + c.z0, h = Math.max(2.5, data[o + 3]), r = Math.max(1, data[o + 4]), kind = data[o + 5] | 0, rot = data[o + 6], v = data[o + 7];
      const P = per[kind];
      q.setFromAxisAngle(up, rot);
      // crown
      let cy, ry, rr = r;
      if (kind === 1) { cy = y + h * 0.55; ry = h * 0.48; rr = Math.min(r, h * 0.3); }
      else if (kind === 2) { cy = y + h * 0.58; ry = h * 0.45; rr = Math.min(r, h * 0.16); }
      else if (kind === 3) { cy = y + h * 0.5; ry = h * 0.55; }
      else { cy = y + h - Math.min(r, h * 0.4) * 1.0; ry = Math.min(r * 1.05, h * 0.42); }
      p.set(x, cy, z); sc.set(rr, ry, rr);
      m4.compose(p, q, sc); P.crown.push(...m4.elements);
      // far version: a bit bigger so the silhouette matches
      sc.set(rr * 1.05, ry * 1.05, rr * 1.05); m4.compose(p, q, sc); P.far.push(...m4.elements);
      // trunk
      const tr = 0.08 + h * 0.012;
      p.set(x, y - 0.2, z); sc.set(tr, kind === 3 ? 0.4 : cy - y + 0.2, tr);
      m4.compose(p, q, sc); P.trunk.push(...m4.elements);
      // colour: summer greens with some variety
      col.setHSL(kind === 1 ? 0.36 + v * 0.04 : 0.17 + v * 0.12, 0.3, 0.62 + v * 0.12);
      P.col.push(col.r * 1.35, col.g * 1.35, col.b * 1.35);
      P.n++;
    }
    c.treeData = per.map((P) => ({ crown: new Float32Array(P.crown), trunk: new Float32Array(P.trunk), far: new Float32Array(P.far), col: new Float32Array(P.col), n: P.n }));
    c.treeRaw = data;
    c.treeLod = 2;
    this.chunks.add(c);
    this.dirty = true;
    return true;
  }

  remove(c) { this.chunks.delete(c); this.dirty = true; }

  setDistance(c, d) {
    const lod = d < 340 ? 0 : d < 1350 ? 1 : 2;
    if (lod !== c.treeLod) { c.treeLod = lod; this.dirty = true; }
  }

  // re-pack the instanced meshes (call once per frame; only works when something changed)
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    for (let k = 0; k < KINDS; k++) {
      const crown = this.meshes.crown[k], trunk = this.meshes.trunk[k], far = this.meshes.far[k];
      let nn = 0, nf = 0;
      const capN = crown.instanceMatrix.count, capF = far.instanceMatrix.count;
      if (!crown.instanceColor) { crown.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capN * 3), 3); far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capF * 3), 3); }
      for (const c of this.chunks) {
        const d = c.treeData[k];
        if (!d.n || c.treeLod === 2) continue;
        if (c.treeLod === 0 && nn + d.n <= capN) {
          crown.instanceMatrix.array.set(d.crown, nn * 16); trunk.instanceMatrix.array.set(d.trunk, nn * 16); crown.instanceColor.array.set(d.col, nn * 3);
          nn += d.n;
        } else if (nf + d.n <= capF) {
          far.instanceMatrix.array.set(d.far, nf * 16); far.instanceColor.array.set(d.col, nf * 3);
          nf += d.n;
        }
      }
      crown.count = trunk.count = nn; far.count = nf;
      for (const m of [crown, trunk, far]) { m.instanceMatrix.needsUpdate = true; m.instanceMatrix.clearUpdateRanges?.(); }
      crown.instanceColor.needsUpdate = true; far.instanceColor.needsUpdate = true;
    }
  }

  // trunk colliders for chunks close to the player
  setPhysics(c, on, physics) {
    physics = physics || this.physics;
    if (!physics) return;
    if (on && !c.treePhys && c.treeRaw) {
      const R = physics.R, d = c.treeRaw;
      const body = physics.world.createRigidBody(R.RigidBodyDesc.fixed());
      const cols = [];
      for (let o = 0; o < d.length; o += 8) {
        const kind = d[o + 5] | 0;
        if (kind === 3) continue;
        const h = d[o + 3], r = 0.1 + h * 0.012;
        const col = physics.world.createCollider(R.ColliderDesc.cylinder(1.6, r).setTranslation(d[o] + c.x0, d[o + 1] + 1.4, d[o + 2] + c.z0).setFriction(0.6).setCollisionGroups(((0x0008 << 16) | 0xffff) >>> 0), body);
        physics.tag(col, 'tree');
        cols.push(col);
      }
      c.treePhys = { body, cols };
    } else if (!on && c.treePhys) {
      for (const col of c.treePhys.cols) physics.untag(col);
      physics.world.removeRigidBody(c.treePhys.body);
      c.treePhys = null;
    }
  }
}
