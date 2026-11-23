// The pressure washer: the gun in your hands, the machine on wheels, the hose between them, the water
// tank, nozzles, and the spray itself (raycast from the crosshair, then clean the dirt masks).
import * as THREE from 'three';
import { sceneMaterial, keyOf, texture } from '../render/assets.js';

const TOOLS = ['narrow', 'wide', 'surface'];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

// copy a model node from washer.glb with our materials ('tint' parts get the washer colour)
function cloneModel(node, tintMat) {
  const c = node.clone(true);
  c.position.set(0, 0, 0); c.quaternion.identity(); c.scale.set(1, 1, 1);
  c.traverse((o) => {
    if (!o.isMesh) return;
    const k = keyOf(Array.isArray(o.material) ? o.material[0] : o.material);
    o.material = k === 'tint' ? tintMat : sceneMaterial(k);
  });
  return c;
}

class Hose {
  constructor(scene, n = 30, seg = 6, r = 0.016) {
    this.n = n; this.seg = seg; this.r = r;
    this.pts = Array.from({ length: n }, () => new THREE.Vector3());
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * seg * 3);
    this.nrm = new Float32Array(n * seg * 3);
    const idx = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aNrm = new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('normal', this.aNrm);
    this.mat = new THREE.MeshLambertMaterial({ color: 0x2b2f38 });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.scene = scene;
  }

  // a = machine outlet, b = back of the gun (world)
  update(a, b) {
    const n = this.n, P = this.pts;
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.max(0.01, Math.hypot(dx, dz));
    const ux = dx / L, uz = dz / L;
    const lift = 0.04;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), s = t * L;
      const down = Math.max(0, 1 - s / 0.45);             // drops from the outlet
      const up = Math.min(1, Math.max(0, (s - (L - 0.9)) / 0.9)); // rises to your hand
      const upE = up * up * (3 - 2 * up);
      let y = lift + (a.y - lift) * down * down + (b.y - lift) * upE;
      const sway = Math.sin(t * Math.PI) * Math.min(0.35, L * 0.04);
      P[i].set(a.x + ux * s - uz * sway, y, a.z + uz * s + ux * sway);
    }
    P[n - 1].copy(b);
    const seg = this.seg, r = this.r;
    const tan = new THREE.Vector3(), nor = new THREE.Vector3(), bin = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      tan.subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
      nor.crossVectors(up, tan); if (nor.lengthSq() < 1e-6) nor.set(1, 0, 0); nor.normalize();
      bin.crossVectors(tan, nor).normalize();
      for (let j = 0; j < seg; j++) {
        const a2 = (j / seg) * Math.PI * 2, cs = Math.cos(a2), sn = Math.sin(a2);
        const k = (i * seg + j) * 3;
        const ox = nor.x * cs + bin.x * sn, oy = nor.y * cs + bin.y * sn, oz = nor.z * cs + bin.z * sn;
        this.pos[k] = P[i].x + ox * r; this.pos[k + 1] = P[i].y + oy * r; this.pos[k + 2] = P[i].z + oz * r;
        this.nrm[k] = ox; this.nrm[k + 1] = oy; this.nrm[k + 2] = oz;
      }
    }
    this.aPos.needsUpdate = true; this.aNrm.needsUpdate = true;
  }

  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

export class Washer {
  constructor(app, models) {
    this.app = app;
    const R = app.R;
    this.tintMat = new THREE.MeshLambertMaterial({ map: texture('paint'), vertexColors: true, color: 0xffc21a });
    this.models = models; // name -> node in washer.glb
    // the gun lives in the view scene (camera space)
    this.gun = cloneModel(models.pw_gun, this.tintMat);
    this.gunPivot = new THREE.Group();
    this.gunPivot.add(this.gun);
    R.view.add(this.gunPivot);
    const find = (n) => { let r = null; this.gun.traverse((o) => { if (o.name === n) r = o; }); return r; };
    this.tipN = find('tip_narrow'); this.tipW = find('tip_wide'); this.disc = find('disc'); this.soap = find('soap'); this.hoseIn = find('hose_in');
    // the machine on wheels
    this.unit = cloneModel(models.pw_unit, this.tintMat);
    this.unit.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    let ho = null; this.unit.traverse((o) => { if (o.name === 'hose_out') ho = o; });
    this.hoseOut = ho;
    R.scene.add(this.unit);
    this.hose = new Hose(R.scene);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 40;
    this.hit = null;
    this.hitNormal = new THREE.Vector3();
    this.dir = new THREE.Vector3(); this.right = new THREE.Vector3(); this.up = new THREE.Vector3();
    this.tip = new THREE.Vector3();
    this.tool = 'narrow';
    this.water = 30;
    this.idleT = 0;
    this.spraying = false;  // water is coming out this frame
    this.cleaning = 0;      // texels cleaned this frame
    this.carrying = false;
    this.refilling = false;
    this.prompt = null;     // text for the HUD, e.g. "Hold E to refill"
    this.events = [];       // 'nozzle', 'empty', 'refill', 'pickup', 'drop', 'nohose'
    this.pose = { x: 0.21, y: -0.27, z: -0.36, rx: 0.03, ry: 0.06, rz: 0 };
    this.kick = 0; this.swap = 0; this.discSpin = 0;
    this.stretchedT = 0;
    this.setStats(app.stats());
  }

