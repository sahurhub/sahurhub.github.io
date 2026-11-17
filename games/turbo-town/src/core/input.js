// TURBO TOWN - keyboard and controller input.
// W/Up accelerate, S/Down brake + reverse, A/D or arrows steer, Space use item, Shift or Q
// look behind, Esc pause. There is no drift button: holding a turn at speed drifts by
// itself (see autoDrift in physics/kart-physics.js). Standard controllers: A or RT
// accelerate, B or LT brake, left stick or d-pad steer, X, LB or RB item, Y look behind,
// Start pause.
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'item', ShiftLeft: 'back', ShiftRight: 'back', KeyQ: 'back', Escape: 'pause',
  Backquote: 'quickpause', // ` : pause at once (online: votes for a pause, no menu)
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedOnce = new Set();
    this.state = { throttle: 0, steer: 0, item: false, back: false };
    this.enabled = true;
    this.lastDevice = 'keyboard';
    this.padPrev = {};
    addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      const a = KEYMAP[e.code];
      if (!a) return;
      if (['up', 'down', 'left', 'right', 'item'].includes(a)) e.preventDefault();
      if (!this.keys.has(a)) this.pressedOnce.add(a);
      this.keys.add(a);
      this.lastDevice = 'keyboard';
    });
    addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) this.keys.delete(a); });
    addEventListener('blur', () => this.keys.clear());
  }

  // true once per key press (pause, item)
  consume(action) {
    if (this.pressedOnce.has(action)) { this.pressedOnce.delete(action); return true; }
    return false;
  }

  clearPresses() { this.pressedOnce.clear(); }

  poll() {
    const k = this.keys;
    let throttle = (k.has('up') ? 1 : 0) - (k.has('down') ? 1 : 0);
    let steer = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
    let item = k.has('item'), back = k.has('back');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const v = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
      const ax = Math.abs(gp.axes[0] || 0) > 0.18 ? gp.axes[0] : 0;
      const gas = Math.max(b(0) ? 1 : 0, v(7)), brake = Math.max(b(1) ? 1 : 0, v(6));
      const padSteer = ax + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      if (gas || brake || padSteer || b(5) || b(4) || b(2) || b(3) || b(9)) this.lastDevice = 'pad';
      if (gas > 0.1 || brake > 0.1) throttle = gas - brake;
      if (padSteer) steer = Math.max(-1, Math.min(1, padSteer));
      item = item || b(4) || b(2) || b(5);
      back = back || b(3);
      const edge = (i, action) => { const now = b(i); if (now && !this.padPrev[gp.index + ':' + i]) this.pressedOnce.add(action); this.padPrev[gp.index + ':' + i] = now; };
      edge(9, 'pause'); edge(4, 'item'); edge(2, 'item'); edge(5, 'item'); edge(0, 'confirm'); edge(1, 'cancel');
    }
    const s = this.state;
    if (!this.enabled) { s.throttle = 0; s.steer = 0; s.item = false; s.back = false; return s; }
    s.throttle = Math.max(-1, Math.min(1, throttle));
    s.steer = steer; s.item = item; s.back = back;
    return s;
  }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
