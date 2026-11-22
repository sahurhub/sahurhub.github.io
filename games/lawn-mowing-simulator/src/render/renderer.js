// WebGL renderer, scene, camera and the Low / Medium / High graphics presets.
import * as THREE from 'three';
import { settings, saveSettings } from '../core/store.js';
import { FLAGS } from '../config.js';

// grassR = grass blades drawn this far from the camera; spacing = distance between tufts.
export const PRESETS = {
  low: { name: 'Low', dpr: 1, scale: 0.8, grassR: 15, spacing: 0.2, blades: 3, bend: false, clippings: 120, rain: 500, detail: 35, fog: [42, 120], maxScale: 0.8 },
  medium: { name: 'Medium', dpr: 1.25, scale: 1, grassR: 21, spacing: 0.17, blades: 3, bend: true, clippings: 260, rain: 1100, detail: 60, fog: [60, 170], maxScale: 1 },
  high: { name: 'High', dpr: 2, scale: 1, grassR: 27, spacing: 0.15, blades: 4, bend: true, clippings: 480, rain: 2200, detail: 110, fog: [80, 240], maxScale: 1 },
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
    r.setClearColor(0x9fd8ff, 1);
    this.r = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 700);
    this.listeners = [];
    this.applySize();
    addEventListener('resize', () => this.applySize());
  }

  onPresetChange(fn) { this.listeners.push(fn); }

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
    this.camera.aspect = innerWidth / Math.max(1, innerHeight);
    this.camera.updateProjectionMatrix();
  }

  render() { this.r.render(this.scene, this.camera); }
}

// Watches the frame rate and lowers the quality when the device struggles ("Auto" setting).
export class FpsMonitor {
  constructor(renderer) {
    this.R = renderer;
    this.frames = 0; this.time = 0; this.fps = 60; this.slow = 0; this.warm = 0;
  }
  // dt = real seconds since last frame; active = a job is running (only judge real gameplay)
  tick(dt, active) {
    this.frames++; this.time += dt;
    if (this.time < 1) return;
    this.fps = this.frames / this.time;
    this.frames = 0; this.time = 0;
    if (!active || settings.quality !== 'auto' || document.hidden) { this.warm = 0; return; }
    if (++this.warm < 3) return; // let things settle first
    const R = this.R;
    if (this.fps < (R.presetName === 'low' ? 27 : 43)) this.slow++; else this.slow = Math.max(0, this.slow - 1);
    if (this.slow >= 3) {
      this.slow = 0; this.warm = 0;
      if (R.presetName === 'high') R.setPreset('medium', true);
      else if (R.presetName === 'medium') R.setPreset('low', true);
      else if ((settings.autoScale || 1) > 0.62) { settings.autoScale = Math.max(0.6, (settings.autoScale || 1) - 0.12); saveSettings(); R.applySize(); }
    }
  }
}
