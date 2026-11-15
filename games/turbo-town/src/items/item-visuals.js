// TURBO TOWN - drawing items: floating, spinning, glowing item boxes, rockets, splashes,
// freeze pops, shield bubbles, the turbo trail and rainbow sparkles.
import * as THREE from 'three';
import { matrixOf } from '../render/props.js';
import { vcMaterial } from '../render/materials.js';

export class ItemVisuals {
  constructor(game, race) {
    this.game = game;
    this.race = race;
    this.items = race.items;
    this.group = new THREE.Group();
    this.group.name = 'items';
    game.r.scene.add(this.group);
    const assets = game.assets;
    const meshOf = (name, fallback) => {
      const m = assets && assets.merged(name);
      return m ? m.parts : fallback();
    };
    // item boxes: one instanced mesh per part + a soft glow sprite
    const boxes = this.items.boxes;
    const boxParts = meshOf('item_box', () => [{ geometry: new THREE.BoxGeometry(1.3, 1.3, 1.3).toNonIndexed(), glow: null, color: '#ff9fd0' }]);
    this.boxMeshes = boxParts.map((p) => {
      const mat = p.glow ? vcMaterial({ toon: false, emissive: p.glow }) : (p.color ? new THREE.MeshLambertMaterial({ color: p.color }) : vcMaterial({ toon: true }));
      const im = new THREE.InstancedMesh(p.geometry, mat, Math.max(1, boxes.length));
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    });
    this.glowTex = glowTexture();
    const glowMat = new THREE.SpriteMaterial({ map: this.glowTex, color: '#fff2a8', transparent: true, opacity: 0.75, depthWrite: false });
    this.glows = boxes.map((b) => { const s = new THREE.Sprite(glowMat); s.scale.set(3.2, 3.2, 1); this.group.add(s); return s; });
    // projectiles and hazards (small pools)
    this.rocketParts = meshOf('item_rocket', () => [{ geometry: new THREE.ConeGeometry(0.3, 1.2, 10).rotateX(Math.PI / 2), glow: null, color: '#ff4757' }]);
    this.splashParts = meshOf('item_splash', () => [{ geometry: new THREE.CylinderGeometry(1.2, 1.2, 0.1, 16), glow: null, color: '#ff6fd0' }]);
    this.freezeParts = meshOf('item_freezepop', () => [{ geometry: new THREE.BoxGeometry(0.4, 0.8, 0.2), glow: null, color: '#9fe8ff' }]);
    this.springParts = meshOf('item_spring', () => [{ geometry: new THREE.CylinderGeometry(0.5, 0.5, 0.9, 10), glow: null, color: '#3ddc84' }]);
    this.pools = {
      rocket: this.pool(this.rocketParts, 8),
      splash: this.pool(this.splashParts, 24),
      freeze: this.pool(this.freezeParts, 8),
      spring: this.pool(this.springParts, 8),
    };
    // shield bubbles
    const bubbleMat = new THREE.MeshLambertMaterial({ color: '#7fe0ff', emissive: new THREE.Color('#2a8acc'), transparent: true, opacity: 0.32, depthWrite: false });
    this.bubbles = race.racers.map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.45, 18, 12), bubbleMat); m.visible = false; this.group.add(m); return m; });
    this.springT = new Map();
    this.time = 0;
  }

  pool(parts, n) {
    return parts.map((p) => {
      const mat = p.glow ? vcMaterial({ toon: false, emissive: p.glow }) : (p.color ? new THREE.MeshLambertMaterial({ color: p.color }) : vcMaterial({ toon: true }));
      const im = new THREE.InstancedMesh(p.geometry, mat, n);
      im.count = 0;
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    });
  }

  fill(pool, list, toMatrix) {
    for (const im of pool) {
      const n = Math.min(list.length, im.instanceMatrix.count);
      for (let i = 0; i < n; i++) im.setMatrixAt(i, toMatrix(list[i], i));
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  onEvent(e) {
    const fx = this.game.fx;
    if (e.type === 'itemUse' && e.item === 'spring') this.springT.set(e.racer.index, 0.6);
    if (e.type === 'boxHit') {
      const b = this.items.boxes[e.box];
      fx.emit({ x: b.x, y: b.y, z: b.z, vy: 3, spread: 8, color: '#ffffff', size: 0.35, life: 0.6, drag: 0.4, colorVar: 1 }, 26);
    }
    if (e.type === 'rocketBoom' || e.type === 'itemHit' || e.type === 'shieldPop') {
      const k = e.racer ? e.racer.kart : e;
      const col = e.type === 'shieldPop' ? '#9fe8ff' : '#ffb02e';
      fx.emit({ x: k.x, y: (k.y || 0) + 0.8, z: k.z, vy: 3, spread: 9, color: col, size: 0.45, life: 0.5, drag: 0.4 }, 30);
    }
    if (e.type === 'frozen') {
      const k = e.racer.kart;
      fx.emit({ x: k.x, y: k.y + 0.8, z: k.z, vy: 2, spread: 6, color: '#c8f4ff', size: 0.4, life: 0.8, drag: 0.3 }, 30);
    }
    if (e.type === 'splashed') fx.emit({ x: e.x, y: e.racer.kart.y + 0.3, z: e.z, vy: 4, spread: 6, color: '#ff6fd0', size: 0.4, life: 0.6, gravity: 12 }, 24);
  }

  update(dt) {
    this.time += dt;
    const t = this.time, items = this.items;
    // boxes bob, spin and glow; broken boxes grow back in
    const tmp = {};
    items.boxes.forEach((b, i) => {
      const show = b.active;
      const s = show ? 1 : 0.0001;
      tmp.x = b.x; tmp.y = b.y + Math.sin(t * 2 + i) * 0.18; tmp.z = b.z;
      tmp.ry = t * 1.4 + i; tmp.rx = 0.35; tmp.rz = 0.35; tmp.s = s;
      for (const im of this.boxMeshes) im.setMatrixAt(i, matrixOf(tmp));
      const g = this.glows[i];
      g.visible = show;
      g.position.set(b.x, tmp.y, b.z);
      g.material.opacity = 0.55 + Math.sin(t * 4 + i) * 0.15;
    });
    for (const im of this.boxMeshes) im.instanceMatrix.needsUpdate = true;
    // rockets with a smoke trail
    this.fill(this.pools.rocket, items.rockets, (rk) => matrixOf({ x: rk.x, y: rk.y, z: rk.z, ry: rk.yaw, s: 1.3 }));
    for (const rk of items.rockets) this.game.fx.emit({ x: rk.x - Math.sin(rk.yaw) * 0.8, y: rk.y, z: rk.z - Math.cos(rk.yaw) * 0.8, vy: 0.5, spread: 0.6, color: '#ffe6a8', size: 0.4, life: 0.35, drag: 0.3 }, 1);
    // splashes on the ground
    this.fill(this.pools.splash, items.hazards, (h) => matrixOf({ x: h.x, y: h.y + 0.04, z: h.z, ry: h.id, s: h.r / 1.0 }));
    // freeze pops spinning through the air
    this.fill(this.pools.freeze, items.freezes, (f) => matrixOf({ x: f.x, y: f.y, z: f.z, ry: t * 12, rx: 0.4, s: 1.6 }));
    for (const f of items.freezes) this.game.fx.emit({ x: f.x, y: f.y, z: f.z, spread: 1, color: '#d8f8ff', size: 0.3, life: 0.4 }, 1);
    // springs pop out under karts that used one
    const springs = [];
    for (const [idx, left] of this.springT) {
      const k = this.race.racers[idx].kart;
      springs.push({ k, left });
      const nl = left - dt;
      if (nl <= 0) this.springT.delete(idx); else this.springT.set(idx, nl);
    }
    this.fill(this.pools.spring, springs, (sp) => matrixOf({ x: sp.k.x, y: sp.k.gy ?? sp.k.y, z: sp.k.z, sy: 0.5 + (0.6 - sp.left) * 3, s: 1.4 }));
    // shields and rainbow sparkle, frost on frozen karts
    this.race.racers.forEach((r, i) => {
      const k = r.kart, b = this.bubbles[i];
      b.visible = !!k.shield && k.respawnT <= 0;
      if (b.visible) { b.position.set(k.x, k.y + 0.75, k.z); b.scale.setScalar(1 + Math.sin(t * 6) * 0.04); }
      if (k.rainbowT > 0) {
        const hue = (t * 2 + i * 0.3) % 1;
        const c = new THREE.Color().setHSL(hue, 1, 0.6);
        this.game.fx.emit({ x: k.x, y: k.y + 0.8, z: k.z, vy: 1, spread: 3, color: '#' + c.getHexString(), size: 0.35, life: 0.4 }, 2);
      }
      if (k.frozenT > 0) this.game.fx.emit({ x: k.x, y: k.y + 1, z: k.z, vy: 0.5, spread: 2.5, color: '#d8f8ff', size: 0.25, life: 0.5 }, 1);
    });
    // turbo trail: glowing dots that fade
    for (const s of items.trail) {
      if (Math.random() < 0.3) this.game.fx.emit({ x: s.x + (Math.random() - 0.5), y: s.y + 0.15, z: s.z + (Math.random() - 0.5), vy: 0.6, spread: 0.3, color: Math.random() < 0.5 ? '#ffd32a' : '#ff8a1f', size: 0.4, life: 0.4 }, 1);
    }
  }

  dispose() { this.group.removeFromParent(); }
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.4, 'rgba(255,240,180,0.35)');
  grd.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
