// Safe localStorage (private mode and blocked storage just fall back to memory).
import { FLAGS } from '../config.js';

const mem = new Map();

export const store = {
  get(k) {
    if (FLAGS.nosave) return mem.has(k) ? mem.get(k) : null;
    try { return localStorage.getItem(k); } catch (e) { return mem.has(k) ? mem.get(k) : null; }
  },
  set(k, v) {
    mem.set(k, v);
    if (FLAGS.nosave) return;
    try { localStorage.setItem(k, v); } catch (e) { /* storage full or blocked */ }
  },
  del(k) {
    mem.delete(k);
    if (FLAGS.nosave) return;
    try { localStorage.removeItem(k); } catch (e) { /* */ }
  },
  json(k, def = null) {
    const v = this.get(k);
    if (v == null) return def;
    try { return JSON.parse(v); } catch (e) { return def; }
  },
  setJson(k, v) { this.set(k, JSON.stringify(v)); },
};

// Player settings (graphics, sound, camera...).
const SKEY = 'lms.settings.v1';
const DEFAULTS = { quality: 'auto', fps: false, volume: 0.7, mute: false, camera: 'third', minimap: true, autoScale: 1 };
export const settings = { ...DEFAULTS, ...(store.json(SKEY, {}) || {}) };
export function saveSettings() { store.setJson(SKEY, settings); }
