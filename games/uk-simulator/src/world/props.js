// UK Simulator - street furniture: lamp posts, bollards, red post boxes and phone boxes, bus
// stops, benches, bins, traffic lights, Belisha beacons, signs, overhead line masts and the
// Market Cross. One instanced mesh per kind, re-packed when chunks change; colliders near the player.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const STONE = [0.74, 0.69, 0.6], GREY = [0.35, 0.36, 0.38], DARK = [0.12, 0.12, 0.13], RED = [0.72, 0.06, 0.05], WHITE = [0.92, 0.92, 0.9], BLACK = [0.05, 0.05, 0.05], AMBER = [1.0, 0.6, 0.1], WOOD = [0.45, 0.32, 0.2], GREEN = [0.1, 0.3, 0.2], STEEL = [0.6, 0.62, 0.64], YELLOW = [0.95, 0.8, 0.1];

function part(geo, col, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  const g = geo.toNonIndexed ? geo.index ? geo.toNonIndexed() : geo : geo;
  g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const box = (w, h, d, col, x, y, z, ry, rx, rz) => part(new THREE.BoxGeometry(w, h, d), col, x, y, z, ry, rx, rz);
const cyl = (rt, rb, h, col, x, y, z, seg = 8, rx = 0, rz = 0) => part(new THREE.CylinderGeometry(rt, rb, h, seg), col, x, y, z, 0, rx, rz);
const ball = (r, col, x, y, z) => part(new THREE.SphereGeometry(r, 10, 6), col, x, y, z);

// each kind: { geo, glow?, col: [ [type, ...args] collider ] }
function makeKinds() {
  const K = {};
  // 0 lamp: grey column, swan-neck arm, flat LED head (glows at night)
  K[0] = { geo: mergeGeometries([cyl(0.07, 0.1, 7.6, GREY, 0, 3.8, 0), cyl(0.05, 0.05, 1.0, GREY, 0, 7.55, 0.45, 6, Math.PI / 2), box(0.3, 0.1, 0.7, DARK, 0, 7.5, 0.95)]), glow: box(0.26, 0.03, 0.6, [1, 1, 1], 0, 7.44, 0.95), col: ['cyl', 0.12, 3.8] };
  K[1] = { geo: mergeGeometries([box(1.7, 0.06, 0.45, WOOD, 0, 0.45, 0), box(1.7, 0.4, 0.05, WOOD, 0, 0.7, -0.22), box(0.08, 0.45, 0.4, DARK, -0.75, 0.22, 0), box(0.08, 0.45, 0.4, DARK, 0.75, 0.22, 0)]), col: ['box', 0.9, 0.45, 0.3] };
  K[2] = { geo: mergeGeometries([cyl(0.25, 0.22, 0.85, DARK, 0, 0.43, 0, 10), cyl(0.27, 0.27, 0.08, DARK, 0, 0.88, 0, 10)]), col: ['cyl', 0.27, 0.5] };
  // 3 red pillar post box
  K[3] = { geo: mergeGeometries([cyl(0.3, 0.3, 1.35, RED, 0, 0.68, 0, 14), part(new THREE.SphereGeometry(0.33, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), RED, 0, 1.35, 0), box(0.32, 0.05, 0.05, BLACK, 0, 1.12, 0.29), box(0.66, 0.06, 0.66, BLACK, 0, 0.03, 0)]), col: ['cyl', 0.33, 0.85] };
  // 4 red K6 phone box
  K[4] = { geo: mergeGeometries([box(0.92, 2.3, 0.92, RED, 0, 1.15, 0), box(1.0, 0.25, 1.0, RED, 0, 2.42, 0), box(0.94, 0.18, 0.94, BLACK, 0, 2.15, 0), box(0.6, 1.4, 0.94, [0.55, 0.62, 0.68], 0, 1.2, 0)]), col: ['box', 0.5, 1.3, 0.5] };
  // 5 bus stop: pole with flag + small shelter
  K[5] = { geo: mergeGeometries([cyl(0.04, 0.04, 2.8, GREY, -1.6, 1.4, 0.2), box(0.45, 0.45, 0.04, [0.9, 0.1, 0.1], -1.6, 2.6, 0.2), box(2.6, 0.06, 1.3, DARK, 0, 2.4, -0.5), box(2.6, 2.3, 0.05, [0.6, 0.7, 0.75], 0, 1.2, -1.1), box(0.05, 2.3, 1.2, GREY, 1.28, 1.2, -0.5), box(1.6, 0.05, 0.35, DARK, 0, 0.5, -0.9)]), col: ['box', 1.3, 1.2, 0.6, 0, -0.5] };
  // 6 traffic signals
  K[6] = { geo: mergeGeometries([cyl(0.06, 0.06, 3.0, GREY, 0, 1.5, 0), box(0.32, 0.95, 0.25, BLACK, 0, 2.7, 0.1)]), glow: mergeGeometries([ball(0.08, [1, 0.1, 0.05], 0, 3.0, 0.23), ball(0.08, [1, 0.6, 0.0], 0, 2.72, 0.23), ball(0.08, [0.1, 1, 0.3], 0, 2.44, 0.23)]), col: ['cyl', 0.1, 1.5] };
  K[7] = { geo: mergeGeometries([cyl(0.1, 0.1, 0.9, DARK, 0, 0.45, 0, 10), cyl(0.11, 0.11, 0.06, WHITE, 0, 0.78, 0, 10)]), col: ['cyl', 0.12, 0.45] };
  // 8 give way, 9 stop (signs on posts)
  K[8] = { geo: mergeGeometries([cyl(0.04, 0.04, 2.2, GREY, 0, 1.1, 0), part(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 3), WHITE, 0, 2.2, 0.04, 0, Math.PI / 2, Math.PI), part(new THREE.CylinderGeometry(0.47, 0.47, 0.025, 3), RED, 0, 2.2, 0.03, 0, Math.PI / 2, Math.PI)]), col: ['cyl', 0.06, 1.1] };
  K[9] = { geo: mergeGeometries([cyl(0.04, 0.04, 2.2, GREY, 0, 1.1, 0), part(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 8), RED, 0, 2.3, 0.04, Math.PI / 8, Math.PI / 2)]), col: ['cyl', 0.06, 1.1] };
  K[12] = { geo: mergeGeometries([cyl(0.03, 0.03, 0.9, GREY, 0, 0.45, 0), box(0.25, 0.25, 0.03, YELLOW, 0, 0.85, 0.03)]) };
  K[13] = { geo: mergeGeometries([cyl(0.04, 0.04, 2.4, GREY, 0, 1.2, 0), part(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), WHITE, 0, 2.3, 0.04, 0, Math.PI / 2), part(new THREE.CylinderGeometry(0.34, 0.34, 0.025, 16), RED, 0, 2.3, 0.03, 0, Math.PI / 2)]), col: ['cyl', 0.06, 1.2] };
  K[14] = { geo: mergeGeometries([part(new THREE.TorusGeometry(0.4, 0.03, 6, 12, Math.PI), STEEL, 0, 0, 0), part(new THREE.TorusGeometry(0.4, 0.03, 6, 12, Math.PI), STEEL, 0.8, 0, 0)]) };
  K[15] = K[25] = { geo: mergeGeometries([box(1.2, 1.4, 1.2, STONE, 0, 0.7, 0), box(0.8, 1.6, 0.8, STONE, 0, 2.2, 0)]), col: ['box', 0.7, 1.5, 0.7] };
  K[16] = { geo: marketCross(), col: ['cyl', 2.4, 4] };
  K[17] = { geo: mergeGeometries([box(0.3, 1.6, 5.5, [0.15, 0.13, 0.12], 0, 0.8, 0), box(0.25, 0.25, 4.0, WHITE, 0, 1.8, -3.5)]), col: ['box', 0.2, 1.0, 2.8] };
  K[19] = { geo: mergeGeometries([box(0.12, 1.2, 0.12, WOOD, -1.7, 0.6, 0), box(0.12, 1.2, 0.12, WOOD, 1.7, 0.6, 0), ...[0.25, 0.55, 0.85, 1.1].map((y) => box(3.4, 0.08, 0.05, [0.6, 0.6, 0.6], 0, y, 0))]) };
  K[23] = { geo: mergeGeometries([cyl(1.4, 1.5, 0.5, STONE, 0, 0.25, 0, 16), cyl(0.2, 0.25, 1.4, STONE, 0, 0.9, 0, 10)]), col: ['cyl', 1.5, 0.4] };
  K[24] = { geo: mergeGeometries([cyl(0.08, 0.1, 3.2, [0.1, 0.25, 0.15], 0, 1.6, 0), cyl(0.35, 0.35, 0.2, [0.1, 0.25, 0.15], 0, 3.3, 0, 16, Math.PI / 2), cyl(0.3, 0.3, 0.21, WHITE, 0, 3.3, 0, 16, Math.PI / 2)]), col: ['cyl', 0.12, 1.6] };
  K[26] = { geo: mergeGeometries([box(1.5, 1.4, 1.1, GREEN, 0, 0.7, 0), box(1.5, 1.4, 1.1, [0.2, 0.3, 0.5], 1.7, 0.7, 0)]), col: ['box', 1.6, 0.7, 0.6, 0.85] };
  K[27] = { geo: mergeGeometries([box(0.5, 1.5, 0.3, [0.85, 0.88, 0.9], 0, 0.75, 0), box(0.4, 0.3, 0.02, [0.1, 0.5, 0.3], 0, 1.2, 0.16)]), col: ['box', 0.3, 0.75, 0.2] };
  // 40 Belisha beacon (black and white pole, amber globe)
  K[40] = { geo: mergeGeometries([...[0, 1, 2, 3, 4, 5, 6].map((k) => cyl(0.06, 0.06, 0.38, k % 2 ? WHITE : BLACK, 0, 0.19 + k * 0.38, 0, 8))]), glow: ball(0.17, AMBER, 0, 2.85, 0), col: ['cyl', 0.08, 1.4] };
  // 41 overhead line mast (main line)
  K[41] = { geo: mergeGeometries([box(0.25, 7.2, 0.25, [0.45, 0.47, 0.45], 0, 3.6, 0), box(0.12, 0.12, 3.4, [0.45, 0.47, 0.45], 0, 6.6, -1.6, 0)]), col: ['box', 0.15, 3.6, 0.15] };
  return K;
}

