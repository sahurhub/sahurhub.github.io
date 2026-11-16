// TURBO TOWN - sign in, multiplayer hub, party lobby, online results and the pause vote.
import { h, btn, header, icon } from '../ui.js';
import { KARTS, KART_BY_ID } from '../../shared/karts.js';
import { DRIVERS, MAP_INFO, pauseVotesNeeded } from '../../shared/rules.js';
import { fmtTime, ordinal } from '../hud.js';
import { chatLogin, chatSignup } from '../../net/net.js';

const mapName = (id) => (MAP_INFO.find((m) => m.id === id) || {}).name || id;

// ------------------------------------------------------------------ sign in

export function SignIn(ui, params) {
  let mode = 'login';
  const name = h('input', { type: 'text', maxlength: 20, autocomplete: 'username', placeholder: 'Name', class: 'field' });
  const pass = h('input', { type: 'password', maxlength: 100, autocomplete: 'current-password', placeholder: 'Password', class: 'field' });
  const msg = h('p', { class: 'muted' }, params.message || '');
  const title = h('h2', {}, 'Sign in to race');
  const go = btn({ label: 'Sign in', icon: 'play', color: '#3ddc84', onClick: () => submit() });
  const swap = h('button', { class: 'linkish', type: 'button' }, 'New here? Make an account');
  swap.addEventListener('click', () => {
    mode = mode === 'login' ? 'signup' : 'login';
    title.textContent = mode === 'login' ? 'Sign in to race' : 'Make your account';
    go.querySelector('.btn-label').textContent = mode === 'login' ? 'Sign in' : 'Make account';
    swap.textContent = mode === 'login' ? 'New here? Make an account' : 'I already have an account';
    pass.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  });
  const submit = async () => {
    go.disabled = true;
    msg.textContent = 'One moment...';
    try {
      if (mode === 'login') await chatLogin(name.value.trim(), pass.value);
      else await chatSignup(name.value.trim(), pass.value);
      msg.textContent = '';
      await params.onSignedIn();
    } catch (e) { msg.textContent = e.message; go.disabled = false; }
  };
  pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  const el = h('div', { class: 'menu-center' },
    h('div', { class: 'logo' }, h('span', { class: 'logo-a' }, 'TURBO'), h('span', { class: 'logo-b' }, 'TOWN')),
    h('div', { class: 'panel signin' },
      title,
      h('p', {}, 'Turbo Town uses your SahurHub Chat account. Your coins, karts and records are saved to it.'),
      name, pass, go, msg, swap,
      h('p', { class: 'muted small' }, 'Names are 3 to 20 letters, numbers or underscores. Passwords need at least 6 characters.')));
  return { el, noBack: true, enter() { name.focus(); } };
}

// ------------------------------------------------------------------ multiplayer hub

export function Multiplayer(ui) {
  const app = ui.app;
  const online = app.online;
  if (!online) {
    return { el: h('div', { class: 'menu-full' }, header(ui, 'Multiplayer'), h('div', { class: 'panel' }, h('h2', {}, 'Online racing'), h('p', {}, 'Multiplayer needs the Turbo Town server. Start the game signed in (it is online-only) to race with friends.'))) };
  }
  const code = h('input', { type: 'text', maxlength: 6, placeholder: 'ABC123', class: 'field code', autocapitalize: 'characters' });
  const msg = h('p', { class: 'muted' });
  const act = async (fn) => { msg.textContent = 'Connecting...'; try { await fn(); msg.textContent = ''; } catch (e) { msg.textContent = e.message; } };
  const el = h('div', { class: 'menu-full' }, header(ui, 'Multiplayer'),
    h('div', { class: 'grid2 mp' },
      h('div', { class: 'panel' }, h('h2', { html: icon('users') + ' Race with friends' }),
        h('p', {}, 'Make a party and share its code. Up to 8 racers.'),
        btn({ label: 'Create party', icon: 'crown', color: '#a55eea', onClick: () => act(() => online.create()) }),
        h('h3', {}, 'Got a code?'),
        h('div', { class: 'row' }, code, btn({ label: 'Join', icon: 'next', color: '#3ddc84', onClick: () => act(() => online.join(code.value)) }))),
      h('div', { class: 'panel' }, h('h2', { html: icon('flag') + ' Public race' }),
        h('p', {}, 'Race real players from anywhere. A race starts 30 seconds after a second player arrives, or straight away with 8.'),
        btn({ label: 'Find a race', icon: 'play', color: '#ff4f9a', onClick: () => act(() => online.queue()) }))),
    msg);
  code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  return { el };
}