  setStats(st) {
    const full = !this.stats || this.water >= this.stats.tank - 0.01;
    this.stats = st;
    if (full || this.water > st.tank) this.water = st.tank;
    if (this.tool === 'surface' && !st.surface) this.tool = 'narrow';
    if (this.soap) this.soap.visible = st.detergent;
    this.showTool();
  }

  setColor(hex) { this.tintMat.color.set(hex).multiplyScalar(1.25); }

  setTool(t) {
    if (!TOOLS.includes(t) || t === this.tool) return false;
    if (t === 'surface' && !this.stats.surface) { this.events.push('nosurface'); return false; }
    this.tool = t;
    this.swap = 1;
    this.showTool();
    this.events.push('nozzle');
    return true;
  }
  toggleNozzle() { return this.setTool(this.tool === 'narrow' ? 'wide' : 'narrow'); }

  showTool() {
    if (this.tipN) this.tipN.visible = this.tool === 'narrow';
    if (this.tipW) this.tipW.visible = this.tool === 'wide';
    if (this.disc) this.disc.visible = this.tool === 'surface';
  }

  // place the machine (start of a job)
  place(x, z, yaw) {
    this.unit.position.set(x, 0, z);
    this.unit.rotation.set(0, yaw, 0);
    this.unit.updateMatrixWorld(true);
    this.carrying = false;
    this.water = this.stats.tank;
    this.tool = 'narrow';
    this.showTool();
  }

  tether() { return this.carrying ? null : { x: this.unit.position.x, z: this.unit.position.z, len: this.stats.hose }; }

  // ---------------------------------------------------------------- per frame
  // ctx = { want, useHeld, usePressed, job, player, cam, time, parts, jet, active }
  update(dt, ctx) {
    const { job, player, cam } = ctx;
    const st = this.stats;
    this.events.length = 0;
    this.cleaning = 0;
    this.prompt = null;
    this.refilling = false;
    cam.getWorldDirection(this.dir);
    this.right.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    this.up.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    // tap and machine (E)
    if (ctx.active && job) {
      const px = player.pos.x, pz = player.pos.z;
      const tapD = job.tap ? Math.hypot(job.tap.x - px, job.tap.z - pz) : 99;
      const unitD = Math.hypot(this.unit.position.x - px, this.unit.position.z - pz);
      const needWater = this.water < st.tank - 0.05;
      if (!this.carrying && tapD < 1.8 && needWater) {
        this.prompt = { text: 'Hold E to refill', prog: this.water / st.tank };
        if (ctx.useHeld) {
          this.water = Math.min(st.tank, this.water + (st.tank / 2.2) * dt);
          this.refilling = true;
          this.prompt.text = 'Refilling...';
          if (this.water >= st.tank - 0.01) this.events.push('refill');
        }
      } else if (this.carrying) {
        this.prompt = { text: 'Press E to put the washer down' };
        if (ctx.usePressed) { this.carrying = false; this.events.push('drop'); job.refreshShadow(); }
      } else if (unitD < 1.5) {
        this.prompt = { text: 'Press E to pick up the washer' };
        if (ctx.usePressed) { this.carrying = true; this.events.push('pickup'); }
      }
      if (this.carrying) {
        const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
        const tx = px + fx * 0.9 + fz * 0.35, tz = pz + fz * 0.9 - fx * 0.35;
        const k = Math.min(1, dt * 10);
        this.unit.position.x += (tx - this.unit.position.x) * k;
        this.unit.position.z += (tz - this.unit.position.z) * k;
        this.unit.position.y = Math.max(0, player.pos.y);
        this.unit.rotation.y = player.yaw + Math.PI;
        this.unit.updateMatrixWorld(true);
        this.shadowT = (this.shadowT || 0) - dt;
        if (this.shadowT <= 0) { this.shadowT = 0.2; job.refreshShadow(); }
      }
      player.tether = this.tether();
      if (player.stretched) {
        this.stretchedT += dt;
        if (this.stretchedT > 0.4 && !this.prompt) this.prompt = { text: 'The hose is at full stretch. Press E at the washer to move it.' };
      } else this.stretchedT = 0;
    }
    // aim
    this.aim(job, cam);
    // spray
    const want = ctx.want && ctx.active && !this.carrying;
    let canSpray = want && this.water > 0.01;
    if (want && !canSpray && this.wasSpraying) this.events.push('empty');
    if (want && !canSpray && !this.prompt) this.prompt = { text: 'Out of water! Hold E at the tap, or wait a moment.' };
    this.spraying = canSpray;
    this.wasSpraying = canSpray;
    if (canSpray) {
      this.idleT = 0;
      const use = (this.tool === 'surface' ? st.disc.use : st[this.tool].use) * (1 + 0.12 * st.pressureLvl);
      this.water = Math.max(0, this.water - use * dt);
      if (job) this.applySpray(dt, job, cam);
    } else {
      this.idleT += dt;
      if (this.idleT > 0.8 && !this.refilling) this.water = Math.min(st.tank, this.water + (st.tank / 40) * dt);
    }
    this.updateView(dt, ctx);
    this.updateFx(dt, ctx);
  }

