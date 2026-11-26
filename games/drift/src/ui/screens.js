// Drift! - menu screens: loading, main menu, sign in, room browser, create room,
// car select, settings (with key rebinding), credits, pause menu, room settings, kicked.
import { el } from '../core/util.js';
import { settings, ACTIONS, keyName, CAMERA_MODES, CAMERA_NAMES } from '../core/settings.js';
import { seg, toggle, slider, field } from './ui.js';
import { GAME_NAME, VERSION, asset } from '../config.js';
import { LIMITS, QUICK_CHAT } from '../shared/protocol.js';
import { chatLogin, chatSignup } from '../net/net.js';
import { getCatalog } from '../car/car-model.js';
import { loadJSON } from '../core/assets.js';

const TIPS = [
  'Tap Space for the handbrake: it is the easiest way to start a drift.',
  'Hold the steering into the corner on the throttle to swing round a full 360.',
  'Press 1 to 8 for quick messages like "Nice drift!" and "Tandem? Follow me".',
  'Press C to switch between the chase, far chase, hood and cockpit cameras.',
  'Hold Tab to see everyone in the room. Tap it to keep it open.',
  'Press R if you get stuck: your car is put back on the nearest road.',
  'Press M for the big map: it shows where everyone in your room is.',
  'The drift assists can be switched off in Settings > Driving.',
];

// The game's logo: big italic DRIFT with an orange "!" over a tyre-mark stripe.
const logo = (small) => el('div.logo' + (small ? '.small' : ''), el('b', 'Drift', el('em', { text: '!' })), el('i'));

export function loadingScreen(ui, title = 'Loading...') {
  const fill = el('i');
  const text = el('div.status', { text: title });
  const node = ui.show('loading', () => el('div.screen.loading',
    logo(true), el('div.bar', fill), text, el('div.tip', { text: TIPS[(Math.random() * TIPS.length) | 0] })));
  return {
    set(p, t) { fill.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; if (t) text.textContent = t; },
    node,
  };
}

export function mainMenu(g) {
  g.ui.show('main', () => {
    const acc = g.net.me
      ? el('div.account', 'Signed in as ', el('b', { text: g.net.me.display }), g.net.me.owner ? el('span.badge.owner', { text: 'OWNER' }) : null)
      : el('div.account', { text: 'Uses your SahurHub Chat account' });
    return el('div.screen.main-menu',
      logo(false),
      el('div.logo-sub', { text: 'Slide round a sunny seaside county with your friends: coast road, village lanes, hairpins, the docks and the airfield. Every car is free.' }),
      el('div.menu-buttons',
        el('button.btn.primary', { text: 'Play Online', autofocus: true, onclick: () => g.play() }),
        el('button.btn', { text: 'Settings', onclick: () => settingsScreen(g, 'graphics', () => mainMenu(g)) }),
        el('button.btn', { text: 'Controls', onclick: () => settingsScreen(g, 'controls', () => mainMenu(g)) }),
        el('button.btn', { text: 'Credits', onclick: () => creditsScreen(g, () => mainMenu(g)) })),
      acc,
      el('div.version', { text: `${GAME_NAME} ${VERSION}` }));
  });
}

export function signInScreen(g, reason, onDone) {
  let mode = 'login';
  const name = el('input.input', { placeholder: 'Username', autocomplete: 'username', maxlength: 32, autofocus: true });
  const pass = el('input.input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', maxlength: 128 });
  const err = el('div.err', { text: reason || '' });
  const go = el('button.btn.primary', { text: 'Sign in' });
  const tabs = seg([['login', 'I already have an account'], ['signup', "I'm new"]], mode, (v) => { mode = v; go.textContent = v === 'login' ? 'Sign in' : 'Make my account'; pass.autocomplete = v === 'login' ? 'current-password' : 'new-password'; });
  const submit = async () => {
    err.textContent = '';
    if (!name.value.trim() || !pass.value) { err.textContent = 'Type your username and password.'; return; }
    go.disabled = true;
    try {
      if (mode === 'login') await chatLogin(name.value.trim(), pass.value); else await chatSignup(name.value.trim(), pass.value);
      onDone();
    } catch (e) { err.textContent = e.message; go.disabled = false; }
  };
  go.onclick = submit;
  const node = g.ui.show('signin', () => el('div.screen',
    el('div.card',
      el('h2', { text: 'Sign in' }),
      el('p.sub', { text: 'Drift! uses your SahurHub Chat account. Signing in here also signs you in to the chat.' }),
      tabs, el('div', { style: { height: '14px' } }),
      field('Username', name), field('Password', pass), err,
      el('div.actions', el('button.btn', { text: 'Back', onclick: () => mainMenu(g) }), go))));
  node.onKey = (e) => { if (e.code === 'Enter') { submit(); return true; } if (e.code === 'Escape') { mainMenu(g); return true; } return false; };
}

