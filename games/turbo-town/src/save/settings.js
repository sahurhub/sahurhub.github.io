// TURBO TOWN - device settings (graphics, sound, controls). These stay on the device;
// all progress lives in the player's online profile.
const KEY = 'turbotown.settings';

export function detectQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const cros = /CrOS/.test(navigator.userAgent);
  if (cores <= 4 || mem <= 4 || cros) return 'low';
  if (cores >= 8 && mem >= 8) return 'high';
  return 'medium';
}

export const DEFAULTS = {
  quality: null,        // low | medium | high (null = not chosen yet, use detected)
  pixel: 'smooth',      // pixel look: chunky | retro | smooth (see render/renderer.js)
  pixelV: 2,            // 2 = smooth became the default (older saves are moved to smooth once)
  resolution: 100,      // % of native resolution (smooth look only)
  view: 'auto',         // render distance in metres or auto
  shadows: 'auto',      // auto | on | off
  particles: 'normal',  // normal | low | off
  showFps: false,
  volume: 0.8,
  sfx: true,
  camera: 'normal',
  lowAsked: false,      // the "switch to Low graphics?" question was already asked
};

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { s = {}; }
  const out = { ...DEFAULTS, ...s };
  // smooth is the default look since 2026-11-17: saves from before then switch to it once
  // (anyone can still pick Chunky or Retro in Settings, and that choice is kept)
  if (!s.pixelV) { out.pixel = 'smooth'; out.pixelV = DEFAULTS.pixelV; }
  out.detected = detectQuality();
  if (!out.quality) out.quality = out.detected;
  return out;
}

export function saveSettings(s) {
  const { detected, ...rest } = s;
  try { localStorage.setItem(KEY, JSON.stringify(rest)); } catch (e) { /* private mode */ }
}
