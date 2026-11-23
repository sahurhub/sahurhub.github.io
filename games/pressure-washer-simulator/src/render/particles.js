// Pooled particles (one Points draw call): water droplets, splashes, mist and sparkles.
// Plus the water jet: one stretched cone mesh from the nozzle to where the water hits.
import * as THREE from 'three';

const KIND = { drop: 0, splash: 1, mist: 2, sparkle: 3 };

export class Particles {
  constructor(scene, max) {
    this.scene = scene;
    this.build(max);
  }

  build(max) {
    if (this.points) { this.scene.remove(this.points); this.points.geometry.dispose(); }
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.colr = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.kind = new Uint8Array(max);
    this.next = 0;
    this.live = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(this.colr, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aAlpha', this.aAlpha);
    g.setAttribute('aColor', this.aColor);
    if (!this.mat) {
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 600 } },
        vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
          uniform float uScale; varying float vA; varying vec3 vC;
          void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * uScale / max(0.05, -mv.z); vA = aAlpha; vC = aColor; }`,
        fragmentShader: `varying float vA; varying vec3 vC;
          void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0 || vA < 0.005) discard;
            gl_FragColor = vec4(vC, vA * (1.0 - r * r)); }`,
        transparent: true, depthWrite: false,
      });
    }
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.scene.add(this.points);
  }

  setScale(heightPx, fovDeg) { this.mat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360)); }

  emit(kind, x, y, z, vx, vy, vz, life, size, r, g, b) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size0[i] = size; this.size[i] = size;
    this.colr[i * 3] = r; this.colr[i * 3 + 1] = g; this.colr[i * 3 + 2] = b;
    this.alpha[i] = 1;
    this.kind[i] = kind;
  }

  drop(x, y, z, vx, vy, vz, life) { this.emit(KIND.drop, x, y, z, vx, vy, vz, life, 0.028, 0.82, 0.93, 1); }
  splash(x, y, z, vx, vy, vz, dirty) {
    const c = dirty ? [0.55, 0.47, 0.36] : [0.85, 0.95, 1];
    this.emit(KIND.splash, x, y, z, vx, vy, vz, 0.35 + Math.random() * 0.35, 0.035 + Math.random() * 0.03, c[0], c[1], c[2]);
  }
  mist(x, y, z, vx, vy, vz) { this.emit(KIND.mist, x, y, z, vx, vy, vz, 0.5 + Math.random() * 0.4, 0.07 + Math.random() * 0.06, 0.9, 0.96, 1); }
  sparkle(x, y, z) {
    const h = Math.random();
    this.emit(KIND.sparkle, x, y, z, (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 0.7, 0.08 + Math.random() * 0.08, 1, 0.92 + h * 0.08, 0.6 + h * 0.4);
  }

  update(dt) {
    const n = this.max;
    let live = 0;
    for (let i = 0; i < n; i++) {
      let L = this.life[i];
      if (L <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; } continue; }
      L -= dt;
      this.life[i] = L;
      if (L <= 0) { this.alpha[i] = 0; continue; }
      live++;
      const k = this.kind[i], t = 1 - L / this.maxLife[i];
      const j = i * 3;
      if (k === KIND.drop) { this.vel[j + 1] -= 4 * dt; this.alpha[i] = 0.9; }
      else if (k === KIND.splash) { this.vel[j + 1] -= 9.8 * dt; this.vel[j] *= 1 - 1.5 * dt; this.vel[j + 2] *= 1 - 1.5 * dt; this.alpha[i] = 0.85 * (1 - t); }
      else if (k === KIND.mist) { this.vel[j] *= 1 - 2.5 * dt; this.vel[j + 1] = this.vel[j + 1] * (1 - 2.5 * dt) + 0.3 * dt; this.vel[j + 2] *= 1 - 2.5 * dt; this.size[i] = this.size0[i] * (1 + t * 1.8); this.alpha[i] = 0.2 * (1 - t); }
      else { this.alpha[i] = Math.sin(t * Math.PI) * (0.7 + 0.3 * Math.sin(L * 40)); this.size[i] = this.size0[i] * (0.6 + 0.6 * Math.sin(t * Math.PI)); this.vel[j + 1] *= 1 - dt; }
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
    }
    this.live = live;
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true; this.aColor.needsUpdate = true;
    this.points.visible = live > 0;
  }

  clear() { this.life.fill(0); this.alpha.fill(0); }

  dispose() { this.scene.remove(this.points); this.points.geometry.dispose(); this.mat.dispose(); }
}

// The jet: a unit cone along +Z (0..1), its end widened to uEnd (metres) in the shader.
export class Jet {
  constructor(scene) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 10, 6, true);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, 0.5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uStart: { value: 0.012 }, uEnd: { value: new THREE.Vector2(0.05, 0.05) }, uLen: { value: 1 }, uTime: { value: 0 }, uAlpha: { value: 0.6 } },
      vertexShader: `uniform float uStart; uniform vec2 uEnd; uniform float uLen; varying float vT; varying vec2 vXY;
        void main() { vT = position.z; vXY = position.xy; vec3 p = position; p.xy *= mix(vec2(uStart), uEnd, position.z); p.z *= uLen;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uLen; uniform float uAlpha; varying float vT; varying vec2 vXY;
        void main() { float s = sin(vT * uLen * 9.0 - uTime * 40.0 + vXY.x * 3.0) * 0.5 + 0.5;
          float edge = 1.0 - abs(vXY.x) * 0.7;
          float a = uAlpha * (0.2 + 0.55 * s * s) * edge * smoothstep(0.0, 0.05, vT) * (1.0 - 0.6 * vT);
          gl_FragColor = vec4(mix(vec3(0.75, 0.9, 1.0), vec3(1.0), s), a); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.scene = scene;
    this._up = new THREE.Vector3();
  }

  // from, to: world points; endW/endH: half width/height of the spray at the far end; roll: fan axis
  set(from, to, endW, endH, right, time, alpha = 0.6) {
    const m = this.mesh;
    m.visible = true;
    m.position.copy(from);
    const len = from.distanceTo(to);
    m.lookAt(to);
    // turn the cone about its axis so its local X matches the fan direction
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quaternion);
    const dir = to.clone().sub(from).normalize();
    const r = right.clone().sub(dir.clone().multiplyScalar(right.dot(dir))).normalize();
    const ang = Math.atan2(this._up.crossVectors(ax, r).dot(dir), ax.dot(r));
    m.rotateZ(ang);
    this.mat.uniforms.uLen.value = Math.max(0.01, len);
    this.mat.uniforms.uEnd.value.set(endW, endH);
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uAlpha.value = alpha;
  }

  hide() { this.mesh.visible = false; }

  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
