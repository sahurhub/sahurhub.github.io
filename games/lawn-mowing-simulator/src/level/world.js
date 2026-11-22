// Builds and runs the 3D world for one level.
import * as THREE from 'three';
import { compileLevel, heightAt } from '../shared/levels.js';
import { levelGrid } from '../shared/lawn.js';
import { batchProps, buildRig, modelGeo, propMat, disposeTree } from '../render/assets.js';
import { Ground, makeTerrainFn } from '../lawn/ground.js';
import { Grass } from '../lawn/grass.js';
import { sceneryProps } from './scenery.js';

const DETAIL = new Set(['flowers_white', 'flowers_yellow', 'flowers_pink', 'flowers_purple', 'flowers_red', 'reeds', 'hose_seg', 'rock_small']);
const SHADOW_R = { tree_round: 1.5, tree_fruit: 1.2, tree_big: 2.2, tree_pine: 1.3, tree_pine_tall: 1.6, bush: 0.9, bush_flower: 0.9 };

export class World {
  constructor(R, sky, blobs) {
    this.R = R; this.sky = sky; this.blobs = blobs;
    this.root = new THREE.Group();
    R.scene.add(this.root);
    this.ground = new Ground(R, sky);
    this.grass = new Grass(sky);
    this.fragile = new Map();
    this.spinners = [];
    this.level = null;
  }

  build(levelId) {
    this.clear();
    const L = compileLevel(levelId);
    const G = levelGrid(levelId);
    this.level = L; this.grid = G;
    this.terrain = makeTerrainFn(L);
    this.root.add(this.ground.build(L, G, this.terrain));
    this.root.add(this.grass.build(this.R.preset, L, this.ground));
    // props: level props (minus obstacles that can be knocked over) + background scenery
    const fragileIds = new Set(L.fragile.map((f) => f.id));
    const scenery = sceneryProps(L);
    const all = [...L.props.filter((p) => p.obstacle == null || !fragileIds.has(p.obstacle)), ...scenery];
    const statics = [], details = [];
    this.blobs.clear();
    for (const p of all) {
      const it = { ...p, y: this.terrain(p.x, p.z) - (p.m.startsWith('house') || p.m === 'barn' || p.m === 'clubhouse' ? 0.05 : 0) };
      if (p.m === 'windmill') { this.addWindmill(it); continue; }
      (DETAIL.has(p.m) ? details : statics).push(it);
      const sr = SHADOW_R[p.m];
      if (sr) this.blobs.add(it.x, it.y, it.z, sr * (p.s || 1));
    }
    this.staticMesh = batchProps(statics, { chunk: 40 });
    this.detailMesh = batchProps(details, { chunk: 24 });
    this.root.add(this.staticMesh, this.detailMesh);
    // knock-over obstacles: separate meshes so they can fall over / roll away
    for (const f of L.fragile) {
      const geo = modelGeo(f.type);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, propMat);
      const y = this.terrain(f.x, f.z);
      mesh.position.set(f.x, y, f.z);
      mesh.rotation.y = f.rot || 0;
      this.root.add(mesh);
      const blob = this.blobs.add(f.x, y, f.z, f.r * 1.4);
      this.fragile.set(f.id, { def: f, mesh, down: false, t: 0, vx: 0, vz: 0, blob, x: f.x, z: f.z });
    }
    if (L.pitch) this.root.add(pitchLines(L.pitch, this.terrain));
    this.sky.makeClouds(L.id, new THREE.Vector3((L.bounds[0] + L.bounds[2]) / 2, 0, (L.bounds[1] + L.bounds[3]) / 2));
    return L;
  }

  addWindmill(it) {
    const rig = buildRig('windmill');
    if (!rig) return;
    rig.root.position.set(it.x, it.y, it.z);
    rig.root.rotation.y = it.rot || 0;
    rig.root.scale.setScalar(it.s || 1);
    this.root.add(rig.root);
    const blades = rig.parts.windmill_blades;
    if (blades) this.spinners.push(blades);
  }

  // terrain height used by gameplay (inside the level the two are identical)
  heightAt(x, z) { return heightAt(this.level, x, z); }

  // knock over a fragile obstacle (from the mower hitting it). dir = push direction
  knock(id, dirx, dirz, speed) {
    const f = this.fragile.get(id);
    if (!f || f.down) return null;
    f.down = true; f.t = 0;
    f.fallAxis = new THREE.Vector3(dirz, 0, -dirx).normalize();
    if (f.def.kick) { f.vx = dirx * (2 + speed * 1.5); f.vz = dirz * (2 + speed * 1.5); }
    return f;
  }

  update(dt, time, cam, look, mower) {
    this.grass.update(time, cam, look, mower);
    this.ground.uniforms.uTime.value = time;
    for (const s of this.spinners) s.rotation.z += dt * 0.6;
    for (const f of this.fragile.values()) {
      if (!f.down || f.t > 3) continue;
      f.t += dt;
      if (f.def.kick) {
        // the ball rolls away and slows down
        f.x += f.vx * dt; f.z += f.vz * dt;
        f.vx *= 1 - 1.2 * dt; f.vz *= 1 - 1.2 * dt;
        f.mesh.position.set(f.x, this.terrain(f.x, f.z), f.z);
        f.mesh.rotateOnWorldAxis(f.fallAxis, Math.hypot(f.vx, f.vz) * dt / 0.14);
      } else if (f.t < 0.35) {
        f.mesh.rotateOnWorldAxis(f.fallAxis, (dt / 0.35) * (Math.PI / 2) * 0.95);
        f.mesh.position.y = this.terrain(f.x, f.z) + 0.05;
      }
      if (f.blob >= 0) this.blobs.set(f.blob, f.x, this.terrain(f.x, f.z), f.z, f.def.r * 1.4);
    }
    // small detail props (flowers) only near the camera
    const far2 = this.R.preset.detail * this.R.preset.detail;
    for (const m of this.detailMesh ? this.detailMesh.children : []) {
      const c = m.geometry.boundingSphere.center;
      m.visible = (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 < far2 + m.geometry.boundingSphere.radius ** 2;
    }
  }

  // reset obstacles for a new job
  resetObstacles() {
    for (const f of this.fragile.values()) {
      f.down = false; f.t = 0; f.x = f.def.x; f.z = f.def.z; f.vx = f.vz = 0;
      f.mesh.position.set(f.def.x, this.terrain(f.def.x, f.def.z), f.def.z);
      f.mesh.rotation.set(0, f.def.rot || 0, 0);
      if (f.blob >= 0) this.blobs.set(f.blob, f.def.x, this.terrain(f.def.x, f.def.z), f.def.z, f.def.r * 1.4);
    }
  }

  rebuildGrass() { if (this.level) { this.grass.build(this.R.preset, this.level, this.ground); } }

  clear() {
    for (const c of [...this.root.children]) { this.root.remove(c); if (c !== this.ground.mesh && c !== this.grass.mesh) disposeTree(c); }
    this.ground.dispose();
    this.fragile.clear();
    this.spinners = [];
    this.staticMesh = this.detailMesh = null;
  }
}