function marketCross() {
  // Leighton Buzzard's 15th-century market cross: pentagonal, open arches below, statue niches
  // above, pinnacles and a central spire (about 8 m tall)
  const parts = [];
  parts.push(cyl(2.6, 2.7, 0.3, STONE, 0, 0.15, 0, 5), cyl(2.3, 2.3, 0.3, STONE, 0, 0.45, 0, 5));
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2 + Math.PI / 10;
    parts.push(box(0.55, 3.0, 0.55, STONE, Math.cos(a) * 1.75, 2.1, Math.sin(a) * 1.75, -a));
    parts.push(cyl(0.12, 0.25, 1.4, STONE, Math.cos(a) * 1.75, 6.7, Math.sin(a) * 1.75, 6));
  }
  parts.push(cyl(2.1, 2.1, 0.45, STONE, 0, 3.8, 0, 5), cyl(1.5, 1.7, 2.0, STONE, 0, 5.0, 0, 5), cyl(0.15, 0.7, 2.6, STONE, 0, 7.3, 0, 5), cyl(1.0, 1.0, 0.2, [0.58, 0.55, 0.5], 0, 0.62, 0, 5));
  return mergeGeometries(parts);
}

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
const GLOW = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0 });
// glow takes the part's own colour (amber beacons, red / amber / green signals)
GLOW.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor;'); };

