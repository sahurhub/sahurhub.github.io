// Tiny DOM helpers: elements, modals, toasts, money formatting.
import { sfx } from '../core/audio.js';
import { icon } from './icons.js';

export const $ui = () => document.getElementById('ui');

export function el(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => '$' + Math.round(n || 0).toLocaleString('en-GB');
export const pct = (f) => Math.floor((f || 0) * 100 + 1e-6) + '%';
export const time = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export const stars = (n, max = 3) => `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(max - n)}</span></span>`;

let openModal = null;
export const modalOpen = () => !!openModal;

// A panel with a coloured header. opts = { title, color, icon, narrow, onClose, tabs: [[id, label]], tab, render(body, tab) }
export function modal(opts) {
  closeModal(true);
  const wrap = el('div', { class: 'modal' });
  const panel = el('div', { class: 'panel' + (opts.narrow ? ' narrow' : '') });
  const head = el('div', { class: 'panel-head ' + (opts.color || '') });
  head.innerHTML = `<h2>${opts.icon ? icon(opts.icon) : ''}${esc(opts.title)}</h2>${opts.headExtra || ''}`;
  if (opts.closable !== false) {
    const x = el('button', { class: 'btn x-btn', title: 'Close', onclick: () => closeModal() }, '&times;');
    head.appendChild(x);
  }
  panel.appendChild(head);
  let tabsEl = null;
  const body = el('div', { class: 'panel-body' });
  const state = { tab: opts.tab || (opts.tabs && opts.tabs[0][0]) };
  const draw = () => {
    if (tabsEl) for (const b of tabsEl.children) b.classList.toggle('on', b.dataset.tab === state.tab);
    body.innerHTML = '';
    opts.render(body, state.tab, draw);
    body.scrollTop = 0;
  };
  if (opts.tabs) {
    tabsEl = el('div', { class: 'tabs' });
    for (const [id, label] of opts.tabs) {
      tabsEl.appendChild(el('button', { class: 'tab', 'data-tab': id, onclick: () => { sfx.click(); state.tab = id; draw(); } }, esc(label)));
    }
    panel.appendChild(tabsEl);
  }
  panel.appendChild(body);
  wrap.appendChild(panel);
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap && opts.closable !== false) closeModal(); });
  $ui().appendChild(wrap);
  openModal = { wrap, opts, draw, state, head };
  sfx.open();
  draw();
  return openModal;
}

export function closeModal(silent) {
  if (!openModal) return;
  const m = openModal;
  openModal = null;
  m.wrap.remove();
  if (!silent && m.opts.onClose) m.opts.onClose();
}

export function redrawModal() { if (openModal) openModal.draw(); }
export function setModalHead(html) { if (openModal) { const x = openModal.head.querySelector('.money-small'); if (x) x.outerHTML = html; } }

let toastBox = null;
export function toast(text, kind = '') {
  if (!toastBox || !toastBox.isConnected) { toastBox = el('div', { class: 'toasts' }); $ui().appendChild(toastBox); }
  const t = el('div', { class: 'toast ' + kind }, esc(text));
  toastBox.appendChild(t);
  while (toastBox.children.length > 4) toastBox.firstChild.remove();
  setTimeout(() => t.remove(), 2600);
}

// Confirm dialog: resolves true / false
export function confirmBox(title, text, yes = 'Yes', no = 'Cancel') {
  return new Promise((resolve) => {
    modal({
      title, narrow: true, color: 'orange', closable: true, onClose: () => resolve(false),
      render(body) {
        body.innerHTML = `<p style="font-size:18px;margin:0 0 10px">${esc(text)}</p>`;
        const row = el('div', { class: 'row-btns' });
        row.appendChild(el('button', { class: 'btn grey', onclick: () => { closeModal(true); resolve(false); } }, esc(no)));
        row.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(true); resolve(true); } }, esc(yes)));
        body.appendChild(row);
      },
    });
  });
}
