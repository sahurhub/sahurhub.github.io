// Driver Online USA - sky, sun and weather (Sunny, Cloudy, Rain, Storm, Fog, Snow, Dynamic).
// The time of day never changes (golden hour). Weather only changes how things look: it does
// not change tyre grip (the user's choice). The room's weather comes from the server as
// { from, to, t0, t1 } in server time, so everyone blends at the same moment.
import * as THREE from 'three';
import { loadTexture, loadJSON } from '../core/assets.js';
import { asset } from '../config.js';
import { weatherUniforms } from './weather-mat.js';
import { clamp, smoothstep, damp } from '../core/util.js';

export const WX = {
  sunny:  { sky: 'sunny',    sun: 3.0, hemi: 0.55, fog: 0.00055, fogColor: 0xd9b48c, rain: 0, snow: 0, wet: 0,    dark: false, skyTint: 1.0, shadow: 1 },
  cloudy: { sky: 'cloudy',   sun: 1.5, hemi: 0.75, fog: 0.0009,  fogColor: 0xb9a99a, rain: 0, snow: 0, wet: 0,    dark: false, skyTint: 0.95, shadow: 0.55 },
  rain:   { sky: 'overcast', sun: 0.2, hemi: 0.7,  fog: 0.0024,  fogColor: 0x7d8288, rain: 0.65, snow: 0, wet: 1, dark: true,  skyTint: 0.8, shadow: 0 },
  storm:  { sky: 'storm',    sun: 0.1, hemi: 0.42, fog: 0.0032,  fogColor: 0x4a4f57, rain: 1, snow: 0, wet: 1,    dark: true,  skyTint: 0.6, shadow: 0 },
  fog:    { sky: 'overcast', sun: 0.25, hemi: 0.75, fog: 0.016,  fogColor: 0xa3a7ab, rain: 0, snow: 0, wet: 0.25, dark: true,  skyTint: 0.9, shadow: 0 },
  snow:   { sky: 'overcast', sun: 0.35, hemi: 0.9, fog: 0.0045,  fogColor: 0xc9cfd8, rain: 0, snow: 1, wet: 0.2,  dark: true,  skyTint: 1.05, shadow: 0.15 },
};
const NUMERIC = ['sun', 'hemi', 'fog', 'rain', 'snow', 'wet', 'skyTint', 'shadow'];

