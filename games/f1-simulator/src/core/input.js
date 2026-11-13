// Player input: keyboard (with smoothing so on/off keys feel like pedals and a wheel),
// gamepads and racing wheels through the Gamepad API. All bindings can be remapped.
import { clamp, approach } from './math.js';

export const DEFAULT_KEYS = {
  accelerate: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  shiftUp: ['ShiftLeft', 'ShiftRight', 'KeyE'],
  shiftDown: ['ControlLeft', 'ControlRight', 'KeyQ'],
  boost: ['Space'],
  aero: ['KeyF'],
  ers: ['KeyM'],
  camera: ['KeyC'],
  lookBack: ['KeyB'],
  reset: ['KeyR'],
  pause: ['Escape', 'KeyP'],
};

export const ACTION_LABELS = {
  accelerate: 'Accelerate', brake: 'Brake / reverse', left: 'Steer left', right: 'Steer right',
  shiftUp: 'Shift up', shiftDown: 'Shift down', boost: 'Boost / overtake', aero: 'Straight mode (manual)', ers: 'ERS mode (Harvest / Medium / Hotlap)', camera: 'Change camera',
  lookBack: 'Look back', reset: 'Reset car', pause: 'Pause',
};

export const DEFAULT_PAD = { steerAxis: 0, throttleButton: 7, brakeButton: 6, shiftUp: 5, shiftDown: 4, boost: 0, camera: 3, reset: 2, pause: 9, lookBack: 1 };

export class Input {
  constructor(keys = DEFAULT_KEYS) {
    this.setKeys(keys);
    this.down = new Set();
    this.pressed = new Set();   // actions that went down since last read
    this.steer = 0; this.throttle = 0; this.brake = 0;
    this.enabled = true;
    this.padIndex = null;
    this.padPrev = {};
    this.device = 'keyboard';
    this.capture = null;        // set to a function to grab the next key (for remapping)
    this._kd = (e) => {
      if (this.capture) { e.preventDefault(); const f = this.capture; this.capture = null; f(e.code); return; }
      const act = this.byCode[e.code];
      if (!act) return;
      if (this.enabled || act === 'pause') e.preventDefault();
      if (!e.repeat) { this.down.add(e.code); this.pressed.add(act); }
    };
    this._ku = (e) => { this.down.delete(e.code); };
    this._blur = () => this.down.clear();
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
    window.addEventListener('gamepadconnected', (e) => { this.padIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', (e) => { if (this.padIndex === e.gamepad.index) this.padIndex = null; });
  }

  setKeys(keys) {
    this.keys = JSON.parse(JSON.stringify(keys));
    this.byCode = {};
    for (const [act, codes] of Object.entries(this.keys)) for (const c of codes) this.byCode[c] = act;
  }

  held(action) {
    for (const c of this.keys[action] || []) if (this.down.has(c)) return true;
    return false;
  }

  /** Was this action pressed since the last call? */
  take(action) {
    if (this.pressed.has(action)) { this.pressed.delete(action); return true; }
    return false;
  }

  _pad() {
    if (this.padIndex == null || !navigator.getGamepads) return null;
    return navigator.getGamepads()[this.padIndex] || null;
  }

  /**
   * Fill the car control object. Call once per rendered frame.
   * @param c   { steer, throttle, brake, shift, boost, aero }
   * @param dt  frame time in seconds
   * @param speed car speed (m/s), used to make keyboard steering calmer at high speed
   */
  read(c, dt, speed = 0) {
    const pad = this._pad();
    let padUsed = false;
    if (pad) {
      const ax = pad.axes[DEFAULT_PAD.steerAxis] || 0;
      const th = pad.buttons[DEFAULT_PAD.throttleButton] ? pad.buttons[DEFAULT_PAD.throttleButton].value : 0;
      const br = pad.buttons[DEFAULT_PAD.brakeButton] ? pad.buttons[DEFAULT_PAD.brakeButton].value : 0;
      if (Math.abs(ax) > 0.06 || th > 0.03 || br > 0.03) padUsed = true;
      if (padUsed) {
        const dz = 0.05;
        const a = Math.abs(ax) < dz ? 0 : (Math.abs(ax) - dz) / (1 - dz) * Math.sign(ax);
        this.steer = -Math.sign(a) * Math.pow(Math.abs(a), 1.6); // stick right = steer right = negative
        this.throttle = th; this.brake = br;
        this.device = 'gamepad';
      }
      for (const act of ['shiftUp', 'shiftDown', 'boost', 'camera', 'reset', 'pause', 'lookBack']) {
        const b = pad.buttons[DEFAULT_PAD[act]];
        const on = !!(b && b.pressed);
        if (on && !this.padPrev[act]) this.pressed.add(act);
        this.padPrev[act] = on;
      }
    }
    if (!padUsed) {
      const kLeft = this.held('left'), kRight = this.held('right');
      const tgt = (kLeft ? 1 : 0) - (kRight ? 1 : 0);
      if (kLeft || kRight || this.held('accelerate') || this.held('brake')) this.device = 'keyboard';
      if (this.device === 'keyboard') {
        // steering moves at a finite speed: quick to centre, slower to wind on at high speed
        const fast = clamp(speed / 80, 0, 1);
        const rate = tgt === 0 ? 4.5 : Math.sign(tgt) !== Math.sign(this.steer) && this.steer !== 0 ? 6.5 : 3.0 - 1.9 * fast;
        this.steer = approach(this.steer, tgt, rate * dt);
        this.throttle = approach(this.throttle, this.held('accelerate') ? 1 : 0, (this.held('accelerate') ? 5.5 : 9) * dt);
        this.brake = approach(this.brake, this.held('brake') ? 1 : 0, (this.held('brake') ? 7 : 11) * dt);
      }
    }
    if (!this.enabled) { c.steer = 0; c.throttle = 0; c.brake = 0; c.boost = false; return; }
    c.steer = this.steer;
    c.throttle = this.throttle;
    c.brake = this.brake;
    c.boost = this.held('boost') || !!(pad && pad.buttons[DEFAULT_PAD.boost] && pad.buttons[DEFAULT_PAD.boost].pressed);
    if (this.take('shiftUp')) c.shift = 1;
    else if (this.take('shiftDown')) c.shift = -1;
    if (this.take('aero')) c.aeroPress = true;
    if (this.take('ers')) c.ersCycle = true;
  }

  clear() { this.pressed.clear(); this.down.clear(); this.steer = 0; this.throttle = 0; this.brake = 0; }
}