export class Props {
  constructor(physics) {
    this.physics = physics;
    this.kinds = makeKinds();
    this.group = new THREE.Group(); this.group.name = 'props';
    this.chunks = new Set();
    this.dirty = true;
    this.meshes = {};
    for (const [k, def] of Object.entries(this.kinds)) {
      const cap = k === '0' ? 6000 : 1200;
      const m = new THREE.InstancedMesh(def.geo, MAT, cap); m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      this.group.add(m);
      const g = def.glow ? new THREE.InstancedMesh(def.glow, GLOW, cap) : null;
      if (g) { g.count = 0; g.frustumCulled = false; this.group.add(g); }
      this.meshes[k] = { m, g };
    }
    this.glowMat = GLOW;
  }

  add(c, furn) {
    const list = {};
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const items = [];
    for (let o = 0; o < furn.length; o += 5) {
      const k = furn[o] | 0;
      if (!this.kinds[k]) continue;
      const x = furn[o + 1] + c.x0, y = furn[o + 2], z = furn[o + 3] + c.z0, a = furn[o + 4];
      // lamps: the stored angle points from the road out to the lamp, so the arm (local +z)
      // turns the other way, out over the road; other things line up with the road
      q.setFromAxisAngle(up, k === 0 ? Math.atan2(-Math.cos(a), -Math.sin(a)) : -a);
      p.set(x, y, z); m4.compose(p, q, one);
      (list[k] || (list[k] = [])).push(...m4.elements);
      items.push({ k, x, y, z, a });
    }
    c.propData = Object.fromEntries(Object.entries(list).map(([k, v]) => [k, new Float32Array(v)]));
    c.propItems = items;
    c.propVisible = false;
    this.chunks.add(c);
    this.dirty = true;
    return true;
  }

