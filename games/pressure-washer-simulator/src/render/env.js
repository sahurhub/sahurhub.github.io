// Sky (Poly Haven HDRI turned into a small JPG), sun + sky light, fog and the one cheap shadow.
import * as THREE from 'three';

// Sun direction found from the brightest pixel of the HDRI when it was converted (tools/blender/build_textures.py).
// SKY.sunAz / sunEl are written by that script into src/render/sky-info.js.
import { SKY } from './sky-info.js';

export class Env {
  constructor(R) {
    this.R = R;
    const scene = R.scene;
    this.hemi = new THREE.HemisphereLight(new THREE.Color(SKY.skyColor), new THREE.Color(SKY.groundColor), SKY.hemi);
    this.sun = new THREE.DirectionalLight(new THREE.Color(SKY.sunColor), SKY.sun);
    const el = SKY.sunEl, az = SKY.sunAz;
    this.sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    this.sun.castShadow = false;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog(new THREE.Color(SKY.fogColor), 45, 190);
    scene.background = new THREE.Color(SKY.fogColor);
    // lights for the washer in your hands (its own scene)
    const vh = new THREE.HemisphereLight(this.hemi.color, this.hemi.groundColor, SKY.hemi);
    const vs = new THREE.DirectionalLight(this.sun.color, SKY.sun * 0.9);
    vs.position.copy(this.sunDir).multiplyScalar(5);
    R.view.add(vh, vs, vs.target);
    this.viewSun = vs;
    this.center = new THREE.Vector3();
    this.radius = 20;
    this.skyTex = null;
  }

  setSky(tex) {
    if (!tex) return;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.skyTex = tex;
    this.R.scene.background = tex;
  }

  // Fit the shadow camera around the job area (bounds = {x0, z0, x1, z1}).
  fitShadow(b) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const r = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 + 2;
    this.center.set(cx, 0, cz);
    this.radius = r;
    const s = this.sun;
    s.position.copy(this.sunDir).multiplyScalar(r + 30).add(this.center);
    s.target.position.copy(this.center);
    s.target.updateMatrixWorld();
    const c = s.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = r * 2 + 60;
    c.updateProjectionMatrix();
    this.refreshShadow();
  }

  applyQuality() {
    const on = this.R.shadowsOn();
    const size = this.R.preset.shadowSize;
    const s = this.sun;
    if (s.shadow.mapSize.x !== size) {
      s.shadow.mapSize.set(size, size);
      if (s.shadow.map) { s.shadow.map.dispose(); s.shadow.map = null; }
    }
    s.castShadow = on;
    this.refreshShadow();
  }

  refreshShadow() { this.R.r.shadowMap.needsUpdate = true; }

  dispose() {
    if (this.skyTex) this.skyTex.dispose();
    if (this.sun.shadow.map) this.sun.shadow.map.dispose();
  }
}
