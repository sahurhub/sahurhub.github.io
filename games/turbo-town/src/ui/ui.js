// TURBO TOWN - screen manager and small DOM helpers.
// A screen is a function (ui, params) -> { el, enter?(), leave?(), onKey?(e), back?() }.
import { icon } from './icons.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sv == null) continue;
        if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }
  return el;
}

// Big rounded button: { label, icon, color, sub, onClick, disabled, lock, cls }
export function btn(o) {
  const b = h('button', { class: 'btn ' + (o.cls || '') + (o.lock ? ' locked' : ''), type: 'button', disabled: o.disabled ? true : null, style: o.color ? { '--c': o.color } : null });
  b.innerHTML = (o.icon ? icon(o.lock ? 'lock' : o.icon) : '') + `<span class="btn-text"><span class="btn-label"></span>${o.sub ? '<span class="btn-sub"></span>' : ''}</span>`;
  b.querySelector('.btn-label').textContent = o.label;
  if (o.sub) b.querySelector('.btn-sub').textContent = o.sub;
  if (o.onClick) b.addEventListener('click', (e) => { if (!o.disabled) { sfx('click'); o.onClick(e); } });
  b.addEventListener('mouseenter', () => sfx('hover'));
  return b;
}

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

let sfxHook = () => {};
export function setSfx(fn) { sfxHook = fn; }
function sfx(name) { sfxHook(name); }

export class UI {
  constructor(root) {
    this.root = root;
    this.stack = [];
    this.current = null;
    this.toastBox = h('div', { class: 'toasts' });
    document.body.appendChild(this.toastBox);
    addEventListener('keydown', (e) => {
      if (!this.current) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const dir = ARROWS[e.code];
      if (dir && this.navOn()) { e.preventDefault(); this.moveFocus(dir); return; }
      this.escape(e);
    });
    addEventListener('pointerdown', () => document.body.classList.remove('key-nav'));
    this.pad = { dir: null, next: 0, a: false, b: false };
    requestAnimationFrame(() => this.pollPad());
  }

  // Escape: let the screen handle it, else go back a screen
  escape(e) {
    if (!this.current) return;
    if (this.current.onKey && this.current.onKey(e) === true) return;
    if (e.code === 'Escape' && this.stack.length > 1 && !this.current.noBack) { e.preventDefault(); this.back(); }
  }

  // menus can be driven with arrows / controller, except screens where the player drives
  navOn() { return !!this.current && this.current.padNav !== false; }

  navScope() {
    const modals = document.querySelectorAll('.modal-wrap');
    return modals.length ? modals[modals.length - 1] : this.current && this.current.el;
  }

