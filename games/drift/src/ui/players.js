// Drift! - the Players panel: hold Tab to look, click "Pin" (or tap Tab) to keep it open.
// Each row: name, leader crown, OWNER badge, car (name + picture), ping with signal bars, typing.
// Click a row for: Teleport to them, Spectate them, Locate them, Mute (just for you), and for the
// room leader (or a SahurHub Owner): Kick (asks first), Make leader, Mute in room chat.
import { el, $ } from '../core/util.js';
import { carSpec } from '../car/car-model.js';
import { asset } from '../config.js';
import { colorFor } from './hud.js';

export class PlayersPanel {
  constructor(game) {
    this.g = game;
    this.node = el('div#players', { hidden: true });
    $('#hud').append(this.node);
    this.pinned = false;
    this.held = false;
    this.openRow = 0;
    this.dirty = true;
  }

  get visible() { return !this.node.hidden; }

  open(pin) { if (pin) this.pinned = true; this.node.hidden = false; this.render(); this.g.onUIChange && this.g.onUIChange(); }
  close() { this.pinned = false; this.held = false; this.openRow = 0; this.node.hidden = true; this.g.onUIChange && this.g.onUIChange(); }

  /** Tab held: show while held. A quick tap pins it open. */
  setHeld(on) {
    if (on && !this.held) { this.heldAt = performance.now(); this.held = true; if (this.pinned) { this.close(); return; } this.open(false); }
    else if (!on && this.held) {
      this.held = false;
      if (performance.now() - this.heldAt < 250) { this.pinned = true; return; }
      if (!this.pinned) this.close();
    }
  }

  markDirty() { this.dirty = true; if (this.visible) this.render(); }

  signal(ping) {
    const s = !ping ? 0 : ping < 80 ? 4 : ping < 150 ? 3 : ping < 250 ? 2 : 1;
    return el('span.signal.s' + s, el('i'), el('i'), el('i'), el('i'));
  }

  render() {
    const g = this.g, r = g.room;
    if (!r) return;
    const me = g.myPid;
    const canMod = g.isLeader() || (g.net.me && g.net.me.owner);
    const list = el('div.pp-list');
    const players = [...g.playerList.values()].sort((a, b) => (b.pid === r.leader) - (a.pid === r.leader) || a.joined - b.joined);
    for (const p of players) {
      const spec = p.car ? carSpec(p.car) : null;
      const isMe = p.pid === me;
      const row = el('div.pp-row' + (isMe ? '.me' : '') + (this.openRow === p.pid ? '.open' : ''), {
        onclick: (e) => { if (e.target.closest('.pp-actions')) return; if (isMe) return; this.openRow = this.openRow === p.pid ? 0 : p.pid; this.render(); },
      },
        el('div.pp-name',
          el('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: colorFor(p.pid), flex: 'none' } }),
          p.pid === r.leader ? el('span.crown', { title: 'Room leader', text: '♛' }) : null,
          el('span.n', { text: p.name + (isMe ? ' (you)' : '') }),
          p.owner ? el('span.badge.owner', { text: 'OWNER' }) : null,
          p.muted ? el('span.muted-tag', { text: 'muted' }) : null,
          g.localMutes.has(p.uid) ? el('span.muted-tag', { text: 'muted by you' }) : null,
          p.typing ? el('span.typing') : null),
        el('div.pp-car', spec ? el('img', { src: asset('cars/' + spec.thumb), alt: '' }) : null, el('span', { text: spec ? spec.name : 'Picking a car...' })),
        el('div.pp-ping', this.signal(p.ping), el('span', { text: p.ping ? `${p.ping} ms` : '-' })));
      if (this.openRow === p.pid && !isMe) {
        const acts = el('div.pp-actions');
        const tpOk = r.teleport || canMod;
        acts.append(
          el('button.btn.small', { text: 'Teleport to them', disabled: !tpOk, title: tpOk ? '' : 'The leader turned teleporting off', onclick: () => { g.teleportTo(p.pid); this.close(); } }),
          el('button.btn.small', { text: 'Spectate', onclick: () => { g.spectate(p.pid); this.close(); } }),
          el('button.btn.small', { text: g.locatePid === p.pid ? 'Stop locating' : 'Locate', onclick: () => { g.locate(g.locatePid === p.pid ? 0 : p.pid); this.render(); } }),
          el('button.btn.small', { text: g.localMutes.has(p.uid) ? 'Unmute (for me)' : 'Mute (for me)', onclick: () => { g.localMute(p.uid, !g.localMutes.has(p.uid)); this.render(); } }));
        if (canMod) {
          acts.append(
            el('button.btn.small', { text: p.muted ? 'Unmute in room chat' : 'Mute in room chat', onclick: () => g.net.request('mute', { pid: p.pid, on: !p.muted }).catch((e) => g.hud.notice(e.message, 'bad')) }),
            el('button.btn.small', { text: 'Make leader', onclick: async () => { if (await g.ui.confirm(`Make ${p.name} the leader?`, 'They get the leader controls and you become a normal player.', 'Make leader')) g.net.request('lead', { pid: p.pid }).catch((e) => g.hud.notice(e.message, 'bad')); } }),
            el('button.btn.small.danger', { text: 'Kick', onclick: async () => { if (await g.ui.confirm(`Kick ${p.name}?`, 'They are sent back to the room browser.', 'Kick', true)) g.net.request('kick', { pid: p.pid }).catch((e) => g.hud.notice(e.message, 'bad')); } }));
        }
        row.append(acts);
      }
      list.append(row);
    }
    this.node.innerHTML = '';
    this.node.append(
      el('div.pp-head',
        el('h3', el('span', { text: r.name }), r.priv ? el('span.badge.blue', { text: 'PRIVATE' }) : null,
          el('button.btn.small.pin', { text: this.pinned ? 'Close' : 'Pin open', onclick: () => { if (this.pinned) this.close(); else { this.pinned = true; this.render(); } } })),
        el('div.meta', el('span', { text: `${g.playerList.size}/${r.max} players` }),
          el('span', { text: r.teleport ? 'Teleporting on' : 'Teleporting off' }), r.ghost ? el('span', { text: 'Ghost cars' }) : null)),
      list,
      el('div.pp-foot', { text: canMod ? 'You can moderate this room: click a player for Kick, Make leader and Mute.' : 'Click a player to teleport, spectate, locate or mute them.' }));
    this.dirty = false;
  }
}
