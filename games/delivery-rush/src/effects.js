// Particle effects (pooled GPU points): coin bursts, confetti, dust, exhaust, sparks, sparkles,
// chimney smoke. One draw call for normal blending and one for additive glow.
import * as THREE from 'three';

class ParticlePool {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.amax = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = vA * smoothstep(0.5, 0.25, r); gl_FragColor = vec4(vC, a); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, color, size, life, grav = 0, grow = 0, drag = 0, alphaMax = 1) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.grow[i] = grow; this.drag[i] = drag;
    this.amax[i] = alphaMax;
    this.alpha[i] = alphaMax;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 2] *= dr;
      this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.1 && this.grav[i] > 0) { this.pos[k + 1] = 0.1; this.vel[k + 1] *= -0.3; this.vel[k] *= 0.6; this.vel[k + 2] *= 0.6; }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t * 2.5) * this.amax[i];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

const C = c => new THREE.Color(c);
const GOLD = C('#ffd23f'), CONF = ['#ff5d5d', '#ffd23f', '#52d6a3', '#2b7de9', '#ff70a6', '#8f4bd6'].map(C);

export class Effects {
  constructor(scene, quality) {
    this.normal = new ParticlePool(scene, quality === 'low' ? 600 : 1400, false);
    this.glow = new ParticlePool(scene, quality === 'low' ? 300 : 700, true);
    this.smokeT = 0;
  }
  setScale(h) { this.normal.points.material.uniforms.scale.value = h * 0.6; this.glow.points.material.uniforms.scale.value = h * 0.6; }

  coinBurst(x, y, z, n = 24) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
      this.glow.emit(x, y, z, Math.cos(a) * s, 5 + Math.random() * 5, Math.sin(a) * s, GOLD, 0.35, 1.2 + Math.random() * 0.5, 12, 0, 0.5);
    }
  }
  confetti(x, y, z, n = 80) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 5;
      this.normal.emit(x, y, z, Math.cos(a) * s, 6 + Math.random() * 7, Math.sin(a) * s, CONF[i % CONF.length], 0.22, 2 + Math.random(), 6, 0, 1.2);
    }
  }
  sparkle(x, y, z, color, n = 2) {
    const c = C(color);
    for (let i = 0; i < n; i++) this.glow.emit(x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.8, 0, 0.8 + Math.random(), 0, c, 0.18, 0.8, 0, -0.1, 0);
  }
  sparks(x, y, z, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 5;
      this.glow.emit(x, y, z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, C('#ffb347'), 0.12, 0.5, 14, 0, 0.5);
    }
  }
  dust(x, y, z, amount = 1, color = '#c9c2b6') {
    const c = C(color);
    for (let i = 0; i < amount; i++) this.normal.emit(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, c, 0.25, 0.8, 0, 0.9, 0.8, 0.45);
  }
  exhaust(x, y, z, throttle) {
    const c = C(throttle > 0.5 ? '#9a9ea6' : '#c3c7cd');
    this.normal.emit(x, y, z, (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, c, 0.1, 0.9, -0.3, 0.45, 0.6, 0.35);
  }
  smoke(x, y, z) {
    const c = C('#e3e3e3');
    this.normal.emit(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), 0.6 + Math.random() * 0.4, 1.5 + Math.random(), (Math.random() - 0.5) * 0.4, c, 1.6, 5, -0.05, 1.6, 0.1, 0.6);
  }
  ring(x, y, z, color, n = 30) {
    const c = C(color);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      this.glow.emit(x, y, z, Math.cos(a) * 6, 0.5, Math.sin(a) * 6, c, 0.3, 0.6, 0, 0, 2);
    }
  }
  update(dt) { this.normal.update(dt); this.glow.update(dt); }
}
