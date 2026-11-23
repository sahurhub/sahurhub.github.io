// Keyboard + mouse with pointer lock. Held actions (move, spray) and one-shot presses (nozzle, F3...).
import { on } from './life.js';
import { FLAGS } from '../config.js';

const KEYS = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyE: 'use', KeyQ: 'find', ShiftLeft: 'nozzle', ShiftRight: 'nozzle',
  Digit1: 'tool1', Digit2: 'tool2', Digit3: 'tool3', Numpad1: 'tool1', Numpad2: 'tool2', Numpad3: 'tool3',
  F3: 'fps', Enter: 'finish', NumpadEnter: 'finish', KeyP: 'pause', Escape: 'esc',
};
const PREVENT = new Set(['Space', 'Tab', 'F3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const input = {
  held: new Set(),
  pressed: new Set(),
  dx: 0, dy: 0,
  locked: false,
  playing: false, // set by the app while a job is running (stops page scrolling keys)
  down(a) { return this.held.has(a); },
  take(a) { if (!this.pressed.has(a)) return false; this.pressed.delete(a); return true; },
  mouse() { const d = [this.dx, this.dy]; this.dx = 0; this.dy = 0; return d; },
  reset() { this.held.clear(); this.pressed.clear(); this.dx = 0; this.dy = 0; },
};

let canvasEl = null;
let lockCb = null;

const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.type !== 'range'; };

export function initInput(canvas, onLockChange) {
  canvasEl = canvas;
  lockCb = onLockChange;
  on(window, 'keydown', (e) => {
    if (e.code === 'F3' || (input.playing && PREVENT.has(e.code))) e.preventDefault();
    if (typing(e)) return;
    const a = KEYS[e.code];
    if (!a) return;
    if (!e.repeat) input.pressed.add(a);
    input.held.add(a);
  });
  on(window, 'keyup', (e) => { const a = KEYS[e.code]; if (a) input.held.delete(a); });
  on(window, 'blur', () => { input.held.clear(); });
  on(canvas, 'mousedown', (e) => {
    if (!input.locked) return;
    if (e.button === 0) input.held.add('spray');
    if (e.button === 2) input.pressed.add('nozzle');
    e.preventDefault();
  });
  on(window, 'mouseup', (e) => { if (e.button === 0) input.held.delete('spray'); });
  on(canvas, 'contextmenu', (e) => e.preventDefault());
  on(document, 'mousemove', (e) => {
    if (!input.locked || FLAGS.test) return;
    input.dx += clamp(e.movementX || 0, -250, 250);
    input.dy += clamp(e.movementY || 0, -250, 250);
  });
  on(document, 'pointerlockchange', () => {
    const was = input.locked;
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) input.held.delete('spray');
    if (was !== input.locked && lockCb) lockCb(input.locked, false);
  });
  on(document, 'pointerlockerror', () => { if (lockCb) lockCb(false, true); });
}

// Must be called from a click. Chrome refuses for about a second after Esc; we report that as an error.
export function requestLock() {
  if (FLAGS.test) { input.locked = true; if (lockCb) lockCb(true, false); return; }
  if (!canvasEl || document.pointerLockElement === canvasEl) return;
  try {
    const p = canvasEl.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => { if (lockCb) lockCb(false, true); });
  } catch (e) {
    if (lockCb) lockCb(false, true);
  }
}

export function exitLock() {
  if (FLAGS.test) { if (input.locked) { input.locked = false; if (lockCb) lockCb(false, false); } return; }
  if (document.pointerLockElement) document.exitPointerLock();
}