export function roomBrowser(g, message) {
  const list = el('div.room-list', el('div.empty', { text: 'Looking for rooms...' }));
  const err = el('div.err', { text: message || '' });
  const jName = el('input.input', { placeholder: 'Room name', maxlength: LIMITS.roomName[1] });
  const jPass = el('input.input', { type: 'password', placeholder: 'Password (if it has one)', maxlength: LIMITS.password[1] });
  const stats = el('span.stats-pill');
  const join = async (name, password) => {
    err.textContent = '';
    try { await g.joinRoom(name, password); } catch (e) { err.textContent = e.message; }
  };
  const refresh = async () => {
    try {
      const d = await g.net.request('rooms');
      list.innerHTML = '';
      stats.textContent = `${d.stats.players} driving in ${d.stats.rooms} of ${d.maxRooms} rooms`;
      const head = el('div.room-row.head', el('div', { text: 'Room' }), el('div.host', { text: 'Host' }), el('div', { text: 'Players' }), el('div'));
      list.append(head);
      if (!d.rooms.length) list.append(el('div.empty', { text: 'No rooms yet. Make one and your friends can join it!' }));
      for (const r of d.rooms) {
        const full = r.count >= r.max && !g.net.me.owner;
        const pick = () => { if (r.locked && !g.net.me.owner) { jName.value = r.name; jPass.value = ''; jPass.focus(); err.textContent = 'This room has a password: type it below and press Join.'; } else join(r.name, ''); };
        list.append(el('div.room-row', { title: r.priv ? 'Private room (only Owners can see it here)' : '' },
          el('div.name', r.priv ? el('span.lock', { text: 'PRIVATE' }) : null, r.name),
          el('div.host.muted', { text: r.host }),
          el('div.count' + (full ? '.full' : ''), { text: `${r.count}/${r.max}` }),
          el('button.btn.small' + (full ? '' : '.primary'), { text: full ? 'Full' : 'Join', disabled: full, onclick: pick })));
      }
    } catch (e) { list.innerHTML = ''; list.append(el('div.empty', { text: e.message })); }
  };
  const node = g.ui.show('rooms', () => el('div.screen',
    el('div.card.wide',
      el('div.card-head', el('div', el('h2', { text: 'Rooms' }), stats),
        el('div.row', el('button.btn.small', { text: 'Refresh', onclick: refresh }), el('button.btn.primary', { text: 'Create Room', onclick: () => createRoomScreen(g) }))),
      list,
      el('div.label', { text: 'Join a private room by its name' }),
      el('div.join-name', { style: { marginTop: '8px' } }, jName, jPass, el('button.btn.primary', { text: 'Join', onclick: () => join(jName.value, jPass.value) })),
      err,
      el('div.actions', el('button.btn', { text: 'Back', onclick: () => { g.net.close(); mainMenu(g); } })))));
  refresh();
  const timer = setInterval(() => { if (g.ui.is('rooms')) refresh(); else clearInterval(timer); }, 5000);
  node.cleanup = () => clearInterval(timer);
  node.onKey = (e) => { if (e.code === 'Enter' && document.activeElement && (document.activeElement === jName || document.activeElement === jPass)) { join(jName.value, jPass.value); return true; } if (e.code === 'Escape') { g.net.close(); mainMenu(g); return true; } return false; };
}

