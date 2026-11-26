// Drift! - keyboard and mouse (keys can be changed in Settings > Controls).
import { settings } from './settings.js';

class Input {
  constructor() {
    this.codes = new Set();      // keys held now
    this.pressedCodes = new Set(); // keys pressed since the last frame
    this.mouseDX = 0; this.mouseDY = 0;
    this.rightMouse = false;
    this.enabled = true;          // false while menus are open or chat is being typed in
    this.listeners = [];          // raw key handlers for menus (return true to swallow)
    this.lastActivity = performance.now();
    this.buildMap();
    settings.on('change', (k) => { if (k === 'keys') this.buildMap(); });

    window.addEventListener('keydown', (e) => this.onKey(e, true), true);
    window.addEventListener('keyup', (e) => this.onKey(e, false), true);
    window.addEventListener('blur', () => { this.codes.clear(); this.rightMouse = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.enabled && (this.rightMouse || this.down('freeLook') || document.pointerLockElement)) {
        this.mouseDX += e.movementX || 0; this.mouseDY += e.movementY || 0;
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 2 && this.enabled && e.target && e.target.closest && e.target.closest('#view')) {
        this.rightMouse = true;
        const c = document.querySelector('#view canvas');
        if (c && c.requestPointerLock) { try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* not allowed */ } }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) { this.rightMouse = false; if (document.pointerLockElement) document.exitPointerLock(); }
    });
    window.addEventListener('contextmenu', (e) => { if (e.target && e.target.closest && e.target.closest('#view')) e.preventDefault(); });
  }

  buildMap() {
    this.map = new Map(); // code -> [actions]
    const keys = settings.get('keys');
    for (const [action, codes] of Object.entries(keys)) {
      for (const c of codes) { if (!this.map.has(c)) this.map.set(c, []); this.map.get(c).push(action); }
    }
  }

  typing() {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }

  onKey(e, isDown) {
    this.lastActivity = performance.now();
    for (const fn of this.listeners) { if (fn(e, isDown)) { e.preventDefault(); e.stopPropagation(); return; } }
    if (this.typing()) { if (!isDown) this.codes.delete(e.code); return; }
    const actions = this.map.get(e.code) || [];
    // keep the browser from scrolling, tabbing or opening its search while driving
    if (actions.length || ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote'].includes(e.code)) {
      if (!(e.ctrlKey || e.metaKey)) e.preventDefault();
    }
    if (isDown) {
      if (!this.codes.has(e.code)) this.pressedCodes.add(e.code);
      this.codes.add(e.code);
    } else this.codes.delete(e.code);
  }

  /** Is this action's key held? */
  down(action) {
    if (!this.enabled) return false;
    for (const c of settings.get('keys')[action] || []) if (this.codes.has(c)) return true;
    return false;
  }
  /** Was this action's key pressed since the last frame? (ignores the enabled flag when always=true) */
  pressed(action, always = false) {
    if (!this.enabled && !always) return false;
    for (const c of settings.get('keys')[action] || []) if (this.pressedCodes.has(c)) return true;
    return false;
  }
  get freeLook() { return this.enabled && (this.rightMouse || this.down('freeLook')); }

  takeMouse() { const d = [this.mouseDX, this.mouseDY]; this.mouseDX = 0; this.mouseDY = 0; return d; }
  endFrame() { this.pressedCodes.clear(); }
  release() { this.codes.clear(); this.pressedCodes.clear(); this.rightMouse = false; }
}

export const input = new Input();
