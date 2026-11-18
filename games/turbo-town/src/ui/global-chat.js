// TURBO TOWN - the public chat for everyone playing. It is always there: a panel in the
// bottom right corner of the menus, and the last few lines in the bottom left during races
// (press T to type - or Enter in a race - Enter to send, Esc to stop typing). Messages go through the
// game server, which filters bad words and stops spam (see server/lib/global-chat.js).
const KEEP = 60;            // lines kept on screen
const RACE_LINES = 5;       // lines shown during a race
const RACE_FADE_MS = 12000; // race lines fade after this long

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export class GlobalChat {
  constructor(net, me) {
    this.net = net;
    this.me = me;              // { uid, name }
    this.mode = 'hidden';
    this.collapsed = false;
    this.unread = 0;
    this.root = el('div', 'gchat hidden');
    this.head = el('div', 'gchat-head');
    this.title = el('span', 'gchat-title', 'Public chat');
    this.toggle = el('button', 'gchat-toggle', '-');
    this.toggle.type = 'button';
    this.toggle.title = 'Hide or show the chat';
    this.head.append(this.title, this.toggle);
    this.log = el('div', 'gchat-log');
    this.form = el('form', 'gchat-form');
    this.input = el('input', 'gchat-input');
    this.input.maxLength = 140;
    this.input.autocomplete = 'off';
    this.input.placeholder = 'Say something nice';
    this.sendBtn = el('button', 'gchat-send', 'Send');
    this.sendBtn.type = 'submit';
    this.form.append(this.input, this.sendBtn);
    this.root.append(this.head, this.log, this.form);
    document.body.appendChild(this.root);

    this.toggle.addEventListener('click', () => this.setCollapsed(!this.collapsed));
    this.head.addEventListener('click', (e) => { if (e.target === this.head || e.target === this.title) this.setCollapsed(!this.collapsed); });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (text) this.net.send('gchat', { text });
      this.input.value = '';
      if (this.mode === 'race') this.input.blur(); // back to driving
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.input.value = ''; this.input.blur(); }
    });
    this.input.addEventListener('focus', () => this.root.classList.add('typing'));
    this.input.addEventListener('blur', () => this.root.classList.remove('typing'));
    // T opens the chat box anywhere (and Enter during a race)
    addEventListener('keydown', (e) => {
      if (this.mode === 'hidden' || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const open = e.code === 'KeyT' || (this.mode === 'race' && e.key === 'Enter');
      if (!open) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault(); // so the "t" is not typed into the box
      if (this.collapsed) this.setCollapsed(false);
      this.input.focus();
    });

    net.on('gchatLog', (m) => { this.log.innerHTML = ''; for (const x of m.list || []) this.add(x, true); });
    net.on('gchat', (m) => this.add(m.m));
    net.on('gchatClear', (m) => { this.log.innerHTML = ''; this.system('An admin cleared the chat.'); });
    net.on('gchatSlow', () => this.system('Slow down a little!'));
  }

  // 'menu' (panel bottom right), 'race' (lines bottom left) or 'hidden'
  setMode(mode) {
    if (mode === this.mode) return;
    if (this.mode === 'race' && document.activeElement === this.input) this.input.blur();
    this.mode = mode;
    this.root.classList.toggle('hidden', mode === 'hidden');
    this.root.classList.toggle('race', mode === 'race');
    this.root.classList.toggle('menu', mode === 'menu');
    this.input.placeholder = mode === 'race' ? 'Press T to chat, Enter to send' : 'Press T to chat';
    if (mode === 'race') this.refreshRace();
    this.scroll();
  }

  setCollapsed(on) {
    this.collapsed = on;
    this.root.classList.toggle('collapsed', on);
    this.toggle.textContent = on ? '+' : '-';
    if (!on) { this.unread = 0; this.updateTitle(); this.scroll(); }
  }

  updateTitle() { this.title.textContent = 'Public chat' + (this.unread ? ` (${this.unread} new)` : ''); }

  add(m, old = false) {
    if (!m) return;
    const line = el('div', 'gchat-line' + (m.from === this.me.uid ? ' me' : ''));
    line.append(el('b', null, m.name + ': '), el('span', null, m.text));
    line.dataset.at = old ? 0 : Date.now();
    this.push(line);
    if (!old && this.collapsed && m.from !== this.me.uid) { this.unread++; this.updateTitle(); }
  }

  system(text) {
    const line = el('div', 'gchat-line sys', text);
    line.dataset.at = Date.now();
    this.push(line);
  }

  push(line) {
    this.log.appendChild(line);
    while (this.log.children.length > KEEP) this.log.firstChild.remove();
    if (this.mode === 'race') this.refreshRace();
    this.scroll();
  }

  // during a race only the newest lines show, and they fade unless you are typing
  refreshRace() {
    const lines = [...this.log.children];
    const now = Date.now();
    lines.forEach((l, i) => {
      const recent = i >= lines.length - RACE_LINES;
      const fresh = now - Number(l.dataset.at || 0) < RACE_FADE_MS;
      l.classList.toggle('gone', !recent);
      l.classList.toggle('faded', recent && !fresh);
    });
  }

  scroll() { this.log.scrollTop = this.log.scrollHeight; }

  // called every frame by the app (cheap: only touches the DOM twice a second in races)
  tick() {
    if (this.mode !== 'race') return;
    const now = Date.now();
    if (now - (this.lastFade || 0) > 500) { this.lastFade = now; this.refreshRace(); }
  }
}
