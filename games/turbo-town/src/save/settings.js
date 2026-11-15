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
  pixel: 'retro',       // pixel look: chunky | retro | smooth (see render/renderer.js)
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
  out.detected = detectQuality();
  if (!out.quality) out.quality = out.detected;
  return out;
}

export function saveSettings(s) {
  const { detected, ...rest } = s;
  try { localStorage.setItem(KEY, JSON.stringify(rest)); } catch (e) { /* private mode */ }
}