export function roomSettingsForm(o, { live }) {
  // o = settings object we edit in place
  const nodes = [];
  const name = el('input.input', { value: o.name || '', maxlength: LIMITS.roomName[1], placeholder: 'My room', autofocus: !live });
  name.oninput = () => { o.name = name.value; };
  nodes.push(field('Room name', name));
  if (!live) nodes.push(slider('Max players', LIMITS.minPlayers, LIMITS.maxPlayers, 1, o.max, (v) => String(v), (v) => { o.max = v; }));
  const pw = el('input.input', { type: 'text', value: o.password || '', maxlength: LIMITS.password[1], placeholder: live ? 'Leave empty for no password' : 'Optional' });
  pw.oninput = () => { o.password = pw.value; o.pwChanged = true; };
  const pwField = field('Password (private rooms only)', pw);
  pwField.hidden = !o.priv;
  nodes.push(field('Who can see it', seg([[false, 'Public (listed)'], [true, 'Private (join by name)']], !!o.priv, (v) => { o.priv = v; pwField.hidden = !v; })));
  nodes.push(pwField);
  nodes.push(toggle('Allow teleporting to players', o.teleport, (v) => { o.teleport = v; }, 'From the Players panel'));
  nodes.push(toggle('Ghost cars', o.ghost, (v) => { o.ghost = v; }, 'Players drive through each other (walls stay solid)'));
  return nodes;
}

export function createRoomScreen(g) {
  const me = g.net.me;
  const o = { name: `${me.display}'s room`.slice(0, LIMITS.roomName[1]), max: LIMITS.maxPlayers, priv: false, password: '', teleport: true, ghost: false };
  const err = el('div.err');
  const go = el('button.btn.primary', { text: 'Create Room' });
  go.onclick = async () => {
    err.textContent = ''; go.disabled = true;
    try { await g.createRoom(o); } catch (e) { err.textContent = e.message; go.disabled = false; }
  };
  const node = g.ui.show('create', () => el('div.screen',
    el('div.card', el('h2', { text: 'Create Room' }), el('p.sub', { text: 'You will be the room leader: you can kick players, change the room settings and hand over leadership.' }),
      ...roomSettingsForm(o, { live: false }), err,
      el('div.actions', el('button.btn', { text: 'Back', onclick: () => roomBrowser(g) }), go))));
  node.onKey = (e) => { if (e.code === 'Escape') { roomBrowser(g); return true; } return false; };
}

export function carSelectScreen(g, { inGame, onBack } = {}) {
  const cat = getCatalog();
  const cars = (cat && cat.cars) || [];
  let pick = settings.get('car') && cars.some((c) => c.id === settings.get('car')) ? settings.get('car') : (cars[0] && cars[0].id);
  const detail = el('div.car-detail');
  const tiles = new Map();
  const bar = (label, v) => el('div.stat', label, el('div.bar', el('i', { style: { width: Math.round(Math.max(0.05, Math.min(1, v)) * 100) + '%' } })));
  const showDetail = () => {
    const c = cars.find((x) => x.id === pick);
    detail.innerHTML = '';
    if (!c) return;
    const st = c.stats || {};
    const mph = Math.round((c.topSpeed || 0) * 2.237);
    detail.append(
      el('img', { src: asset('cars/' + c.thumb), alt: '' }),
      el('h3', { text: c.name }),
      el('div.muted', { text: `${c.type || ''}${mph ? ` - top speed ${settings.get('units') === 'kmh' ? Math.round(mph * 1.609) + ' km/h' : mph + ' mph'}` : ''}` }),
      bar('Top speed', st.speed ?? 0.5), bar('Acceleration', st.accel ?? 0.5), bar('Handling', st.handling ?? 0.5));
    for (const [id, t] of tiles) t.classList.toggle('on', id === pick);
  };
  const grid = el('div.car-grid');
  for (const c of cars) {
    const t = el('div.car-tile', { onclick: () => { pick = c.id; showDetail(); }, ondblclick: () => drive() },
      el('img', { src: asset('cars/' + c.thumb), alt: '', loading: 'lazy' }), el('div.t', c.name, el('small', { text: c.type || '' })));
    tiles.set(c.id, t); grid.append(t);
  }
  const err = el('div.err');
  const driveBtn = el('button.btn.primary', { text: inGame ? 'Switch to this car' : 'Drive' });
  const drive = async () => {
    if (!pick) return;
    driveBtn.disabled = true; err.textContent = '';
    try { await g.selectCar(pick); } catch (e) { err.textContent = e.message; driveBtn.disabled = false; }
  };
  driveBtn.onclick = drive;
  const node = g.ui.show('cars', () => el('div.screen' + (inGame ? '.clear' : ''),
    el('div.card.wide', el('div.card-head', el('h2', { text: 'Pick a car' }), el('span.muted', { text: `${cars.length} cars, all free` })),
      cars.length ? el('div.car-layout', grid, el('div', detail, err, el('div.actions', onBack ? el('button.btn', { text: 'Back', onclick: onBack }) : null, driveBtn)))
        : el('div.empty', { text: 'No cars have been added yet.' }))));
  showDetail();
  node.onKey = (e) => { if (e.code === 'Escape' && onBack) { onBack(); return true; } if (e.code === 'Enter') { drive(); return true; } return false; };
}

