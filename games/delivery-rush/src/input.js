// Keyboard + mouse input. Produces a plain "controls" object each frame so that the
// player / vehicle simulation never reads the DOM (a network peer could send the same object).

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;          // false while a menu is open
    this.dragging = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.onLockChange = null;

    addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); });

    canvas.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (e.button === 0 && !this.locked && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        } catch (err) { /* pointer lock not available: fall back to drag */ }
      }
      if (e.button === 2 || !this.locked) this.dragging = true;
    });
    addEventListener('mouseup', () => { this.dragging = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!this.enabled) return;
      if (this.locked || this.dragging) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    canvas.addEventListener('wheel', e => {
      if (!this.enabled) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange && was !== this.locked) this.onLockChange(this.locked);
    });
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  isDown(...codes) { return codes.some(c => this.down.has(c)); }
  wasPressed(...codes) { return codes.some(c => this.pressed.has(c)); }

  // called once per frame by the game
  read() {
    const en = this.enabled;
    const d = c => en && this.down.has(c);
    const c = {
      forward: (d('KeyW') || d('ArrowUp') ? 1 : 0) - (d('KeyS') || d('ArrowDown') ? 1 : 0),
      right: (d('KeyD') || d('ArrowRight') ? 1 : 0) - (d('KeyA') || d('ArrowLeft') ? 1 : 0),
      jump: d('Space'),
      jumpPressed: en && this.pressed.has('Space'),
      sprint: d('ShiftLeft') || d('ShiftRight'),
      interact: en && this.pressed.has('KeyE'),
      horn: d('KeyH'),
      reset: en && this.pressed.has('KeyR'),
      call: en && this.pressed.has('KeyV'),
      lookX: en ? this.mouseDX * this.sensitivity : 0,
      lookY: en ? this.mouseDY * this.sensitivity * (this.invertY ? -1 : 1) : 0,
      zoom: en ? this.wheel : 0,
    };
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    return c;
  }
  endFrame() { this.pressed.clear(); }
}
