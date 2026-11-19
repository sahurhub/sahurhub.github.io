// UK Simulator - sky, sun and moon, time of day, fog, rain and wet roads.
// The sun follows its real path over Leighton Buzzard (latitude 51.92 N) for today's date.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const LAT = 51.92 * Math.PI / 180;

export class Weather {
  constructor(renderer, scene, quality) {
    this.renderer = renderer; this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(400000);
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.82;
    this.sun = new THREE.DirectionalLight(0xfff2e0, 3);
    this.sun.castShadow = true;
    const sm = quality === 'low' ? 1024 : quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 900;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd2ee, 0x5d5a48, 1.0);
    scene.add(this.hemi);
    this.fog = new THREE.Fog(0xc8d4de, 400, 1500);
    scene.fog = this.fog;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(1000); this.envScene.add(this.envSky);
    this.envTimer = 0;
    this.hour = 12.5;
    this.timeScale = 30;          // game seconds per real second (24 h = 48 min)
    this.mode = 'cycle';          // 'cycle' | 'real' | 'fixed'
    this.rain = 0; this.rainTarget = 0; this.wet = 0;
    this.day = dayOfYear(new Date());
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.night = 0;
    this.rainMesh = makeRain();
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);
    this.lastEnvHour = -10;
  }

  setHour(h) { this.hour = ((h % 24) + 24) % 24; this.lastEnvHour = -10; }

  update(dt, focus) {
    if (this.mode === 'cycle') this.hour = (this.hour + dt * this.timeScale / 3600) % 24;
    else if (this.mode === 'real') { const d = new Date(); this.hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
    // sun position (solar time is close enough to clock time here, near 0 degrees longitude)
    const decl = -23.44 * Math.PI / 180 * Math.cos(2 * Math.PI * (this.day + 10) / 365);
    const ha = (this.hour - 12) * 15 * Math.PI / 180;
    const el = Math.asin(Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(ha));
    const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(LAT) - Math.tan(decl) * Math.cos(LAT)); // from south, west positive
    // world: x east, z south, y up. azimuth from south towards west
    this.sunDir.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    this.elevation = el;
    const day = THREE.MathUtils.smoothstep(el, -0.1, 0.08);
    this.night = 1 - THREE.MathUtils.smoothstep(el, -0.12, 0.02);
    // rain comes and goes slowly
    this.rain += (this.rainTarget - this.rain) * Math.min(1, dt * 0.05);
    this.wet = Math.max(this.rain > 0.1 ? Math.min(1, this.wet + dt * 0.01) : this.wet - dt * 0.002, 0);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.turbidity.value = 4 + this.rain * 14;
    u.rayleigh.value = 1.2 + this.rain * 2.5;
    const low = THREE.MathUtils.smoothstep(el, 0, 0.35);
    this.sun.color.setRGB(1, 0.72 + 0.26 * low, 0.5 + 0.45 * low);
    // moonlight at night (from the opposite side of the sky)
    const moon = this.night > 0.5;
    const ld = moon ? new THREE.Vector3(-this.sunDir.x, Math.abs(this.sunDir.y) * 0.6 + 0.4, -this.sunDir.z).normalize() : this.sunDir;
    this.sun.intensity = moon ? 0.12 : (3.0 * day) * (1 - this.rain * 0.7);
    if (moon) this.sun.color.setRGB(0.6, 0.7, 1.0);
    this.hemi.intensity = 0.28 + 0.73 * day * (1 - this.rain * 0.35) + this.rain * 0.12 * day;
    this.hemi.color.setRGB(0.72 - 0.2 * this.rain, 0.82 - 0.15 * this.rain, 0.95 - 0.1 * this.rain);
    const fogDay = new THREE.Color().setRGB(0.76 - 0.12 * this.rain, 0.82 - 0.12 * this.rain, 0.88 - 0.1 * this.rain);
    const fogNight = new THREE.Color(0.03, 0.04, 0.06);
    const dusk = new THREE.Color(0.85, 0.6, 0.45);
    const fc = fogDay.clone().lerp(dusk, (1 - low) * day * 0.5).lerp(fogNight, this.night);
    this.fog.color.copy(fc);
    this.fog.near = 250 - this.rain * 150;
    this.fog.far = (this.farLimit || 1500) * (1 - this.rain * 0.45);
    this.renderer.toneMappingExposure = 0.55 + 0.25 * day + this.night * 0.35;
    if (focus) {
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).addScaledVector(ld, 400);
      // snap the shadow camera to texels so shadows do not shimmer when moving
      const sc = this.sun.shadow.camera;
      const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
      this.sun.target.position.x = Math.round(focus.x / texel) * texel;
      this.sun.target.position.z = Math.round(focus.z / texel) * texel;
      this.sun.position.copy(this.sun.target.position).addScaledVector(ld, 400);
      // rain follows the camera
      this.rainMesh.position.copy(focus);
    }
    this.rainMesh.visible = this.rain > 0.05;
    if (this.rainMesh.visible) { this.rainMesh.material.opacity = 0.35 * this.rain; this.rainMesh.material.uniforms && (this.rainMesh.material.uniforms.uTime.value += dt); }
    // reflections: re-render the sky into an environment map now and then
    this.envTimer -= dt;
    if (this.envTimer <= 0 && Math.abs(this.hour - this.lastEnvHour) > 0.15) {
      this.envTimer = 2;
      this.lastEnvHour = this.hour;
      const e = this.envSky.material.uniforms;
      e.sunPosition.value.copy(this.sunDir); e.turbidity.value = u.turbidity.value; e.rayleigh.value = u.rayleigh.value; e.mieCoefficient.value = u.mieCoefficient.value;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.25 + 0.75 * day;
      this.horizon = this.sampleHorizon();
    }
    // fog the same colour as the sky at the horizon, so the far land fades into the sky
    if (this.horizon && this.night < 0.5) {
      const h = this.horizon, k = 1 - this.rain * 0.5;
      this.fog.color.setRGB(h[0] * k + 0.55 * (1 - k) * h[0], h[1] * k + 0.55 * (1 - k) * h[1], h[2] * k + 0.6 * (1 - k) * h[2]);
    }
    // after dusk: plain dark blue night sky instead of the daylight sky model
    this.sky.visible = this.night < 0.85;
    if (!this.sky.visible) { this.scene.background = this.nightColour || (this.nightColour = new THREE.Color(0.006, 0.009, 0.022)); this.fog.color.copy(this.scene.background); }
    else this.scene.background = null;
  }

  // average colour of the sky just above the horizon, looking away from the sun (linear values)
  sampleHorizon() {
    if (!this.hrt) { this.hrt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.FloatType }); this.hcam = new THREE.PerspectiveCamera(30, 1, 1, 4000); this.hbuf = new Float32Array(8 * 8 * 4); }
    const az = Math.atan2(this.sunDir.x, this.sunDir.z) + Math.PI * 0.6;
    this.hcam.position.set(0, 0, 0);
    this.hcam.lookAt(Math.sin(az) * 100, 3, Math.cos(az) * 100);
    const r = this.renderer, prev = r.getRenderTarget(), tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this.hrt); r.render(this.envScene, this.hcam); r.setRenderTarget(prev);
    r.toneMapping = tm;
    r.readRenderTargetPixels(this.hrt, 0, 0, 8, 8, this.hbuf);
    const s = [0, 0, 0];
    // rows 4-5 of 8 (pixel rows count from the bottom) are just above the horizon
    for (let i = 32; i < 48; i++) for (let c = 0; c < 3; c++) s[c] += this.hbuf[i * 4 + c];
    return s.map((v) => Math.max(0, Math.min(4, v / 16)));
  }

  clock() { const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
}

