// TURBO TOWN - cheap pooled particles: one Points draw call for everything (sparks,
// flames, dust, splashes, confetti, petals). Each particle has a colour, size, life and
// simple physics. Sizes shrink as particles age.
import * as THREE from 'three';

export class Particles {
  constructor(scene, max = 1500) {
    this.max = max;
    this.count = 0;
    this.scale = 1; // quality multiplier (fewer particles on low)
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, vertexColors: true,
      uniforms: { scale: { value: 300 } },
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vCol; varying float vA; uniform float scale;
        void main(){ vCol = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vCol; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard; gl_FragColor = vec4(vCol, vA * (1.0 - r * 2.4)); }`,
    });
    this.material = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  setViewport(height) { this.material.uniforms.scale.value = height * 0.55; }

  // o: { x, y, z, vx, vy, vz, color, size, life, gravity, drag, spread }
  emit(o, n = 1) {
    const want = n * this.scale;
    n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
    const c = this._c.set(o.color || '#ffffff');
    for (let k = 0; k < n; k++) {
      if (this.count >= this.max) return;
      const i = this.count++;
      const sp = o.spread || 0;
      this.pos[i * 3] = o.x + (Math.random() - 0.5) * (o.jitter || 0);
      this.pos[i * 3 + 1] = o.y + (Math.random() - 0.5) * (o.jitter || 0);
      this.pos[i * 3 + 2] = o.z + (Math.random() - 0.5) * (o.jitter || 0);
      this.vel[i * 3] = (o.vx || 0) + (Math.random() - 0.5) * sp;
      this.vel[i * 3 + 1] = (o.vy || 0) + (Math.random() - 0.5) * sp;
      this.vel[i * 3 + 2] = (o.vz || 0) + (Math.random() - 0.5) * sp;
      const cv = o.colorVar || 0;
      this.col[i * 3] = Math.min(1, c.r + (Math.random() - 0.5) * cv);
      this.col[i * 3 + 1] = Math.min(1, c.g + (Math.random() - 0.5) * cv);
      this.col[i * 3 + 2] = Math.min(1, c.b + (Math.random() - 0.5) * cv);
      const life = (o.life || 0.5) * (0.75 + Math.random() * 0.5);
      this.life[i] = life; this.maxLife[i] = life;
      this.size0[i] = (o.size || 0.3) * (0.8 + Math.random() * 0.4);
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1;
      this.alpha[i] = o.alpha ?? 1;
    }
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap with the last live particle
        const j = --this.count;
        if (i !== j) {
          for (let a = 0; a < 3; a++) {
            this.pos[i * 3 + a] = this.pos[j * 3 + a]; this.vel[i * 3 + a] = this.vel[j * 3 + a]; this.col[i * 3 + a] = this.col[j * 3 + a];
          }
          this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.size0[i] = this.size0[j];
          this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.alpha[i] = this.alpha[j];
        }
        continue;
      }
      const d = Math.pow(this.drag[i], dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.size[i] = this.size0[i] * (0.35 + 0.65 * f);
      i++;
    }
    const g = this.geo;
    g.setDrawRange(0, this.count);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
  }

  clear() { this.count = 0; this.geo.setDrawRange(0, 0); }
}
