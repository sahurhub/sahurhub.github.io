// Keyboard, gamepad and touch controls, combined into one simple state:
// throttle (-1..1), steer (-1..1, + = right), brake, plus one-shot presses.
const keys = new Set();
const pressed = new Set();
const KEYMAP = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  brake: ['Space'], camera: ['KeyC'], pause: ['Escape', 'KeyP'], action: ['KeyE', 'Enter'], map: ['KeyM'], finish: ['KeyF'],
  reset: ['KeyR'],
};

export const input = {
  throttle: 0, steer: 0, brake: false,
  touch: { x: 0, y: 0, active: false },
  pad: null,
  enabled: true,
  lastDevice: 'keyboard',
  // was this one-shot button pressed since the last call?
  take(name) { if (pressed.has(name)) { pressed.delete(name); return true; } return false; },
  press(name) { pressed.add(name); },
  clear() { pressed.clear(); },
  isTyping() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); },
};

function down(code) { return keys.has(code); }
function any(list) { return list.some(down); }

addEventListener('keydown', (e) => {
  if (input.isTyping()) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) {
    for (const [name, codes] of Object.entries(KEYMAP)) if (codes.includes(e.code) && !['up', 'down', 'left', 'right', 'brake'].includes(name)) pressed.add(name);
  }
  keys.add(e.code);
  input.lastDevice = 'keyboard';
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// ---- gamepad (standard mapping)
let padPrev = [];
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let p = null;
  for (const g of pads) if (g && g.connected) { p = g; break; }
  input.pad = p;
  if (!p) return null;
  const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
  const val = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
  const map = { action: 0, camera: 3, pause: 9, map: 8, finish: 1, reset: 2 };
  for (const [name, i] of Object.entries(map)) { if (b(i) && !padPrev[i]) pressed.add(name); }
  padPrev = p.buttons.map((x) => x.pressed);
  const ax = Math.abs(p.axes[0]) > 0.15 ? p.axes[0] : 0;
  const ay = Math.abs(p.axes[1]) > 0.2 ? p.axes[1] : 0;
  const thr = val(7) - val(6) || (b(12) ? 1 : b(13) ? -1 : 0) || -ay;
  const st = ax || (b(15) ? 1 : b(14) ? -1 : 0);
  if (Math.abs(thr) > 0.05 || Math.abs(st) > 0.05) input.lastDevice = 'gamepad';
  return { thr, st, brake: b(4) || b(5) };
}

// ---- touch joystick (created by the HUD)
export function bindStick(el) {
  const knob = el.querySelector('i');
  let id = null, cx = 0, cy = 0;
  const R = 60;
  const move = (e) => {
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy), k = l > R ? R / l : 1;
    input.touch.x = (dx * k) / R; input.touch.y = (dy * k) / R;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };
  el.addEventListener('pointerdown', (e) => {
    id = e.pointerId; el.setPointerCapture(id);
    const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    input.touch.active = true; input.lastDevice = 'touch'; move(e);
  });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; input.touch = { x: 0, y: 0, active: false }; knob.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

// Call once per frame.
export function updateInput() {
  if (!input.enabled || input.isTyping()) { input.throttle = 0; input.steer = 0; input.brake = false; return; }
  let thr = (any(KEYMAP.up) ? 1 : 0) - (any(KEYMAP.down) ? 1 : 0);
  let st = (any(KEYMAP.right) ? 1 : 0) - (any(KEYMAP.left) ? 1 : 0);
  let brake = any(KEYMAP.brake);
  const g = pollPad();
  if (g) { if (Math.abs(g.thr) > Math.abs(thr)) thr = g.thr; if (Math.abs(g.st) > Math.abs(st)) st = g.st; brake = brake || g.brake; }
  if (input.touch.active) {
    // stick up = forward; the stick's sideways part steers
    const ty = -input.touch.y, tx = input.touch.x;
    if (Math.abs(ty) > 0.12) thr = Math.max(-1, Math.min(1, ty * 1.25));
    if (Math.abs(tx) > 0.12) st = Math.max(-1, Math.min(1, tx * 1.2));
  }
  input.throttle = thr; input.steer = st; input.brake = brake;
}

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
