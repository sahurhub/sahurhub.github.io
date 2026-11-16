// TURBO TOWN - admin panel. Only shown to admin accounts (joe); the server checks every
// request again, so this screen alone gives nobody any powers.
import { h, btn, header, icon } from '../ui.js';
import { levelFromXp } from '../../shared/rules.js';
import { KARTS } from '../../shared/karts.js';

export function Admin(ui) {
  const app = ui.app, prof = app.profile;
  const say = (msg, kind = 'good') => ui.toast(msg, kind);
  const run = async (fn) => {
    try { const out = await fn(); if (out && out.what) say(out.what + (out.name && out.uid ? ' for ' + out.name : '')); return out; } catch (e) { say(e.message, 'bad'); return null; }
  };

  // ---- you
  const meBox = h('div', { class: 'admin-summary' });
  const drawMe = () => { meBox.replaceChildren(summary(prof.get())); };
  drawMe();
  const myLevel = h('input', { class: 'field small', type: 'number', min: 1, max: 60, value: 25, style: { width: '6em' } });
  const myCoins = h('input', { class: 'field small', type: 'number', value: 10000, style: { width: '8em' } });
  const forMe = (action, value) => run(() => prof.adminAct(0, action, value)).then((o) => { if (o) drawMe(); });

  // ---- another player
  const who = h('input', { class: 'field small', placeholder: 'Player name', maxlength: 24 });
  const found = h('div', { class: 'admin-found muted' }, 'Find a player by their name to change their profile.');
  let target = null;
  const drawTarget = () => {
    if (!target) return;
    const lvIn = h('input', { class: 'field small', type: 'number', min: 1, max: 60, value: target.profile.level || 1, style: { width: '6em' } });
    const coinIn = h('input', { class: 'field small', type: 'number', value: 1000, style: { width: '8em' } });
    const act = (action, value) => run(() => prof.adminAct(target.uid, action, value)).then((o) => { if (o) { target = o; drawTarget(); } });
    found.className = 'admin-found';
    found.replaceChildren(
      summary(target.profile, target.name),
      h('div', { class: 'row wrap' },
        btn({ label: 'Unlock everything', icon: 'star', cls: 'small', color: '#ffb02e', onClick: () => act('unlockAll') }),
        btn({ label: 'Gold cups', icon: 'trophy', cls: 'small', color: '#ffb02e', onClick: () => act('gold') }),
        btn({ label: 'Kick from party', icon: 'close', cls: 'small', color: '#a55eea', onClick: () => run(() => prof.adminKick(target.uid)).then((o) => { if (o) say('Taken out of their party'); }) })),
      h('div', { class: 'row wrap' }, h('span', {}, 'Coins'), coinIn, btn({ label: 'Give', cls: 'small', color: '#3ddc84', onClick: () => act('coins', coinIn.value) }),
        h('span', {}, 'Level'), lvIn, btn({ label: 'Set', cls: 'small', color: '#2fb6ff', onClick: () => act('level', lvIn.value) })),
      h('div', { class: 'row wrap' }, btn({ label: 'Reset their progress', icon: 'restart', cls: 'small danger', onClick: () => confirmReset(target.name, () => act('reset')) })));
  };
  const find = async () => {
    const out = await run(() => prof.adminFind(who.value));
    if (out) { target = out; drawTarget(); }
  };
  who.addEventListener('keydown', (e) => { if (e.key === 'Enter') find(); });

  // ---- server
  const serverBox = h('div', { class: 'admin-server muted' }, 'Loading...');
  const loadServer = async () => {
    const info = await prof.adminInfo().catch((e) => ({ error: e.message }));
    if (info.error) { serverBox.textContent = info.error; return; }
    if (info.local) { serverBox.textContent = 'Test mode on this PC: there is no server here.'; return; }
    serverBox.className = 'admin-server';
    serverBox.replaceChildren(
      h('p', {}, `${info.online.length} online, ${info.parties ?? 0} parties, ${info.races ?? 0} races running. Server up ${info.upMinutes} minutes.`),
      ...info.online.map((o) => h('div', { class: 'admin-row' },
        h('b', {}, o.name), h('span', { class: 'muted' }, o.racing ? 'racing' : o.party ? 'in party ' + o.party : 'in menus'),
        o.party ? btn({ label: 'Kick', cls: 'small ghost', onClick: () => run(() => prof.adminKick(o.uid)).then((r) => { if (r) { say(o.name + ' was taken out of the party'); loadServer(); } }) }) : h('span'),
        btn({ label: 'Open', cls: 'small ghost', onClick: () => { who.value = o.name; find(); } }))));
  };

  const confirmReset = (name, go) => ui.modal({
    title: 'Reset progress?',
    text: `This puts ${name} back to a brand new player: coins, karts, levels, cups and records are wiped. It cannot be undone.`,
    buttons: [{ label: 'Reset', cls: 'small danger', onClick: go }, { label: 'Cancel', cls: 'small ghost' }],
  });

  const el = h('div', { class: 'menu-full admin' }, header(ui, 'Admin'),
    h('div', { class: 'panel' },
      h('h3', {}, 'Your account'), meBox,
      h('div', { class: 'row wrap' },
        btn({ label: 'Unlock everything', sub: 'All karts, maps, cups and styles', icon: 'star', color: '#ffb02e', onClick: () => forMe('unlockAll') }),
        btn({ label: 'Gold in every cup', icon: 'trophy', color: '#ffb02e', onClick: () => forMe('gold') })),
      h('div', { class: 'row wrap' },
        h('span', {}, 'Coins'), myCoins, btn({ label: 'Give', cls: 'small', color: '#3ddc84', onClick: () => forMe('coins', myCoins.value) }),
        btn({ label: 'Take', cls: 'small', color: '#ff8a3d', onClick: () => forMe('coins', -Math.abs(Number(myCoins.value) || 0)) }),
        h('span', {}, 'Level'), myLevel, btn({ label: 'Set', cls: 'small', color: '#2fb6ff', onClick: () => forMe('level', myLevel.value) })),
      h('div', { class: 'row wrap' },
        btn({ label: 'Reset my progress', icon: 'restart', cls: 'small danger', onClick: () => confirmReset('your account', () => forMe('reset')) }))),
    h('div', { class: 'panel' },
      h('h3', {}, 'Other players'),
      h('div', { class: 'row wrap' }, who, btn({ label: 'Find', icon: 'user', cls: 'small', onClick: find })),
      found),
    h('div', { class: 'panel' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', {}, 'Server'), btn({ label: 'Refresh', icon: 'restart', cls: 'small ghost', onClick: loadServer })),
      serverBox));
  loadServer();
  return { el };
}

function summary(p, name) {
  const lv = levelFromXp(p.xp || 0).level;
  return h('div', { class: 'admin-sum' },
    h('span', { html: icon('shield') }),
    h('b', {}, name || p.name || 'You'),
    h('span', {}, `Level ${p.level || lv}`),
    h('span', {}, `${(p.coins || 0).toLocaleString('en-GB')} coins`),
    h('span', {}, `${(p.karts || []).length}/${KARTS.length} karts`),
    h('span', {}, `${(p.maps || []).length}/8 maps`),
    h('span', {}, `${(p.cupsOpen || []).length}/4 cups`));
}
