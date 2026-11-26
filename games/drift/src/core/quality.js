// Drift! - graphics quality: Low / Medium / High presets, a guess for this device,
// and an automatic step down when the game runs below about 30 FPS (lower render scale first,
// then shadows, weather particles, prop and traffic detail distance).
import { settings } from './settings.js';
import { FLAGS } from '../config.js';

export const PRESETS = {
  low:    { name: 'low', maxDpr: 1, scale: 0.75, shadows: false, shadowSize: 1024, particles: 0.35, propDistance: 0.6, carShadows: false, trafficLod: 0.6, antialias: false },
  medium: { name: 'medium', maxDpr: 1.25, scale: 0.9, shadows: true, shadowSize: 1024, particles: 0.7, propDistance: 0.85, carShadows: false, trafficLod: 0.85, antialias: false },
  high:   { name: 'high', maxDpr: 2, scale: 1, shadows: true, shadowSize: 2048, particles: 1, propDistance: 1, carShadows: true, trafficLod: 1, antialias: true },
};

/** Best guess for this device. */
export function detectQuality(renderer) {
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
  } catch (e) { /* unknown */ }
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const chromebook = /CrOS/.test(navigator.userAgent);
  const weakGpu = /mali|powervr|adreno [1-5]|intel\(r\) (hd|uhd) graphics (4|5|6)\d\d|hd graphics$|celeron|pentium|mediatek|swiftshader|llvmpipe|software/.test(gpu);
  const strongGpu = /nvidia|geforce|rtx|gtx|radeon (rx|pro)|apple m[1-9]|arc a/.test(gpu);
  if (weakGpu || mem <= 4 && cores <= 4 || (chromebook && !strongGpu)) return 'low';
  if (strongGpu && cores >= 6) return 'high';
  return 'medium';
}

export class Quality {
  constructor(renderer) {
    this.renderer = renderer;
    this.detected = detectQuality(renderer);
    this.autoLevel = this.detected;
    this.autoScale = 1;
    this.window = []; this.lowCount = 0; this.cooldown = 8;
    this.listeners = [];
    this.current = this.compute();
  }

  compute() {
    // ?quality=low|medium|high tries a level for this visit without changing the saved setting
    const pick = PRESETS[FLAGS.quality] ? FLAGS.quality : settings.get('quality');
    const level = pick === 'auto' ? this.autoLevel : pick;
    const p = { ...PRESETS[level] || PRESETS.medium };
    p.shadows = p.shadows && settings.get('shadows');
    p.renderScale = Math.min(settings.get('renderScale'), pick === 'auto' ? p.scale * this.autoScale : 1);
    p.auto = pick === 'auto';
    return p;
  }

  onChange(fn) { this.listeners.push(fn); }
  refresh() { this.current = this.compute(); for (const fn of this.listeners) fn(this.current); }

  pixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.current.maxDpr);
    return Math.max(0.4, dpr * this.current.renderScale);
  }

  /** Called every frame while driving. Returns a message if quality was lowered. */
  sample(dt) {
    if (!this.current.auto) return null;
    this.cooldown -= dt;
    this.window.push(dt);
    let total = 0; for (const d of this.window) total += d;
    if (total < 4) return null;
    const fps = this.window.length / total;
    this.window = [];
    if (this.cooldown > 0) return null;
    if (fps < 29) this.lowCount++; else this.lowCount = 0;
    if (this.lowCount < 2) return null;
    this.lowCount = 0; this.cooldown = 10;
    if (this.autoScale > 0.72) { this.autoScale = Math.max(0.7, this.autoScale - 0.12); this.refresh(); return 'Lowered the render resolution to keep things smooth.'; }
    if (this.autoLevel === 'high') { this.autoLevel = 'medium'; this.autoScale = 1; this.refresh(); return 'Switched graphics to Medium to keep things smooth.'; }
    if (this.autoLevel === 'medium') { this.autoLevel = 'low'; this.autoScale = 1; this.refresh(); return 'Switched graphics to Low to keep things smooth.'; }
    return null;
  }
}