// ------------------------------------------------------------------ party lobby (over the practice area)

export function PartyLobby(ui, params) {
  const online = params.online, app = ui.app;
  const codeChip = h('div', { class: 'party-code' });
  const list = h('div', { class: 'party-members' });
  const settings = h('div', { class: 'party-settings' });
  const actions = h('div', { class: 'party-actions' });
  const chatLog = h('div', { class: 'chat-log' });
  const chatIn = h('input', { type: 'text', maxlength: 140, placeholder: 'Say something nice...', class: 'field chat-in' });
  chatIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && chatIn.value.trim()) { online.chat(chatIn.value); chatIn.value = ''; }
    if (e.key === 'Escape') chatIn.blur();
  });
  const help = h('div', { class: 'party-help' }, 'Test-drive your kart while you wait: loop, ramps, boost pads, a drift pad and cones.');
  let kartPicker = null;

  const refresh = () => {
    const p = online.party;
    if (!p) return;
    const me = p.members.find((m) => m.uid === online.me.uid);
    const leader = online.isLeader();
    codeChip.innerHTML = '';
    if (p.code) {
      const copy = h('button', { class: 'copy', type: 'button', html: icon('copy') + ' Copy' });
      copy.addEventListener('click', () => {
        (navigator.clipboard ? navigator.clipboard.writeText(p.code) : Promise.reject()).then(() => ui.toast('Code copied!', 'good')).catch(() => ui.toast('Code: ' + p.code));
      });
      codeChip.append(h('span', {}, 'PARTY CODE: '), h('b', {}, p.code), copy);
    } else {
      const secs = p.startsAt ? Math.max(0, Math.ceil((p.startsAt - online.net.serverNow()) / 1000)) : 0;
      codeChip.append(h('span', {}, 'PUBLIC RACE'), h('b', {}, p.startsAt ? ` starts in ${secs}s` : ' waiting for players...'));
    }
    list.innerHTML = '';
    list.append(h('div', { class: 'pm-head' }, `Racers ${p.members.length}/8`));
    for (const m of p.members) {
      const d = DRIVERS.find((x) => x.id === m.driver);
      list.append(h('div', { class: 'pm' + (m.uid === online.me.uid ? ' me' : '') },
        h('span', { class: 'pm-dot', style: { background: d ? d.color : '#ccc' } }),
        h('span', { class: 'pm-name' }, m.name, m.uid === p.leader ? h('span', { class: 'crown', html: icon('crown') }) : null),
        h('span', { class: 'pm-kart muted' }, (KART_BY_ID[m.kart] || {}).name || m.kart),
        h('span', { class: 'pm-ready ' + (m.ready ? 'yes' : 'no') }, m.ready ? 'Ready' : 'Not ready')));
    }
    settings.innerHTML = '';
    settings.append(h('div', { class: 'ps-row' }, h('b', {}, 'Map: '), leader && !p.public ? mapSelect(p.map) : h('span', {}, mapName(p.map))),
      h('div', { class: 'ps-row' }, h('b', {}, 'Mode: '), leader && !p.public ? modeSelect(p.mode) : h('span', {}, p.mode === 'noitems' ? 'No items' : 'Race (with items)')));
    actions.innerHTML = '';
    actions.append(
      btn({ label: me && me.ready ? 'Not ready' : 'Ready', icon: 'check', cls: 'small', color: me && me.ready ? '#ffb02e' : '#3ddc84', onClick: () => online.ready(!(me && me.ready)) }),
      btn({ label: 'Change kart', icon: 'kart', cls: 'small', onClick: () => toggleKartPicker() }),
      leader && !p.public ? btn({ label: 'Start race', icon: 'flag', cls: 'small', color: '#ff4f9a', onClick: () => online.start().catch((e) => ui.toast(e.message, 'bad')) }) : null,
      btn({ label: 'Leave', icon: 'close', cls: 'small danger', onClick: () => online.leave() }));
  };

  const mapSelect = (cur) => {
    const s = h('select', { class: 'field small' });
    const opened = app.profile.get().maps;
    for (const m of MAP_INFO) if (opened.includes(m.id)) s.append(h('option', { value: m.id, selected: m.id === cur ? true : null }, m.name));
    s.addEventListener('change', () => online.settings({ map: s.value }).catch((e) => ui.toast(e.message, 'bad')));
    return s;
  };
  const modeSelect = (cur) => {
    const s = h('select', { class: 'field small' });
    s.append(h('option', { value: 'race', selected: cur === 'race' ? true : null }, 'Race (with items)'), h('option', { value: 'noitems', selected: cur === 'noitems' ? true : null }, 'No items'));
    s.addEventListener('change', () => online.settings({ mode: s.value }).catch((e) => ui.toast(e.message, 'bad')));
    return s;
  };

  const toggleKartPicker = () => {
    if (kartPicker) { kartPicker.remove(); kartPicker = null; return; }
    const prof = app.profile.get();
    kartPicker = h('div', { class: 'panel kart-picker' }, h('h3', {}, 'Kart'),
      h('div', { class: 'pick-row' }, ...KARTS.filter((k) => prof.karts.includes(k.id)).map((k) => {
        const b = h('button', { class: 'pick' + (prof.kart === k.id ? ' on' : ''), style: { '--c': k.colors[0] } }, h('span', { class: 'pick-dot' }), k.name);
        b.addEventListener('click', async () => { await app.profile.select(k.id, null); await online.setKart(k.id, prof.driver); toggleKartPicker(); online.enterLobby(); });
        return b;
      })),
      h('h3', {}, 'Driver'),
      h('div', { class: 'pick-row' }, ...DRIVERS.map((d) => {
        const b = h('button', { class: 'pick' + (prof.driver === d.id ? ' on' : ''), style: { '--c': d.color } }, h('span', { class: 'pick-dot' }), d.name);
        b.addEventListener('click', async () => { await app.profile.select(null, d.id); await online.setKart(prof.kart, d.id); toggleKartPicker(); online.enterLobby(); });
        return b;
      })));
    el.appendChild(kartPicker);
  };

  const addChat = (m) => {
    chatLog.append(h('div', { class: 'chat-line' + (m.from ? '' : ' sys') }, m.from ? h('b', {}, m.name + ': ') : null, m.text));
    while (chatLog.children.length > 50) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
  };
  for (const m of online.chatLog) addChat(m);

  const el = h('div', { class: 'party-lobby' },
    codeChip,
    h('div', { class: 'panel party-panel' }, list, settings, actions),
    h('div', { class: 'panel party-chat' }, chatLog, chatIn),
    help);
  const timer = setInterval(() => { if (online.party && online.party.public) refresh(); }, 1000);
  refresh();
  return { el, refresh, addChat, noBack: true, padNav: false, leave() { clearInterval(timer); }, onKey(e) { if (e.code === 'Escape') return true; return false; } };
}

