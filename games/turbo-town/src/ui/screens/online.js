// TURBO TOWN - sign in, multiplayer hub, party lobby, online results and the pause vote.
import { h, btn, header, icon } from '../ui.js';
import { KART_BY_ID, KARTS_BY_RATING, kartRating } from '../../shared/karts.js';
import { MAP_INFO, MAX_RACERS, pauseVotesNeeded } from '../../shared/rules.js';
import { fmtTime, ordinal } from '../hud.js';
import { chatLogin, chatSignup } from '../../net/net.js';

const mapName = (id) => (MAP_INFO.find((m) => m.id === id) || {}).name || id;

// ------------------------------------------------------------------ sign in

export function SignIn(ui, params) {
  // new players first; people who already have a SahurHub Chat account pick the big
  // "I already have an account" tab
  let mode = 'signup';
  const name = h('input', { type: 'text', maxlength: 20, autocomplete: 'username', placeholder: 'Pick a name', class: 'field' });
  const pass = h('input', { type: 'password', maxlength: 100, autocomplete: 'new-password', placeholder: 'Pick a password', class: 'field' });
  const msg = h('p', { class: 'muted' }, params.message || '');
  const title = h('h2', {}, 'Make your account');
  const go = btn({ label: 'Make account', icon: 'play', color: '#3ddc84', onClick: () => submit() });
  const tabNew = h('button', { type: 'button', class: 'signin-tab on' }, "I'm new");
  const tabHave = h('button', { type: 'button', class: 'signin-tab have' }, 'I already have an account');
  const setMode = (m) => {
    mode = m;
    tabNew.classList.toggle('on', m === 'signup');
    tabHave.classList.toggle('on', m === 'login');
    title.textContent = m === 'login' ? 'Welcome back! Sign in' : 'Make your account';
    go.querySelector('.btn-label').textContent = m === 'login' ? 'Sign in' : 'Make account';
    name.placeholder = m === 'login' ? 'Your name' : 'Pick a name';
    pass.placeholder = m === 'login' ? 'Your password' : 'Pick a password';
    pass.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    msg.textContent = '';
    name.focus();
  };
  tabNew.addEventListener('click', () => setMode('signup'));
  tabHave.addEventListener('click', () => setMode('login'));
  const swap = h('div', { class: 'signin-tabs' }, tabNew, tabHave);
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
      swap,
      title,
      h('p', {}, 'Turbo Town uses your SahurHub Chat account (the same one as the chat). Your coins, karts and records are saved to it.'),
      name, pass, go, msg,
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
        h('p', {}, `Make a party and share its code. Up to ${MAX_RACERS} racers.`),
        btn({ label: 'Create party', icon: 'crown', color: '#a55eea', onClick: () => act(() => online.create()) }),
        h('h3', {}, 'Got a code?'),
        h('div', { class: 'row' }, code, btn({ label: 'Join', icon: 'next', color: '#3ddc84', onClick: () => act(() => online.join(code.value)) }))),
      h('div', { class: 'panel' }, h('h2', { html: icon('flag') + ' Public race' }),
        h('p', {}, `Race real players from anywhere. A race starts 30 seconds after a second player arrives, or straight away with ${MAX_RACERS}.`),
        btn({ label: 'Find a race', icon: 'play', color: '#ff4f9a', onClick: () => act(() => online.queue()) })),
      h('div', { class: 'panel' }, h('h2', { html: icon('map') + ' Public city' }),
        h('p', {}, `Drive around Turbo City with anyone who is online. No race, just fun. Up to ${MAX_RACERS} drivers in each city.`),
        btn({ label: 'Drive in the city', icon: 'play', color: '#ff7a45', onClick: () => act(() => online.roam()) }))),
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
  // party chat lives in the chat box (bottom right): press / to talk to the party
  const help = h('div', { class: 'party-help' }, 'Drive around Turbo City while you wait. Press / to talk to your party, T for the public chat.');
  let kartPicker = null;

  const refresh = () => {
    const p = online.party;
    if (!p) return;
    const me = p.members.find((m) => m.uid === online.me.uid);
    const leader = online.isLeader();
    codeChip.innerHTML = '';
    help.textContent = p.roam
      ? 'Drive anywhere in Turbo City with everyone here. Hold Space to drift. Press / to talk to the city, T for the public chat.'
      : 'Drive around Turbo City while you wait. Hold Space to drift. Press / to talk to your party, T for the public chat.';
    if (p.roam) {
      // the public city: no code, no race, just who is here
      codeChip.append(h('span', {}, 'PUBLIC CITY'), h('b', {}, ` ${p.members.length}/${MAX_RACERS} drivers`));
      list.innerHTML = '';
      list.append(h('div', { class: 'pm-head' }, `Drivers ${p.members.length}/${MAX_RACERS}`));
      for (const m of p.members) {
        const kd = KART_BY_ID[m.kart];
        list.append(h('div', { class: 'pm' + (m.uid === online.me.uid ? ' me' : '') },
          h('span', { class: 'pm-dot', style: { background: kd ? kd.colors[0] : '#ccc' } }),
          h('span', { class: 'pm-name' }, m.name),
          h('span', { class: 'pm-kart muted' }, (KART_BY_ID[m.kart] || {}).name || m.kart)));
      }
      settings.innerHTML = '';
      actions.innerHTML = '';
      actions.append(
        btn({ label: 'Change car', icon: 'kart', cls: 'small', onClick: () => toggleKartPicker() }),
        btn({ label: 'Leave city', icon: 'close', cls: 'small danger', onClick: () => online.leave() }));
      return;
    }
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
    list.append(h('div', { class: 'pm-head' }, `Racers ${p.members.length}/${MAX_RACERS}`));
    for (const m of p.members) {
      const kd = KART_BY_ID[m.kart];
      list.append(h('div', { class: 'pm' + (m.uid === online.me.uid ? ' me' : '') },
        h('span', { class: 'pm-dot', style: { background: kd ? kd.colors[0] : '#ccc' } }),
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
      // the cars you own, weakest first, best last
      h('div', { class: 'pick-row' }, ...KARTS_BY_RATING.filter((k) => prof.karts.includes(k.id)).map((k) => {
        const b = h('button', { class: 'pick' + (prof.kart === k.id ? ' on' : ''), style: { '--c': k.colors[0] } }, h('span', { class: 'pick-dot' }), k.name, h('span', { class: 'pick-rate' }, String(kartRating(k.id))));
        b.addEventListener('click', async () => { await app.profile.select(k.id); await online.setKart(k.id); toggleKartPicker(); online.enterLobby(); });
        return b;
      })));
    el.appendChild(kartPicker);
  };

  const el = h('div', { class: 'party-lobby' },
    codeChip,
    h('div', { class: 'panel party-panel' }, list, settings, actions),
    help);
  const timer = setInterval(() => { if (online.party && online.party.public && !online.party.roam) refresh(); }, 1000);
  refresh();
  return { el, refresh, noBack: true, padNav: false, leave() { clearInterval(timer); }, onKey(e) { if (e.code === 'Escape') return true; return false; } };
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
    else actions.append(h('p', { class: 'muted' }, online.party && online.party.closing ? 'The party leader left, so the party closes after the results.' : online.party && online.party.public ? 'Back to the lobby in a few seconds...' : 'Waiting for the party leader...'));
    actions.append(btn({ label: 'Leave party', icon: 'close', cls: 'danger small', onClick: () => online.leave() }));
  };
  const el = h('div', { class: 'menu-results' },
    h('div', { class: 'res-head' },
      h('div', { class: 'res-big place' + Math.min(4, myRow ? myRow.place : 4) }, myRow ? ordinal(myRow.place) : '-'),
      h('div', {}, h('h2', {}, end.watched ? 'Race results' : 'Online race'),
        end.watched ? h('p', {}, 'You watched this race. You race in the next one.')
          : myRow && myRow.time ? h('p', {}, 'Time ' + fmtTime(myRow.time) + (myRow.best ? '   Best lap ' + fmtTime(myRow.best) : '')) : h('p', {}, 'Did not finish'),
        end.watched ? null : h('p', { class: 'muted' }, (myRow ? myRow.overtakes : 0) + ' overtakes'))),
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
  if ((state === 'paused' || state === 'countdown') && s.admin) {
    // an admin's pause: no ready-ups, only the admin carries on
    const secs = state === 'countdown' ? Math.max(0, Math.ceil((s.resumeAt - online.net.serverNow()) / 1000)) : 0;
    const mine = s.admin === online.me.uid;
    el.append(h('div', { class: 'panel pause-panel big' },
      h('h1', {}, state === 'countdown' ? 'Back in ' + secs + '...' : 'RACE PAUSED'),
      state === 'paused' ? h('p', {}, mine ? 'Press 1 to carry on the race.' : 'The race carries on soon.') : null));
    if (state === 'countdown') setTimeout(() => online.renderPause(), 250);
    return;
  }
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
