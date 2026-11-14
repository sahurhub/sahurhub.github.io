// World markers: light beams with floating icons, pulsing ground rings, the 3D direction arrow
// above the player and the GPS route arrows on the road.
import * as THREE from 'three';
import { TEX } from './textures.js';

let beamTex = null;
function beamTexture() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 128);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}

export class Marker {
  constructor(scene, { color = '#2f80ed', icon = 'pickup', height = 26, radius = 2.6, label = null } = {}) {
    this.group = new THREE.Group();
    this.color = new THREE.Color(color);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.55, radius * 0.75, height, 16, 1, true).translate(0, height / 2, 0),
      new THREE.MeshBasicMaterial({ color: this.color, map: beamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    );
    beam.renderOrder = 4;
    this.beam = beam;
    this.group.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.85, radius, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = 0.08;
    ring.renderOrder = 4;
    this.ring = ring;
    this.group.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.85, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.18, depthWrite: false }));
    disc.position.y = 0.07;
    this.group.add(disc);
    const tex = TEX.icons[icon] || TEX.icons.pickup;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
    sprite.scale.set(2.4, 2.4, 1);
    sprite.position.y = 4.2;
    sprite.renderOrder = 10;
    this.sprite = sprite;
    this.group.add(sprite);
    this.radius = radius;
    this.t = Math.random() * 10;
    scene.add(this.group);
  }
  set(x, y, z) { this.group.position.set(x, y, z); return this; }
  setVisible(v) { this.group.visible = v; }
  update(dt, camPos) {
    this.t += dt;
    const s = 1 + Math.sin(this.t * 4) * 0.08;
    this.ring.scale.set(s, 1, s);
    this.sprite.position.y = 4.2 + Math.sin(this.t * 2.2) * 0.25;
    // icons stay readable from far away
    if (camPos) {
      const d = camPos.distanceTo(this.group.position);
      const k = Math.max(2.4, d * 0.045);
      this.sprite.scale.set(k, k, 1);
      this.beam.material.opacity = Math.min(1, 0.35 + d / 120);
    }
  }
  dispose() {
    this.group.removeFromParent();
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}

// small, always-visible icon for fixed places (job boards, garage, dealership, trial starts)
export class PoiIcon {
  constructor(scene, icon, x, y, z, scale = 3) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.icons[icon], transparent: true, depthWrite: false, fog: false }));
    this.sprite.position.set(x, y, z);
    this.sprite.renderOrder = 9;
    this.base = scale;
    this.sprite.scale.set(scale, scale, 1);
    scene.add(this.sprite);
  }
  update(camPos) {
    const d = camPos.distanceTo(this.sprite.position);
    const k = Math.min(this.base * 3, Math.max(this.base, d * 0.03));
    this.sprite.scale.set(k, k, 1);
    this.sprite.visible = d < 420;
  }
  setVisible(v) { this.sprite.visible = v; }
}

export class DirectionArrow {
  constructor(scene) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.9); shape.lineTo(0.62, 0); shape.lineTo(0.24, 0); shape.lineTo(0.24, -0.7);
    shape.lineTo(-0.24, -0.7); shape.lineTo(-0.24, 0); shape.lineTo(-0.62, 0); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
    geo.rotateX(-Math.PI / 2);   // lie flat, tip pointing to -Z
    geo.rotateY(Math.PI);        // tip pointing to +Z
    geo.translate(0, 0, -0.1);
    this.mat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ff9d1a', emissiveIntensity: 0.6, roughness: 0.4 });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.t = 0;
  }
  update(dt, from, to, height) {
    if (!to) { this.mesh.visible = false; return; }
    this.t += dt;
    this.mesh.visible = true;
    const ang = Math.atan2(to.x - from.x, to.z - from.z);
    this.mesh.position.set(from.x, from.y + height + Math.sin(this.t * 3) * 0.12, from.z);
    this.mesh.rotation.set(0, ang, 0);
  }
  setColor(c) { this.mat.color.set(c); this.mat.emissive.set(c); }
}

export class RouteArrows {
  constructor(scene) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.7); shape.lineTo(0.7, -0.1); shape.lineTo(0.4, -0.1); shape.lineTo(0, 0.35); shape.lineTo(-0.4, -0.1); shape.lineTo(-0.7, -0.1); shape.closePath();
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).rotateY(Math.PI);
    this.max = 60;
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, depthWrite: false }), this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4();
  }
  // pts: [{x,z}] starting at the player; heightAt(x,z)
  update(pts, heightAt, enabled) {
    if (!enabled || !pts || pts.length < 2) { this.mesh.count = 0; return; }
    let n = 0, carry = 3, travelled = 0;
    for (let i = 0; i < pts.length - 1 && n < this.max && travelled < 180; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.01) continue;
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      let d = carry;
      while (d < len && n < this.max) {
        const x = a.x + (b.x - a.x) * d / len, z = a.z + (b.z - a.z) * d / len;
        this.m.makeRotationY(ang).setPosition(x, heightAt(x, z) + 0.06, z);
        this.mesh.setMatrixAt(n++, this.m);
        d += 6;
      }
      carry = d - len;
      travelled += len;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
