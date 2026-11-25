// Driver Online USA - room chat (Enter to type, Esc to close). Only people in the same room
// see it. The server filters bad words and limits how fast you can send.
import { el, $ } from '../core/util.js';
import { input } from '../core/input.js';
import { LIMITS } from '../shared/protocol.js';

export class Chat {
  constructor(game) {
    this.g = game;
    this.box = el('div#chat');
    this.log = el('div#chat-log');
    this.input = el('input#chat-input.input', { maxlength: LIMITS.chatLength, placeholder: 'Say something to the room (Enter to send, Esc to close)', hidden: true });
    this.box.append(this.log, this.input);
    $('#hud').append(this.box);
    this.typingSent = false;
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') { e.preventDefault(); this.send(); }
      else if (e.code === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.input.addEventListener('input', () => this.setTyping(this.input.value.length > 0));
    this.input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== this.input) this.close(); }, 50));
  }

  get isOpen() { return !this.input.hidden; }

  open() {
    this.input.hidden = false;
    this.box.classList.add('open');
    input.release();
    this.input.focus();
    this.log.scrollTop = this.log.scrollHeight;
    this.g.onUIChange();
  }

  close() {
    if (this.input.hidden) return;
    this.input.value = '';
    this.input.hidden = true;
    this.box.classList.remove('open');
    this.input.blur();
    this.setTyping(false);
    this.g.onUIChange();
  }

  setTyping(on) {
    if (on === this.typingSent) return;
    this.typingSent = on;
    this.g.net.send({ t: 'typing', on });
  }

  send() {
    const text = this.input.value.trim();
    if (text) this.g.net.send({ t: 'chat', text });
    this.close();
  }

  clear() { this.log.innerHTML = ''; }

  /** m = { pid, name, text, sys, owner } */
  add(m) {
    if (!m.sys && this.g.localMutes.has(m.uid || this.g.uidOf(m.pid))) return;
    const line = el('div.chat-line' + (m.sys ? '.sys' : ''));
    if (m.sys) line.textContent = m.text;
    else {
      line.append(el('b', { text: m.name }), m.owner ? ' ' : '', m.owner ? el('span.badge.owner', { text: 'OWNER' }) : '', ': ', m.text);
    }
    this.log.append(line);
    while (this.log.children.length > 60) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
    setTimeout(() => line.classList.add('faded'), 12000);
  }
}
