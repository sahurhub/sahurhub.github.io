// Cheap effects: flying grass clippings, rain streaks and soft round "blob" shadows.
import * as THREE from 'three';

// ---------------------------------------------------------------- clippings
export class Clippings {
  constructor(scene, max) {
    this.scene = scene;
    this.build(max);
  }
  build(max) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
    this.max = max;
    const geo = new THREE.PlaneGeometry(0.035, 0.1);
    this.mat = this.mat || new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: true });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) { c.setHSL(0.27 + Math.random() * 0.06, 0.65, 0.35 + Math.random() * 0.2); this.mesh.setColorAt(i, c); }
    this.p = new Float32Array(max * 9); // x y z vx vy vz life spinA spinB
    this.next = 0;
    this.alive = 0;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(1, 1, 1); this.v = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, zero);
    this.scene.add(this.mesh);
  }
  setLight(color) { this.mat.color.copy(color); }
  spawn(x, y, z, vx, vy, vz) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const p = this.p, o = i * 9;
    p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = vx; p[o + 4] = vy; p[o + 5] = vz;
    p[o + 6] = 0.9 + Math.random() * 0.6; p[o + 7] = Math.random() * 6; p[o + 8] = Math.random() * 6;
  }
  update(dt, groundY) {
    const p = this.p;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const o = i * 9;
      if (p[o + 6] <= 0) continue;
      any = true;
      p[o + 6] -= dt;
      const gy = groundY(p[o], p[o + 2]) + 0.02;
      if (p[o + 1] > gy) {
        p[o + 4] -= 9 * dt;
        p[o + 3] *= 1 - 1.5 * dt; p[o + 5] *= 1 - 1.5 * dt;
        p[o] += p[o + 3] * dt; p[o + 1] += p[o + 4] * dt; p[o + 2] += p[o + 5] * dt;
        p[o + 7] += dt * 9; p[o + 8] += dt * 7;
      } else { p[o + 1] = gy; p[o + 3] = p[o + 4] = p[o + 5] = 0; }
      const life = p[o + 6];
      const sc = life <= 0 ? 0 : Math.min(1, life * 3);
      this.e.set(p[o + 7], p[o + 8], 0);
      this.m4.compose(this.v.set(p[o], p[o + 1], p[o + 2]), this.q.setFromEuler(this.e), this.s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, this.m4);
    }
    if (any || this.wasAny) this.mesh.instanceMatrix.needsUpdate = true;
    this.wasAny = any;
  }
}

// ---------------------------------------------------------------- rain
const rainVert = `
uniform float uTime;
uniform vec3 uCenter;
attribute float aEnd;
varying float vA;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float fall = uTime * 14.0;
  p.y = mod(p.y - fall, 22.0);
  p.x = uCenter.x + mod(p.x - uCenter.x + 25.0, 50.0) - 25.0;
  p.z = uCenter.z + mod(p.z - uCenter.z + 25.0, 50.0) - 25.0;
  p.y += uCenter.y - 4.0 + aEnd * 0.55;
  p.x += aEnd * 0.08;
  vA = 0.45 * (1.0 - aEnd * 0.6);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const rainFrag = `
varying float vA;
#include <fog_pars_fragment>
void main() { gl_FragColor = vec4(0.8, 0.86, 0.95, vA);
  #include <fog_fragment>
}`;

export class Rain {
  constructor(scene) { this.scene = scene; this.mesh = null; }
  set(on, count) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    if (!on) return;
    const pos = new Float32Array(count * 6), end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * 50, y = Math.random() * 22, z = Math.random() * 50;
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2] = 0; end[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() } }]);
    const m = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: rainVert, fragmentShader: rainFrag, transparent: true, depthWrite: false, fog: true });
    this.mesh = new THREE.LineSegments(g, m);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  update(time, camPos) {
    if (!this.mesh) return;
    this.uniforms.uTime.value = time;
    this.uniforms.uCenter.value.copy(camPos);
  }
}

// ---------------------------------------------------------------- blob shadows
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Blobs {
  constructor(scene, max = 300) {
    this.scene = scene;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, fog: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.max = max;
    this.count = 0;
    this.m4 = new THREE.Matrix4();
    this.clear();
    scene.add(this.mesh);
  }
  clear() { this.count = 0; this.mesh.count = 0; this.gen = (this.gen || 0) + 1; }
  add(x, y, z, r) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    this.set(i, x, y, z, r);
    this.mesh.count = this.count;
    return i;
  }
  set(i, x, y, z, r, sz) {
    this.m4.makeScale(r * 2, 1, (sz || r) * 2);
    this.m4.setPosition(x, y + 0.04, z);
    this.mesh.setMatrixAt(i, this.m4);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  setOpacity(o) { this.mesh.material.opacity = o; }
}