// White pitch markings for the sports field (drawn just above the ground).
function pitchLines([W, H], terrain) {
  const pos = [];
  const w = 0.12;
  const seg = (ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * w / 2, nz = (dx / l) * w / 2;
    const y = (x, z) => terrain(x, z) + 0.025;
    const p = [[ax + nx, az + nz], [ax - nx, az - nz], [bx + nx, bz + nz], [bx - nx, bz - nz]];
    const [a, b, c, d] = p.map(([x, z]) => [x, y(x, z), z]);
    pos.push(...a, ...b, ...c, ...c, ...b, ...d);
  };
  const poly = (pts, closed) => { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; seg(a[0], a[1], b[0], b[1]); } };
  const hw = W / 2, hh = H / 2;
  poly([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], true);
  seg(0, -hh, 0, hh);
  const circ = (cx, cz, r, a0 = 0, a1 = Math.PI * 2, n = 40) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    poly(pts, false);
  };
  circ(0, 0, 4.5);
  for (const s of [-1, 1]) {
    const bx = s * hw;
    poly([[bx, -9], [bx - s * 8, -9], [bx - s * 8, 9], [bx, 9]], false);
    poly([[bx, -4], [bx - s * 3, -4], [bx - s * 3, 4], [bx, 4]], false);
    circ(bx - s * 6, 0, 0.25, 0, Math.PI * 2, 8);
  }
  circ(0, 0, 0.25, 0, Math.PI * 2, 8);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.MeshBasicMaterial({ color: 0xf4f7f2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, fog: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.matrixAutoUpdate = false;
  return mesh;
}
