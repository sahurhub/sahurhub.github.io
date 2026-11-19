// UK Simulator - keyboard, gamepad and touch controls, merged into one control state.
const KEYMAP = {
  throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'], leanBack: ['ShiftLeft', 'ShiftRight'], leanFwd: ['ControlLeft', 'ControlRight'], rearBrake: ['KeyX'],
  shiftUp: ['KeyE'], shiftDown: ['KeyQ'], enter: ['KeyF', 'Enter'], reset: ['KeyR'], camera: ['KeyC'], lights: ['KeyL'], horn: ['KeyH'],
  map: ['KeyM'], menu: ['Escape', 'Tab'], chat: ['KeyT'], debug: ['F3'], tuning: ['F4'], mode: ['KeyV'], look: ['KeyB'], action: ['KeyG'],
};
const PRESS = ['enter', 'reset', 'camera', 'lights', 'map', 'menu', 'chat', 'debug', 'tuning', 'shiftUp', 'shiftDown', 'mode', 'handbrakePress'];

export class Input {
  constructor(el) {
    this.keys = new Set();
    this.pressed = new Set();
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: 0, leanBack: 0, leanFwd: 0, rearBrake: 0, look: 0, lookX: 0, lookY: 0, sprint: 0, horn: 0 };
    this.steerKb = 0;
    this.blocked = false; // typing in chat
    this.mouse = { dx: 0, dy: 0, down: false };
    addEventListener('keydown', (e) => {
      if (this.blocked && e.code !== 'Escape' && e.code !== 'Enter') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3', 'F4'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) for (const [act, codes] of Object.entries(KEYMAP)) if (codes.includes(e.code)) this.pressed.add(act);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mousedown', (e) => { if (e.button === 0 || e.button === 2) this.mouse.down = true; });
    addEventListener('mouseup', () => { this.mouse.down = false; });
    addEventListener('mousemove', (e) => { if (this.mouse.down || document.pointerLockElement) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.touch = null;
    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) this.makeTouch();
  }

  down(act) { return KEYMAP[act].some((c) => this.keys.has(c)); }
  take(act) { const p = this.pressed.has(act); this.pressed.delete(act); return p; }

  update(dt) {
    const s = this.state;
    if (this.blocked) { s.throttle = s.brake = s.steer = s.handbrake = 0; this.pressed.clear(); return s; }
    // keyboard: steering ramps in and out like a real wheel turned by hand
    const kl = this.down('left'), kr = this.down('right');
    const want = (kr ? 1 : 0) - (kl ? 1 : 0);
    const rate = want === 0 ? 6 : Math.sign(want) !== Math.sign(this.steerKb) && this.steerKb !== 0 ? 9 : 3.2;
    this.steerKb += Math.max(-rate * dt, Math.min(rate * dt, want - this.steerKb));
    s.throttle = this.down('throttle') ? 1 : 0;
    s.brake = this.down('brake') ? 1 : 0;
    s.steer = this.steerKb;
    s.handbrake = this.down('handbrake') ? 1 : 0;
    s.leanBack = this.down('leanBack') ? 1 : 0;
    s.leanFwd = this.down('leanFwd') ? 1 : 0;
    s.rearBrake = this.down('rearBrake') ? 1 : 0;
    s.sprint = s.leanBack;
    s.horn = this.down('horn') ? 1 : 0;
    s.look = this.down('look') ? 1 : 0;
    s.lookX = this.mouse.dx; s.lookY = this.mouse.dy; this.mouse.dx = this.mouse.dy = 0;
    // gamepad (standard mapping)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = (v, d = 0.12) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
      const b = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const steer = dz(p.axes[0]);
      if (Math.abs(steer) > 0.01) s.steer = Math.sign(steer) * Math.pow(Math.abs(steer), 1.4);
      s.throttle = Math.max(s.throttle, b(7));
      s.brake = Math.max(s.brake, b(6));
      s.handbrake = Math.max(s.handbrake, b(0));
      s.rearBrake = Math.max(s.rearBrake, b(2));
      const ry = dz(p.axes[3]);
      if (ry > 0) s.leanBack = Math.max(s.leanBack, ry); else s.leanFwd = Math.max(s.leanFwd, -ry);
      s.lookX += dz(p.axes[2]) * 14; s.lookY += 0;
      const prev = this.padPrev || (this.padPrev = {});
      const edge = (i, act) => { const v = b(i) > 0.5; if (v && !prev[i]) this.pressed.add(act); prev[i] = v; };
      edge(3, 'enter'); edge(1, 'camera'); edge(5, 'shiftUp'); edge(4, 'shiftDown'); edge(9, 'menu'); edge(8, 'map'); edge(10, 'reset'); edge(12, 'lights'); edge(0, 'handbrakePress'); edge(13, 'action');
    }
    // touch
    if (this.touch) {
      const t = this.touch;
      if (t.stick.active) s.steer = t.stick.x;
      s.throttle = Math.max(s.throttle, t.btn.gas ? 1 : 0);
      s.brake = Math.max(s.brake, t.btn.brake ? 1 : 0);
      s.handbrake = Math.max(s.handbrake, t.btn.hand ? 1 : 0);
      if (t.stick.active && t.walk) { s.walkX = t.stick.x; s.walkY = t.stick.y; }
    }
    return s;
  }

  makeTouch() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div class="t-stick"><div class="t-knob"></div></div>
      <button class="t-btn t-gas" data-b="gas">GO</button>
      <button class="t-btn t-brake" data-b="brake">BRAKE</button>
      <button class="t-btn t-hand" data-b="hand">HAND</button>
      <button class="t-btn t-small t-enter" data-p="enter">IN/OUT</button>
      <button class="t-btn t-small t-cam" data-p="camera">CAM</button>
      <button class="t-btn t-small t-reset" data-p="reset">RESET</button>
      <button class="t-btn t-small t-menu" data-p="menu">MENU</button>
      <button class="t-btn t-small t-action" data-p="action">START</button>
      <button class="t-btn t-small t-map" data-p="map">MAP</button>`;
    document.body.appendChild(root);
    const t = { stick: { active: false, x: 0, y: 0, id: null }, btn: {}, walk: false };
    const stick = root.querySelector('.t-stick'), knob = root.querySelector('.t-knob');
    const move = (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier !== t.stick.id) continue;
        const r = stick.getBoundingClientRect();
        const x = (tc.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (tc.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const l = Math.hypot(x, y), k = l > 1 ? 1 / l : 1;
        t.stick.x = x * k; t.stick.y = y * k;
        knob.style.transform = `translate(${t.stick.x * 40}px, ${t.stick.y * 40}px)`;
      }
    };
    stick.addEventListener('touchstart', (e) => { e.preventDefault(); t.stick.active = true; t.stick.id = e.changedTouches[0].identifier; move(e); });
    stick.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); });
    const end = (e) => { for (const tc of e.changedTouches) if (tc.identifier === t.stick.id) { t.stick.active = false; t.stick.x = t.stick.y = 0; knob.style.transform = ''; } };
    stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
    for (const b of root.querySelectorAll('[data-b]')) {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); t.btn[b.dataset.b] = true; });
      b.addEventListener('touchend', (e) => { e.preventDefault(); t.btn[b.dataset.b] = false; });
    }
    for (const b of root.querySelectorAll('[data-p]')) b.addEventListener('touchstart', (e) => { e.preventDefault(); this.pressed.add(b.dataset.p); });
    this.touch = t;
  }
}

export { PRESS };