  remove(c) { this.chunks.delete(c); this.dirty = true; }

  setDistance(c, d, visible) { if (visible !== c.propVisible) { c.propVisible = visible; this.dirty = true; } }

  // the street lamps closest to (x, z), written into `out` (Vector3 array) for the light pools
  nearestLamps(x, z, out) {
    const list = [];
    for (const c of this.chunks) {
      if (!c.propVisible || Math.abs(c.x0 + 128 - x) > 400 || Math.abs(c.z0 + 128 - z) > 400) continue;
      for (const it of c.propItems) if (it.k === 0) { const d = (it.x - x) ** 2 + (it.z - z) ** 2; if (d < 160000) list.push([d, it]); }
    }
    list.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < out.length; k++) {
      const it = list[k] && list[k][1];
      // the lamp head hangs about 1 m out from the post, over the road
      if (it) out[k].set(it.x - Math.cos(it.a) * 0.95, it.y + 7.3, it.z - Math.sin(it.a) * 0.95); else out[k].set(0, -1000, 0);
    }
  }

  update(night, time) {
    this.glowMat.emissiveIntensity = 0.2 + night * 2.5;
    if (!this.dirty) return;
    this.dirty = false;
    for (const [k, { m, g }] of Object.entries(this.meshes)) {
      let n = 0;
      const cap = m.instanceMatrix.count;
      for (const c of this.chunks) {
        if (!c.propVisible) continue;
        const d = c.propData[k];
        if (!d || n + d.length / 16 > cap) continue;
        m.instanceMatrix.array.set(d, n * 16);
        if (g) g.instanceMatrix.array.set(d, n * 16);
        n += d.length / 16;
      }
      m.count = n; m.instanceMatrix.needsUpdate = true;
      if (g) { g.count = n; g.instanceMatrix.needsUpdate = true; }
    }
  }

  setPhysics(c, on) {
    const ph = this.physics;
    if (on && !c.propPhys) {
      const R = ph.R;
      const body = ph.world.createRigidBody(R.RigidBodyDesc.fixed());
      const cols = [];
      for (const it of c.propItems || []) {
        const def = this.kinds[it.k];
        if (!def || !def.col) continue;
        const [type, a, b, cc, ox = 0, oz = 0] = def.col;
        let desc;
        if (type === 'cyl') desc = R.ColliderDesc.cylinder(b, a).setTranslation(it.x, it.y + b, it.z);
        else {
          const ang = -it.a;
          const cs = Math.cos(ang), sn = Math.sin(ang);
          desc = R.ColliderDesc.cuboid(a, b, cc).setTranslation(it.x + ox * cs + oz * sn, it.y + b, it.z - ox * sn + oz * cs).setRotation({ x: 0, y: Math.sin(ang / 2), z: 0, w: Math.cos(ang / 2) });
        }
        const col = ph.world.createCollider(desc.setFriction(0.5).setCollisionGroups(((0x0008 << 16) | 0xffff) >>> 0), body);
        ph.tag(col, 'prop');
        cols.push(col);
      }
      c.propPhys = { body, cols };
    } else if (!on && c.propPhys) {
      for (const col of c.propPhys.cols) ph.untag(col);
      ph.world.removeRigidBody(c.propPhys.body);
      c.propPhys = null;
    }
  }
}