function dayOfYear(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }

function makeRain() {
  const n = 6000, pos = new Float32Array(n * 6);
  for (let k = 0; k < n; k++) {
    const x = (Math.random() - 0.5) * 80, y = Math.random() * 40, z = (Math.random() - 0.5) * 80;
    pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.03], k * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, opacity: { value: 0.3 } },
    vertexShader: 'uniform float uTime; void main(){ vec3 p = position; p.y = mod(p.y - uTime * 22.0, 40.0) - 12.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'uniform float opacity; void main(){ gl_FragColor = vec4(0.75, 0.8, 0.88, opacity); }',
  });
  Object.defineProperty(m, 'opacity', { get() { return this.uniforms.opacity.value; }, set(v) { if (this.uniforms) this.uniforms.opacity.value = v; } });
  const mesh = new THREE.LineSegments(g, m);
  mesh.frustumCulled = false;
  mesh.name = 'rain';
  return mesh;
}

// far landscape around and beyond the play area (8 m LiDAR, shown at 24 m detail)
export async function makeFar(base, man) {
  const res = await fetch(base + 'data/far.bin.gz');
  const buf = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const dv = new DataView(buf);
  const n = man.far.n, hb = dv.getFloat32(4, true);
  const deltas = new Int16Array(buf, 8, n * n);
  const h = new Float32Array(n * n);
  let cm = 0, first = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const i = r * n + c;
    if (c === 0) { first = (r > 0 ? first : 0) + deltas[i]; cm = first; } else cm += deltas[i];
    h[i] = hb + cm / 100;
  }
  const step = 3, m = Math.floor((n - 1) / step) + 1, s = man.far.s;
  const pos = new Float32Array(m * m * 3), col = new Float32Array(m * m * 3);
  const a = man.area;
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) {
    const x = man.far.x0 + c * step * s, z = man.far.z0 + r * step * s;
    let y = h[Math.min(n - 1, r * step) * n + Math.min(n - 1, c * step)];
    // sink it under the detailed town so the two never fight
    if (x > a.x0 - 30 && x < a.x1 + 30 && z > a.z0 - 30 && z < a.z1 + 30) y -= 6;
    const k = r * m + c;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    // fields patchwork
    const f = Math.sin(Math.floor(x / 220) * 12.9898 + Math.floor(z / 180) * 78.233) * 43758.5453;
    const t = f - Math.floor(f);
    const g = t < 0.4 ? [0.36, 0.45, 0.24] : t < 0.7 ? [0.42, 0.48, 0.27] : t < 0.85 ? [0.45, 0.38, 0.28] : [0.28, 0.38, 0.22];
    const v = 0.9 + rnd() * 0.15;
    col[k * 3] = g[0] * v; col[k * 3 + 1] = g[1] * v; col[k * 3 + 2] = g[2] * v;
  }
  const idx = [];
  for (let r = 0; r < m - 1; r++) for (let c = 0; c < m - 1; c++) { const p0 = r * m + c, p1 = p0 + 1, p2 = p0 + m, p3 = p2 + 1; idx.push(p0, p3, p1, p0, p2, p3); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = false;
  mesh.name = 'far land';
  const far = (x, z) => {
    const c = (x - man.far.x0) / s, r = (z - man.far.z0) / s;
    const ci = Math.max(0, Math.min(n - 2, Math.floor(c))), ri = Math.max(0, Math.min(n - 2, Math.floor(r)));
    const tx = Math.max(0, Math.min(1, c - ci)), tz = Math.max(0, Math.min(1, r - ri));
    return (h[ri * n + ci] * (1 - tx) + h[ri * n + ci + 1] * tx) * (1 - tz) + (h[(ri + 1) * n + ci] * (1 - tx) + h[(ri + 1) * n + ci + 1] * tx) * tz;
  };
  return { mesh, heightAt: far };
}
