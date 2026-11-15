// TURBO TOWN - 3D showroom behind the menus: karts on a turning podium under a bright sky.
// Modes: 'single' (one kart on a turntable, drag to spin), 'podium' (top three on steps),
// 'parade' (a few karts for the title screen).
import * as THREE from 'three';
import { createSky } from './sky.js';
import { KartVisual } from '../karts/kart-visual.js';
import { createKart } from '../physics/kart-physics.js';
import { KART_BY_ID } from '../shared/karts.js';
import { colorMaterial } from './materials.js';

export class Showroom {
  constructor(assets) {
    this.assets = assets;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xeaf6ff, 0xffd6ec, 1.4));
    const sun = new THREE.DirectionalLight(0xfff3dc, 1.6);
    sun.position.set(6, 10, 7);
    this.scene.add(sun);
    this.sky = createSky({ top: '#57b8ff', horizon: '#ffd7f0', bottom: '#ffe9f6', clouds: 12, seed: 9 });
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#ffe3f3', 40, 160);
    // ground: soft disc with rings
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), colorMaterial('#bdf0a0', { toon: false }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(6 + i * 7, 6.6 + i * 7, 64), colorMaterial(i % 2 ? '#ffffff' : '#a6e88a', { toon: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
      this.scene.add(ring);
    }
    this.podium = this.makePodium();
    this.scene.add(this.podium);
    this.items = [];          // { vis, kart, spin, x, z, y }
    this.angle = 0.6;
    this.spinV = 0;
    this.drag = null;
    this.mode = 'single';
    this.t = 0;
    this.confetti = this.makeConfetti();
    this.scene.add(this.confetti.points);
  }

  makePodium() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.5, 40), colorMaterial('#ff6fa8'));
    top.position.y = 0.25;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.82, 2.82, 0.14, 40), colorMaterial('#ffffff'));
    band.position.y = 0.33;
    g.add(top, band);
    this.steps = new THREE.Group();
    const cols = ['#ffd23f', '#dfe9ff', '#ffb36b'];
    const hts = [1.4, 1.0, 0.7];
    const xs = [0, -2.5, 2.5];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.3, hts[i], 2.3), colorMaterial(cols[i]));
      s.position.set(xs[i], hts[i] / 2, 0);
      this.steps.add(s);
    }
    this.steps.visible = false;
    this.scene.add(this.steps);
    return g;
  }

  makeConfetti() {
    const n = 220;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [];
    const pal = ['#ff4f9a', '#ffd23f', '#3ddc84', '#2fb6ff', '#a55eea', '#ffffff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      pos[i * 3 + 1] = -100;
      const c = pal[i % pal.length];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      vel.push({ x: 0, y: 0, z: 0, life: 0 });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, fog: false }));
    points.frustumCulled = false;
    return { points, pos, vel, n, on: false };
  }

  clear() {
    for (const it of this.items) it.vis.dispose();
    this.items = [];
  }

  // one kart on the turntable
  showKart(kartId, driver, opts = {}) {
    this.clear();
    this.mode = 'single';
    this.steps.visible = false;
    this.podium.visible = true;
    this.add(kartId, driver, 0, 0.5, 0, opts);
    this.confetti.on = !!opts.confetti;
  }

  // top three on podium steps: list = [{ kart, driver, paint }]
  showPodium(list) {
    this.clear();
    this.mode = 'podium';
    this.podium.visible = false;
    this.steps.visible = true;
    const xs = [0, -2.5, 2.5], ys = [1.4, 1.0, 0.7];
    list.slice(0, 3).forEach((e, i) => this.add(e.kart, e.driver, xs[i], ys[i], 0, { paint: e.paint, cosmetics: e.cosmetics, yaw: 0 }));
    this.confetti.on = true;
  }

  // a row of karts for the title screen
  showParade(list) {
    this.clear();
    this.mode = 'parade';
    this.steps.visible = false;
    this.podium.visible = true;
    list.forEach((e, i) => {
      const a = (i / list.length) * Math.PI * 2;
      this.add(e.kart, e.driver, Math.cos(a) * 1.15, 0.5, Math.sin(a) * 1.15, { paint: e.paint, yaw: a + Math.PI / 2, scale: 0.72 });
    });
    this.confetti.on = false;
  }

  add(kartId, driver, x, y, z, opts = {}) {
    const def = KART_BY_ID[kartId] || KART_BY_ID.starter;
    const vis = new KartVisual(def, { assets: this.assets, driver, paint: opts.paint, cosmetics: opts.cosmetics, blob: false });
    const kart = createKart(def);
    kart.frozen = true; kart.grounded = true;
    vis.root.scale.setScalar(opts.scale || 1);
    this.scene.add(vis.root);
    const it = { vis, kart, x, y, z, yaw: opts.yaw ?? 0, locked: !!opts.locked };
    if (opts.locked) vis.root.traverse((o) => { if (o.isMesh) { o.material = colorMaterial('#3b3560', { toon: false }); } });
    this.items.push(it);
    return it;
  }

  // drag to spin (garage / kart select)
  attach(el) {
    const down = (e) => { this.drag = { x: e.clientX, a: this.angle }; this.spinV = 0; };
    const move = (e) => {
      if (!this.drag) return;
      const na = this.drag.a + (e.clientX - this.drag.x) * 0.012;
      this.spinV = (na - this.angle) * 30;
      this.angle = na;
    };
    const up = () => { this.drag = null; };
    el.addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    return () => { el.removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
  }

  update(dt, aspect) {
    this.t += dt;
    this.camera.aspect = aspect;
    if (!this.drag) { this.spinV *= Math.exp(-dt * 2); this.angle += (0.35 + this.spinV) * dt; }
    if (this.mode === 'single') {
      // frame the kart a little to the right on wide screens (menus sit on the left)
      const wide = aspect > 1.2;
      this.camera.position.set(wide ? -1.4 : 0, 2.2, 6.4);
      this.camera.lookAt(wide ? -1.4 + 1.6 : 0, 0.9, 0);
      this.camera.fov = wide ? 34 : 46;
    } else if (this.mode === 'podium') {
      this.camera.position.set(Math.sin(this.t * 0.2) * 1.5, 3.2, 9.5);
      this.camera.lookAt(0, 1.4, 0);
      this.camera.fov = 42;
    } else {
      this.camera.position.set(0, 3.4, 7.5);
      this.camera.lookAt(0, 0.6, 0);
      this.camera.fov = aspect > 1 ? 36 : 52;
    }
    this.camera.updateProjectionMatrix();
    this.podium.rotation.y = this.mode === 'single' ? this.angle : this.t * 0.2;
    for (const it of this.items) {
      const k = it.kart;
      k.time += dt;
      let yaw = it.yaw, x = it.x, z = it.z;
      if (this.mode === 'single') yaw = this.angle;
      if (this.mode === 'parade') {
        const a = Math.atan2(it.z, it.x) + this.t * 0.2;
        const r = Math.hypot(it.x, it.z);
        x = Math.cos(a) * r; z = Math.sin(a) * r; yaw = -a;
      }
      k.x = k.px = x; k.z = k.pz = z; k.y = k.py = it.y; k.yaw = k.pyaw = yaw;
      k.steer = Math.sin(this.t * 0.8 + x) * 0.3;
      it.vis.update(k, 1, dt);
      it.vis.root.position.set(x, it.y, z);
      it.vis.blob.visible = false;
    }
    this.sky.position.copy(this.camera.position);
    this.sky.userData.update(this.t);
    this.updateConfetti(dt);
  }

  updateConfetti(dt) {
    const c = this.confetti;
    for (let i = 0; i < c.n; i++) {
      const v = c.vel[i];
      v.life -= dt;
      if (v.life <= 0) {
        if (!c.on) { c.pos[i * 3 + 1] = -100; continue; }
        c.pos[i * 3] = (Math.random() - 0.5) * 12; c.pos[i * 3 + 1] = 7 + Math.random() * 3; c.pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
        v.x = (Math.random() - 0.5) * 0.8; v.y = -1 - Math.random(); v.z = (Math.random() - 0.5) * 0.8; v.life = 4 + Math.random() * 3;
      }
      c.pos[i * 3] += (v.x + Math.sin(this.t * 3 + i) * 0.4) * dt; c.pos[i * 3 + 1] += v.y * dt; c.pos[i * 3 + 2] += v.z * dt;
    }
    c.points.geometry.attributes.position.needsUpdate = true;
  }
}
