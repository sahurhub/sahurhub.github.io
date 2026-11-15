// TURBO TOWN - renderer, scene, lights and graphics quality.
import * as THREE from 'three';

export const QUALITY = {
  low: { pixel: 0.75, shadows: false, particles: 0.4, view: 380, antialias: false, toon: false, detail: 0.5 },
  medium: { pixel: 1.0, shadows: false, particles: 0.75, view: 560, antialias: false, toon: true, detail: 0.8 },
  high: { pixel: 1.0, shadows: true, particles: 1.0, view: 800, antialias: true, toon: true, detail: 1.0 },
};

// Pixel look: the game draws a small picture this many pixels tall and blows it up with
// sharp square pixels (retro 8-bit style, and much less work for weak computers).
export const PIXEL_LOOK = { chunky: 300, retro: 420, smooth: 0 };

export class Renderer {
  constructor(container, settings) {
    this.settings = settings;
    const q = QUALITY[settings.quality] || QUALITY.medium;
    // smoothing edges would blur the pixels, so it is only used with the smooth look
    const aa = q.antialias && (settings.pixel || 'retro') === 'smooth';
    this.renderer = new THREE.WebGLRenderer({ antialias: aa, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.3, 900);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xdff4ff, 0x8fd16a, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3d6, 1.55);
    this.sun.position.set(80, 140, 60);
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.applySettings(settings);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  get quality() { return QUALITY[this.settings.quality] || QUALITY.medium; }

  applySettings(settings) {
    this.settings = settings;
    const q = this.quality;
    this.pixelRatio();
    const shadows = settings.shadows === 'auto' ? q.shadows : settings.shadows === 'on';
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    this.viewDistance = settings.view === 'auto' ? q.view : Number(settings.view) || q.view;
    this.camera.far = this.viewDistance + 200;
    this.camera.updateProjectionMatrix();
    if (this.scene.fog) this.setFog(this.fogColor, this.fogNear);
    this.resize();
  }

  setFog(color, near) {
    this.fogColor = color; this.fogNear = near;
    this.scene.fog = new THREE.Fog(color, Math.min(near, this.viewDistance * 0.4), this.viewDistance);
  }

  // keep the shadow camera around the player kart
  follow(x, y, z) {
    if (!this.sun.castShadow) return;
    this.sun.position.set(x + 50, y + 110, z + 35);
    this.sun.target.position.set(x, y, z);
  }

  // drawing resolution: full (smooth look) or a whole number of screen pixels per game pixel
  pixelRatio() {
    const s = this.settings, q = this.quality;
    const dpr = devicePixelRatio || 1;
    const target = PIXEL_LOOK[s.pixel || 'retro'] ?? PIXEL_LOOK.retro;
    let ratio;
    if (target) {
      const tall = innerHeight * dpr;
      const n = Math.max(1, Math.round(tall / (target * (q.pixel < 1 ? 0.85 : 1))));
      ratio = dpr / n;
    } else ratio = Math.min(dpr, 2) * q.pixel * ((s.resolution || 100) / 100);
    this.canvas.classList.toggle('pixel', !!target);
    if (Math.abs(this.renderer.getPixelRatio() - ratio) > 1e-4) this.renderer.setPixelRatio(ratio);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.pixelRatio();
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    // wide screens see more; tall (phone) screens get a wider vertical FOV
    this.baseFov = w / h < 1 ? 80 : 68;
    this.camera.updateProjectionMatrix();
  }

  render() { this.renderer.render(this.scene, this.camera); }

  info() { return this.renderer.info.render; }
}
