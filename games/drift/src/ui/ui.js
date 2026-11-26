// Drift! - screen manager and small form pieces used by the menus.
import { el, $ } from '../core/util.js';
import { input } from '../core/input.js';

export class UI {
  constructor(game) {
    this.g = game;
    this.root = $('#ui');
    this.current = null;   // { name, node, onKey }
    this.layers = [];      // confirm boxes on top
    input.listeners.push((e, down) => this.onKey(e, down));
  }

  get open() { return !!this.current || this.layers.length > 0; }
  is(name) { return !!this.current && this.current.name === name; }

  /** Show a screen: build() returns a node (and may set node.onKey). */
  show(name, build) {
    this.clear();
    const node = build();
    node.dataset.screen = name;
    this.root.append(node);
    this.current = { name, node };
    this.g.onUIChange && this.g.onUIChange();
    const first = node.querySelector('[autofocus]');
    if (first) setTimeout(() => first.focus(), 30);
    return node;
  }

  close() { this.clear(); this.g.onUIChange && this.g.onUIChange(); }

  clear() {
    if (this.current) { if (this.current.node.cleanup) this.current.node.cleanup(); this.current.node.remove(); }
    this.current = null;
    for (const l of this.layers) l.remove();
    this.layers = [];
  }

  onKey(e, down) {
    if (!down) return false;
    const top = this.layers[this.layers.length - 1] || (this.current && this.current.node);
    if (top && top.onKey) return top.onKey(e) === true;
    return false;
  }

  /** Yes/no question on top of everything. Resolves true/false. */
  confirm(title, text, okLabel = 'OK', danger = false) {
    return new Promise((resolve) => {
      const done = (v) => { node.remove(); this.layers = this.layers.filter((l) => l !== node); this.g.onUIChange && this.g.onUIChange(); resolve(v); };
      const node = el('div.screen.clear', { style: { zIndex: 30 } },
        el('div.card.confirm-box', el('h2', { text: title }), el('p.sub', { text }),
          el('div.actions', { style: { justifyContent: 'center' } },
            el('button.btn', { text: 'Cancel', onclick: () => done(false) }),
            el('button.btn' + (danger ? '.danger' : '.primary'), { text: okLabel, onclick: () => done(true) }))));
      node.onKey = (e) => { if (e.code === 'Escape') { done(false); return true; } if (e.code === 'Enter') { done(true); return true; } return false; };
      this.root.append(node);
      this.layers.push(node);
      this.g.onUIChange && this.g.onUIChange();
    });
  }
}

// ---- form pieces -----------------------------------------------------------------------
export function seg(options, value, onChange) {
  const box = el('div.seg');
  const set = (v) => { value = v; for (const b of box.children) b.classList.toggle('on', b.dataset.v === String(v)); };
  for (const [v, label] of options) box.append(el('button', { type: 'button', text: label, dataset: { v: String(v) }, onclick: () => { set(v); onChange(v); } }));
  set(value);
  box.set = set;
  return box;
}

export function toggle(label, value, onChange, hint) {
  const sw = el('button.switch' + (value ? '.on' : ''), { type: 'button', 'aria-label': label });
  sw.onclick = () => { value = !value; sw.classList.toggle('on', value); onChange(value); };
  return el('div.toggle', el('div', el('div', { text: label }), hint ? el('div.muted', { style: { fontSize: '12px' }, text: hint }) : null), sw);
}

export function slider(label, min, max, step, value, fmt, onChange) {
  const out = el('span.muted', { text: fmt(value) });
  const r = el('input', { type: 'range', min, max, step, value });
  r.oninput = () => { const v = Number(r.value); out.textContent = fmt(v); onChange(v); };
  return el('div.field', el('div.row', el('label.grow', { text: label }), out), r);
}

export function field(label, inputNode) { return el('div.field', el('label', { text: label }), inputNode); }