  // move keyboard focus to the nearest button in a direction
  moveFocus(dir) {
    const scope = this.navScope();
    if (!scope) return;
    document.body.classList.add('key-nav');
    const items = [...scope.querySelectorAll('button:not([disabled]), input, select, [tabindex="0"]')].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const cur = document.activeElement;
    if (!items.includes(cur)) { items[0].focus({ preventScroll: true }); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
      // only buttons that really sit on that side (small overlaps allowed)
      const edge = dir === 'left' ? a.left - b.right : dir === 'right' ? b.left - a.right : dir === 'up' ? a.top - b.bottom : b.top - a.bottom;
      if (edge < -10) continue;
      const main = Math.max(0, edge) + 1;
      // sideways: how far apart the two buttons are (0 when they line up), then centres
      const horiz = dir === 'left' || dir === 'right';
      const gap = horiz ? Math.max(0, b.top - a.bottom, a.top - b.bottom) : Math.max(0, b.left - a.right, a.left - b.right);
      const score = main + gap * 3 + (horiz ? Math.abs(dy) : Math.abs(dx)) * 0.3;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); sfx('hover'); }
  }

  // controller in menus: d-pad / left stick moves, A presses, B goes back
  pollPad() {
    requestAnimationFrame(() => this.pollPad());
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let dir = null, a = false, b = false;
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const pr = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const x = gp.axes[0] || 0, y = gp.axes[1] || 0;
      if (pr(12) || y < -0.6) dir = 'up'; else if (pr(13) || y > 0.6) dir = 'down';
      else if (pr(14) || x < -0.6) dir = 'left'; else if (pr(15) || x > 0.6) dir = 'right';
      a = a || pr(0); b = b || pr(1);
    }
    const p = this.pad, now = performance.now();
    const pressA = a && !p.a, pressB = b && !p.b;
    p.a = a; p.b = b;
    if (!this.navOn()) { p.dir = null; return; }
    if (dir && (dir !== p.dir || now >= p.next)) {
      p.next = now + (dir !== p.dir ? 420 : 150);
      this.moveFocus(dir);
    }
    p.dir = dir;
    if (pressA) {
      const scope = this.navScope(), el = document.activeElement;
      if (scope && el && scope.contains(el) && el !== scope) el.click();
      else this.moveFocus('down');
    }
    if (pressB) {
      const modals = document.querySelectorAll('.modal-wrap');
      if (modals.length) modals[modals.length - 1].remove();
      else this.escape({ code: 'Escape', preventDefault() {} });
    }
  }

  // replace = true clears the history (e.g. going home)
  show(screenFn, params = {}, { replace = false, push = true } = {}) {
    const scr = screenFn(this, params);
    scr.fn = screenFn; scr.params = params;
    if (replace) this.stack = [];
    if (push) this.stack.push(scr);
    this.swap(scr);
    return scr;
  }

  swap(scr) {
    const old = this.current;
    if (old) {
      if (old.leave) old.leave();
      old.el.classList.add('screen-out');
      setTimeout(() => old.el.remove(), 260);
    }
    scr.el.classList.add('screen', 'screen-in');
    this.root.appendChild(scr.el);
    requestAnimationFrame(() => scr.el.classList.remove('screen-in'));
    this.current = scr;
    if (scr.enter) scr.enter();
    const first = scr.el.querySelector('[autofocus], .btn:not([disabled])');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }

  back() {
    if (this.current && this.current.back && this.current.back() === true) return;
    if (this.stack.length <= 1) return;
    this.stack.pop();
    const prev = this.stack[this.stack.length - 1];
    // rebuild the previous screen so it shows fresh data
    const scr = prev.fn(this, prev.params);
    scr.fn = prev.fn; scr.params = prev.params;
    this.stack[this.stack.length - 1] = scr;
    this.swap(scr);
  }

  hide() {
    if (this.current) {
      if (this.current.leave) this.current.leave();
      this.current.el.remove();
      this.current = null;
    }
    this.stack = [];
  }

  toast(text, kind = '') {
    const t = h('div', { class: 'toast ' + kind }, text);
    this.toastBox.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3000);
  }

  // simple modal: { title, text, buttons: [{ label, onClick, cls }] }
  modal(o) {
    const wrap = h('div', { class: 'modal-wrap' });
    const close = () => wrap.remove();
    const box = h('div', { class: 'modal panel' },
      h('h2', {}, o.title || ''),
      o.text ? h('p', {}, o.text) : null,
      o.body || null,
      h('div', { class: 'row end' }, ...(o.buttons || [{ label: 'OK' }]).map((b) => btn({ label: b.label, cls: b.cls || 'small', icon: b.icon, onClick: () => { close(); if (b.onClick) b.onClick(); } }))));
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    return close;
  }
}

// a header bar with a back button and a title
export function header(ui, title, extra = null) {
  return h('div', { class: 'scr-head' },
    btn({ label: 'Back', icon: 'back', cls: 'small ghost', onClick: () => ui.back() }),
    h('h1', { class: 'scr-title' }, title),
    extra || h('span'));
}

export function statBar(label, value, max = 10, color = '') {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return h('div', { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-bar' }, h('i', { style: { width: pct + '%', background: color || null } })));
}

export function countUp(el, to, ms = 900, fmt = (v) => Math.round(v)) {
  const from = 0, t0 = performance.now();
  const step = (now) => {
    const f = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - f, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (f < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export { icon };
