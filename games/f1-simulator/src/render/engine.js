// Rendering engine: WebGL renderer, sky, sun, shadows, fog and the graphics quality presets.
import * as THREE from 'three';

export const QUALITY = {
  low: { label: 'Low', pixelRatio: 0.75, antialias: false, shadows: false, shadowMap: 0, aniso: 2, trees: 0.3, crowd: 0.4, far: 2200, lodNear: 26 },
  medium: { label: 'Medium', pixelRatio: 1.0, antialias: true, shadows: true, shadowMap: 1024, aniso: 4, trees: 0.6, crowd: 0.7, far: 3200, lodNear: 42 },
  high: { label: 'High', pixelRatio: 1.0, antialias: true, shadows: true, shadowMap: 2048, aniso: 8, trees: 1.0, crowd: 1.0, far: 4500, lodNear: 65 },
  ultra: { label: 'Ultra', pixelRatio: 1.5, antialias: true, shadows: true, shadowMap: 4096, aniso: 16, trees: 1.3, crowd: 1.0, far: 6500, lodNear: 100 },
};

export class Engine {
  constructor(container, qualityName = 'medium', overrides = {}) {
    const q = { ...QUALITY[qualityName] || QUALITY.medium, ...overrides };
    this.q = q;
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * q.pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.className = 'game-canvas';
    this.renderer = renderer;
    this.maxAniso = Math.min(q.aniso, renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.12, q.far);
    this.scene.add(this.camera);

    this._sky();
    this._lights();
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  _sky() {
    const elev = THREE.MathUtils.degToRad(41), azim = THREE.MathUtils.degToRad(205);
    this.sunDir = new THREE.Vector3(Math.cos(elev) * Math.sin(azim), Math.sin(elev), Math.cos(elev) * Math.cos(azim)).normalize();
    // Clear-day sky dome: deep blue overhead fading to pale haze at the horizon, with a sun glow.
    const makeDome = (radius) => {
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
        uniforms: {
          top: { value: new THREE.Color(0x2f6fd0) }, horizon: { value: new THREE.Color(0xb7d2ee) },
          sunDir: { value: this.sunDir }, sunCol: { value: new THREE.Color(0xfff2d6) },
        },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir);
            vec3 col = mix(horizon, top, pow(max(d.y, 0.0), 0.45));
            if (d.y < 0.0) col = mix(horizon, horizon * 0.82, clamp(-d.y * 5.0, 0.0, 1.0));
            float s = max(dot(d, normalize(sunDir)), 0.0);
            col += sunCol * (pow(s, 900.0) * 2.5 + pow(s, 14.0) * 0.16);
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      });
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
      m.scale.setScalar(radius);
      m.frustumCulled = false;
      m.renderOrder = -2;
      return m;
    };
    const sky = makeDome(this.q.far * 0.95);
    this.sky = sky;
    this.scene.add(sky);
    // image-based lighting from the same sky, so paint and carbon reflect something real
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(makeDome(1000));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 24), new THREE.MeshBasicMaterial({ color: 0x3b4a34 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -8;
    envScene.add(ground);
    this.envTarget = pmrem.fromScene(envScene, 0.02);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    const haze = new THREE.Color(0xb7d2ee);
    this.scene.fog = new THREE.Fog(haze, this.q.far * 0.16, this.q.far * 0.92);
    this._clouds();
  }

  /** A ring of soft fair-weather clouds (flat sprites far away, so they cost almost nothing). */
  _clouds() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 26; k++) {
      const x = 40 + rnd() * 176, y = 50 + rnd() * 40, r = 18 + rnd() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.95, toneMapped: false });
    this.clouds = new THREE.Group();
    const R = this.q.far * 0.8;
    for (let k = 0; k < 22; k++) {
      const s = new THREE.Sprite(mat);
      const a = (k / 22) * Math.PI * 2 + rnd() * 0.25, h = R * (0.1 + rnd() * 0.28), sz = R * (0.22 + rnd() * 0.3);
      s.position.set(Math.cos(a) * R, h, Math.sin(a) * R);
      s.scale.set(sz, sz * 0.42, 1);
      this.clouds.add(s);
    }
    this.clouds.renderOrder = -1;
    this.scene.add(this.clouds);
  }

  _lights() {
    const q = this.q;
    const sun = new THREE.DirectionalLight(0xfff1dc, 3.9);
    sun.castShadow = q.shadows;
    if (q.shadows) {
      sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      const c = sun.shadow.camera;
      const R = 38;
      c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 20; c.far = 420;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.03;
      this.shadowR = R;
    }
    this.sun = sun;
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.HemisphereLight(0xbcd3ff, 0x4d5a3c, 1.0));
  }

  /** Keep the shadow area centred on a point (the player's car). */
  focus(x, z) {
    const sun = this.sun;
    let fx = x, fz = z;
    if (this.q.shadows) {
      const texel = (this.shadowR * 2) / this.q.shadowMap;
      fx = Math.round(x / texel) * texel;
      fz = Math.round(z / texel) * texel;
    }
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx + this.sunDir.x * 200, this.sunDir.y * 200, fz + this.sunDir.z * 200);
    sun.target.updateMatrixWorld();
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.clouds.position.set(this.camera.position.x, 0, this.camera.position.z);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        for (const k of ['map', 'normalMap', 'alphaMap', 'roughnessMap', 'emissiveMap']) if (m[k] && !m[k].userData.shared) m[k].dispose();
        m.dispose();
      });
    });
    if (this.envTarget) this.envTarget.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
