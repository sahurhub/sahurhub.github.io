// TURBO TOWN - the chat box. It is always there: a panel in the bottom right corner of the
// menus, and the last few lines in the bottom left while driving. It carries two chats:
//   Public chat - everyone playing. Press T to type.
//   Party chat  - only your party (or the public city you are in). Press / to type.
// Enter sends, Esc stops typing. Messages go through the game server, which filters bad
// words and stops spam (see server/lib/global-chat.js and the party chat in rooms.js).
const KEEP = 60;            // lines kept on screen
const RACE_LINES = 6;       // lines shown while driving
const RACE_FADE_MS = 12000; // lines fade after this long while driving

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
    this.channel = 'public';   // where typed messages go: 'public' or 'party'
    this.party = null;         // { label } while in a party or the public city
    this.root = el('div', 'gchat hidden');
    this.head = el('div', 'gchat-head');
    this.title = el('span', 'gchat-title', 'Chat');
    this.toggle = el('button', 'gchat-toggle', '-');
    this.toggle.type = 'button';
    this.toggle.title = 'Hide or show the chat';
    this.head.append(this.title, this.toggle);
    this.log = el('div', 'gchat-log');
    this.form = el('form', 'gchat-form');
    this.chan = el('button', 'gchat-chan', 'ALL');
    this.chan.type = 'button';
    this.chan.title = 'Who sees your message (click to switch)';
    this.input = el('input', 'gchat-input');
    this.input.maxLength = 140;
    this.input.autocomplete = 'off';
    this.sendBtn = el('button', 'gchat-send', 'Send');
    this.sendBtn.type = 'submit';
    this.form.append(this.chan, this.input, this.sendBtn);
    this.root.append(this.head, this.log, this.form);
    document.body.appendChild(this.root);

    this.toggle.addEventListener('click', () => this.setCollapsed(!this.collapsed));
    this.head.addEventListener('click', (e) => { if (e.target === this.head || e.target === this.title) this.setCollapsed(!this.collapsed); });
    this.chan.addEventListener('click', () => { this.setChannel(this.channel === 'party' ? 'public' : 'party'); this.input.focus(); });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (text) {
        if (this.channel === 'party' && this.party) this.net.send('chat', { text });
        else this.net.send('gchat', { text });
      }
      this.input.value = '';
      if (this.mode === 'race') this.input.blur(); // back to driving
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.input.value = ''; this.input.blur(); }
    });
    this.input.addEventListener('focus', () => this.root.classList.add('typing'));
    this.input.addEventListener('blur', () => this.root.classList.remove('typing'));
    // T opens the public chat anywhere, / the party chat (and Enter while driving opens
    // whichever was used last)
    addEventListener('keydown', (e) => {
      if (this.mode === 'hidden' || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      let want = null;
      if (e.code === 'KeyT') want = 'public';
      else if (e.key === '/' || e.code === 'Slash' || e.code === 'NumpadDivide') want = 'party';
      else if (this.mode === 'race' && e.key === 'Enter') want = this.channel;
      if (!want) return;
      e.preventDefault(); // so the key is not typed into the box
      if (want === 'party' && !this.party) {
        this.system('Party chat is for when you are in a party or the public city. Press T for the public chat.');
        return;
      }
      this.setChannel(want);
      if (this.collapsed) this.setCollapsed(false);
      this.input.focus();
    });

    net.on('gchatLog', (m) => { this.log.querySelectorAll('.gchat-line:not(.party)').forEach((l) => l.remove()); for (const x of m.list || []) this.add(x, true); });
    net.on('gchat', (m) => this.add(m.m));
    net.on('gchatClear', () => { this.log.querySelectorAll('.gchat-line:not(.party)').forEach((l) => l.remove()); this.system('An admin cleared the public chat.'); });
    net.on('gchatSlow', () => this.system('Slow down a little!'));
    this.setChannel('public');
  }

  // 'menu' (panel bottom right), 'race' (lines bottom left while driving) or 'hidden'
  setMode(mode) {
    if (mode === this.mode) return;
    if (this.mode === 'race' && document.activeElement === this.input) this.input.blur();
    this.mode = mode;
    this.root.classList.toggle('hidden', mode === 'hidden');
    this.root.classList.toggle('race', mode === 'race');
    this.root.classList.toggle('menu', mode === 'menu');
    this.setChannel(this.channel);
    if (mode === 'race') this.refreshRace();
    this.scroll();
  }

  // called when you join or leave a party / the public city. label: what to call it
  setParty(party) {
    const was = !!this.party;
    this.party = party ? { label: party.roam ? 'City' : 'Party' } : null;
    if (!this.party && this.channel === 'party') this.setChannel('public');
    else this.setChannel(this.channel);
    if (!was && this.party) this.system(this.party.label === 'City' ? 'Press / to talk to everyone in this city, T for the public chat.' : 'Press / to talk to your party, T for the public chat.');
  }

  setChannel(ch) {
    if (ch === 'party' && !this.party) ch = 'public';
    this.channel = ch;
    const party = ch === 'party';
    this.chan.textContent = party ? this.party.label.toUpperCase() : 'ALL';
    this.chan.classList.toggle('party', party);
    this.root.classList.toggle('to-party', party);
    const keys = this.party ? 'T: everyone, /: ' + this.party.label.toLowerCase() : 'Press T to chat';
    this.input.placeholder = party ? `Message your ${this.party.label.toLowerCase()} (Enter to send)` : this.mode === 'race' ? keys + ', Enter to send' : keys;
  }

  setCollapsed(on) {
    this.collapsed = on;
    this.root.classList.toggle('collapsed', on);
    this.toggle.textContent = on ? '+' : '-';
    if (!on) { this.unread = 0; this.updateTitle(); this.scroll(); }
  }

  updateTitle() { this.title.textContent = 'Chat' + (this.unread ? ` (${this.unread} new)` : ''); }

  add(m, old = false) {
    if (!m) return;
    const line = el('div', 'gchat-line' + (m.from === this.me.uid ? ' me' : ''));
    line.append(el('b', null, m.name + ': '), el('span', null, m.text));
    line.dataset.at = old ? 0 : Date.now();
    this.push(line);
    if (!old && this.collapsed && m.from !== this.me.uid) { this.unread++; this.updateTitle(); }
  }

  // a party (or public city) message: { from, name, text }; from 0 = the game saying something
  addParty(m) {
    if (!m) return;
    const label = this.party ? this.party.label : 'Party';
    const line = el('div', 'gchat-line party' + (m.from === this.me.uid ? ' me' : '') + (m.from ? '' : ' sys'));
    line.append(el('i', 'gchat-tag', label.toUpperCase()));
    if (m.from) line.append(el('b', null, m.name + ': '));
    line.append(el('span', null, m.text));
    line.dataset.at = Date.now();
    this.push(line);
    if (this.collapsed && m.from !== this.me.uid) { this.unread++; this.updateTitle(); }
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

  // while driving only the newest lines show, and they fade unless you are typing
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