export function settingsScreen(g, tab = 'graphics', onBack) {
  const body = el('div');
  const tabsRow = el('div.tabs');
  const tabs = [['graphics', 'Graphics'], ['audio', 'Sound'], ['camera', 'Camera'], ['driving', 'Driving'], ['controls', 'Controls']];
  let waiting = null; // key rebinding
  const render = () => {
    body.innerHTML = '';
    tabsRow.innerHTML = '';
    for (const [id, label] of tabs) tabsRow.append(el('button' + (id === tab ? '.on' : ''), { text: label, onclick: () => { tab = id; waiting = null; render(); } }));
    const S = settings;
    if (tab === 'graphics') {
      body.append(
        field('Quality', seg([['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], S.get('quality'), (v) => { S.set('quality', v); })),
        el('div.muted', { style: { fontSize: '13px', marginTop: '-6px', marginBottom: '12px' }, text: 'Auto picks a level for this device and lowers it by itself if the game drops below about 30 FPS.' }),
        slider('Render scale', 0.5, 1, 0.05, S.get('renderScale'), (v) => Math.round(v * 100) + '%', (v) => S.set('renderScale', v)),
        toggle('Shadows', S.get('shadows'), (v) => S.set('shadows', v)),
        toggle('Show FPS', S.get('fps'), (v) => S.set('fps', v)),
        toggle('Tell me when quality is lowered automatically', S.get('autoQualityNotice'), (v) => S.set('autoQualityNotice', v)),
        toggle('Name tags above cars', S.get('nameTags'), (v) => S.set('nameTags', v)));
    } else if (tab === 'audio') {
      const pct = (v) => Math.round(v * 100) + '%';
      body.append(
        slider('Master volume', 0, 1, 0.05, S.get('volume'), pct, (v) => S.set('volume', v)),
        slider('Engines', 0, 1, 0.05, S.get('engineVolume'), pct, (v) => S.set('engineVolume', v)),
        slider('Effects', 0, 1, 0.05, S.get('effectsVolume'), pct, (v) => S.set('effectsVolume', v)));
    } else if (tab === 'camera') {
      body.append(
        field('Camera view', seg(CAMERA_MODES.map((m) => [m, CAMERA_NAMES[m]]), S.get('camera'), (v) => { if (g.cameraRig) g.cameraRig.setMode(v); else S.set('camera', v); })),
        slider('Field of view', 55, 95, 1, S.get('fov'), (v) => v + '°', (v) => S.set('fov', v)),
        slider('Chase camera distance', 0.7, 1.6, 0.05, S.get('camDistance'), (v) => Math.round(v * 100) + '%', (v) => S.set('camDistance', v)),
        slider('Mouse sensitivity', 0.3, 2.5, 0.05, S.get('mouseSens'), (v) => v.toFixed(2), (v) => S.set('mouseSens', v)));
    } else if (tab === 'driving') {
      body.append(
        el('div.label', { text: 'Drift assists' }),
        toggle('Auto countersteer', S.get('assistCountersteer'), (v) => S.set('assistCountersteer', v),
          'Once you slide, the front wheels steer for you. Steer toward the corner for more angle, let go to hold it, ease off the throttle to straighten up.'),
        toggle('Angle hold', S.get('assistAngleHold'), (v) => S.set('assistAngleHold', v),
          'Keeps your angle steady and stops the car spinning out. Past about 100 degrees it lets go, so you can still do 360s.'),
        toggle('Throttle help', S.get('assistThrottle'), (v) => S.set('assistThrottle', v),
          'While sliding, the throttle keeps you moving and the rear tyres let go a little easier.'),
        el('div', { style: { height: '14px' } }),
        field('Gearbox', seg([['auto', 'Automatic'], ['manual', 'Manual (E up, Q down)']], S.get('gearbox'), (v) => S.set('gearbox', v))));
    } else {
      const keys = S.get('keys');
      const grid = el('div.keys');
      for (const [action, label] of ACTIONS) {
        grid.append(el('div', { text: label }));
        for (let i = 0; i < 2; i++) {
          const code = (keys[action] || [])[i];
          const isWait = waiting && waiting.action === action && waiting.i === i;
          grid.append(el('button.keycap' + (isWait ? '.wait' : ''), { text: isWait ? 'Press a key...' : keyName(code), onclick: () => { waiting = { action, i }; render(); } }));
        }
      }
      const quick = el('div.quick-list');
      QUICK_CHAT.forEach((line, i) => quick.append(el('kbd', { text: String(i + 1) }), el('div', { text: line })));
      body.append(el('p.muted', { style: { fontSize: '13px', marginTop: 0 }, text: 'Click a key to change it, then press the new key. Esc cancels. Mouse: hold the right button to look around.' }), grid,
        el('div.actions', el('button.btn.small', { text: 'Reset all keys', onclick: () => { S.resetKeys(); render(); } })),
        el('div.label', { style: { marginTop: '18px' }, text: 'Quick messages (number keys while driving)' }), quick);
    }
  };
  const back = () => { if (onBack) onBack(); else g.ui.close(); };
  const node = g.ui.show('settings', () => el('div.screen' + (g.inRoom ? '.clear' : ''),
    el('div.card', el('div.card-head', el('h2', { text: 'Settings' }), el('button.btn.small', { text: 'Done', onclick: back })), tabsRow, body)));
  render();
  node.onKey = (e) => {
    if (waiting) {
      if (e.code !== 'Escape') settings.setKey(waiting.action, waiting.i, e.code);
      waiting = null; render(); return true;
    }
    if (e.code === 'Escape') { back(); return true; }
    return false;
  };
}

export async function creditsScreen(g, onBack) {
  const list = el('ul.credits-list', el('li', { text: 'Loading...' }));
  const node = g.ui.show('credits', () => el('div.screen',
    el('div.card', el('div.card-head', el('h2', { text: 'Credits' }), el('button.btn.small', { text: 'Done', onclick: onBack })),
      el('p.sub', { text: 'Drift! is made for SahurHub. These people made the models, textures and skies we used - thank you!' }), list)));
  node.onKey = (e) => { if (e.code === 'Escape') { onBack(); return true; } return false; };
  try {
    const c = await loadJSON(asset('credits.json'));
    list.innerHTML = '';
    for (const item of c.items || []) {
      list.append(el('li', el('b', { text: item.title }), ' by ', item.author, ' - ', item.licence, item.url ? el('span', ' (', el('a', { href: item.url, target: '_blank', rel: 'noopener', text: 'link' }), ')') : null, item.note ? el('div.muted', { text: item.note }) : null));
    }
    for (const t of c.tools || []) list.append(el('li', el('b', { text: t.title }), ' - ', t.licence));
  } catch (e) { list.innerHTML = ''; list.append(el('li', { text: 'Could not load the credits list.' })); }
}

export function pauseMenu(g) {
  const room = g.room;
  const isLeader = g.isLeader();
  const camRow = seg(CAMERA_MODES.map((m) => [m, CAMERA_NAMES[m].replace('Third person (', '').replace(')', '').replace(/^./, (c) => c.toUpperCase())]), g.cameraRig.mode, (v) => g.cameraRig.setMode(v));
  const node = g.ui.show('pause', () => el('div.screen.clear',
    el('div.card', el('div.card-head', el('div', el('h2', { text: 'Paused' }), el('div.muted', { text: `${room.name} - the world keeps going while you are here` })), el('button.btn.small', { text: 'Resume', onclick: () => g.ui.close() })),
      el('div.label', { text: 'Camera' }), el('div', { style: { margin: '8px 0 16px' } }, camRow),
      el('div.pause-grid',
        el('button.btn', { text: 'Change car', onclick: () => carSelectScreen(g, { inGame: true, onBack: () => pauseMenu(g) }) }),
        el('button.btn', { text: 'Repair car', onclick: () => { g.repairCar(); g.ui.close(); } }),
        el('button.btn', { text: 'Reset to road (R)', onclick: () => { g.resetCar(); g.ui.close(); } }),
        el('button.btn', { text: 'Players (Tab)', onclick: () => { g.ui.close(); g.players.open(true); } }),
        (isLeader || (g.net.me && g.net.me.owner)) ? el('button.btn', { text: 'Room settings', onclick: () => roomSettingsScreen(g) }) : null,
        el('button.btn', { text: 'Settings', onclick: () => settingsScreen(g, 'graphics', () => pauseMenu(g)) }),
        el('button.btn', { text: 'Controls', onclick: () => settingsScreen(g, 'controls', () => pauseMenu(g)) }),
        (g.net.me && g.net.me.owner) ? el('button.btn.danger', { text: 'Close room (Owner)', onclick: async () => { if (await g.ui.confirm('Close this room?', 'Everyone in it goes back to the room browser.', 'Close room', true)) g.net.request('close').catch((e) => g.hud.notice(e.message, 'bad')); } }) : null,
        el('button.btn.danger', { text: 'Leave room', onclick: async () => { if (await g.ui.confirm('Leave the room?', isLeader ? 'Someone else will become the leader.' : 'You can join again from the room browser.', 'Leave', true)) g.leaveRoom(); } })))));
  node.onKey = (e) => { if (e.code === 'Escape') { g.ui.close(); return true; } return false; };
}

export function roomSettingsScreen(g) {
  const r = g.room;
  const o = { name: r.name, priv: r.priv, password: '', teleport: r.teleport, ghost: r.ghost };
  const err = el('div.err');
  const save = el('button.btn.primary', { text: 'Save' });
  save.onclick = async () => {
    err.textContent = ''; save.disabled = true;
    const patch = {};
    for (const k of ['name', 'priv', 'teleport', 'ghost']) if (o[k] !== r[k]) patch[k] = o[k];
    if (o.pwChanged || (o.priv && !r.priv)) patch.password = o.password || '';
    try { if (Object.keys(patch).length) await g.net.request('settings', patch); pauseMenu(g); } catch (e) { err.textContent = e.message; save.disabled = false; }
  };
  const node = g.ui.show('roomsettings', () => el('div.screen.clear',
    el('div.card', el('h2', { text: 'Room settings' }), el('p.sub', { text: `Max players: ${r.max}. Changes apply for everyone straight away.` }),
      ...roomSettingsForm(o, { live: true }), err,
      el('div.actions', el('button.btn', { text: 'Back', onclick: () => pauseMenu(g) }), save))));
  node.onKey = (e) => { if (e.code === 'Escape') { pauseMenu(g); return true; } return false; };
}

export function messageScreen(g, title, text, button, onOk) {
  const node = g.ui.show('message', () => el('div.screen',
    el('div.card.confirm-box', el('h2', { text: title }), el('p.sub', { text }),
      el('div.actions', { style: { justifyContent: 'center' } }, el('button.btn.primary', { text: button, autofocus: true, onclick: onOk })))));
  node.onKey = (e) => { if (e.code === 'Enter' || e.code === 'Escape') { onOk(); return true; } return false; };
}
