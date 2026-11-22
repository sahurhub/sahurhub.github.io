// Thousands of grass blades in ONE draw call. Each instance is a tuft of blades on a grid
// that wraps around a point in front of the camera (no per-frame CPU work). The vertex shader
// reads the lawn mask: cut grass collapses to nothing, the rest sways in the wind and bends
// away from the mower. Blades fade out at a distance; the ground shader paints the rest.
import * as THREE from 'three';

const vert = `
uniform float uN, uSp, uR, uTime, uBladeH, uWind, uHasPattern, uMissed;
uniform vec2 uCenter, uCam, uOrigin, uSize, uTilt;
uniform vec4 uHills[6];
uniform int uHillCount;
uniform vec3 uMower;
uniform vec3 uBase, uTip, uLight, uCutTip;
uniform sampler2D uMask, uPattern;
attribute vec2 aSide;
varying vec3 vCol;
#include <fog_pars_vertex>
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float terrain(vec2 p) {
  float h = dot(uTilt, p);
  for (int i = 0; i < 6; i++) {
    if (i >= uHillCount) break;
    vec4 k = uHills[i];
    vec2 d = p - k.xy;
    h += k.w * exp(-dot(d, d) / (k.z * k.z));
  }
  return h;
}
void cull() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); }
void main() {
  float id = float(gl_InstanceID);
  float fi = mod(id, uN), fj = floor(id / uN);
  vec2 c = uCenter / uSp;
  vec2 cell = vec2(fi + uN * floor((c.x - fi) / uN + 0.5), fj + uN * floor((c.y - fj) / uN + 0.5));
  vec2 tuft = (cell + 0.5 + (h22(cell) - 0.5) * 0.85) * uSp;
  float d = distance(tuft, uCam);
  if (d > uR) { cull(); return; }
  vec2 uv = (tuft - uOrigin) / uSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { cull(); return; }
  vec4 m = texture2D(uMask, uv);
  float hf = m.b > 0.5 ? 1.0 : (m.b > 0.3 ? 0.62 : 0.0);
  hf *= 1.0 - smoothstep(0.12, 0.8, m.r);
  hf *= 1.0 - smoothstep(uR * 0.72, uR, d);
  if (hf < 0.04) { cull(); return; }
  float br = aSide.y;
  vec2 rnd = h22(cell * 1.37 + br * 7.13);
  float h = uBladeH * hf * (0.72 + 0.56 * rnd.x);
  float ang = rnd.y * 6.2832;
  vec2 fwd = vec2(cos(ang), sin(ang));
  vec2 perp = vec2(-fwd.y, fwd.x);
  vec2 root = tuft + position.xz * uSp;
  float t = position.y;
  float w = 0.032 * (1.0 - t) * (0.75 + 0.5 * rnd.x);
  float sway = sin(uTime * 1.7 + root.x * 0.33 + root.y * 0.21) * 0.6 + sin(uTime * 2.9 + root.x * 0.9 + root.y * 0.4) * 0.25;
  vec2 bend = (vec2(0.75, 0.45) * sway * uWind * 0.55 + fwd * 0.38) * h * t * t;
  vec2 dm = root - uMower.xy;
  float ld = length(dm);
  bend += (dm / max(ld, 0.01)) * h * t * 0.7 * (1.0 - smoothstep(uMower.z, uMower.z + 0.7, ld));
  vec2 xz = root + perp * w * aSide.x + bend;
  float y = terrain(root) + t * h * (1.0 - 0.35 * min(1.0, length(bend) / max(h, 0.01)));
  vec4 mvPosition = modelViewMatrix * vec4(xz.x, y, xz.y, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float shade = 0.8 + 0.32 * h12(cell * 2.1 + br);
  vec3 col = mix(uBase, uTip, t) * shade;
  col *= mix(0.6, 1.0, smoothstep(0.0, 0.55, t));
  col = mix(col, uCutTip, smoothstep(0.1, 0.6, m.r) * t);
  if (uHasPattern > 0.5) {
    float p = texture2D(uPattern, uv).r;
    col = mix(col * 0.82, mix(col, vec3(1.0, 0.95, 0.55), 0.45 * t), p);
  }
  if (uMissed > 0.0 && m.b > 0.9) col = mix(col, vec3(1.0, 0.1, 0.35), uMissed * (0.75 + 0.2 * sin(uTime * 6.0)) * (0.4 + 0.6 * t));
  vCol = col * uLight;
  #include <fog_vertex>
}`;

