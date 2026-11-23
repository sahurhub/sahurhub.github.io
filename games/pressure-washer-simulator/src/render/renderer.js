// WebGL renderer, the world scene + camera, the in-hand "view" scene, and the Low / Medium / High presets.
import * as THREE from 'three';
import { settings, saveSettings } from '../core/store.js';
import { FLAGS } from '../config.js';

// dpr = max device pixel ratio used, scale = render scale, particles = spray particle pool size
export const PRESETS = {
  low: { name: 'Low', dpr: 1, scale: 0.8, shadows: false, shadowSize: 1024, particles: 220, aniso: 1, uploads: 2 },
  medium: { name: 'Medium', dpr: 1.25, scale: 1, shadows: true, shadowSize: 1024, particles: 420, aniso: 2, uploads: 3 },
  high: { name: 'High', dpr: 2, scale: 1, shadows: true, shadowSize: 2048, particles: 700, aniso: 4, uploads: 4 },
};

// A first guess before we can measure the frame rate.
export function guessPreset() {
  if (FLAGS.quality && PRESETS[FLAGS.quality]) return FLAGS.quality;
  if (settings.quality !== 'auto' && PRESETS[settings.quality]) return settings.quality;
  if (settings.autoPreset && PRESETS[settings.autoPreset]) return settings.autoPreset;
  const ua = navigator.userAgent;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (/CrOS/.test(ua) || cores <= 4 || mem <= 4 || /Android|iPhone|iPad/.test(ua)) return 'low';
  return 'medium';
}

export class Renderer {
  constructor(canvas) {
    this.presetName = guessPreset();
    this.preset = PRESETS[this.presetName];
    let r;
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: this.presetName === 'high', powerPreference: 'high-performance', stencil: false, depth: true });
    } catch (e) {
      r = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false });
    }
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.setClearColor(0x9fd6ff, 1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false; // the world is static: shadows are drawn once per job (see Env.refreshShadow)
    r.autoClear = false;
    r.info.autoReset = false;
    this.r = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / Math.max(1, innerHeight), 0.06, 420);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    // the washer in your hands is drawn in its own little scene after clearing depth, so it never
    // pokes into walls
    this.view = new THREE.Scene();
    this.viewCam = new THREE.PerspectiveCamera(70, this.camera.aspect, 0.01, 10);
    this.showView = false;
    this.listeners = [];
    this.applySize();
    this.onResize = () => this.applySize();
    addEventListener('resize', this.onResize);
  }

  onPresetChange(fn) { this.listeners.push(fn); }

  shadowsOn() {
    if (settings.shadows === 'on') return true;
    if (settings.shadows === 'off') return false;
    return this.preset.shadows;
  }

  setPreset(name, fromAuto = false) {
    if (!PRESETS[name]) return;
    const changed = name !== this.presetName;
    this.presetName = name;
    this.preset = PRESETS[name];
    if (fromAuto) { settings.autoPreset = name; saveSettings(); }
    this.applySize();
    if (changed) for (const fn of this.listeners) fn(this.preset, name);
  }

  pixelRatio() {
    const auto = settings.quality === 'auto' ? (settings.autoScale || 1) : 1;
    return Math.min(window.devicePixelRatio || 1, this.preset.dpr) * this.preset.scale * auto;
  }

  applySize() {
    this.r.setPixelRatio(this.pixelRatio());
    this.r.setSize(innerWidth, innerHeight, false);
    const a = innerWidth / Math.max(1, innerHeight);
    this.camera.aspect = a; this.camera.updateProjectionMatrix();
    this.viewCam.aspect = a; this.viewCam.fov = this.camera.fov; this.viewCam.updateProjectionMatrix();
  }

  render() {
    const r = this.r;
    r.info.reset();
    r.clear();
    r.render(this.scene, this.camera);
    if (this.showView) {
      r.clearDepth();
      r.render(this.view, this.viewCam);
    }
  }

  dispose() {
    removeEventListener('resize', this.onResize);
    this.r.dispose();
    try { this.r.forceContextLoss(); } catch (e) { /* */ }
  }
}

// Watches the frame rate and lowers the quality when the device struggles ("Auto" setting).
export class FpsMonitor {
  constructor(renderer) {
    this.R = renderer;
    this.frames = 0; this.time = 0; this.fps = 60; this.ms = 16; this.slow = 0; this.warm = 0;
  }
  // dt = real seconds since last frame; active = a job is being played (only judge real gameplay)
  tick(dt, active) {
    this.frames++; this.time += dt;
    if (this.time < 0.5) return;
    this.fps = this.frames / this.time;
    this.ms = (this.time / this.frames) * 1000;
    this.frames = 0; this.time = 0;
    if (!active || settings.quality !== 'auto' || document.hidden) { this.warm = 0; return; }
    if (++this.warm < 6) return; // let things settle first
    const R = this.R;
    if (this.fps < (R.presetName === 'low' ? 26 : 44)) this.slow++; else this.slow = Math.max(0, this.slow - 1);
    if (this.slow >= 6) {
      this.slow = 0; this.warm = 0;
      if (R.presetName === 'high') R.setPreset('medium', true);
      else if (R.presetName === 'medium') R.setPreset('low', true);
      else if ((settings.autoScale || 1) > 0.62) { settings.autoScale = Math.max(0.6, (settings.autoScale || 1) - 0.12); saveSettings(); R.applySize(); }
    }
  }
}
