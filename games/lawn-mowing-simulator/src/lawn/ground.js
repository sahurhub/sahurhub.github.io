// The ground: one mesh with a custom shader. It reads two textures over the level:
//   surface map (lawn / path / soil / sand / water / asphalt / patio / meadow)
//   mask (R = cut, G/A = direction the mower was going when it cut, B = grass type)
// Cut lawn is drawn in one even colour (the cut direction is still stored for the neatness score).
import * as THREE from 'three';
import { SURF } from '../shared/lawn.js';
import { heightAt } from '../shared/levels.js';

export const LAWN_COLORS = {
  uncut: new THREE.Color('#3f9e2c'), cut: new THREE.Color('#7fd651'), meadow: new THREE.Color('#57b336'),
  path: new THREE.Color('#c9c6c0'), patio: new THREE.Color('#d8c3a0'), soil: new THREE.Color('#6b4a2f'),
  sand: new THREE.Color('#ecd9a0'), water: new THREE.Color('#3aa7e8'), asphalt: new THREE.Color('#55585f'),
};

const NOISE = `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}`;

const vert = `
varying vec3 vWorld;
varying vec3 vNrm;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = `
uniform sampler2D uMask, uSurf, uPattern;
uniform vec2 uOrigin, uSize;
uniform vec3 uAmb, uSunCol, uSunDir;
uniform float uTime, uWet, uMissed, uHasPattern;
uniform vec3 cUncut, cCut, cMeadow, cPath, cPatio, cSoil, cSand, cWater, cAsphalt;
varying vec3 vWorld;
varying vec3 vNrm;
#include <fog_pars_fragment>
${NOISE}
void main() {
  vec2 uv = (vWorld.xz - uOrigin) / uSize;
  float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  vec4 m = texture2D(uMask, uv) * inside;
  float s = floor(texture2D(uSurf, uv).r * 255.0 + 0.5) * inside;
  float n1 = vnoise(vWorld.xz * 0.7), n2 = vnoise(vWorld.xz * 3.7 + 11.0), n3 = vnoise(vWorld.xz * 11.0);
  vec3 col;
  if (s < 0.5) {
    col = cMeadow * (0.84 + 0.2 * n1 + 0.08 * n2);
  } else if (s < 1.5) {
    vec3 uncut = cUncut * (0.82 + 0.16 * n1 + 0.1 * n3);
    // mowed grass is one even colour everywhere (no stripes, no blotches; user's choice 2026-11-22)
    col = mix(uncut, cCut, smoothstep(0.1, 0.9, m.r));
    if (uHasPattern > 0.5) {
      float p = texture2D(uPattern, uv).r;
      col = mix(col, col * 1.18 + vec3(0.06, 0.05, 0.0), p * (1.0 - m.r) * 0.8);
    }
    if (uMissed > 0.0 && m.b > 0.9 && m.r < 0.5) col = mix(col, vec3(1.0, 0.1, 0.35), uMissed * (0.7 + 0.2 * sin(uTime * 6.0)));
  } else if (s < 2.5) {
    vec2 t = fract(vWorld.xz * 1.1);
    float grout = step(0.05, t.x) * step(0.05, t.y);
    col = cPath * (0.88 + 0.1 * n2) * (0.8 + 0.2 * grout);
  } else if (s < 3.5) {
    col = cSoil * (0.78 + 0.3 * n3 + 0.1 * n1);
  } else if (s < 4.5) {
    col = cSand * (0.92 + 0.1 * n2);
  } else if (s < 5.5) {
    col = cWater * (0.9 + 0.12 * sin(uTime * 1.8 + (vWorld.x + vWorld.z) * 2.3) + 0.05 * n2);
  } else if (s < 6.5) {
    col = cAsphalt * (0.88 + 0.12 * n3);
  } else {
    vec2 c = floor(vWorld.xz / 0.62);
    vec2 t = fract(vWorld.xz / 0.62);
    float grout = step(0.04, t.x) * step(0.04, t.y);
    col = cPatio * (0.88 + 0.12 * hash21(c)) * (0.78 + 0.22 * grout);
  }
  float wet = uWet * (s > 1.5 && s < 7.5 && (s < 4.5 || s > 5.5) ? 1.0 : 0.6);
  col *= 1.0 - 0.22 * wet;
  vec3 n = normalize(vNrm);
  vec3 light = uAmb + uSunCol * max(dot(n, uSunDir), 0.0);
  col *= light * 1.08;
  col += wet * 0.03;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// Height used for the ground mesh: the level's own terrain inside, rolling hills outside.
export function makeTerrainFn(level) {
  const [x0, z0, x1, z1] = level.bounds;
  const sh = (a) => Math.sin(a) * 0.5 + 0.5;
  return (x, z) => {
    const h = heightAt(level, x, z);
    const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
    const d = Math.hypot(dx, dz);
    if (d < 6) return h;
    const k = Math.min(1, (d - 6) / 30);
    const hills = (sh(x * 0.045 + 1.3) * sh(z * 0.05 + 0.7) * 7 + sh(x * 0.11 + z * 0.07) * 2.2) * k * k;
    return h + hills;
  };
}

export class Ground {
  constructor(renderer, sky) {
    this.R = renderer;
    this.sky = sky;
    this.mesh = null;
  }

  build(level, grid, terrain) {
    this.dispose();
    const g = grid;
    this.grid = g;
    // textures
    this.data = new Uint8Array(g.n * 4);
    this.surfData = new Uint8Array(g.n);
    for (let k = 0; k < g.n; k++) {
      const s = g.surf[k];
      this.surfData[k] = s;
      this.data[k * 4 + 1] = 128; this.data[k * 4 + 3] = 128;
      this.data[k * 4 + 2] = g.mow[k] ? 255 : s === SURF.lawn ? 160 : s === SURF.meadow ? 100 : 0;
    }
    this.maskTex = new THREE.DataTexture(this.data, g.nx, g.nz, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.maskTex.magFilter = THREE.LinearFilter; this.maskTex.minFilter = THREE.LinearFilter;
    this.maskTex.generateMipmaps = false; this.maskTex.needsUpdate = true;
    this.surfTex = new THREE.DataTexture(this.surfData, g.nx, g.nz, THREE.RedFormat, THREE.UnsignedByteType);
    this.surfTex.magFilter = THREE.NearestFilter; this.surfTex.minFilter = THREE.NearestFilter;
    this.surfTex.generateMipmaps = false; this.surfTex.needsUpdate = true;
    this.patternTex = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
    this.patternTex.needsUpdate = true;
    this.fullUpload = true;

    // mesh: bounds + a wide margin of meadow and hills
    const M = 75;
    const [bx0, bz0, bx1, bz1] = level.bounds;
    const x0 = bx0 - M, z0 = bz0 - M, x1 = bx1 + M, z1 = bz1 + M;
    const W = x1 - x0, D = z1 - z0;
    const step = Math.max(0.9, Math.max(W, D) / 150);
    const sx = Math.ceil(W / step), sz = Math.ceil(D / step);
    const pos = new Float32Array((sx + 1) * (sz + 1) * 3);
    let o = 0;
    for (let j = 0; j <= sz; j++) for (let i = 0; i <= sx; i++) {
      const x = x0 + (i / sx) * W, z = z0 + (j / sz) * D;
      pos[o++] = x; pos[o++] = terrain(x, z); pos[o++] = z;
    }
    const idx = new Uint32Array(sx * sz * 6);
    o = 0;
    for (let j = 0; j < sz; j++) for (let i = 0; i < sx; i++) {
      const a = j * (sx + 1) + i, b = a + sx + 1, c = a + 1, d = b + 1;
      idx[o++] = a; idx[o++] = b; idx[o++] = c; idx[o++] = c; idx[o++] = b; idx[o++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const L = this.sky.light;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uMask: { value: null }, uSurf: { value: null }, uPattern: { value: null },
      uOrigin: { value: new THREE.Vector2(g.x0, g.z0) }, uSize: { value: new THREE.Vector2(g.nx * g.cs, g.nz * g.cs) },
      uAmb: { value: L.amb }, uSunCol: { value: L.sun }, uSunDir: { value: L.dir },
      uTime: { value: 0 }, uWet: { value: 0 }, uMissed: { value: 0 }, uHasPattern: { value: 0 },
      cUncut: { value: LAWN_COLORS.uncut }, cCut: { value: LAWN_COLORS.cut }, cMeadow: { value: LAWN_COLORS.meadow },
      cPath: { value: LAWN_COLORS.path }, cPatio: { value: LAWN_COLORS.patio }, cSoil: { value: LAWN_COLORS.soil },
      cSand: { value: LAWN_COLORS.sand }, cWater: { value: LAWN_COLORS.water }, cAsphalt: { value: LAWN_COLORS.asphalt },
    }]);
    // UniformsUtils.merge clones values: point the shared ones back at the live objects
    Object.assign(this.uniforms.uAmb, { value: L.amb }); Object.assign(this.uniforms.uSunCol, { value: L.sun }); Object.assign(this.uniforms.uSunDir, { value: L.dir });
    this.uniforms.uMask.value = this.maskTex; this.uniforms.uSurf.value = this.surfTex; this.uniforms.uPattern.value = this.patternTex;
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, fog: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.matrixAutoUpdate = false;
    return this.mesh;
  }

  setPattern(mask) {
    const g = this.grid;
    if (this.patternTex) this.patternTex.dispose();
    if (mask) {
      const d = new Uint8Array(g.n);
      for (let k = 0; k < g.n; k++) d[k] = mask[k] ? 255 : 0;
      this.patternTex = new THREE.DataTexture(d, g.nx, g.nz, THREE.RedFormat, THREE.UnsignedByteType);
      this.patternTex.magFilter = THREE.NearestFilter; this.patternTex.minFilter = THREE.NearestFilter;
    } else this.patternTex = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
    this.patternTex.needsUpdate = true;
    this.uniforms.uPattern.value = this.patternTex;
    this.uniforms.uHasPattern.value = mask ? 1 : 0;
  }

  // Reset every cell to uncut (new job).
  resetCut() {
    const g = this.grid;
    for (let k = 0; k < g.n; k++) { this.data[k * 4] = 0; this.data[k * 4 + 1] = 128; this.data[k * 4 + 3] = 128; }
    this.fullUpload = true;
  }

  markCut(k, h) {
    const d = this.data;
    d[k * 4] = 255;
    d[k * 4 + 1] = Math.round((Math.sin(h) * 0.5 + 0.5) * 255);
    d[k * 4 + 3] = Math.round((Math.cos(h) * 0.5 + 0.5) * 255);
  }

  // Send changed cells to the GPU (only the changed rectangle, not the whole texture).
  upload(dirty) {
    if (this.fullUpload) { this.maskTex.needsUpdate = true; this.fullUpload = false; return; }
    if (!dirty) return;
    const g = this.grid;
    const i0 = Math.max(0, dirty[0] - 1), j0 = Math.max(0, dirty[1] - 1), i1 = Math.min(g.nx - 1, dirty[2] + 1), j1 = Math.min(g.nz - 1, dirty[3] + 1);
    const r = this.R.r;
    try {
      const props = r.properties.get(this.maskTex);
      if (!props || !props.__webglTexture || props.__version !== this.maskTex.version) { this.maskTex.needsUpdate = true; return; }
      const gl = r.getContext();
      r.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, g.nx);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, i0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, j0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, i0, j0, i1 - i0 + 1, j1 - j0 + 1, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    } catch (e) {
      this.maskTex.needsUpdate = true;
    }
  }

  dispose() {
    if (!this.mesh) return;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    for (const t of [this.maskTex, this.surfTex, this.patternTex]) t && t.dispose();
    this.mesh = null;
  }
}
