// Safe localStorage: private mode, blocked or full storage just fall back to memory.
import { FLAGS, SETTINGS_KEY } from '../config.js';

const mem = new Map();

export const store = {
  get(k) {
    if (FLAGS.nosave) return mem.has(k) ? mem.get(k) : null;
    try { return localStorage.getItem(k); } catch (e) { return mem.has(k) ? mem.get(k) : null; }
  },
  set(k, v) {
    mem.set(k, v);
    if (FLAGS.nosave) return;
    try { localStorage.setItem(k, v); } catch (e) { /* storage full or blocked: keep the memory copy */ }
  },
  del(k) {
    mem.delete(k);
    if (FLAGS.nosave) return;
    try { localStorage.removeItem(k); } catch (e) { /* blocked */ }
  },
  json(k, def = null) {
    if (FLAGS.fresh && !mem.has(k)) return def;
    const v = this.get(k);
    if (v == null) return def;
    try { return JSON.parse(v); } catch (e) { return def; }
  },
  setJson(k, v) {
    try { this.set(k, JSON.stringify(v)); } catch (e) { /* */ }
  },
};

// Player settings (graphics, sound, mouse).
const DEFAULTS = { quality: 'auto', shadows: 'auto', fps: false, volume: 0.7, mute: false, sens: 1, invertY: false, autoScale: 1, autoPreset: null };
export const settings = { ...DEFAULTS, ...(store.json(SETTINGS_KEY, {}) || {}) };
export function saveSettings() { store.setJson(SETTINGS_KEY, settings); }