// ------------------------------------------------------------------ online results

export function OnlineResults(ui, params) {
  const online = params.online, end = params.end;
  const me = online.me;
  const myRow = end.results.find((r) => r.uid === me.uid);
  const rw = end.rewards;
  const actions = h('div', { class: 'row center wrap' });
  const refresh = () => {
    actions.innerHTML = '';
    if (online.isLeader() && online.party && !online.party.public) actions.append(btn({ label: 'Back to lobby', icon: 'users', color: '#3ddc84', onClick: () => online.back().catch((e) => ui.toast(e.message, 'bad')) }));
    else actions.append(h('p', { class: 'muted' }, online.party && online.party.public ? 'Back to the lobby in a few seconds...' : 'Waiting for the party leader...'));
    actions.append(btn({ label: 'Leave party', icon: 'close', cls: 'danger small', onClick: () => online.leave() }));
  };
  const el = h('div', { class: 'menu-results' },
    h('div', { class: 'res-head' },
      h('div', { class: 'res-big place' + Math.min(4, myRow ? myRow.place : 4) }, myRow ? ordinal(myRow.place) : '-'),
      h('div', {}, h('h2', {}, 'Online race'), myRow && myRow.time ? h('p', {}, 'Time ' + fmtTime(myRow.time) + (myRow.best ? '   Best lap ' + fmtTime(myRow.best) : '')) : h('p', {}, 'Did not finish'),
        h('p', { class: 'muted' }, (myRow ? myRow.overtakes : 0) + ' overtakes'))),
    h('div', { class: 'res-cols' },
      h('div', { class: 'res-table' }, ...end.results.map((r) => h('div', { class: 'res-row' + (r.uid === me.uid ? ' me' : '') + (r.place <= 3 ? ' p' + r.place : '') },
        h('span', { class: 'res-place' }, ordinal(r.place)), h('span', { class: 'res-name' }, r.name + (r.left ? ' (left)' : '')),
        h('span', { class: 'res-kart muted' }, (KART_BY_ID[r.kart] || {}).name || ''), h('span', { class: 'res-time' }, r.time ? fmtTime(r.time) : 'DNF')))),
      rw ? h('div', { class: 'reward panel' }, h('h3', { html: icon('coin') + ' Rewards (saved to your account)' }),
        ...rw.lines.map((l) => h('div', { class: 'rw-line' }, h('span', {}, l.label), h('b', {}, '+' + l.coins))),
        h('div', { class: 'rw-line total' }, h('span', {}, 'Total coins'), h('b', {}, String(rw.coins))),
        h('div', { class: 'rw-line' }, h('span', {}, 'XP'), h('b', {}, String(rw.xp))),
        rw.levelUp ? h('div', { class: 'levelup' }, 'LEVEL UP! You are now level ' + rw.levelUp) : null) : h('div', { class: 'panel' }, h('p', {}, 'No rewards this time.'))),
    actions);
  refresh();
  if (rw && rw.profile) ui.app.profile.data = rw.profile;
  return { el, refresh, noBack: true };
}