const frag = `
varying vec3 vCol;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(vCol, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function bladeGeometry(blades, bend) {
  const pos = [], side = [], idx = [];
  let v = 0;
  for (let b = 0; b < blades; b++) {
    const ox = (Math.random() - 0.5) * 0.7, oz = (Math.random() - 0.5) * 0.7, r = (b + 0.5) / blades;
    if (bend) {
      const verts = [[-1, 0], [1, 0], [-1, 0.5], [1, 0.5], [0, 1]];
      for (const [s, t] of verts) { pos.push(ox, t, oz); side.push(s * (t === 0.5 ? 0.62 : 1), r); }
      idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3, v + 2, v + 3, v + 4);
      v += 5;
    } else {
      for (const [s, t] of [[-1, 0], [1, 0], [0, 1]]) { pos.push(ox, t, oz); side.push(s, r); }
      idx.push(v, v + 1, v + 2);
      v += 3;
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 2));
  g.setIndex(idx);
  return g;
}

export class Grass {
  constructor(sky) {
    this.sky = sky;
    this.mesh = null;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uN: { value: 100 }, uSp: { value: 0.2 }, uR: { value: 15 }, uTime: { value: 0 }, uBladeH: { value: 0.32 }, uWind: { value: 1 },
      uHasPattern: { value: 0 }, uMissed: { value: 0 },
      uCenter: { value: new THREE.Vector2() }, uCam: { value: new THREE.Vector2() },
      uOrigin: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2(1, 1) }, uTilt: { value: new THREE.Vector2() },
      uHills: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4(0, 0, 1, 0)) }, uHillCount: { value: 0 },
      uMower: { value: new THREE.Vector3(9999, 9999, 0.5) },
      uBase: { value: new THREE.Color('#2f7d22') }, uTip: { value: new THREE.Color('#8fe05a') }, uCutTip: { value: new THREE.Color('#b9ee7a') },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uMask: { value: null }, uPattern: { value: null },
    }]);
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, fog: true, side: THREE.DoubleSide });
  }

  // preset = { grassR, spacing, blades, bend }
  build(preset, level, ground) {
    if (this.mesh) { this.mesh.geometry.dispose(); }
    const N = Math.ceil((preset.grassR * 2) / preset.spacing);
    const geo = bladeGeometry(preset.blades, preset.bend);
    geo.instanceCount = N * N;
    const u = this.uniforms;
    u.uN.value = N; u.uSp.value = preset.spacing; u.uR.value = preset.grassR;
    const g = ground.grid;
    u.uOrigin.value.set(g.x0, g.z0); u.uSize.value.set(g.nx * g.cs, g.nz * g.cs);
    u.uTilt.value.set(...(level.tilt || [0, 0]));
    const hills = level.hills || [];
    u.uHillCount.value = Math.min(6, hills.length);
    hills.slice(0, 6).forEach((k, i) => u.uHills.value[i].set(k.x, k.z, k.r, k.h));
    u.uMask.value = ground.maskTex;
    u.uPattern.value = ground.patternTex;
    if (!this.mesh) {
      this.mesh = new THREE.Mesh(geo, this.material);
      this.mesh.frustumCulled = false;
      this.mesh.matrixAutoUpdate = false;
    } else this.mesh.geometry = geo;
    return this.mesh;
  }

  // camPos = camera position, look = point the camera looks at
  update(time, camPos, look, mower) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uCam.value.set(camPos.x, camPos.z);
    // centre the blade patch ahead of the camera so few blades are wasted behind it
    const dx = look.x - camPos.x, dz = look.z - camPos.z, l = Math.hypot(dx, dz) || 1;
    const ahead = u.uR.value * 0.55 * Math.min(1, l / 6); // looking straight down: keep it centred
    u.uCenter.value.set(camPos.x + (dx / l) * ahead, camPos.z + (dz / l) * ahead);
    if (mower) u.uMower.value.set(mower.x, mower.z, mower.r);
    const L = this.sky.light;
    u.uLight.value.copy(L.amb).add(new THREE.Color().copy(L.sun).multiplyScalar(0.75));
    u.uWind.value = L.wind;
  }

  setPattern(ground) { this.uniforms.uPattern.value = ground.patternTex; this.uniforms.uHasPattern.value = ground.uniforms.uHasPattern.value; }
}
