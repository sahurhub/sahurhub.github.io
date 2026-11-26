// TURBO TOWN - admin quick commands during online races. Only admin accounts get this, and
// the server checks every command again (server.js 'adminRace'). It works like Rocket
// League's quick chat:
//   1          pause the race straight away, no vote (press 1 again to carry on)
//   2, 3, 4    open a menu (Race, Me, Everyone); then 2, 3 or 4 runs one of its commands
//   1          while a menu is open: close it (it also closes by itself after a few seconds)
export const ADMIN_MENUS = {
  2: { name: 'Race', cmds: { 2: ['end', 'End the race now'], 3: ['lobby', 'Stop: back to the lobby'], 4: ['clear', 'Clear items off the track'] } },
  3: { name: 'Me', cmds: { 2: ['boost', 'Big boost'], 3: ['item', 'Give me an item'], 4: ['rainbow', 'Rainbow Rush'] } },
  4: { name: 'Everyone', cmds: { 2: ['freezeAll', 'Freeze everyone'], 3: ['rocketLeader', 'Rocket the leader'], 4: ['itemAll', 'Item for everyone'] } },
};
const OPEN_FOR = 5; // seconds a menu stays open

export class AdminQuick {
  constructor(app) {
    this.app = app;
    this.menu = 0;
    this.t = 0;
    this.el = null;
    // every press of 1-4 is queued in order (even two quick presses of the same key)
    this.queue = [];
    addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const m = /^(Digit|Numpad)([1-4])$/.exec(e.code);
      if (m) this.queue.push(Number(m[2]));
    });
  }

  // every frame during an online race
  tick(dt) {
    if (this.menu) { this.t -= dt; if (this.t <= 0) this.close(); }
    const q = this.queue;
    this.queue = [];
    for (const k of q) this.press(k);
  }

  press(key) {
    if (key === 1) {
      if (this.menu) this.close();
      else this.send('pause');
      return;
    }
    if (!this.menu) { this.open(key); return; }
    const [cmd] = ADMIN_MENUS[this.menu].cmds[key];
    this.close();
    this.send(cmd);
  }

  send(cmd) {
    const net = this.app.online && this.app.online.net;
    if (!net) return;
    net.request('adminRace', { cmd }).catch((e) => this.app.game.hud.toast(e.message, 'bad'));
  }

  open(n) { this.menu = n; this.t = OPEN_FOR; this.render(); }
  // also called every frame outside online races: presses made there are dropped
  close() { this.queue.length = 0; if (!this.menu && !this.el) return; this.menu = 0; this.render(); }

  render() {
    if (!this.menu) { if (this.el) { this.el.remove(); this.el = null; } return; }
    if (!this.el) { this.el = document.createElement('div'); this.el.className = 'admin-quick'; document.body.appendChild(this.el); }
    const m = ADMIN_MENUS[this.menu];
    const row = (k, text, cls = '') => `<div class="aq-row ${cls}"><kbd>${k}</kbd><span>${text}</span></div>`;
    this.el.innerHTML = `<div class="aq-title">ADMIN: ${m.name.toUpperCase()}</div>`
      + [2, 3, 4].map((k) => row(k, m.cmds[k][1])).join('')
      + row(1, 'Close', 'dim');
  }
}