// ------------------------------------------------------------------ pause vote panel

export function renderPauseVote(el, online, s) {
  const race = online.game.race;
  const players = race ? race.racers.map((r) => ({ uid: r.data.uid, name: r.name })) : [];
  const state = s ? s.state : 'none';
  el.innerHTML = '';
  const nameOf = (u) => (players.find((p) => p.uid === u) || {}).name || 'Racer';
  if (state === 'paused' || state === 'countdown') {
    const secs = state === 'countdown' ? Math.max(0, Math.ceil((s.resumeAt - online.net.serverNow()) / 1000)) : 0;
    const iReady = s.ready.includes(online.me.uid);
    el.append(h('div', { class: 'panel pause-panel big' },
      h('h1', {}, state === 'countdown' ? 'Back in ' + secs + '...' : 'RACE PAUSED'),
      h('div', { class: 'pv-list' }, ...s.active.map((u) => h('div', { class: 'pv' }, h('span', {}, nameOf(u)), h('b', { class: s.ready.includes(u) ? 'yes' : 'no' }, s.ready.includes(u) ? 'READY' : 'not ready')))),
      state === 'paused' ? btn({ label: iReady ? 'Waiting for the others' : 'READY', icon: 'check', color: '#3ddc84', disabled: iReady, onClick: () => online.readyUp() }) : null,
      state === 'paused' && s.autoAt ? h('p', { class: 'muted' }, 'The race carries on by itself after 90 seconds, so nobody gets stuck.') : null));
    if (state === 'countdown') setTimeout(() => online.renderPause(), 250);
    return;
  }
  const votes = s ? s.votes : [];
  const needed = s ? s.needed : pauseVotesNeeded(players.length);
  const iVoted = votes.includes(online.me.uid);
  el.append(h('div', { class: 'panel pause-panel' },
    h('h2', {}, 'REQUEST PAUSE'),
    h('p', {}, `${votes.length} / ${needed} votes needed. The race keeps going until the vote passes.`),
    h('div', { class: 'pv-list' }, ...(s ? s.active : players.map((p) => p.uid)).map((u) => h('div', { class: 'pv' }, h('span', {}, nameOf(u)), h('b', { class: votes.includes(u) ? 'yes' : 'no' }, votes.includes(u) ? 'wants a pause' : '-')))),
    h('div', { class: 'row' },
      btn({ label: iVoted ? 'Cancel my vote' : 'Request pause', icon: 'pause', cls: 'small', color: iVoted ? '#ffb02e' : '#a55eea', onClick: () => online.vote(!iVoted) }),
      btn({ label: 'Close', icon: 'close', cls: 'small ghost', onClick: () => { online.pausePanel = false; online.renderPause(); } }))));
}
