// Sky dome, sun, lights, fog and drifting clouds for sunny / rain / evening.
import * as THREE from 'three';
import { modelGeo, glowUniform } from './assets.js';
import { rng, hashStr } from '../shared/rng.js';

export const LOOKS = {
  sunny: {
    zenith: '#3f9cff', horizon: '#c4e8ff', sun: [0.45, 0.82, 0.35], sunCol: '#fff4e0', sunI: 2.7,
    hemiSky: '#dcefff', hemiGround: '#86b860', hemiI: 2.1, fog: '#bfe3ff', fogMul: 1, glow: 0.2, cloud: '#ffffff', wet: 0, wind: 1,
  },
  rain: {
    zenith: '#6f7d93', horizon: '#aeb9c6', sun: [0.3, 0.9, 0.2], sunCol: '#dfe6ee', sunI: 1.1,
    hemiSky: '#c3ccd8', hemiGround: '#5f7d52', hemiI: 2.2, fog: '#a9b4c1', fogMul: 0.6, glow: 0.5, cloud: '#9aa4b2', wet: 1, wind: 1.8,
  },
  evening: {
    zenith: '#344a9a', horizon: '#ffb070', sun: [-0.75, 0.22, -0.55], sunCol: '#ffb070', sunI: 2.2,
    hemiSky: '#9a9be0', hemiGround: '#5d6b3c', hemiI: 1.45, fog: '#e6a882', fogMul: 0.85, glow: 1.0, cloud: '#ffd2b8', wet: 0.15, wind: 0.6,
  },
};

const skyVert = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = `
uniform vec3 uZenith, uHorizon, uSunDir, uSunCol;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  col = mix(col, uHorizon * 0.9, smoothstep(0.0, -0.2, d.y));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunCol * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x88aa66, 2);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xbfe3ff, 60, 170);
    this.cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color(0.25, 0.25, 0.28) });
    this.clouds = [];
    // values for custom shaders (ground, grass)
    this.light = { amb: new THREE.Color(), sun: new THREE.Color(), dir: new THREE.Vector3(), wet: 0, wind: 1 };
    this.look = LOOKS.sunny;
  }

  set(weather, fogRange) {
    const L = LOOKS[weather] || LOOKS.sunny;
    this.look = L;
    const u = this.uniforms;
    u.uZenith.value.set(L.zenith); u.uHorizon.value.set(L.horizon);
    u.uSunDir.value.set(...L.sun).normalize(); u.uSunCol.value.set(L.sunCol);
    this.hemi.color.set(L.hemiSky); this.hemi.groundColor.set(L.hemiGround); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    this.sun.position.copy(u.uSunDir.value).multiplyScalar(50);
    this.scene.fog.color.set(L.fog);
    this.scene.fog.near = fogRange[0] * L.fogMul; this.scene.fog.far = fogRange[1] * L.fogMul;
    this.cloudMat.color.set(L.cloud);
    glowUniform.value = L.glow;
    // lighting numbers for the custom shaders (same maths as three's Lambert: colour * intensity / pi)
    const sky = new THREE.Color(L.hemiSky), gr = new THREE.Color(L.hemiGround);
    this.light.amb.copy(sky).lerp(gr, 0.25).multiplyScalar(L.hemiI / Math.PI);
    this.light.sun.set(L.sunCol).multiplyScalar(L.sunI / Math.PI);
    this.light.dir.copy(u.uSunDir.value);
    this.light.wet = L.wet; this.light.wind = L.wind;
  }

  makeClouds(id, center, count = 9) {
    for (const c of this.clouds) this.scene.remove(c);
    this.clouds = [];
    const R = rng(hashStr('clouds:' + id));
    const names = ['cloud_a', 'cloud_b', 'cloud_c'];
    for (let i = 0; i < count; i++) {
      const geo = modelGeo(names[i % 3]);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, this.cloudMat);
      const a = R() * Math.PI * 2, d = 70 + R() * 110;
      m.position.set(center.x + Math.cos(a) * d, 38 + R() * 30, center.z + Math.sin(a) * d);
      m.scale.setScalar(3 + R() * 3);
      m.rotation.y = R() * Math.PI;
      m.userData.speed = 0.6 + R() * 0.8;
      this.scene.add(m);
      this.clouds.push(m);
    }
    this.cloudCenter = center;
  }

  update(dt, camPos) {
    this.dome.position.copy(camPos);
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x - this.cloudCenter.x > 190) c.position.x -= 380;
    }
  }
}