  aim(job, cam) {
    this.hit = null;
    if (!job) return;
    this.raycaster.set(cam.position, this.dir);
    const hits = this.raycaster.intersectObjects(job.rayTargets, false);
    if (hits.length) {
      const h = hits[0];
      this.hit = h;
      if (h.face) this.hitNormal.copy(h.face.normal).transformDirection(h.object.matrixWorld);
      else this.hitNormal.set(0, 1, 0);
      if (this.hitNormal.dot(this.dir) > 0) this.hitNormal.negate();
    }
  }

  // how hard the water comes out (drops when the tank is nearly empty)
  power() {
    const st = this.stats;
    const low = Math.min(1, this.water / (st.tank * 0.12));
    return st.pressure * (0.35 + 0.65 * low) * (st.detergent ? 1.1 : 1);
  }

  applySpray(dt, job, cam) {
    const st = this.stats, h = this.hit;
    const pw = this.power();
    if (this.tool === 'surface') {
      if (h && h.distance <= st.disc.reach && this.hitNormal.y > 0.55) {
        for (const s of job.surfaces) s.sprayDisc(h.point, st.disc.r, st.disc.rate * pw, st.disc.rate * pw * st.stub, dt);
      }
    } else if (h && h.distance <= st.range) {
      const nz = st[this.tool];
      for (const s of job.surfaces) s.sprayCone(cam.position, this.dir, this.right, this.up, nz.tanA, nz.tanB, h.distance, st.range, nz.rate * pw, nz.rate * pw * st.stub, dt);
    }
    for (const s of job.surfaces) { this.cleaning += s.hits; s.hits = 0; }
  }

  // gun sway, recoil and the tool poses
  updateView(dt, ctx) {
    const p = this.pose, pl = ctx.player;
    const surf = this.tool === 'surface';
    const target = this.carrying
      ? { x: 0.26, y: -0.55, z: -0.4, rx: -0.5, ry: 0.3, rz: 0.2 }
      : surf ? { x: 0.16, y: -0.42, z: -0.42, rx: -0.62, ry: 0.05, rz: 0 } : { x: 0.21, y: -0.27, z: -0.36, rx: 0.03, ry: 0.06, rz: 0 };
    const k = Math.min(1, dt * 10);
    for (const key of ['x', 'y', 'z', 'rx', 'ry', 'rz']) p[key] += (target[key] - p[key]) * k;
    this.kick += ((this.spraying ? 1 : 0) - this.kick) * Math.min(1, dt * 14);
    this.swap = Math.max(0, this.swap - dt * 3.5);
    const t = ctx.time;
    const bob = pl.bobAmt * 0.012;
    const jit = this.spraying ? 0.0025 * this.power() : 0;
    const g = this.gunPivot;
    g.position.set(p.x + Math.sin(pl.bob) * bob + (Math.random() - 0.5) * jit, p.y + Math.abs(Math.cos(pl.bob)) * bob + (Math.random() - 0.5) * jit, p.z + this.kick * 0.025);
    g.rotation.set(p.rx + this.kick * 0.02 - this.swap * 0.25, p.ry, p.rz + Math.sin(this.swap * Math.PI) * 0.9, 'YXZ');
    if (this.disc && surf) { this.discSpin += dt * (this.spraying ? 30 : 3); this.disc.rotation.z = this.discSpin; }
    g.updateMatrixWorld(true);
    // nozzle tip in world space (view space -> world with the main camera)
    const tipObj = this.tool === 'wide' ? this.tipW : this.tool === 'surface' ? this.disc : this.tipN;
    if (tipObj) { tipObj.getWorldPosition(this.tip); this.tip.applyMatrix4(ctx.cam.matrixWorld); }
    // hose: machine outlet -> back of the gun
    if (this.hoseIn && this.hoseOut) {
      this.hoseIn.getWorldPosition(_v); _v.applyMatrix4(ctx.cam.matrixWorld);
      this.hoseOut.getWorldPosition(_v2);
      this.hose.update(_v2, _v);
    }
  }