const SKY_VS = `varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
uniform sampler2D tA, tB; uniform float uMix, uTint, uFlash, uRot; uniform vec3 uFogColor; uniform float uHaze;
varying vec3 vDir;
vec2 eq(vec3 d) { d = normalize(d); float a = atan(d.z, d.x) + uRot; return vec2(a / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5); }
void main() {
  vec2 uv = eq(vDir);
  // where the panorama wraps round (u jumps from 1 to 0) the screen-space slope of u is huge, so the
  // GPU would pick the blurriest mip level and draw a thin line in the sky: take the slope from a
  // copy of u shifted by half a turn instead (no jump there) wherever it is the smaller one
  vec2 uv2 = vec2(fract(uv.x + 0.5), uv.y);
  vec2 gx = dFdx(uv), gy = dFdy(uv), gx2 = dFdx(uv2), gy2 = dFdy(uv2);
  if (abs(gx2.x) < abs(gx.x)) gx.x = gx2.x;
  if (abs(gy2.x) < abs(gy.x)) gy.x = gy2.x;
  vec3 c = mix(textureGrad(tA, uv, gx, gy).rgb, textureGrad(tB, uv, gx, gy).rgb, uMix) * uTint;
  float h = normalize(vDir).y;
  c = mix(c, uFogColor, uHaze * (1.0 - smoothstep(-0.05, 0.35, h)));
  c += vec3(0.75, 0.8, 0.95) * uFlash;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export class Weather {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.textures = {};
    this.state = { from: 'sunny', to: 'sunny', t0: 0, t1: 0 };
    this.cur = { ...WX.sunny };
    this.name = 'sunny';
    this.flash = 0; this.nextFlash = 8;
    this.onThunder = null;
    this.wet = 0; this.snowCover = 0;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envFor = null;

    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, depthWrite: false, side: THREE.BackSide,
      uniforms: { tA: { value: null }, tB: { value: null }, uMix: { value: 0 }, uTint: { value: 1 }, uFlash: { value: 0 }, uRot: { value: 0 }, uFogColor: { value: new THREE.Color() }, uHaze: { value: 0 } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // lights: low warm sun (golden hour) and sky light
    this.sunDir = new THREE.Vector3(-0.55, 0.22, -0.8).normalize();
    this.sun = new THREE.DirectionalLight(0xffc48a, 3);
    this.sun.castShadow = quality.shadows;
    const sm = quality.shadowSize || 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd2ff, 0x5b4a3a, 0.6);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xd9b48c, 0.0006);

    // rain and snow around the camera
    this.makeParticles();
  }

  async load() {
    try {
      const info = await loadJSON(asset('sky/sky.json'));
      if (info.sunDir) this.sunDir.fromArray(info.sunDir).normalize();
      if (info.rot !== undefined) this.skyMat.uniforms.uRot.value = info.rot;
      this.skyInfo = info;
    } catch (e) { /* defaults */ }
    await this.ensureSky('sunny');
    this.apply(true);
  }

  ensureSky(name) {
    if (!this.skyLoads) this.skyLoads = {};
    if (!this.skyLoads[name]) {
      this.skyLoads[name] = loadTexture(asset(`sky/${name}.webp`))
        .then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; this.textures[name] = t; return t; })
        .catch(() => { const t = fallbackSky(name); this.textures[name] = t; return t; });
    }
    return this.skyLoads[name];
  }

  /** From the server: { from, to, t0, t1 } (server ms). */
  setState(st) {
    this.state = { from: st.from, to: st.to, t0: st.t0, t1: st.t1 };
    this.ensureSky(WX[st.from].sky);
    this.ensureSky(WX[st.to].sky);
  }

  /** Weather as it looks right now (for the HUD and players panel). */
  current(serverMs) { const s = this.state; return serverMs >= s.t1 ? s.to : s.from; }
  isDark() { return this.cur.dark; }

  makeParticles() {
    const q = this.quality.particles ?? 1;
    // rain: falling streaks drawn as lines, moved on the graphics card
    const nRain = Math.round(4000 * q);
    const pos = new Float32Array(nRain * 6), seed = new Float32Array(nRain * 2);
    for (let i = 0; i < nRain; i++) {
      const x = Math.random() * 60 - 30, y = Math.random() * 30, z = Math.random() * 60 - 30;
      pos.set([x, y, z, x, y, z], i * 6);
      seed[i * 2] = 0; seed[i * 2 + 1] = 1;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('end', new THREE.BufferAttribute(seed, 1));
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmt: { value: 0 }, uWind: { value: new THREE.Vector2(2, 1) } },
      vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uAmt; uniform vec2 uWind; attribute float end; varying float vA;
        void main() {
          vec3 p = position;
          float fall = 22.0;
          p.y = mod(p.y - uTime * fall, 30.0);
          p.xz += uWind * (30.0 - p.y) * 0.05;
          vec3 w = vec3(mod(p.x - uCam.x + 30.0, 60.0) - 30.0 + uCam.x, p.y + uCam.y - 12.0, mod(p.z - uCam.z + 30.0, 60.0) - 30.0 + uCam.z);
          w += end * vec3(uWind.x * 0.03, -0.6, uWind.y * 0.03);
          vA = step(fract(position.x * 7.13 + position.z * 3.7), uAmt) * 0.32;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `varying float vA; void main() { if (vA <= 0.0) discard; gl_FragColor = vec4(0.75, 0.8, 0.88, vA); }`,
    });
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false; this.rain.visible = false;
    this.scene.add(this.rain);
    // snow: soft dots that drift down and sway
    const nSnow = Math.round(3500 * q);
    const sp = new Float32Array(nSnow * 3);
    for (let i = 0; i < nSnow; i++) sp.set([Math.random() * 60 - 30, Math.random() * 30, Math.random() * 60 - 30], i * 3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmt: { value: 0 }, uScale: { value: 300 } },
      vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uAmt; uniform float uScale; varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * 1.6, 30.0);
          p.x += sin(uTime * 0.8 + position.z) * 0.8; p.z += cos(uTime * 0.6 + position.x) * 0.8;
          vec3 w = vec3(mod(p.x - uCam.x + 30.0, 60.0) - 30.0 + uCam.x, p.y + uCam.y - 12.0, mod(p.z - uCam.z + 30.0, 60.0) - 30.0 + uCam.z);
          vA = step(fract(position.x * 5.31 + position.z * 2.9), uAmt);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_PointSize = uScale * 0.06 / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main() { if (vA <= 0.0) discard; vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)); gl_FragColor = vec4(1.0, 1.0, 1.0, a * 0.9); }`,
    });
    this.snow = new THREE.Points(sg, this.snowMat);
    this.snow.frustumCulled = false; this.snow.visible = false;
    this.scene.add(this.snow);
  }

  setQuality(quality) {
    this.quality = quality;
    this.sun.castShadow = quality.shadows;
    const sm = quality.shadowSize || 2048;
    if (this.sun.shadow.mapSize.x !== sm) { this.sun.shadow.mapSize.set(sm, sm); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.scene.remove(this.rain); this.scene.remove(this.snow);
    this.rain.geometry.dispose(); this.snow.geometry.dispose();
    this.makeParticles();
  }

  apply(instant) { void instant; }

  update(dt, serverMs, camPos, focus) {
    const s = this.state;
    const A = WX[s.from] || WX.sunny, B = WX[s.to] || WX.sunny;
    const k = s.t1 > s.t0 ? smoothstep(s.t0, s.t1, serverMs) : 1;
    for (const n of NUMERIC) this.cur[n] = A[n] + (B[n] - A[n]) * k;
    this.cur.dark = k < 0.5 ? A.dark : B.dark;
    this.name = k < 0.5 ? s.from : s.to;
    const fogC = new THREE.Color(A.fogColor).lerp(new THREE.Color(B.fogColor), k);

    // sky textures
    const ta = this.textures[A.sky], tb = this.textures[B.sky];
    const u = this.skyMat.uniforms;
    if (ta || tb) { u.tA.value = ta || tb; u.tB.value = tb || ta; u.uMix.value = A.sky === B.sky ? 0 : k; }
    u.uTint.value = this.cur.skyTint;
    u.uFogColor.value.copy(fogC);
    u.uHaze.value = clamp(this.cur.fog * 60, 0, 1);
    this.sky.position.copy(camPos);

    // environment reflections follow the main sky texture
    const envKey = (k < 0.5 ? A.sky : B.sky);
    if (this.envFor !== envKey && this.textures[envKey]) {
      if (this.scene.environment) this.scene.environment.dispose();
      this.scene.environment = this.pmrem.fromEquirectangular(this.textures[envKey]).texture;
      this.envFor = envKey;
    }
    this.scene.environmentIntensity = 0.55 * this.cur.skyTint + 0.15;

    // lightning in storms
    if (B.rain >= 1 && k > 0.6) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.flash = 1; this.nextFlash = 6 + Math.random() * 16;
        const delay = 0.6 + Math.random() * 3;
        if (this.onThunder) setTimeout(() => this.onThunder(delay), delay * 1000);
      }
    }
    this.flash = Math.max(0, this.flash - dt * (this.flash > 0.5 ? 6 : 2.5));
    const flick = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(serverMs * 0.05)) : 0;
    u.uFlash.value = flick * 0.8;

    // lights and fog
    this.sun.intensity = this.cur.sun;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 200);
    this.sun.target.position.copy(focus);
    this.sun.castShadow = this.quality.shadows && this.cur.shadow > 0.05;
    this.sun.shadow.intensity = clamp(this.cur.shadow, 0, 1);
    this.hemi.intensity = this.cur.hemi + flick * 1.6;
    this.scene.fog.color.copy(fogC);
    this.scene.fog.density = this.cur.fog;

    // wet roads dry slowly; snow builds up over about 40 s
    this.wet = damp(this.wet, this.cur.wet, this.cur.wet > this.wet ? 0.25 : 0.05, dt);
    this.snowCover = damp(this.snowCover, this.cur.snow, this.cur.snow > this.snowCover ? 0.06 : 0.04, dt);
    weatherUniforms.uWet.value = this.wet;
    weatherUniforms.uSnow.value = this.snowCover;

    // particles
    const t = serverMs / 1000;
    this.rain.visible = this.cur.rain > 0.02 && (this.quality.particles ?? 1) > 0;
    this.snow.visible = this.cur.snow > 0.02 && (this.quality.particles ?? 1) > 0;
    this.rainMat.uniforms.uTime.value = t; this.rainMat.uniforms.uCam.value.copy(camPos); this.rainMat.uniforms.uAmt.value = this.cur.rain;
    this.snowMat.uniforms.uTime.value = t; this.snowMat.uniforms.uCam.value.copy(camPos); this.snowMat.uniforms.uAmt.value = this.cur.snow;
    this.snowMat.uniforms.uScale.value = this.renderer.domElement.height;
  }
}

/** If a sky picture is missing: a simple gradient so the game still works. */
function fallbackSky(name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  const top = { sunny: '#6f8fc9', cloudy: '#8a97ad', overcast: '#9aa0a8', storm: '#4b5059' }[name] || '#7f95b8';
  const mid = { sunny: '#f0b27a', cloudy: '#d8b493', overcast: '#b6b9bd', storm: '#666b73' }[name] || '#e7c9a0';
  grd.addColorStop(0, top); grd.addColorStop(0.48, mid); grd.addColorStop(0.52, '#6b6155'); grd.addColorStop(1, '#3b352e');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