  // water jet + particles
  updateFx(dt, ctx) {
    const { parts, jet, time } = ctx;
    if (!parts || !jet) return;
    if (!this.spraying) { jet.hide(); return; }
    const st = this.stats, h = this.hit;
    const surf = this.tool === 'surface';
    const budget = this.app.R.presetName === 'low' ? 0.5 : this.app.R.presetName === 'medium' ? 0.8 : 1.2;
    const dirty = this.cleaning > 0;
    if (surf) {
      jet.hide();
      if (h && h.distance <= st.disc.reach && this.hitNormal.y > 0.55) {
        const c = h.point;
        const n = Math.ceil(5 * budget);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = st.disc.r * (0.9 + Math.random() * 0.2);
          parts.splash(c.x + Math.cos(a) * r, c.y + 0.03, c.z + Math.sin(a) * r, Math.cos(a) * 2.2, 0.8 + Math.random(), Math.sin(a) * 2.2, dirty);
        }
        if (Math.random() < budget) parts.mist(c.x, c.y + 0.05, c.z, 0, 0.2, 0);
      }
      return;
    }
    const nz = st[this.tool];
    const pw = this.power();
    const reach = h && h.distance <= st.range;
    const end = reach ? h.point : _v.copy(this.app.R.camera.position).addScaledVector(this.dir, st.range);
    const dist = this.tip.distanceTo(end);
    jet.set(this.tip, end, Math.max(0.02, dist * nz.tanA), Math.max(0.015, dist * nz.tanB), this.right, time, (this.tool === 'wide' ? 0.2 : 0.3) + 0.15 * Math.min(1, pw));
    // droplets along the jet
    const nd = Math.ceil(3 * budget);
    const dx = (end.x - this.tip.x) / dist, dy = (end.y - this.tip.y) / dist, dz = (end.z - this.tip.z) / dist;
    const speed = 26;
    for (let i = 0; i < nd; i++) {
      const sa = (Math.random() * 2 - 1) * nz.tanA, sb = (Math.random() * 2 - 1) * nz.tanB;
      const vx = (dx + this.right.x * sa + this.up.x * sb) * speed, vy = (dy + this.right.y * sa + this.up.y * sb) * speed, vz = (dz + this.right.z * sa + this.up.z * sb) * speed;
      parts.drop(this.tip.x, this.tip.y, this.tip.z, vx, vy, vz, reach ? dist / speed : 0.5);
    }
    if (reach) {
      const n = this.hitNormal;
      const d = this.dir;
      const dn = d.x * n.x + d.y * n.y + d.z * n.z;
      const rx = d.x - 2 * dn * n.x, ry = d.y - 2 * dn * n.y, rz = d.z - 2 * dn * n.z;
      const ns = Math.ceil((this.tool === 'wide' ? 5 : 4) * budget);
      const w = this.tool === 'wide' ? h.distance * nz.tanA : 0.03;
      for (let i = 0; i < ns; i++) {
        const off = (Math.random() * 2 - 1) * w;
        const px = h.point.x + this.right.x * off, py = h.point.y + this.right.y * off, pz = h.point.z + this.right.z * off;
        const s = 1.5 + Math.random() * 2.5;
        parts.splash(px + n.x * 0.02, py + n.y * 0.02, pz + n.z * 0.02,
          (rx * 0.6 + n.x * 0.6) * s + (Math.random() - 0.5) * 1.6, (ry * 0.6 + n.y * 0.6) * s + Math.random() * 1.2, (rz * 0.6 + n.z * 0.6) * s + (Math.random() - 0.5) * 1.6, dirty);
      }
      if (Math.random() < 0.6 * budget) parts.mist(h.point.x + n.x * 0.05, h.point.y + n.y * 0.05, h.point.z + n.z * 0.05, n.x * 0.4, 0.3, n.z * 0.4);
    }
  }

  hideAll(on) {
    this.gunPivot.visible = !on;
    this.hose.mesh.visible = !on;
  }

  dispose() {
    this.app.R.view.remove(this.gunPivot);
    this.app.R.scene.remove(this.unit);
    this.hose.dispose();
    this.tintMat.dispose();
  }
}
