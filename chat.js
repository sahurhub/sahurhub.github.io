/*
  SahurHub Chat: a Discord-style chat window.

  Loaded only when someone opens the chat, or quietly in the background when
  this device already has an account (so the Chat button can show unread
  badges). The chat server runs on the Oracle server (sahurhub-chat) and this
  file talks to it over a WebSocket.
*/

const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const API = LOCAL ? 'http://localhost:10002' : 'https://chat-79-72-86-205.nip.io';
const WS_URL = API.replace(/^http/, 'ws') + '/ws';
const KEYS = { device: 'sahurhub.chat.device', session: 'sahurhub.chat.session', prefs: 'sahurhub.chat.prefs' };

// Permissions (same numbers as the server's lib/perms.js)
const P = {
  ADMINISTRATOR: 1, VIEW_CHANNEL: 2, SEND_MESSAGES: 4, MANAGE_MESSAGES: 8, MANAGE_CHANNELS: 16, MANAGE_ROLES: 32,
  TIMEOUT_MEMBERS: 64, BAN_MEMBERS: 128, MENTION_EVERYONE: 256, VIEW_REPORTS: 512, MANAGE_MEMBERS: 1024,
  APPROVE_LOGOUTS: 2048, SEND_DMS: 4096
};
const PERM_LIST = [
  [P.ADMINISTRATOR, 'Administrator', 'Every permission below. Channel settings still apply, so #announcements stays Owner-only.'],
  [P.VIEW_CHANNEL, 'See channels', 'See channels and read their messages.'],
  [P.SEND_MESSAGES, 'Send messages', 'Talk in channels.'],
  [P.SEND_DMS, 'Send direct messages', 'Start and reply to direct messages.'],
  [P.MENTION_EVERYONE, 'Mention @everyone', 'Ping everybody at once with @everyone.'],
  [P.MANAGE_MESSAGES, 'Manage messages', 'Delete other people\'s messages and ignore slowmode.'],
  [P.TIMEOUT_MEMBERS, 'Time out members', 'Stop someone from talking for a while.'],
  [P.BAN_MEMBERS, 'Ban members', 'Ban and unban accounts (their devices too).'],
  [P.VIEW_REPORTS, 'Handle reports', 'See reported messages and deal with them.'],
  [P.MANAGE_MEMBERS, 'Manage members', 'Reset passwords and remove profile pictures or bios.'],
  [P.MANAGE_ROLES, 'Manage roles', 'Create and edit roles below their own, and give them out.'],
  [P.MANAGE_CHANNELS, 'Manage channels', 'Create, edit, reorder and delete channels, and set slowmode.'],
  [P.APPROVE_LOGOUTS, 'Approve log-outs', 'Accept or decline requests to log out of a device.']
];
const SWATCHES = ['#5b8def', '#2fb5c9', '#3fb27f', '#2ecc71', '#f0b232', '#f0a33a', '#e8615a', '#ff5c5c', '#e85fa3', '#a368e8', '#c27c4e', '#7b8794'];
const TIMEOUTS = [[60, '1 minute'], [300, '5 minutes'], [600, '10 minutes'], [3600, '1 hour'], [86400, '1 day'], [604800, '1 week']];
const SLOWMODES = [[0, 'Off'], [5, '5 seconds'], [10, '10 seconds'], [30, '30 seconds'], [60, '1 minute'], [120, '2 minutes'], [300, '5 minutes'], [600, '10 minutes'], [3600, '1 hour']];

const ICONS = {
  hash: '<path d="M5 9h14M4 15h14M10 4 8 20M16 4l-2 16"/>',
  megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M2.8 12h2.4M18.8 12h2.4M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  users: '<path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="8" r="3.5"/><path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.6a3.5 3.5 0 0 1 0 6.8"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  shrink: '<path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/>',
  reply: '<path d="M10 8 5 12.5 10 17"/><path d="M5.5 12.5H14a5 5 0 0 1 5 5V19"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  send: '<path d="M4.5 12 3 4.5 21 12 3 19.5Z"/><path d="M4.5 12H12"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  bellOff: '<path d="M6 16V11a6 6 0 0 1 9.4-4.9M18 11v5l1.5 2H8"/><path d="M10 20a2 2 0 0 0 4 0M3 3l18 18"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5Z" fill="currentColor" stroke-width="1.2"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5Z"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-9 8.5"/>',
  search: '<circle cx="10.6" cy="10.6" r="6.4"/><path d="m15.4 15.4 4.9 4.9"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6Z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.2 2"/>',
  ban: '<circle cx="12" cy="12" r="8.6"/><path d="M6 6l12 12"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>'
};
function icon(name, cls) {
  return `<svg class="ch-ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } }
};
const prefs = (() => {
  const base = { sound: true, members: true, full: false, rect: null };
  try { return Object.assign(base, JSON.parse(store.get(KEYS.prefs) || '{}')); } catch (e) { return base; }
})();
function savePrefs() { store.set(KEYS.prefs, JSON.stringify(prefs)); }

function deviceId() {
  let d = store.get(KEYS.device);
  if (!d || !/^[a-f0-9]{64}$/.test(d)) {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    d = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    store.set(KEYS.device, d);
  }
  return d;
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
// What everyone sees (display name), with the @username as a fallback.
function displayName(u) { return u ? (u.display || u.name) : 'Deleted user'; }
// Mentions are stored as <@id>. Turn them back into readable text.
function plainText(text, forEditing) {
  return String(text).replace(/<@(\d{1,12})>/g, (all, id) => {
    const u = S.users.get(Number(id));
    return u ? '@' + (forEditing ? u.name : displayName(u)) : all;
  });
}
function waitText(ms) {
  const hrs = Math.ceil(ms / 3600e3);
  if (hrs < 48) return hrs + (hrs === 1 ? ' hour' : ' hours');
  return Math.ceil(ms / 86400e3) + ' days';
}
const DISPLAY_COOLDOWN = 24 * 3600e3;
const NAME_COOLDOWN = 14 * 86400e3;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Phone-sized screen (Enter makes a new line, no automatic keyboard)
const narrow = () => window.matchMedia('(max-width: 720px)').matches;
// The chat's own width decides when side panels fold away (matches chat.css)
const compactView = () => !!view && view.clientWidth < 600;
const tightView = () => !!view && view.clientWidth < 820;
const hub = () => window.SahurHub || null;

function timeText(ts) { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
function dayText(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKey(ts) === dayKey(today)) return 'Today';
  if (dayKey(ts) === dayKey(yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
function fullTime(ts) { return dayText(ts) + ' at ' + timeText(ts); }
function agoText(ts) {
  if (!ts) return 'a while ago';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + (min === 1 ? ' minute ago' : ' minutes ago');
  const hr = Math.round(min / 60);
  if (hr < 24) return hr + (hr === 1 ? ' hour ago' : ' hours ago');
  const d = Math.round(hr / 24);
  return d + (d === 1 ? ' day ago' : ' days ago');
}
function durationText(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min < 60) return min + (min === 1 ? ' minute' : ' minutes');
  const hr = Math.ceil(min / 60);
  if (hr < 48) return hr + (hr === 1 ? ' hour' : ' hours');
  return Math.ceil(hr / 24) + ' days';
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const S = {
  status: 'idle',          // idle | connecting | ready | reconnecting | offline | signedout | banned
  statusMessage: '',
  me: 0,
  perms: 0,
  users: new Map(),
  roles: new Map(),
  channels: [],
  dms: new Map(),          // dm id -> { id, user, last }
  unread: {},              // key -> { n, m }
  counts: { reports: 0, logouts: 0 },
  device: '',
  logoutPending: false,
  limits: { message: 2000, bio: 190, topic: 120, keepDays: 90 },
  convos: new Map(),       // key -> { list, more, loaded, loading }
  current: '',
  typing: new Map(),       // key -> Map(user id -> expires)
  reply: null,
  editing: null,
  lastSent: new Map(),     // channel key -> time (for the slowmode countdown)
  fresh: new Set(),        // message ids that just arrived (they slide in)
  notice: ''
};
const listeners = new Set();
let started = false;

function me() { return S.users.get(S.me); }
function has(perm) { return (S.perms & perm) !== 0; }
function channelById(id) { return S.channels.find((c) => c.id === id); }
function convoInfo(key) {
  if (!key) return null;
  if (key[0] === 'c') { const ch = channelById(Number(key.slice(1))); return ch && !ch.hidden ? { type: 'c', ch } : null; }
  const dm = S.dms.get(Number(key.slice(1)));
  return dm ? { type: 'd', dm, user: S.users.get(dm.user) } : null;
}
function sortedRoles() { return [...S.roles.values()].sort((a, b) => b.position - a.position); }
function topPosition(u) {
  if (!u) return 0;
  if (u.owner) return Infinity;
  let top = 0;
  for (const id of u.roles) { const r = S.roles.get(id); if (r && r.position > top) top = r.position; }
  return top;
}
function canModerate(target) {
  const m = me();
  return !!m && !!target && target.id !== m.id && !target.owner && topPosition(m) > topPosition(target);
}
function aboveRole(role) { const m = me(); return !!m && (m.owner || topPosition(m) > role.position); }
function ownerRole() { return [...S.roles.values()].find((r) => r.kind === 'owner'); }
function displayRoles(u) {
  const list = u.roles.map((id) => S.roles.get(id)).filter(Boolean);
  if (u.owner) { const o = ownerRole(); if (o) list.push(o); }
  return list.sort((a, b) => b.position - a.position);
}
function nameColor(u) {
  if (!u) return '';
  const r = displayRoles(u).find((x) => x.color);
  return r ? r.color : '';
}
function badgeTotal() {
  let n = 0;
  for (const k in S.unread) {
    if (k[0] === 'd' || convoInfo(k)) n += S.unread[k].m || 0;
  }
  return n;
}
function notify() {
  const info = { mentions: badgeTotal(), unread: Object.keys(S.unread).some((k) => S.unread[k].n > 0 && convoInfo(k)), status: S.status, signedIn: !!store.get(KEYS.session) };
  listeners.forEach((fn) => { try { fn(info); } catch (e) { /* ignore */ } });
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

let ws = null;
let wsReady = false;
let refSeq = 0;
const pending = new Map();
let retry = 0;
let retryTimer = 0;
let gotAuthFailure = false;

function setStatus(status, message) {
  S.status = status;
  S.statusMessage = message || '';
  if (view) renderScreen();
  notify();
}

function connect() {
  clearTimeout(retryTimer);
  const token = store.get(KEYS.session);
  if (!token) { setStatus('signedout'); return; }
  if (ws) return;
  if (S.status !== 'ready' && S.status !== 'reconnecting') setStatus('connecting');
  gotAuthFailure = false;
  let sock;
  try { sock = new WebSocket(WS_URL); } catch (e) { scheduleRetry(); return; }
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ t: 'hello', token, device: deviceId() }));
  sock.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch (err) { return; }
    onEvent(m);
  };
  sock.onclose = (e) => {
    if (ws !== sock) return;
    ws = null;
    wsReady = false;
    for (const [, p] of pending) { clearTimeout(p.timer); p.reject(new Error('Lost connection to the chat. Try again in a moment.')); }
    pending.clear();
    if (e.code === 4002 || e.code === 4003 || gotAuthFailure) return;
    scheduleRetry();
  };
  sock.onerror = () => {};
}

function scheduleRetry() {
  setStatus(S.status === 'ready' || S.status === 'reconnecting' ? 'reconnecting' : 'offline');
  const delay = [1000, 2000, 4000, 8000, 15000, 30000][Math.min(retry++, 5)];
  retryTimer = setTimeout(connect, delay);
}

function req(t, data) {
  return new Promise((resolve, reject) => {
    if (!ws || !wsReady) { reject(new Error('Not connected to the chat right now.')); return; }
    const ref = ++refSeq;
    const timer = setTimeout(() => { pending.delete(ref); reject(new Error('The chat server did not answer. Try again.')); }, 15000);
    pending.set(ref, { resolve, reject, timer });
    ws.send(JSON.stringify(Object.assign({}, data || {}, { t, ref })));
  });
}

async function authRequest(kind, name, password, display) {
  let res;
  try {
    res = await fetch(API + '/api/' + kind, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password, display: display || undefined, device: deviceId() })
    });
  } catch (e) {
    throw new Error('Can\'t reach the chat server. Check your internet connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  store.set(KEYS.session, data.token);
  S.notice = '';
  retry = 0;
  connect();
}

function onEvent(m) {
  switch (m.t) {
    case 'res': {
      const p = pending.get(m.ref);
      if (!p) return;
      pending.delete(m.ref);
      clearTimeout(p.timer);
      if (m.ok) p.resolve(m.data); else p.reject(new Error(m.error || 'Something went wrong.'));
      return;
    }
    case 'ready': {
      retry = 0;
      wsReady = true;
      S.me = m.me;
      S.perms = m.perms;
      S.users = new Map(m.users.map((u) => [u.id, u]));
      S.roles = new Map(m.roles.map((r) => [r.id, r]));
      S.channels = m.channels;
      S.dms = new Map(m.dms.map((d) => [d.id, d]));
      S.unread = m.unread || {};
      S.counts = m.counts || { reports: 0, logouts: 0 };
      S.device = m.device || '';
      S.logoutPending = !!m.logoutPending;
      S.limits = m.limits || S.limits;
      S.convos.clear();
      if (!convoInfo(S.current)) S.current = '';
      setStatus('ready');
      if (view) { renderAll(); if (isVisible()) openConvo(S.current || firstChannelKey(), true); }
      return;
    }
    case 'auth_failed':
      gotAuthFailure = true;
      if (m.reason === 'banned') { setStatus('banned', m.message); return; }
      store.del(KEYS.session);
      setStatus('signedout');
      return;
    case 'logged_out':
      gotAuthFailure = true;
      store.del(KEYS.session);
      S.notice = m.message || 'You were logged out.';
      setStatus('signedout');
      return;
    case 'banned':
      gotAuthFailure = true;
      setStatus('banned', m.message);
      return;
    case 'msg': onMessage(m.message); return;
    case 'msg_update': onMessageUpdate(m.message); return;
    case 'msg_delete': onMessageDelete(m.key, m.id); return;
    case 'typing': onTyping(m.key, m.user); return;
    case 'read':
      if (S.unread[m.key]) { delete S.unread[m.key]; notify(); if (view) renderSide(); }
      return;
    case 'user': {
      const old = S.users.get(m.user.id);
      S.users.set(m.user.id, m.user);
      if (view) {
        renderMembers();
        renderSide();
        renderMe();
        if (!old || old.name !== m.user.name || old.avatar !== m.user.avatar || old.color !== m.user.color || String(old.roles) !== String(m.user.roles) || old.owner !== m.user.owner) refreshAuthor(m.user.id);
        if (m.user.id === S.me) renderComposer();
        refreshOpenProfile(m.user.id);
      }
      return;
    }
    case 'users':
      S.users = new Map(m.users.map((u) => [u.id, u]));
      if (view) { renderMembers(); renderSide(); renderMe(); renderMessages(false); }
      return;
    case 'structure':
      S.roles = new Map(m.roles.map((r) => [r.id, r]));
      S.channels = m.channels;
      S.perms = m.perms;
      if (view) {
        if (!convoInfo(S.current)) openConvo(firstChannelKey(), true);
        renderAll();
        refreshSettings();
      }
      return;
    case 'dm':
      S.dms.set(m.dm.id, m.dm);
      if (view) renderSide();
      return;
    case 'counts':
      S.counts = { reports: m.reports, logouts: m.logouts };
      if (view) { renderSide(); refreshSettings(); }
      return;
    case 'logout_state':
      S.logoutPending = !!m.pending;
      if (m.declined) toast('Your log-out request was declined.');
      if (view) { renderBanner(); refreshSettings(); }
      return;
    case 'notice':
      toast(m.message);
      return;
    default:
  }
}

function firstChannelKey() {
  const list = S.channels.filter((c) => !c.hidden);
  const general = list.find((c) => c.name === 'general');
  const ch = general || list[0];
  return ch ? 'c' + ch.id : '';
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function convo(key) {
  let c = S.convos.get(key);
  if (!c) { c = { list: [], more: true, loaded: false, loading: false }; S.convos.set(key, c); }
  return c;
}

async function loadHistory(key, older) {
  const c = convo(key);
  if (c.loading || (older && !c.more)) return;
  c.loading = true;
  try {
    const data = await req('history', { key, before: older && c.list.length ? c.list[0].id : 0 });
    if (older) c.list = data.messages.concat(c.list);
    else c.list = data.messages.concat(c.list.filter((m) => m.pending));
    c.more = data.more;
    c.loaded = true;
    if (!older) setFirstUnread(key);
  } catch (e) {
    toast(e.message);
  } finally {
    c.loading = false;
  }
  if (view && S.current === key) {
    if (older) prependRender();
    else { renderMessages(true); if (isVisible()) markRead(key); }
  }
}

// Where the "New" line goes when a conversation opens with unread messages.
function setFirstUnread(key) {
  const c = convo(key);
  const un = S.unread[key];
  c.firstUnread = 0;
  if (!un || !un.n) return;
  const real = c.list.filter((m) => !m.pending);
  const first = real[real.length - Math.min(un.n, real.length)];
  c.firstUnread = first ? first.id : 0;
}

function isMention(m) {
  if (m.author === S.me) return false;
  if (m.key[0] === 'd') return true;
  return m.everyone || m.mentions.includes(S.me);
}

function onMessage(m) {
  const c = S.convos.get(m.key);
  if (c && c.loaded) {
    const i = m.nonce ? c.list.findIndex((x) => x.pending && x.nonce === m.nonce) : -1;
    if (i >= 0) c.list.splice(i, 1, m);
    else if (!c.list.some((x) => x.id === m.id)) { c.list.push(m); S.fresh.add(m.id); }
  }
  // whoever sent it is no longer typing
  const t = S.typing.get(m.key);
  if (t && t.delete(m.author) && view && S.current === m.key) renderTyping();
  const watching = view && S.current === m.key && isVisible() && atBottom();
  if (m.author !== S.me && !watching) {
    const u = S.unread[m.key] || { n: 0, m: 0 };
    u.n += 1;
    if (isMention(m)) u.m += 1;
    S.unread[m.key] = u;
    if (isMention(m) && prefs.sound) ping();
    notify();
  }
  if (view) {
    if (S.current === m.key && c && c.loaded) {
      const stick = atBottom() || m.author === S.me;
      renderMessages(false);
      if (stick) scrollToBottom(); else showJump(true);
      if (watching) markRead(m.key);
    }
    renderSide();
  }
}

function onMessageUpdate(m) {
  const c = S.convos.get(m.key);
  if (!c) return;
  const i = c.list.findIndex((x) => x.id === m.id);
  if (i >= 0) c.list[i] = m;
  for (const x of c.list) if (x.reply && x.reply.id === m.id) x.reply = { id: m.id, author: m.author, content: m.content.slice(0, 160) };
  if (view && S.current === m.key) renderMessages(false);
}

function onMessageDelete(key, id) {
  const c = S.convos.get(key);
  if (!c) return;
  c.list = c.list.filter((x) => x.id !== id);
  for (const x of c.list) if (x.reply && x.reply.id === id) x.reply = { id, deleted: true };
  if (S.reply && S.reply.id === id) S.reply = null;
  if (S.editing && S.editing.id === id) S.editing = null;
  if (view && S.current === key) { renderMessages(false); renderComposer(); }
}

let readTimer = 0;
function markRead(key) {
  if (!key || !wsReady) return;
  const c = S.convos.get(key);
  const last = c && c.list.filter((m) => !m.pending).slice(-1)[0];
  const had = !!S.unread[key];
  if (had) { delete S.unread[key]; notify(); if (view) renderSide(); }
  if (!last) return;
  if (c.readUpTo >= last.id && !had) return;
  c.readUpTo = last.id;
  clearTimeout(readTimer);
  readTimer = setTimeout(() => { req('read', { key, id: last.id }).catch(() => {}); }, 250);
}

function onTyping(key, uid) {
  if (!S.typing.has(key)) S.typing.set(key, new Map());
  S.typing.get(key).set(uid, Date.now() + 7000);
  if (view && S.current === key) renderTyping();
  startTypingSweep();
}
let typingSweep = 0;
function startTypingSweep() {
  if (typingSweep) return;
  typingSweep = setInterval(() => {
    let any = false;
    for (const [key, map] of S.typing) {
      for (const [uid, until] of map) if (until < Date.now()) { map.delete(uid); if (view && key === S.current) renderTyping(); }
      if (map.size) any = true;
    }
    if (!any) { clearInterval(typingSweep); typingSweep = 0; }
  }, 1000);
}

// A short two-note ping for mentions and DMs.
let audioCtx = null;
function ping() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [880, 1318.5].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const s = t + i * 0.09;
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.16, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.28);
      o.connect(g).connect(audioCtx.destination);
      o.start(s);
      o.stop(s + 0.3);
    });
  } catch (e) { /* no sound */ }
}

// Message text: links, `code`, **bold**, *italic* and @mentions. Everything
// is escaped first, so nobody can put real HTML in a message. Mentions are
// stored as <@id> and always show the person's current display name.
function mentionHtml(u) {
  return `<span class="ch-mention${u.id === S.me ? ' is-me' : ''}" data-user="${u.id}">@${esc(displayName(u))}</span>`;
}
function formatText(text, ids) {
  return String(text).split(/(`[^`\n]+`)/g).map((part, i) => {
    if (i % 2) return '<code>' + esc(plainText(part.slice(1, -1))) + '</code>';
    let s = esc(part);
    const held = [];
    const hold = (html) => { held.push(html); return '\u0000' + (held.length - 1) + '\u0000'; };
    s = s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (url) => hold(`<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`));
    s = s.replace(/&lt;@(\d{1,12})&gt;/g, (all, id) => {
      const u = S.users.get(Number(id));
      return u && (!ids || ids.includes(u.id)) ? hold(mentionHtml(u)) : all;
    });
    s = s.replace(/(^|[^\w@])@(everyone|[A-Za-z0-9_]{3,20})\b/g, (all, pre, name) => {
      if (name === 'everyone') return pre + hold('<span class="ch-mention">@everyone</span>');
      const u = [...S.users.values()].find((x) => x.name.toLowerCase() === name.toLowerCase());
      return u ? pre + hold(mentionHtml(u)) : all;
    });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?![\w*])/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, (all, n) => held[Number(n)]);
  }).join('');
}

// ---------------------------------------------------------------------------
// The view (one copy, moved between the hub window and Desktop Mode)
// ---------------------------------------------------------------------------

let view = null;   // the .ch-app element
const el = {};     // parts of the view
let host = 'none'; // 'window' | 'embedded' | 'none'
let embeddedHost = null;

function buildView() {
  view = h(`
    <div class="ch-app" data-screen="loading">
      <div class="ch-screen ch-screen-loading"><div class="ch-spinner"></div><p>Connecting to SahurHub Chat</p></div>
      <div class="ch-screen ch-screen-offline">
        <div class="ch-card">
          <div class="ch-card-icon">${icon('chat')}</div>
          <h2>Can't reach the chat</h2>
          <p class="ch-muted">The chat server isn't answering right now. It will keep trying by itself.</p>
          <button class="ch-btn ch-btn-primary" type="button" data-act="retry">Try again</button>
        </div>
      </div>
      <div class="ch-screen ch-screen-banned">
        <div class="ch-card">
          <div class="ch-card-icon is-danger">${icon('ban')}</div>
          <h2>You are banned</h2>
          <p class="ch-muted ch-banned-reason"></p>
        </div>
      </div>
      <div class="ch-screen ch-screen-auth">
        <form class="ch-card ch-auth" novalidate>
          <div class="ch-card-icon">${icon('chat')}</div>
          <h2 class="ch-auth-title">Join SahurHub Chat</h2>
          <p class="ch-auth-notice" hidden></p>
          <div class="ch-seg" role="tablist">
            <button type="button" role="tab" data-mode="signup" aria-selected="true">Create account</button>
            <button type="button" role="tab" data-mode="login" aria-selected="false">Log in</button>
          </div>
          <label class="ch-field"><span>Username</span><span class="ch-at-field"><b>@</b><input name="name" autocomplete="username" maxlength="20" spellcheck="false" autocapitalize="off" required></span></label>
          <label class="ch-field ch-only-signup"><span>Display name <em>(optional)</em></span><input name="display" autocomplete="nickname" maxlength="32" placeholder="What everyone sees"></label>
          <label class="ch-field"><span>Password</span><input name="password" type="password" autocomplete="new-password" maxlength="100" required></label>
          <label class="ch-field ch-only-signup"><span>Password again</span><input name="password2" type="password" autocomplete="new-password" maxlength="100"></label>
          <p class="ch-hint ch-only-signup">Your username is 3 to 20 letters, numbers or underscores. You log in with it and people @mention you with it. Passwords need at least 6 characters.</p>
          <p class="ch-error" role="alert" hidden></p>
          <button class="ch-btn ch-btn-primary ch-btn-wide" type="submit">Create account</button>
          <p class="ch-hint ch-auth-rules">One account per device. There is no log-out button: to switch accounts you ask the Owner to log this device out.</p>
        </form>
      </div>
      <div class="ch-layout">
        <aside class="ch-side">
          <div class="ch-server">
            <span class="ch-server-name">SahurHub</span>
            <button class="ch-iconbtn ch-server-btn" type="button" data-act="server-settings" aria-label="Server settings" hidden>${icon('shield')}<span class="ch-dot-badge" hidden></span></button>
          </div>
          <div class="ch-side-scroll">
            <div class="ch-group-head"><span>Channels</span><button class="ch-iconbtn ch-iconbtn-sm" type="button" data-act="new-channel" aria-label="Create a channel" hidden>${icon('plus')}</button></div>
            <nav class="ch-chan-list" aria-label="Channels"></nav>
            <div class="ch-group-head"><span>Direct messages</span><button class="ch-iconbtn ch-iconbtn-sm" type="button" data-act="new-dm" aria-label="New direct message">${icon('plus')}</button></div>
            <nav class="ch-dm-list" aria-label="Direct messages"></nav>
          </div>
          <div class="ch-me">
            <button class="ch-me-card" type="button" data-act="my-profile"></button>
            <button class="ch-iconbtn" type="button" data-act="toggle-sound"></button>
            <button class="ch-iconbtn" type="button" data-act="settings" aria-label="Settings">${icon('gear')}</button>
          </div>
        </aside>
        <main class="ch-main">
          <header class="ch-head">
            <button class="ch-iconbtn ch-narrow-only" type="button" data-act="open-side" aria-label="Channels">${icon('menu')}<span class="ch-dot-badge" hidden></span></button>
            <span class="ch-head-icon"></span>
            <h2 class="ch-head-title"></h2>
            <span class="ch-head-topic"></span>
            <button class="ch-iconbtn" type="button" data-act="toggle-members" aria-label="Show members">${icon('users')}</button>
          </header>
          <div class="ch-banner" hidden></div>
          <div class="ch-msgs" tabindex="-1"><div class="ch-msgs-inner"></div></div>
          <button class="ch-jump" type="button" data-act="jump" hidden>New messages ${icon('down')}</button>
          <div class="ch-typing" aria-live="polite"></div>
          <form class="ch-compose">
            <div class="ch-suggest" hidden></div>
            <div class="ch-compose-bar" hidden><span class="ch-compose-bar-text"></span><button class="ch-iconbtn ch-iconbtn-sm" type="button" data-act="cancel-compose" aria-label="Cancel">${icon('close')}</button></div>
            <div class="ch-compose-box">
              <textarea rows="1" aria-label="Message"></textarea>
              <button class="ch-send" type="submit" aria-label="Send">${icon('send')}</button>
            </div>
            <div class="ch-compose-note" hidden></div>
          </form>
        </main>
        <aside class="ch-members" aria-label="Members"><div class="ch-members-scroll"></div></aside>
        <div class="ch-scrim" data-act="close-drawers"></div>
      </div>
      <div class="ch-layer"></div>
      <div class="ch-toast" role="status" aria-live="polite"></div>
    </div>`);
  const q = (s) => view.querySelector(s);
  Object.assign(el, {
    auth: q('.ch-auth'), authError: q('.ch-auth .ch-error'), authNotice: q('.ch-auth-notice'),
    side: q('.ch-side'), serverBtn: q('.ch-server-btn'), newChannel: q('[data-act="new-channel"]'),
    chans: q('.ch-chan-list'), dms: q('.ch-dm-list'), meCard: q('.ch-me-card'), sound: q('[data-act="toggle-sound"]'),
    head: q('.ch-head'), headIcon: q('.ch-head-icon'), headTitle: q('.ch-head-title'), headTopic: q('.ch-head-topic'),
    sideBadge: q('[data-act="open-side"] .ch-dot-badge'), membersBtn: q('[data-act="toggle-members"]'),
    banner: q('.ch-banner'), msgs: q('.ch-msgs'), inner: q('.ch-msgs-inner'), jump: q('.ch-jump'), typing: q('.ch-typing'),
    compose: q('.ch-compose'), input: q('.ch-compose textarea'), bar: q('.ch-compose-bar'), barText: q('.ch-compose-bar-text'),
    note: q('.ch-compose-note'), send: q('.ch-send'), suggest: q('.ch-suggest'),
    members: q('.ch-members-scroll'), layer: q('.ch-layer'), toast: q('.ch-toast'), bannedReason: q('.ch-banned-reason')
  });
  wireView();
  renderScreen();
}

function renderScreen() {
  if (!view) return;
  const screen = S.status === 'ready' || S.status === 'reconnecting' ? 'main'
    : S.status === 'signedout' ? 'auth' : S.status === 'banned' ? 'banned' : S.status === 'offline' ? 'offline' : 'loading';
  view.dataset.screen = screen;
  if (screen === 'banned') el.bannedReason.textContent = S.statusMessage ? 'Reason: ' + S.statusMessage : 'An admin banned this account.';
  if (screen === 'auth') {
    el.authNotice.hidden = !S.notice;
    el.authNotice.textContent = S.notice;
  }
  if (screen === 'main') renderBanner();
}

function renderAll() {
  renderSide();
  renderMe();
  renderHead();
  renderMessages(false);
  renderTyping();
  renderComposer();
  renderMembers();
  renderBanner();
  view.classList.toggle('show-members', !!prefs.members);
}

function renderBanner() {
  if (!view) return;
  let text = '';
  let cls = '';
  if (S.status === 'reconnecting') { text = 'Reconnecting to the chat...'; cls = 'is-warn'; }
  else if (S.logoutPending) { text = 'You asked to log out of this device. Waiting for the Owner to accept.'; cls = 'is-info'; }
  el.banner.hidden = !text;
  el.banner.className = 'ch-banner ' + cls;
  el.banner.textContent = text;
}

function avatarHtml(u, size) {
  const s = size || 40;
  if (!u) return `<span class="ch-avatar" style="width:${s}px;height:${s}px"></span>`;
  const inner = u.avatar
    ? `<img src="${esc(API + u.avatar)}" alt="" loading="lazy" decoding="async" crossorigin="anonymous">`
    : `<span>${esc(Array.from(displayName(u))[0].toUpperCase())}</span>`;
  return `<span class="ch-avatar" style="width:${s}px;height:${s}px;--av:${esc(u.color || '#7b8794')};font-size:${Math.round(s * 0.42)}px">${inner}</span>`;
}
function statusDot(u) { return `<span class="ch-status${u && u.online ? ' is-online' : ''}"></span>`; }
function nameHtml(u, extra) {
  if (!u) return '<span class="ch-name">Deleted user</span>';
  const c = nameColor(u);
  return `<span class="ch-name${extra ? ' ' + extra : ''}" data-user="${u.id}" title="@${esc(u.name)}"${c ? ` style="color:${esc(c)}"` : ''}>${esc(displayName(u))}</span>` +
    (u.owner ? `<span class="ch-crown" title="Owner">${icon('crown')}</span>` : '');
}

function renderSide() {
  if (!view || S.status === 'signedout') return;
  const manage = has(P.MANAGE_ROLES) || has(P.MANAGE_CHANNELS) || has(P.VIEW_REPORTS) || has(P.APPROVE_LOGOUTS) || has(P.BAN_MEMBERS) || has(P.MANAGE_MEMBERS) || has(P.TIMEOUT_MEMBERS);
  el.serverBtn.hidden = !manage;
  const pendingCount = (S.counts.reports || 0) + (S.counts.logouts || 0);
  const dot = el.serverBtn.querySelector('.ch-dot-badge');
  dot.hidden = !pendingCount;
  dot.textContent = pendingCount > 99 ? '99+' : String(pendingCount);
  el.newChannel.hidden = !has(P.MANAGE_CHANNELS);

  el.chans.innerHTML = S.channels.filter((c) => !c.hidden).map((c) => {
    const key = 'c' + c.id;
    const u = S.unread[key];
    const canSend = (c.perms & P.SEND_MESSAGES) !== 0;
    return `<button class="ch-chan${key === S.current ? ' is-active' : ''}${u && u.n ? ' is-unread' : ''}" type="button" data-key="${key}" title="${esc(c.topic || c.name)}">
      ${icon(canSend ? 'hash' : 'megaphone', 'ch-chan-icon')}<span class="ch-chan-name">${esc(c.name)}</span>
      ${u && u.m ? `<span class="ch-count">${u.m > 99 ? '99+' : u.m}</span>` : ''}</button>`;
  }).join('') || '<p class="ch-empty-small">No channels you can see.</p>';

  const dms = [...S.dms.values()].filter((d) => S.users.get(d.user) && (d.last || ('d' + d.id) === S.current)).sort((a, b) => b.last - a.last);
  el.dms.innerHTML = dms.map((d) => {
    const key = 'd' + d.id;
    const u = S.users.get(d.user);
    const un = S.unread[key];
    return `<button class="ch-dm${key === S.current ? ' is-active' : ''}${un && un.n ? ' is-unread' : ''}" type="button" data-key="${key}">
      <span class="ch-avatar-wrap">${avatarHtml(u, 30)}${statusDot(u)}</span><span class="ch-chan-name">${esc(displayName(u))}</span>
      ${un && un.m ? `<span class="ch-count">${un.m > 99 ? '99+' : un.m}</span>` : ''}</button>`;
  }).join('') || '<p class="ch-empty-small">Click + or someone\'s name to message them.</p>';

  const others = badgeTotal() - ((S.unread[S.current] && S.unread[S.current].m) || 0);
  el.sideBadge.hidden = others <= 0;
  el.sideBadge.textContent = others > 99 ? '99+' : String(others);
}

function renderMe() {
  if (!view) return;
  const u = me();
  if (!u) return;
  el.meCard.innerHTML = `<span class="ch-avatar-wrap">${avatarHtml(u, 34)}${statusDot({ online: S.status === 'ready' })}</span>
    <span class="ch-me-text"><span class="ch-me-name">${esc(displayName(u))}</span><span class="ch-me-sub">${S.status === 'ready' ? '@' + esc(u.name) : 'Connecting'}</span></span>`;
  el.meCard.setAttribute('aria-label', 'Your profile (' + displayName(u) + ')');
  el.sound.innerHTML = icon(prefs.sound ? 'bell' : 'bellOff');
  el.sound.setAttribute('aria-label', prefs.sound ? 'Turn ping sound off' : 'Turn ping sound on');
  el.sound.title = prefs.sound ? 'Ping sound is on' : 'Ping sound is off';
}

function renderHead() {
  if (!view) return;
  const info = convoInfo(S.current);
  if (!info) { el.headIcon.innerHTML = ''; el.headTitle.textContent = ''; el.headTopic.textContent = ''; return; }
  if (info.type === 'c') {
    el.headIcon.innerHTML = icon((info.ch.perms & P.SEND_MESSAGES) ? 'hash' : 'megaphone');
    el.headTitle.textContent = info.ch.name;
    el.headTopic.textContent = info.ch.topic || '';
  } else {
    el.headIcon.innerHTML = `<span class="ch-avatar-wrap">${avatarHtml(info.user, 24)}${statusDot(info.user)}</span>`;
    el.headTitle.innerHTML = nameHtml(info.user);
    el.headTopic.textContent = info.user && info.user.online ? 'Online' : info.user ? 'Last seen ' + agoText(info.user.lastSeen) : '';
  }
  el.membersBtn.classList.toggle('is-on', !!prefs.members);
}

function messageHtml(m, prev, firstUnreadId) {
  const u = S.users.get(m.author);
  const grouped = prev && !m.reply && prev.author === m.author && m.ts - prev.ts < 7 * 60000 && dayKey(prev.ts) === dayKey(m.ts) && prev.id !== firstUnreadId && m.id !== firstUnreadId;
  let out = '';
  if (!prev || dayKey(prev.ts) !== dayKey(m.ts)) out += `<div class="ch-day"><span>${esc(dayText(m.ts))}</span></div>`;
  if (m.id === firstUnreadId) out += '<div class="ch-new-line"><span>New</span></div>';
  const mine = m.author === S.me;
  const info = convoInfo(m.key);
  const canDelete = mine || (info && info.type === 'c' && (info.ch.perms & P.MANAGE_MESSAGES) && !(u && u.owner && !me().owner));
  let reply = '';
  if (m.reply) {
    if (m.reply.deleted) reply = `<div class="ch-reply"><span class="ch-reply-line"></span><span class="ch-muted">Original message was deleted</span></div>`;
    else {
      const ru = S.users.get(m.reply.author);
      reply = `<button class="ch-reply" type="button" data-jump="${m.reply.id}"><span class="ch-reply-line"></span>${avatarHtml(ru, 16)}${nameHtml(ru)}<span class="ch-reply-text">${esc(plainText(m.reply.content).replace(/\n/g, ' '))}</span></button>`;
    }
  }
  const actions = m.pending ? '' : `<div class="ch-actions">
      <button class="ch-iconbtn ch-iconbtn-sm" type="button" data-msg-act="reply" aria-label="Reply" title="Reply">${icon('reply')}</button>
      ${mine ? `<button class="ch-iconbtn ch-iconbtn-sm" type="button" data-msg-act="edit" aria-label="Edit" title="Edit">${icon('edit')}</button>` : ''}
      ${canDelete ? `<button class="ch-iconbtn ch-iconbtn-sm is-danger" type="button" data-msg-act="delete" aria-label="Delete" title="Delete">${icon('trash')}</button>` : ''}
      ${!mine ? `<button class="ch-iconbtn ch-iconbtn-sm" type="button" data-msg-act="report" aria-label="Report" title="Report">${icon('flag')}</button>` : ''}
    </div>`;
  const cls = ['ch-msg', grouped ? 'is-grouped' : '', isMention(m) && m.key[0] === 'c' ? 'is-mention' : '', m.pending ? 'is-pending' : '', m.failed ? 'is-failed' : '', S.fresh.has(m.id) ? 'is-new' : ''].filter(Boolean).join(' ');
  out += `<div class="${cls}" data-id="${m.id}">
    ${reply}
    <div class="ch-msg-row">
      ${grouped ? `<span class="ch-msg-gutter" title="${esc(fullTime(m.ts))}">${esc(timeText(m.ts))}</span>`
                : `<button class="ch-msg-avatar" type="button" data-user="${m.author}" aria-label="Profile">${avatarHtml(u, 40)}</button>`}
      <div class="ch-msg-body">
        ${grouped ? '' : `<div class="ch-msg-head">${nameHtml(u, 'is-clickable')}<span class="ch-time" title="${esc(fullTime(m.ts))}">${esc(dayKey(m.ts) === dayKey(Date.now()) ? 'Today at ' + timeText(m.ts) : fullTime(m.ts))}</span></div>`}
        <div class="ch-text">${formatText(m.content, m.pending ? null : m.mentions)}${m.edited ? '<span class="ch-edited" title="' + esc(fullTime(m.edited)) + '">(edited)</span>' : ''}</div>
      </div>
    </div>
    ${actions}
  </div>`;
  return out;
}

function renderMessages(scroll) {
  if (!view) return;
  const key = S.current;
  const info = convoInfo(key);
  if (!info) { el.inner.innerHTML = ''; return; }
  const c = convo(key);
  if (!c.loaded) { el.inner.innerHTML = '<div class="ch-loading-msgs"><div class="ch-spinner"></div></div>'; return; }
  const keepTop = el.msgs.scrollTop;
  let start = '';
  if (!c.more) {
    start = info.type === 'c'
      ? `<div class="ch-start"><div class="ch-start-icon">${icon((info.ch.perms & P.SEND_MESSAGES) ? 'hash' : 'megaphone')}</div><h3>Welcome to #${esc(info.ch.name)}</h3><p class="ch-muted">${esc(info.ch.topic || 'This is the start of the channel.')}</p></div>`
      : `<div class="ch-start">${avatarHtml(info.user, 64)}<h3>${esc(info.user ? info.user.name : '')}</h3><p class="ch-muted">This is the start of your direct messages. Only the two of you can read them.</p></div>`;
  } else {
    start = '<div class="ch-more"><div class="ch-spinner ch-spinner-sm"></div></div>';
  }
  let html = start;
  let prev = null;
  const firstUnread = c.firstUnread || 0;
  for (const m of c.list) { html += messageHtml(m, prev, firstUnread); prev = m; }
  el.inner.innerHTML = html;
  S.fresh.clear();
  if (scroll) scrollToBottom();
  else el.msgs.scrollTop = keepTop;
}

function prependRender() {
  const before = el.msgs.scrollHeight - el.msgs.scrollTop;
  renderMessages(false);
  el.msgs.scrollTop = el.msgs.scrollHeight - before;
}

function refreshAuthor(uid) {
  const c = S.convos.get(S.current);
  if (c && c.list.some((m) => m.author === uid || (m.reply && m.reply.author === uid))) renderMessages(false);
  if (convoInfo(S.current) && convoInfo(S.current).type === 'd') renderHead();
}

function atBottom() { return !el.msgs || el.msgs.scrollHeight - el.msgs.scrollTop - el.msgs.clientHeight < 80; }
function scrollToBottom() {
  if (!el.msgs) return;
  el.msgs.scrollTop = el.msgs.scrollHeight;
  requestAnimationFrame(() => { el.msgs.scrollTop = el.msgs.scrollHeight; });
  showJump(false);
}
function showJump(on) { if (el.jump) el.jump.hidden = !on; }

function renderTyping() {
  if (!view) return;
  const map = S.typing.get(S.current);
  const names = map ? [...map.keys()].filter((id) => id !== S.me).map((id) => S.users.get(id)).filter(Boolean).map(displayName) : [];
  let text = '';
  if (names.length === 1) text = names[0] + ' is typing';
  else if (names.length === 2) text = names[0] + ' and ' + names[1] + ' are typing';
  else if (names.length > 2) text = 'Several people are typing';
  el.typing.innerHTML = text ? `<span class="ch-typing-dots"><i></i><i></i><i></i></span><span>${esc(text)}</span>` : '';
}

function composeBlock() {
  const info = convoInfo(S.current);
  const u = me();
  if (!info || !u) return 'Pick a channel to start chatting.';
  if (u.timeoutUntil && u.timeoutUntil > Date.now()) return 'You are timed out for ' + durationText(u.timeoutUntil - Date.now()) + '.';
  if (info.type === 'c' && !(info.ch.perms & P.SEND_MESSAGES)) return info.ch.name === 'announcements' ? 'Only the Owner can post in #announcements.' : 'You cannot send messages in #' + info.ch.name + '.';
  if (info.type === 'd' && !has(P.SEND_DMS)) return 'You cannot send direct messages.';
  if (info.type === 'd' && (!info.user || info.user.banned)) return 'This person is no longer on SahurHub Chat.';
  return '';
}

function renderComposer() {
  if (!view) return;
  const info = convoInfo(S.current);
  const block = composeBlock();
  el.compose.classList.toggle('is-blocked', !!block);
  el.input.disabled = !!block;
  el.send.disabled = !!block;
  el.input.placeholder = block || (info ? (info.type === 'c' ? 'Message #' + info.ch.name : 'Message ' + (info.user ? info.user.name : '')) : '');
  if (S.editing) {
    el.bar.hidden = false;
    el.barText.textContent = 'Editing your message. Press Escape to cancel.';
  } else if (S.reply) {
    const ru = S.users.get(S.reply.author);
    el.bar.hidden = false;
    el.barText.innerHTML = 'Replying to ' + nameHtml(ru);
  } else {
    el.bar.hidden = true;
  }
  renderNote();
}

let noteTimer = 0;
function renderNote() {
  clearTimeout(noteTimer);
  const info = convoInfo(S.current);
  let text = '';
  const len = el.input.value.length;
  if (len > S.limits.message - 200) text = (S.limits.message - len) + ' characters left';
  if (info && info.type === 'c' && info.ch.slowmode && !(info.ch.perms & (P.MANAGE_MESSAGES | P.MANAGE_CHANNELS))) {
    const wait = (S.lastSent.get(S.current) || 0) + info.ch.slowmode * 1000 - Date.now();
    text = (text ? text + '  ' : '') + (wait > 0 ? 'Slowmode: wait ' + Math.ceil(wait / 1000) + 's' : 'Slowmode is on (' + slowText(info.ch.slowmode) + ')');
    if (wait > 0) noteTimer = setTimeout(renderNote, 1000 - (wait % 1000) + 20);
  }
  el.note.hidden = !text;
  el.note.textContent = text;
}
function slowText(sec) { const f = SLOWMODES.find((x) => x[0] === sec); return f ? f[1] : sec + ' seconds'; }

function renderMembers() {
  if (!view) return;
  const list = [...S.users.values()].filter((u) => !u.banned);
  const groups = new Map();
  const hoisted = sortedRoles().filter((r) => r.hoist && r.kind !== 'everyone');
  const online = [];
  const offline = [];
  for (const u of list) {
    if (!u.online) { offline.push(u); continue; }
    const role = hoisted.find((r) => (r.kind === 'owner' ? u.owner : u.roles.includes(r.id)));
    if (role) { if (!groups.has(role.id)) groups.set(role.id, []); groups.get(role.id).push(u); } else online.push(u);
  }
  const byName = (a, b) => displayName(a).localeCompare(displayName(b));
  let html = '';
  for (const r of hoisted) {
    const g = groups.get(r.id);
    if (g && g.length) html += memberGroup(r.name, g.sort(byName));
  }
  if (online.length) html += memberGroup('Online', online.sort(byName));
  if (offline.length) html += memberGroup('Offline', offline.sort(byName), true);
  el.members.innerHTML = html;
}
function memberGroup(title, users, off) {
  return `<div class="ch-mgroup"><div class="ch-mgroup-head">${esc(title)} - ${users.length}</div>` + users.map((u) => `
    <button class="ch-member${off ? ' is-offline' : ''}" type="button" data-user="${u.id}">
      <span class="ch-avatar-wrap">${avatarHtml(u, 32)}${statusDot(u)}</span>
      <span class="ch-member-text">${nameHtml(u)}${u.bio ? `<span class="ch-member-bio">${esc(u.bio.split('\n')[0])}</span>` : ''}</span>
    </button>`).join('') + '</div>';
}

// ---------------------------------------------------------------------------
// Opening conversations
// ---------------------------------------------------------------------------

function openConvo(key, force) {
  if (!key) { S.current = ''; renderAll(); return; }
  if (key === S.current && !force) { closeDrawers(); return; }
  if (S.current && S.current !== key) { S.reply = null; S.editing = null; el.input.value = ''; autosize(); }
  S.current = key;
  const c = convo(key);
  closeDrawers();
  renderSide();
  renderHead();
  renderTyping();
  renderComposer();
  showJump(false);
  if (!c.loaded) {
    renderMessages(true);
    loadHistory(key, false);
  } else {
    setFirstUnread(key);
    renderMessages(true);
    if (isVisible()) markRead(key);
  }
  if (!narrow()) setTimeout(() => { if (!el.input.disabled && isVisible()) el.input.focus({ preventScroll: true }); }, 30);
}

async function openDmWith(uid) {
  try {
    const data = await req('open_dm', { user: uid });
    S.dms.set(data.dm.id, data.dm);
    closeAllModals();
    openConvo('d' + data.dm.id);
  } catch (e) { toast(e.message); }
}

// ---------------------------------------------------------------------------
// Sending, editing, mentions
// ---------------------------------------------------------------------------

let typingSent = 0;
async function submit() {
  const text = el.input.value.trim();
  if (!text || composeBlock()) return;
  if (text.length > S.limits.message) { toast('That message is too long (' + S.limits.message + ' characters at most).'); return; }
  const key = S.current;
  if (S.editing) {
    const id = S.editing.id;
    S.editing = null;
    el.input.value = '';
    autosize();
    renderComposer();
    try { await req('edit', { id, content: text }); } catch (e) { toast(e.message); }
    return;
  }
  const nonce = Math.random().toString(36).slice(2);
  const reply = S.reply;
  const c = convo(key);
  const temp = { id: 'p' + nonce, pending: true, nonce, key, author: S.me, content: text, ts: Date.now(), mentions: [], everyone: false, edited: 0, reply: reply ? { id: reply.id, author: reply.author, content: reply.content || '' } : null };
  if (c.loaded) { c.list.push(temp); S.fresh.add(temp.id); renderMessages(false); scrollToBottom(); }
  el.input.value = '';
  S.reply = null;
  autosize();
  renderComposer();
  typingSent = 0;
  try {
    await req('send', { key, content: text, reply: reply ? reply.id : 0, nonce });
    S.lastSent.set(key, Date.now());
    renderNote();
  } catch (e) {
    c.list = c.list.filter((m) => m !== temp);
    if (S.current === key) {
      renderMessages(false);
      if (!el.input.value) { el.input.value = text; autosize(); }
    }
    toast(e.message);
  }
}

function startEdit(m) {
  S.editing = { id: m.id };
  S.reply = null;
  el.input.value = plainText(m.content, true);
  autosize();
  renderComposer();
  el.input.focus();
  el.input.setSelectionRange(el.input.value.length, el.input.value.length);
}

function autosize() {
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 180) + 'px';
}

// @name suggestions while typing
let suggestState = null;
function updateSuggest() {
  const pos = el.input.selectionStart;
  const before = el.input.value.slice(0, pos);
  const m = /(^|[^\w@])@([A-Za-z0-9_]{0,20})$/.exec(before);
  const info = convoInfo(S.current);
  if (!m || !info || info.type !== 'c') { hideSuggest(); return; }
  const q = m[2].toLowerCase();
  const list = [...S.users.values()].filter((u) => !u.banned && (u.name.toLowerCase().startsWith(q) || displayName(u).toLowerCase().startsWith(q)))
    .sort((a, b) => (b.online - a.online) || displayName(a).localeCompare(displayName(b))).slice(0, 6);
  const items = list.map((u) => ({ text: u.name, u }));
  if ((info.ch.perms & P.MENTION_EVERYONE) && 'everyone'.startsWith(q)) items.push({ text: 'everyone' });
  if (!items.length) { hideSuggest(); return; }
  suggestState = { start: pos - m[2].length, end: pos, items, index: 0 };
  drawSuggest();
}
function drawSuggest() {
  el.suggest.hidden = false;
  el.suggest.innerHTML = '<div class="ch-suggest-head">Mention someone</div>' + suggestState.items.map((it, i) => `
    <button class="ch-suggest-item${i === suggestState.index ? ' is-active' : ''}" type="button" data-suggest="${i}">
      ${it.u ? avatarHtml(it.u, 22) + nameHtml(it.u) + `<span class="ch-muted">@${esc(it.u.name)}</span>` : `<span class="ch-suggest-at">@</span><span class="ch-name">everyone</span><span class="ch-muted">Ping everybody</span>`}
    </button>`).join('');
}
function hideSuggest() { suggestState = null; if (el.suggest) el.suggest.hidden = true; }
function pickSuggest(i) {
  const it = suggestState && suggestState.items[i];
  if (!it) return;
  const v = el.input.value;
  const insert = it.text + ' ';
  el.input.value = v.slice(0, suggestState.start) + insert + v.slice(suggestState.end);
  const caret = suggestState.start + insert.length;
  el.input.setSelectionRange(caret, caret);
  hideSuggest();
  autosize();
  el.input.focus();
}

// ---------------------------------------------------------------------------
// Events on the view
// ---------------------------------------------------------------------------

function wireView() {
  // Sign up / log in
  let mode = 'signup';
  const setMode = (m) => {
    mode = m;
    el.auth.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    el.auth.classList.toggle('is-login', m === 'login');
    el.auth.querySelector('.ch-auth-title').textContent = m === 'login' ? 'Welcome back' : 'Join SahurHub Chat';
    el.auth.querySelector('[type="submit"]').textContent = m === 'login' ? 'Log in' : 'Create account';
    field('password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    el.authError.hidden = true;
  };
  const field = (n) => el.auth.querySelector(`input[name="${n}"]`);
  el.auth.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  el.auth.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = field('name').value.trim().replace(/^@/, '');
    const pw = field('password').value;
    const display = mode === 'signup' ? field('display').value.trim() : '';
    const showErr = (t) => { el.authError.hidden = false; el.authError.textContent = t; };
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) { showErr('Usernames are 3 to 20 letters, numbers or underscores (no spaces).'); return; }
    if (pw.length < 6) { showErr('Passwords need at least 6 characters.'); return; }
    if (mode === 'signup' && pw !== field('password2').value) { showErr('The two passwords are different.'); return; }
    const btn = el.auth.querySelector('[type="submit"]');
    btn.disabled = true;
    el.authError.hidden = true;
    try {
      await authRequest(mode, name, pw, display);
      el.auth.reset();
    } catch (err) {
      showErr(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  view.addEventListener('click', (e) => {
    const t = e.target;
    const act = t.closest('[data-act]');
    if (act && view.contains(act)) {
      const a = act.dataset.act;
      if (a === 'retry') { retry = 0; clearTimeout(retryTimer); connect(); }
      else if (a === 'server-settings') openSettings(firstAdminTab());
      else if (a === 'settings' || a === 'my-profile') openSettings('profile');
      else if (a === 'toggle-sound') { prefs.sound = !prefs.sound; savePrefs(); renderMe(); if (prefs.sound) ping(); toast(prefs.sound ? 'Ping sound on for mentions and DMs.' : 'Ping sound off.'); }
      else if (a === 'new-dm') openNewDm();
      else if (a === 'new-channel') openSettings('channels', { create: true });
      else if (a === 'toggle-members') {
        if (tightView()) { view.classList.toggle('drawer-members'); view.classList.remove('drawer-side'); }
        else { prefs.members = !prefs.members; savePrefs(); view.classList.toggle('show-members', prefs.members); renderHead(); }
      }
      else if (a === 'open-side') { view.classList.toggle('drawer-side'); view.classList.remove('drawer-members'); }
      else if (a === 'close-drawers') closeDrawers();
      else if (a === 'jump') { scrollToBottom(); markRead(S.current); }
      else if (a === 'cancel-compose') { S.reply = null; if (S.editing) { S.editing = null; el.input.value = ''; autosize(); } renderComposer(); }
      return;
    }
    const conv = t.closest('[data-key]');
    if (conv && view.contains(conv) && conv.closest('.ch-side')) { openConvo(conv.dataset.key); return; }
    const sug = t.closest('[data-suggest]');
    if (sug) { pickSuggest(Number(sug.dataset.suggest)); return; }
    const jumpTo = t.closest('[data-jump]');
    if (jumpTo) { highlightMessage(Number(jumpTo.dataset.jump)); return; }
    const msgAct = t.closest('[data-msg-act]');
    if (msgAct) { messageAction(msgAct.dataset.msgAct, msgAct.closest('.ch-msg')); return; }
    const userEl = t.closest('[data-user]');
    if (userEl && !t.closest('.ch-layer') && !t.closest('a')) { openProfile(Number(userEl.dataset.user)); return; }
    // Tap a message on touch screens to show its buttons
    const msg = t.closest('.ch-msg');
    if (msg && window.matchMedia('(hover: none)').matches) {
      const was = msg.classList.contains('is-selected');
      el.inner.querySelectorAll('.ch-msg.is-selected').forEach((x) => x.classList.remove('is-selected'));
      if (!was) msg.classList.add('is-selected');
    }
  });

  el.compose.addEventListener('submit', (e) => { e.preventDefault(); hideSuggest(); submit(); });
  el.input.addEventListener('input', () => {
    autosize();
    renderNote();
    updateSuggest();
    if (el.input.value.trim() && Date.now() - typingSent > 3000 && !S.editing && S.current) {
      typingSent = Date.now();
      req('typing', { key: S.current }).catch(() => {});
    }
  });
  el.input.addEventListener('keydown', (e) => {
    if (suggestState) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = suggestState.items.length;
        suggestState.index = (suggestState.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        drawSuggest();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSuggest(suggestState.index); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideSuggest(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !narrow()) { e.preventDefault(); submit(); return; }
    if (e.key === 'Escape' && (S.reply || S.editing)) {
      e.preventDefault();
      e.stopPropagation();
      S.reply = null;
      if (S.editing) { S.editing = null; el.input.value = ''; autosize(); }
      renderComposer();
      return;
    }
    if (e.key === 'ArrowUp' && !el.input.value) {
      const c = S.convos.get(S.current);
      const last = c && c.list.filter((m) => m.author === S.me && !m.pending).slice(-1)[0];
      if (last) { e.preventDefault(); startEdit(last); }
    }
  });
  el.input.addEventListener('blur', () => setTimeout(hideSuggest, 150));

  el.msgs.addEventListener('scroll', () => {
    if (el.msgs.scrollTop < 200) {
      const c = S.convos.get(S.current);
      if (c && c.loaded && c.more && !c.loading) loadHistory(S.current, true);
    }
    if (atBottom()) { showJump(false); if (S.unread[S.current] && isVisible()) markRead(S.current); }
  }, { passive: true });

  view.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (closeTopModal()) { e.stopPropagation(); e.preventDefault(); return; }
      if (view.classList.contains('drawer-side') || view.classList.contains('drawer-members')) { closeDrawers(); e.stopPropagation(); }
    }
  });
  // Escape also works when nothing inside the chat has keyboard focus
  // (for example right after a settings page redraws).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isVisible() || view.contains(e.target)) return;
    if (closeTopModal()) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  const relayout = () => {
    if (!view) return;
    if (!compactView()) view.classList.remove('drawer-side');
    if (!tightView()) view.classList.remove('drawer-members');
  };
  window.addEventListener('resize', relayout);
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(view);
  document.addEventListener('visibilitychange', () => { if (isVisible() && S.current && atBottom()) markRead(S.current); });
  window.addEventListener('focus', () => { if (isVisible() && S.current && atBottom()) markRead(S.current); });
  document.addEventListener('sahurhub:theme', () => { /* colors come from CSS */ });
}

function closeDrawers() { if (view) view.classList.remove('drawer-side', 'drawer-members'); }

function highlightMessage(id) {
  const node = el.inner.querySelector(`.ch-msg[data-id="${id}"]`);
  if (!node) { toast('That message is further back. Scroll up to load older messages.'); return; }
  node.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
  node.classList.remove('is-flash');
  void node.offsetWidth;
  node.classList.add('is-flash');
}

async function messageAction(action, node) {
  if (!node) return;
  const id = Number(node.dataset.id);
  const c = S.convos.get(S.current);
  const m = c && c.list.find((x) => x.id === id);
  if (!m) return;
  if (action === 'reply') {
    S.reply = { id: m.id, author: m.author, content: m.content };
    S.editing = null;
    renderComposer();
    el.input.focus();
  } else if (action === 'edit') {
    startEdit(m);
  } else if (action === 'delete') {
    const ok = await confirmBox('Delete message?', 'This cannot be undone.', 'Delete', true, m);
    if (ok) req('delete', { id }).catch((e) => toast(e.message));
  } else if (action === 'report') {
    const reason = await promptBox('Report message', 'Tell the moderators what is wrong (optional).', 'For example: being mean, spam', 'Report', 300, m);
    if (reason === null) return;
    req('report', { id, reason }).then(() => toast('Thanks. The moderators will take a look.')).catch((e) => toast(e.message));
  }
}

// ---------------------------------------------------------------------------
// Toasts, modals, confirm and prompt boxes
// ---------------------------------------------------------------------------

let toastTimer = 0;
function toast(text) {
  if (!view || !isVisible()) { const H = hub(); if (H && H.toast) H.toast(text); return; }
  el.toast.textContent = text;
  el.toast.classList.remove('show');
  void el.toast.offsetWidth;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200);
}

const modals = [];
function openModal(opts) {
  const wrap = h(`<div class="ch-modal-wrap${opts.wide ? ' is-wide' : ''}${opts.className ? ' ' + opts.className : ''}">
    <div class="ch-modal" role="dialog" aria-modal="true" aria-label="${esc(opts.title || 'Dialog')}">
      ${opts.title ? `<div class="ch-modal-head"><h3>${esc(opts.title)}</h3><button class="ch-iconbtn" type="button" data-close aria-label="Close">${icon('close')}</button></div>` : ''}
      <div class="ch-modal-body"></div>
    </div></div>`);
  const body = wrap.querySelector('.ch-modal-body');
  if (opts.body) body.appendChild(typeof opts.body === 'string' ? h('<div>' + opts.body + '</div>') : opts.body);
  const entry = { wrap, body, onClose: opts.onClose, closed: false };
  entry.close = () => {
    if (entry.closed) return;
    entry.closed = true;
    const i = modals.indexOf(entry);
    if (i >= 0) modals.splice(i, 1);
    if (entry.onClose) entry.onClose();
    if (reduceMotion()) { wrap.remove(); return; }
    wrap.classList.add('is-closing');
    setTimeout(() => wrap.remove(), 160);
  };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) entry.close(); });
  el.layer.appendChild(wrap);
  modals.push(entry);
  const box = wrap.querySelector('.ch-modal');
  box.setAttribute('tabindex', '-1');
  const first = wrap.querySelector('input:not([type="hidden"]):not([type="file"]):not([disabled]), textarea, select');
  setTimeout(() => { if (first && !narrow()) first.focus(); else box.focus({ preventScroll: true }); }, 40);
  return entry;
}
function closeTopModal() { const m = modals[modals.length - 1]; if (!m) return false; m.close(); return true; }
function closeAllModals() { while (modals.length) modals[modals.length - 1].close(); }

function quoteHtml(m) {
  if (!m) return '';
  const u = S.users.get(m.author);
  return `<div class="ch-quote">${avatarHtml(u, 20)}${nameHtml(u)}<span class="ch-quote-text">${esc(plainText(m.content).slice(0, 200))}</span></div>`;
}

function confirmBox(title, text, okLabel, danger, quoteMsg) {
  return new Promise((resolve) => {
    let answered = false;
    const body = h(`<div><p class="ch-muted">${esc(text)}</p>${quoteHtml(quoteMsg)}<div class="ch-modal-actions">
      <button class="ch-btn" type="button" data-no>Cancel</button>
      <button class="ch-btn ${danger ? 'ch-btn-danger' : 'ch-btn-primary'}" type="button" data-yes>${esc(okLabel)}</button></div></div>`);
    const m = openModal({ title, body, className: 'is-small', onClose: () => { if (!answered) resolve(false); } });
    body.querySelector('[data-no]').onclick = () => m.close();
    body.querySelector('[data-yes]').onclick = () => { answered = true; resolve(true); m.close(); };
    setTimeout(() => body.querySelector('[data-yes]').focus(), 50);
  });
}

function promptBox(title, text, placeholder, okLabel, max, quoteMsg) {
  return new Promise((resolve) => {
    let answered = false;
    const body = h(`<form><p class="ch-muted">${esc(text)}</p>${quoteHtml(quoteMsg)}
      <input class="ch-input" maxlength="${max || 300}" placeholder="${esc(placeholder || '')}">
      <div class="ch-modal-actions"><button class="ch-btn" type="button" data-no>Cancel</button>
      <button class="ch-btn ch-btn-primary" type="submit">${esc(okLabel)}</button></div></form>`);
    const m = openModal({ title, body, className: 'is-small', onClose: () => { if (!answered) resolve(null); } });
    body.querySelector('[data-no]').onclick = () => m.close();
    body.addEventListener('submit', (e) => { e.preventDefault(); answered = true; resolve(body.querySelector('input').value.trim()); m.close(); });
  });
}

// ---------------------------------------------------------------------------
// New DM picker
// ---------------------------------------------------------------------------

function openNewDm() {
  if (!has(P.SEND_DMS)) { toast('You cannot send direct messages.'); return; }
  const body = h(`<div><input class="ch-input" type="search" placeholder="Find someone" aria-label="Find someone" autocomplete="off" spellcheck="false"><div class="ch-pick-list"></div></div>`);
  const input = body.querySelector('input');
  const list = body.querySelector('.ch-pick-list');
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const people = [...S.users.values()].filter((u) => u.id !== S.me && !u.banned && (u.name.toLowerCase().includes(q) || displayName(u).toLowerCase().includes(q)))
      .sort((a, b) => (b.online - a.online) || displayName(a).localeCompare(displayName(b))).slice(0, 50);
    list.innerHTML = people.map((u) => `<button class="ch-pick" type="button" data-dm="${u.id}"><span class="ch-avatar-wrap">${avatarHtml(u, 32)}${statusDot(u)}</span><span class="ch-pick-names">${nameHtml(u)}<small>@${esc(u.name)}</small></span><span class="ch-muted">${u.online ? 'Online' : ''}</span></button>`).join('')
      || '<p class="ch-muted ch-pad">Nobody found.</p>';
  };
  input.addEventListener('input', draw);
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-dm]'); if (b) openDmWith(Number(b.dataset.dm)); });
  draw();
  openModal({ title: 'New direct message', body });
}

// ---------------------------------------------------------------------------
// Profiles (and moderation for people with the right roles)
// ---------------------------------------------------------------------------

let openProfileState = null;
function openProfile(uid) {
  const u = S.users.get(uid);
  if (!u) return;
  const body = h('<div class="ch-profile"></div>');
  const m = openModal({ body, className: 'is-profile', onClose: () => { if (openProfileState && openProfileState.modal === m) openProfileState = null; } });
  openProfileState = { uid, body, modal: m };
  drawProfile();
}
function refreshOpenProfile(uid) { if (openProfileState && openProfileState.uid === uid) drawProfile(); }

function drawProfile() {
  const st = openProfileState;
  const u = S.users.get(st.uid);
  if (!u) { st.modal.close(); return; }
  const isMe = u.id === S.me;
  const mod = canModerate(u);
  const myRoles = sortedRoles().filter((r) => r.kind === 'custom' && aboveRole(r));
  const roles = displayRoles(u);
  const timedOut = u.timeoutUntil && u.timeoutUntil > Date.now();
  st.body.innerHTML = `
    <div class="ch-profile-banner" style="--av:${esc(u.color)}"></div>
    <button class="ch-iconbtn ch-profile-close" type="button" data-close aria-label="Close">${icon('close')}</button>
    <div class="ch-profile-top">${avatarHtml(u, 84)}${statusDot(u)}</div>
    <div class="ch-profile-main">
      <h3>${nameHtml(u)}</h3>
      <p class="ch-handle">@${esc(u.name)}</p>
      <p class="ch-muted">${u.online ? 'Online' : 'Last seen ' + esc(agoText(u.lastSeen))}${timedOut ? ' · Timed out for ' + esc(durationText(u.timeoutUntil - Date.now())) : ''}</p>
      ${roles.length ? `<div class="ch-chips">${roles.map((r) => `<span class="ch-chip"><i style="background:${esc(r.color || '#99a')}"></i>${esc(r.name)}</span>`).join('')}</div>` : ''}
      ${u.bio ? `<div class="ch-profile-section"><h4>About me</h4><p class="ch-bio">${esc(u.bio)}</p></div>` : ''}
      <div class="ch-profile-section"><h4>Member since</h4><p>${esc(new Date(u.created).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }))}</p></div>
      <div class="ch-profile-buttons">
        ${isMe ? `<button class="ch-btn ch-btn-primary" type="button" data-p="edit">${icon('edit')}Edit profile</button>`
               : (has(P.SEND_DMS) && !u.banned ? `<button class="ch-btn ch-btn-primary" type="button" data-p="dm">${icon('chat')}Message</button>` : '')}
      </div>
      ${!isMe && (mod || (has(P.MANAGE_ROLES) && myRoles.length && mod)) && (has(P.MANAGE_ROLES) || has(P.TIMEOUT_MEMBERS) || has(P.BAN_MEMBERS) || has(P.MANAGE_MEMBERS)) ? `
      <div class="ch-profile-section ch-mod">
        <h4>${icon('shield')}Moderation</h4>
        ${has(P.MANAGE_ROLES) && myRoles.length ? `<div class="ch-mod-roles">${myRoles.map((r) => `<label class="ch-check"><input type="checkbox" data-role="${r.id}"${u.roles.includes(r.id) ? ' checked' : ''}><i style="background:${esc(r.color || '#99a')}"></i>${esc(r.name)}</label>`).join('')}</div>` : ''}
        ${has(P.TIMEOUT_MEMBERS) ? `<div class="ch-mod-row"><select class="ch-input ch-select" data-timeout>${TIMEOUTS.map(([s, t]) => `<option value="${s}">${t}</option>`).join('')}</select>
          <button class="ch-btn" type="button" data-p="timeout">${icon('clock')}Time out</button>
          ${timedOut ? `<button class="ch-btn" type="button" data-p="untimeout">Remove timeout</button>` : ''}</div>` : ''}
        <div class="ch-mod-row">
          ${has(P.MANAGE_MEMBERS) ? `<button class="ch-btn" type="button" data-p="reset">${icon('key')}Reset password</button>` : ''}
          ${has(P.MANAGE_MEMBERS) && u.display && u.display !== u.name ? `<button class="ch-btn" type="button" data-p="noname">Reset display name</button>` : ''}
          ${has(P.MANAGE_MEMBERS) && u.avatar ? `<button class="ch-btn" type="button" data-p="noavatar">Remove picture</button>` : ''}
          ${has(P.MANAGE_MEMBERS) && u.bio ? `<button class="ch-btn" type="button" data-p="nobio">Clear bio</button>` : ''}
          ${has(P.BAN_MEMBERS) ? (u.banned ? `<button class="ch-btn" type="button" data-p="unban">Unban</button>` : `<button class="ch-btn ch-btn-danger" type="button" data-p="ban">${icon('ban')}Ban</button>`) : ''}
        </div>
      </div>` : ''}
    </div>`;
  st.body.onclick = async (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const a = b.dataset.p;
    try {
      if (a === 'dm') openDmWith(u.id);
      else if (a === 'edit') { st.modal.close(); openSettings('profile'); }
      else if (a === 'timeout') { await req('timeout', { user: u.id, seconds: Number(st.body.querySelector('[data-timeout]').value) }); toast(u.name + ' is timed out.'); }
      else if (a === 'untimeout') { await req('timeout', { user: u.id, seconds: 0 }); toast('Timeout removed.'); }
      else if (a === 'reset') {
        if (!(await confirmBox('Reset password?', u.name + ' will get a new temporary password. You will need to tell it to them.', 'Reset', false))) return;
        const data = await req('reset_password', { user: u.id });
        await confirmBox('New password for ' + u.name, 'Tell ' + u.name + ' this password: ' + data.password + '   They can change it in Settings.', 'Done', false);
      }
      else if (a === 'noavatar') { await req('clear_profile', { user: u.id, what: 'avatar' }); }
      else if (a === 'noname') { await req('clear_profile', { user: u.id, what: 'name' }); toast('Display name reset to @' + u.name + '.'); }
      else if (a === 'nobio') { await req('clear_profile', { user: u.id, what: 'bio' }); }
      else if (a === 'ban') {
        const reason = await promptBox('Ban ' + u.name + '?', 'They will be kicked out, and their devices cannot make new accounts. You can unban them later in Settings.', 'Reason (optional)', 'Ban', 300);
        if (reason === null) return;
        await req('ban', { user: u.id, reason });
        toast(u.name + ' is banned.');
      }
      else if (a === 'unban') { await req('unban', { user: u.id }); toast(u.name + ' is unbanned.'); }
    } catch (err) { toast(err.message); }
  };
  st.body.onchange = async (e) => {
    const box = e.target.closest('[data-role]');
    if (!box) return;
    const ids = [...st.body.querySelectorAll('[data-role]')].filter((x) => x.checked).map((x) => Number(x.dataset.role));
    const keep = u.roles.filter((id) => !myRoles.some((r) => r.id === id));
    try { await req('member_roles', { user: u.id, roles: keep.concat(ids) }); } catch (err) { toast(err.message); drawProfile(); }
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

let settingsState = null;
const TABS = [
  ['profile', 'My profile', () => true],
  ['sound', 'Notifications', () => true],
  ['reports', 'Reports', () => has(P.VIEW_REPORTS)],
  ['logouts', 'Log-out requests', () => has(P.APPROVE_LOGOUTS)],
  ['roles', 'Roles', () => has(P.MANAGE_ROLES)],
  ['channels', 'Channels', () => has(P.MANAGE_CHANNELS)],
  ['members', 'Members', () => has(P.MANAGE_ROLES) || has(P.TIMEOUT_MEMBERS) || has(P.BAN_MEMBERS) || has(P.MANAGE_MEMBERS)],
  ['bans', 'Bans', () => has(P.BAN_MEMBERS)]
];
function firstAdminTab() {
  if (S.counts.logouts && has(P.APPROVE_LOGOUTS)) return 'logouts';
  if (S.counts.reports && has(P.VIEW_REPORTS)) return 'reports';
  const t = TABS.slice(2).find((x) => x[2]());
  return t ? t[0] : 'profile';
}

function openSettings(tab, opts) {
  if (settingsState) settingsState.modal.close();
  const body = h(`<div class="ch-settings"><nav class="ch-settings-nav"></nav><div class="ch-settings-page"></div></div>`);
  const modal = openModal({ title: 'Settings', body, wide: true, className: 'is-settings', onClose: () => { settingsState = null; } });
  settingsState = { modal, body, nav: body.querySelector('.ch-settings-nav'), page: body.querySelector('.ch-settings-page'), tab: tab || 'profile', opts: opts || {}, sel: null };
  settingsState.nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) { settingsState.tab = b.dataset.tab; settingsState.sel = null; settingsState.opts = {}; drawSettings(); }
  });
  drawSettings();
}
function refreshSettings() {
  if (!settingsState) return;
  if (['profile', 'sound'].includes(settingsState.tab) && settingsState.page.contains(document.activeElement)) { drawNav(); return; }
  drawSettings(true);
}
function drawNav() {
  const st = settingsState;
  const tabs = TABS.filter((t) => t[2]());
  if (!tabs.some((t) => t[0] === st.tab)) st.tab = 'profile';
  st.nav.innerHTML = tabs.map(([id, label]) => {
    const n = id === 'reports' ? S.counts.reports : id === 'logouts' ? S.counts.logouts : 0;
    return `<button type="button" data-tab="${id}" class="${id === st.tab ? 'is-active' : ''}">${esc(label)}${n ? `<span class="ch-count">${n}</span>` : ''}</button>`;
  }).join('');
}
function drawSettings(soft) {
  const st = settingsState;
  if (!st) return;
  drawNav();
  const scroll = st.page.scrollTop;
  const fn = { profile: pageProfile, sound: pageSound, reports: pageReports, logouts: pageLogouts, roles: pageRoles, channels: pageChannels, members: pageMembers, bans: pageBans }[st.tab];
  fn(st.page, st);
  if (soft) st.page.scrollTop = scroll;
}

function swatchesHtml(current, allowNone, name) {
  return `<div class="ch-swatches" role="radiogroup">${allowNone ? `<button type="button" class="ch-swatch is-none${!current ? ' is-on' : ''}" data-${name}="" aria-label="No color"></button>` : ''}` +
    SWATCHES.map((c) => `<button type="button" class="ch-swatch${current === c ? ' is-on' : ''}" data-${name}="${c}" style="background:${c}" aria-label="${c}"></button>`).join('') + '</div>';
}

function pageProfile(page, st) {
  const u = me();
  const t = Date.now();
  const dWait = u.owner || !u.displayChanged ? 0 : Math.max(0, u.displayChanged + DISPLAY_COOLDOWN - t);
  const nWait = u.owner || !u.nameChanged ? 0 : Math.max(0, u.nameChanged + NAME_COOLDOWN - t);
  page.innerHTML = `
    <section class="ch-sec">
      <h4>Names</h4>
      <label class="ch-label" for="ch-display">Display name</label>
      <div class="ch-inline"><input id="ch-display" class="ch-input" maxlength="32" value="${esc(displayName(u))}"${dWait ? ' disabled' : ''}>
        <button class="ch-btn ch-btn-primary" type="button" data-pr="display"${dWait ? ' disabled' : ''}>Save</button></div>
      <p class="ch-hint">${dWait ? 'You can change it again in ' + esc(waitText(dWait)) + '.' : 'What everyone sees in the chat. You can change it once a day.'}</p>
      <label class="ch-label" for="ch-username">Username</label>
      <div class="ch-inline"><span class="ch-at-field"><b>@</b><input id="ch-username" class="ch-input" maxlength="20" spellcheck="false" autocapitalize="off" value="${esc(u.name)}"${nWait ? ' disabled' : ''}></span>
        <button class="ch-btn ch-btn-primary" type="button" data-pr="username"${nWait ? ' disabled' : ''}>Save</button></div>
      <p class="ch-hint">${nWait ? 'You can change it again in ' + esc(waitText(nWait)) + '.' : 'You log in with it and people @mention you with it. You can change it every 2 weeks.'}</p>
      ${u.owner ? '<p class="ch-hint">As the Owner you can change both any time.</p>' : ''}
    </section>
    <section class="ch-sec">
      <h4>Profile</h4>
      <div class="ch-prof-edit">
        <div class="ch-prof-pic">${avatarHtml(u, 76)}</div>
        <div class="ch-prof-pic-btns">
          <label class="ch-btn">${icon('image')}Upload picture<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
          ${u.avatar ? '<button class="ch-btn" type="button" data-pr="noavatar">Remove</button>' : ''}
        </div>
      </div>
      <p class="ch-label">Profile color</p>
      ${swatchesHtml(u.color, false, 'color')}
      <label class="ch-label" for="ch-bio">About me</label>
      <textarea id="ch-bio" class="ch-input" maxlength="${S.limits.bio}" rows="3" placeholder="Say something about yourself">${esc(u.bio)}</textarea>
      <div class="ch-row-end"><span class="ch-muted ch-bio-count"></span><button class="ch-btn ch-btn-primary" type="button" data-pr="save">Save</button></div>
    </section>
    <section class="ch-sec">
      <h4>Password</h4>
      <form class="ch-pw" autocomplete="off">
        <input class="ch-input" type="password" name="old" placeholder="Current password" autocomplete="current-password">
        <input class="ch-input" type="password" name="pw" placeholder="New password (6+ characters)" autocomplete="new-password">
        <input class="ch-input" type="password" name="pw2" placeholder="New password again" autocomplete="new-password">
        <div class="ch-row-end"><button class="ch-btn" type="submit">Change password</button></div>
      </form>
    </section>
    <section class="ch-sec">
      <h4>This device</h4>
      <p class="ch-muted">${esc(S.device || 'This browser')} is signed in as <b>${esc(u.name)}</b>. Each device can only use one account, and there is no log-out button.</p>
      ${u.owner ? `<button class="ch-btn" type="button" data-pr="logout">${icon('logout')}Log out of this device</button>`
        : S.logoutPending ? `<p class="ch-info">Waiting for the Owner to accept your log-out request.</p><button class="ch-btn" type="button" data-pr="cancel">Cancel request</button>`
        : `<button class="ch-btn" type="button" data-pr="request">${icon('logout')}Request log out</button><p class="ch-hint">The Owner gets your request and can accept or decline it.</p>`}
    </section>`;
  const bio = page.querySelector('#ch-bio');
  const count = page.querySelector('.ch-bio-count');
  const upd = () => { count.textContent = (S.limits.bio - bio.value.length) + ' left'; };
  bio.addEventListener('input', upd);
  upd();
  let color = u.color;
  page.onclick = async (e) => {
    const sw = e.target.closest('[data-color]');
    if (sw) { color = sw.dataset.color; page.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('is-on', x === sw)); return; }
    const b = e.target.closest('[data-pr]');
    if (!b) return;
    try {
      if (b.dataset.pr === 'display') {
        const v = page.querySelector('#ch-display').value.trim();
        if (v === displayName(u)) return;
        await req('rename', { display: v });
        toast('Display name changed.');
        if (settingsState) drawSettings(true);
        return;
      }
      if (b.dataset.pr === 'username') {
        const v = page.querySelector('#ch-username').value.trim().replace(/^@/, '');
        if (v === u.name) return;
        if (!/^[A-Za-z0-9_]{3,20}$/.test(v)) { toast('Usernames are 3 to 20 letters, numbers or underscores.'); return; }
        const sure = u.owner || await confirmBox('Change your username to @' + v + '?', 'You will log in with @' + v + ' from now on, and you can\'t change it again for 2 weeks.', 'Change', false);
        if (!sure) return;
        await req('rename', { name: v });
        toast('Username changed to @' + v + '.');
        if (settingsState) drawSettings(true);
        return;
      }
      if (b.dataset.pr === 'save') { await req('profile', { color, bio: bio.value }); toast('Profile saved.'); }
      else if (b.dataset.pr === 'noavatar') { await req('avatar', { data: null }); }
      else if (b.dataset.pr === 'request') { await req('logout_request'); toast('Request sent to the Owner.'); }
      else if (b.dataset.pr === 'cancel') { await req('logout_cancel'); }
      else if (b.dataset.pr === 'logout') {
        if (await confirmBox('Log out of this device?', 'You can log back in or make a new account on this device afterwards.', 'Log out', true)) await req('logout_request');
      }
    } catch (err) { toast(err.message); }
  };
  page.querySelector('input[type="file"]').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { await req('avatar', { data: await shrinkImage(file) }); toast('Profile picture updated.'); } catch (err) { toast(err.message); }
  });
  page.querySelector('.ch-pw').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const v = (n) => f.querySelector(`input[name="${n}"]`).value;
    if (v('pw').length < 6) { toast('New passwords need at least 6 characters.'); return; }
    if (v('pw') !== v('pw2')) { toast('The two new passwords are different.'); return; }
    try { await req('password', { old: v('old'), password: v('pw') }); f.reset(); toast('Password changed.'); } catch (err) { toast(err.message); }
  });
}

// Profile pictures are cropped to a square and shrunk before uploading.
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 15 * 1024 * 1024) { reject(new Error('That picture is too big.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      let data = canvas.toDataURL('image/webp', 0.85);
      if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', 0.85);
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture.')); };
    img.src = url;
  });
}

function pageSound(page) {
  page.innerHTML = `<section class="ch-sec"><h4>Notifications</h4>
    <label class="ch-toggle-row"><span><b>Ping sound</b><span class="ch-muted">Plays when someone mentions you or sends you a direct message.</span></span><input type="checkbox" class="ch-switch" data-s="sound"${prefs.sound ? ' checked' : ''}></label>
    <button class="ch-btn" type="button" data-s="test">Play test sound</button>
    <p class="ch-hint">The red number on the Chat button counts mentions and direct messages you haven't read yet. Messages are kept for ${S.limits.keepDays} days.</p></section>`;
  page.onchange = (e) => { if (e.target.dataset.s === 'sound') { prefs.sound = e.target.checked; savePrefs(); renderMe(); } };
  page.onclick = (e) => { if (e.target.closest('[data-s="test"]')) ping(); };
}

async function pageReports(page) {
  page.innerHTML = '<section class="ch-sec"><h4>Reported messages</h4><div class="ch-list-box"><div class="ch-spinner ch-spinner-sm"></div></div></section>';
  let data;
  try { data = await req('reports'); } catch (e) { page.querySelector('.ch-list-box').innerHTML = `<p class="ch-muted">${esc(e.message)}</p>`; return; }
  if (!settingsState || settingsState.page !== page || settingsState.tab !== 'reports') return;
  const box = page.querySelector('.ch-list-box');
  box.innerHTML = data.reports.length ? data.reports.map((r) => {
    const author = S.users.get(r.snapshot.author);
    const reporter = S.users.get(r.reporter);
    return `<div class="ch-report" data-r="${r.id}">
      <div class="ch-report-head"><span class="ch-muted">${esc(r.snapshot.place)} · ${esc(fullTime(r.snapshot.ts))}</span></div>
      <div class="ch-quote">${avatarHtml(author, 20)}${nameHtml(author)}<span class="ch-quote-text">${esc(plainText(r.snapshot.content))}</span></div>
      <p class="ch-muted">Reported by ${esc(reporter ? reporter.name : 'someone')} ${esc(agoText(r.ts))}${r.reason ? ': "' + esc(r.reason) + '"' : ''}${r.exists ? '' : ' · message already deleted'}</p>
      <div class="ch-row-end">
        ${author ? `<button class="ch-btn" type="button" data-ra="profile" data-u="${author.id}">${icon('user')}Profile</button>` : ''}
        <button class="ch-btn" type="button" data-ra="dismiss">Dismiss</button>
        ${r.exists ? '<button class="ch-btn ch-btn-danger" type="button" data-ra="delete">Delete message</button>' : ''}
      </div></div>`;
  }).join('') : '<p class="ch-muted">No open reports. Nice and calm.</p>';
  box.onclick = async (e) => {
    const b = e.target.closest('[data-ra]');
    if (!b) return;
    if (b.dataset.ra === 'profile') { openProfile(Number(b.dataset.u)); return; }
    try { await req('report_resolve', { id: Number(b.closest('[data-r]').dataset.r), action: b.dataset.ra }); pageReports(page); } catch (err) { toast(err.message); }
  };
}

async function pageLogouts(page) {
  page.innerHTML = '<section class="ch-sec"><h4>Log-out requests</h4><p class="ch-muted">People can\'t log out by themselves. Accepting logs that device out, and it can then be used for a different account.</p><div class="ch-list-box"><div class="ch-spinner ch-spinner-sm"></div></div></section>';
  let data;
  try { data = await req('logout_list'); } catch (e) { page.querySelector('.ch-list-box').innerHTML = `<p class="ch-muted">${esc(e.message)}</p>`; return; }
  if (!settingsState || settingsState.page !== page || settingsState.tab !== 'logouts') return;
  const box = page.querySelector('.ch-list-box');
  box.innerHTML = data.requests.length ? data.requests.map((r) => {
    const u = S.users.get(r.user);
    return `<div class="ch-req" data-q="${r.id}"><span class="ch-avatar-wrap">${avatarHtml(u, 36)}</span>
      <div class="ch-req-text">${nameHtml(u)}<span class="ch-muted">${esc(r.device)} · asked ${esc(agoText(r.ts))}</span></div>
      <button class="ch-btn" type="button" data-qa="no">Decline</button><button class="ch-btn ch-btn-primary" type="button" data-qa="yes">Accept</button></div>`;
  }).join('') : '<p class="ch-muted">No requests right now.</p>';
  box.onclick = async (e) => {
    const b = e.target.closest('[data-qa]');
    if (!b) return;
    try { await req('logout_answer', { id: Number(b.closest('[data-q]').dataset.q), accept: b.dataset.qa === 'yes' }); pageLogouts(page); } catch (err) { toast(err.message); }
  };
}

function pageRoles(page, st) {
  const roles = sortedRoles();
  const custom = roles.filter((r) => r.kind === 'custom');
  if (st.sel == null || !S.roles.get(st.sel)) st.sel = (custom[0] || roles[0]).id;
  const role = S.roles.get(st.sel);
  const count = (r) => r.kind === 'everyone' ? [...S.users.values()].filter((u) => !u.banned).length : r.kind === 'owner' ? [...S.users.values()].filter((u) => u.owner).length : [...S.users.values()].filter((u) => u.roles.includes(r.id)).length;
  const editable = role.kind === 'owner' ? me().owner : role.kind === 'everyone' ? true : aboveRole(role);
  const permsLocked = role.kind === 'owner' || !editable;
  page.innerHTML = `<div class="ch-split">
    <div class="ch-split-list">
      <button class="ch-btn ch-btn-primary ch-btn-wide" type="button" data-ro="create">${icon('plus')}Create role</button>
      ${roles.map((r) => `<button type="button" class="ch-split-item${r.id === role.id ? ' is-active' : ''}" data-sel="${r.id}"><i style="background:${esc(r.color || '#99a')}"></i><span>${esc(r.name)}</span><small>${count(r)}</small></button>`).join('')}
      <p class="ch-hint">Roles higher in the list are more powerful. You can only change roles below your own highest role.</p>
    </div>
    <div class="ch-split-edit">
      <h4>${esc(role.kind === 'everyone' ? '@everyone (all members)' : role.name)}</h4>
      ${role.kind === 'owner' ? '<p class="ch-muted">The Owner has every permission and can always post everywhere. You can rename it or change its color.</p>' : ''}
      ${role.kind === 'everyone' ? '<p class="ch-muted">What everybody can do by default.</p>' : ''}
      ${role.kind !== 'everyone' ? `<label class="ch-label">Name</label><input class="ch-input" data-f="name" maxlength="32" value="${esc(role.name)}"${editable ? '' : ' disabled'}>
        <p class="ch-label">Color</p>${swatchesHtml(role.color, true, 'rcolor')}` : ''}
      ${role.kind === 'custom' ? `<label class="ch-toggle-row"><span><b>Show separately</b><span class="ch-muted">List online members with this role in their own group.</span></span><input type="checkbox" class="ch-switch" data-f="hoist"${role.hoist ? ' checked' : ''}${editable ? '' : ' disabled'}></label>` : ''}
      ${role.kind !== 'owner' ? `<p class="ch-label">Permissions</p><div class="ch-perms">${PERM_LIST.filter(([bit]) => !(role.kind === 'everyone' && bit === P.ADMINISTRATOR)).map(([bit, name, desc]) => `
        <label class="ch-toggle-row"><span><b>${esc(name)}</b><span class="ch-muted">${esc(desc)}</span></span><input type="checkbox" class="ch-switch" data-perm="${bit}"${role.perms & bit ? ' checked' : ''}${permsLocked ? ' disabled' : ''}></label>`).join('')}</div>` : ''}
      ${editable ? `<div class="ch-row-end">
        ${role.kind === 'custom' ? `<button class="ch-btn" type="button" data-ro="up" aria-label="Move up">${icon('up')}</button><button class="ch-btn" type="button" data-ro="down" aria-label="Move down">${icon('down')}</button><button class="ch-btn ch-btn-danger" type="button" data-ro="delete">Delete</button>` : ''}
        <button class="ch-btn ch-btn-primary" type="button" data-ro="save">Save</button></div>` : '<p class="ch-hint">This role is above yours, so you can\'t change it.</p>'}
    </div></div>`;
  let color = role.color;
  page.onclick = async (e) => {
    const sel = e.target.closest('[data-sel]');
    if (sel) { st.sel = Number(sel.dataset.sel); pageRoles(page, st); return; }
    const sw = e.target.closest('[data-rcolor]');
    if (sw && editable) { color = sw.dataset.rcolor; page.querySelectorAll('[data-rcolor]').forEach((x) => x.classList.toggle('is-on', x === sw)); return; }
    const b = e.target.closest('[data-ro]');
    if (!b) return;
    try {
      if (b.dataset.ro === 'create') {
        const name = await promptBox('Create role', 'Give the new role a name. You can set its color and permissions next.', 'For example: Helper', 'Create', 32);
        if (!name) return;
        await req('role_create', { name, color: '', perms: 0, hoist: false });
        const made = sortedRoles().filter((r) => r.kind === 'custom' && r.name === name).sort((a, b2) => a.position - b2.position)[0];
        if (made) st.sel = made.id;
        pageRoles(page, st);
      } else if (b.dataset.ro === 'save') {
        let perms = 0;
        page.querySelectorAll('[data-perm]').forEach((x) => { if (x.checked) perms |= Number(x.dataset.perm); });
        const data = { id: role.id };
        if (role.kind !== 'everyone') { data.name = page.querySelector('[data-f="name"]').value; data.color = color; }
        if (role.kind !== 'owner') data.perms = perms;
        if (role.kind === 'custom') data.hoist = page.querySelector('[data-f="hoist"]').checked;
        await req('role_update', data);
        toast('Role saved.');
      } else if (b.dataset.ro === 'delete') {
        if (await confirmBox('Delete ' + role.name + '?', 'Everyone loses this role. This cannot be undone.', 'Delete role', true)) { await req('role_delete', { id: role.id }); st.sel = null; }
      } else if (b.dataset.ro === 'up' || b.dataset.ro === 'down') {
        await req('role_move', { id: role.id, dir: b.dataset.ro });
      }
    } catch (err) { toast(err.message); }
  };
}

function pageChannels(page, st) {
  const list = S.channels;
  if (st.opts.create) {
    st.opts.create = false;
    setTimeout(async () => {
      const name = await promptBox('Create channel', 'Channel names use lowercase letters, numbers and dashes.', 'for example: off-topic', 'Create', 32);
      if (!name) return;
      try { const d = await req('channel_create', { name, topic: '' }); st.sel = d.id; if (settingsState === st) pageChannels(page, st); } catch (err) { toast(err.message); }
    }, 0);
  }
  if (st.sel == null || !list.some((c) => c.id === st.sel)) st.sel = list[0] ? list[0].id : null;
  const ch = list.find((c) => c.id === st.sel);
  const roles = sortedRoles().filter((r) => r.kind !== 'owner');
  const ow = new Map(((ch && ch.overwrites) || []).map((o) => [o.role, o]));
  const tri = (role, bit) => {
    const o = ow.get(role.id);
    const v = o && (o.allow & bit) ? 'allow' : o && (o.deny & bit) ? 'deny' : '';
    return `<select class="ch-input ch-select ch-tri" data-ow="${role.id}" data-bit="${bit}">
      <option value=""${!v ? ' selected' : ''}>Default</option><option value="allow"${v === 'allow' ? ' selected' : ''}>Allow</option><option value="deny"${v === 'deny' ? ' selected' : ''}>Deny</option></select>`;
  };
  page.innerHTML = `<div class="ch-split">
    <div class="ch-split-list">
      <button class="ch-btn ch-btn-primary ch-btn-wide" type="button" data-co="create">${icon('plus')}Create channel</button>
      ${list.map((c) => `<button type="button" class="ch-split-item${ch && c.id === ch.id ? ' is-active' : ''}" data-sel="${c.id}">${icon(c.hidden ? 'lock' : 'hash')}<span>${esc(c.name)}</span></button>`).join('')}
    </div>
    ${ch ? `<div class="ch-split-edit">
      <h4>#${esc(ch.name)}</h4>
      <label class="ch-label">Name</label><input class="ch-input" data-f="name" maxlength="32" value="${esc(ch.name)}">
      <label class="ch-label">Topic</label><input class="ch-input" data-f="topic" maxlength="${S.limits.topic}" value="${esc(ch.topic)}" placeholder="What this channel is for">
      <label class="ch-label">Slowmode</label><select class="ch-input ch-select" data-f="slowmode">${SLOWMODES.map(([s, t]) => `<option value="${s}"${ch.slowmode === s ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <p class="ch-label">Who can see and talk here</p>
      <p class="ch-hint">Default follows the role's own permissions. The Owner can always see and talk everywhere.</p>
      <div class="ch-ow">
        <div class="ch-ow-row ch-ow-head"><span>Role</span><span>See channel</span><span>Send messages</span></div>
        ${roles.map((r) => `<div class="ch-ow-row"><span><i style="background:${esc(r.color || '#99a')}"></i>${esc(r.kind === 'everyone' ? '@everyone' : r.name)}</span>${tri(r, P.VIEW_CHANNEL)}${tri(r, P.SEND_MESSAGES)}</div>`).join('')}
      </div>
      <div class="ch-row-end">
        <button class="ch-btn" type="button" data-co="up" aria-label="Move up">${icon('up')}</button>
        <button class="ch-btn" type="button" data-co="down" aria-label="Move down">${icon('down')}</button>
        <button class="ch-btn ch-btn-danger" type="button" data-co="delete">Delete</button>
        <button class="ch-btn ch-btn-primary" type="button" data-co="save">Save</button>
      </div></div>` : '<div class="ch-split-edit"><p class="ch-muted">No channels yet.</p></div>'}
  </div>`;
  page.onclick = async (e) => {
    const sel = e.target.closest('[data-sel]');
    if (sel) { st.sel = Number(sel.dataset.sel); pageChannels(page, st); return; }
    const b = e.target.closest('[data-co]');
    if (!b) return;
    try {
      if (b.dataset.co === 'create') { st.opts.create = true; pageChannels(page, st); return; }
      if (b.dataset.co === 'save') {
        const ows = new Map();
        page.querySelectorAll('[data-ow]').forEach((s) => {
          const id = Number(s.dataset.ow);
          const o = ows.get(id) || { role: id, allow: 0, deny: 0 };
          if (s.value === 'allow') o.allow |= Number(s.dataset.bit);
          if (s.value === 'deny') o.deny |= Number(s.dataset.bit);
          ows.set(id, o);
        });
        await req('channel_update', {
          id: ch.id, name: page.querySelector('[data-f="name"]').value, topic: page.querySelector('[data-f="topic"]').value,
          slowmode: Number(page.querySelector('[data-f="slowmode"]').value), overwrites: [...ows.values()]
        });
        toast('Channel saved.');
      } else if (b.dataset.co === 'delete') {
        if (await confirmBox('Delete #' + ch.name + '?', 'All of its messages will be deleted too. This cannot be undone.', 'Delete channel', true)) { await req('channel_delete', { id: ch.id }); st.sel = null; }
      } else if (b.dataset.co === 'up' || b.dataset.co === 'down') {
        await req('channel_move', { id: ch.id, dir: b.dataset.co });
      }
    } catch (err) { toast(err.message); }
  };
}

function pageMembers(page, st) {
  const q = st.opts.q || '';
  page.innerHTML = `<section class="ch-sec"><h4>Members</h4><input class="ch-input" type="search" placeholder="Find someone" value="${esc(q)}" aria-label="Find someone"><div class="ch-pick-list"></div><p class="ch-hint">Click someone to change their roles, time them out, ban them or reset their password.</p></section>`;
  const input = page.querySelector('input');
  const listEl = page.querySelector('.ch-pick-list');
  const draw = () => {
    const s = input.value.trim().toLowerCase();
    st.opts.q = input.value;
    listEl.innerHTML = [...S.users.values()].filter((u) => !u.banned && (u.name.toLowerCase().includes(s) || displayName(u).toLowerCase().includes(s))).sort((a, b) => displayName(a).localeCompare(displayName(b))).slice(0, 200).map((u) =>
      `<button class="ch-pick" type="button" data-pu="${u.id}"><span class="ch-avatar-wrap">${avatarHtml(u, 32)}${statusDot(u)}</span><span class="ch-pick-names">${nameHtml(u)}<small>@${esc(u.name)}</small></span><span class="ch-pick-roles">${displayRoles(u).map((r) => `<span class="ch-chip"><i style="background:${esc(r.color || '#99a')}"></i>${esc(r.name)}</span>`).join('')}</span></button>`).join('');
  };
  input.addEventListener('input', draw);
  listEl.onclick = (e) => { const b = e.target.closest('[data-pu]'); if (b) openProfile(Number(b.dataset.pu)); };
  draw();
}

async function pageBans(page) {
  page.innerHTML = '<section class="ch-sec"><h4>Banned accounts</h4><div class="ch-list-box"><div class="ch-spinner ch-spinner-sm"></div></div></section>';
  let data;
  try { data = await req('bans'); } catch (e) { page.querySelector('.ch-list-box').innerHTML = `<p class="ch-muted">${esc(e.message)}</p>`; return; }
  if (!settingsState || settingsState.page !== page || settingsState.tab !== 'bans') return;
  const box = page.querySelector('.ch-list-box');
  box.innerHTML = data.bans.length ? data.bans.map((b) => {
    const u = S.users.get(b.user);
    return `<div class="ch-req" data-b="${b.user}"><span class="ch-avatar-wrap">${avatarHtml(u, 36)}</span><div class="ch-req-text">${nameHtml(u)}<span class="ch-muted">${esc(b.reason || 'No reason given')}</span></div><button class="ch-btn" type="button">Unban</button></div>`;
  }).join('') : '<p class="ch-muted">Nobody is banned.</p>';
  box.onclick = async (e) => {
    const row = e.target.closest('[data-b]');
    if (!row || !e.target.closest('button')) return;
    try { await req('unban', { user: Number(row.dataset.b) }); pageBans(page); } catch (err) { toast(err.message); }
  };
}

// ---------------------------------------------------------------------------
// The floating window on the hub (Desktop Mode uses its own windows)
// ---------------------------------------------------------------------------

let win = null;
function buildWindow() {
  const root = h(`<div id="chat-root" hidden>
    <section class="ch-window" aria-label="SahurHub Chat">
      <header class="ch-titlebar">
        <span class="ch-title">${icon('chat')}SahurHub Chat</span>
        <button class="ch-iconbtn ch-win-full" type="button" aria-label="Full screen" title="Full screen">${icon('expand')}</button>
        <button class="ch-iconbtn ch-win-close" type="button" aria-label="Close chat" title="Close">${icon('close')}</button>
      </header>
      <div class="ch-win-body"></div>
      <div class="ch-win-resize" aria-hidden="true"></div>
    </section></div>`);
  document.body.appendChild(root);
  win = { root, box: root.querySelector('.ch-window'), body: root.querySelector('.ch-win-body'), bar: root.querySelector('.ch-titlebar'), full: root.querySelector('.ch-win-full'), open: false };
  win.full.addEventListener('click', () => setFull(!prefs.full));
  root.querySelector('.ch-win-close').addEventListener('click', () => close());
  win.bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) setFull(!prefs.full); });

  // Drag the window by its title bar
  let drag = null;
  win.bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button') || prefs.full || narrow()) return;
    const r = win.box.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    win.bar.setPointerCapture(e.pointerId);
    win.box.classList.add('is-dragging');
  });
  win.bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const r = win.box.getBoundingClientRect();
    const left = Math.max(-r.width + 120, Math.min(window.innerWidth - 120, e.clientX - drag.dx));
    const top = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - drag.dy));
    win.box.style.left = left + 'px';
    win.box.style.top = top + 'px';
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    win.box.classList.remove('is-dragging');
    saveRect();
  };
  win.bar.addEventListener('pointerup', endDrag);
  win.bar.addEventListener('pointercancel', endDrag);

  // Resize from the bottom-right corner
  const grip = root.querySelector('.ch-win-resize');
  let rs = null;
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = win.box.getBoundingClientRect();
    rs = { id: e.pointerId, x: e.clientX, y: e.clientY, w: r.width, h: r.height };
    grip.setPointerCapture(e.pointerId);
    win.box.classList.add('is-dragging');
  });
  grip.addEventListener('pointermove', (e) => {
    if (!rs || e.pointerId !== rs.id) return;
    win.box.style.width = Math.max(560, Math.min(window.innerWidth - 16, rs.w + e.clientX - rs.x)) + 'px';
    win.box.style.height = Math.max(420, Math.min(window.innerHeight - 16, rs.h + e.clientY - rs.y)) + 'px';
  });
  const endResize = (e) => {
    if (!rs || e.pointerId !== rs.id) return;
    rs = null;
    win.box.classList.remove('is-dragging');
    saveRect();
  };
  grip.addEventListener('pointerup', endResize);
  grip.addEventListener('pointercancel', endResize);
  window.addEventListener('resize', () => { if (win.open) placeWindow(); });
}

function saveRect() {
  const r = win.box.getBoundingClientRect();
  prefs.rect = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  savePrefs();
}
function placeWindow() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let w = Math.min(1000, vw - 48);
  let hgt = Math.min(700, vh - 96);
  let x = (vw - w) / 2;
  let y = Math.max(64, (vh - hgt) / 2 + 16);
  if (prefs.rect) {
    // A saved spot from a bigger screen is pulled back so the whole window shows.
    w = Math.min(Math.max(560, prefs.rect.w), vw - 16);
    hgt = Math.min(Math.max(420, prefs.rect.h), vh - 16);
    x = Math.max(8, Math.min(vw - w - 8, prefs.rect.x));
    y = Math.max(8, Math.min(vh - hgt - 8, prefs.rect.y));
  }
  Object.assign(win.box.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hgt + 'px' });
  win.box.classList.toggle('is-full', !!prefs.full);
  win.full.innerHTML = icon(prefs.full ? 'shrink' : 'expand');
  win.full.setAttribute('aria-label', prefs.full ? 'Exit full screen' : 'Full screen');
  win.full.title = prefs.full ? 'Exit full screen' : 'Full screen';
}
function setFull(on) {
  const before = win.box.getBoundingClientRect();
  prefs.full = !!on;
  savePrefs();
  placeWindow();
  if (!reduceMotion() && !narrow()) {
    const after = win.box.getBoundingClientRect();
    win.box.animate([
      { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})`, transformOrigin: '0 0' },
      { transform: 'none', transformOrigin: '0 0' }
    ], { duration: 380, easing: 'cubic-bezier(.2, .9, .25, 1)' });
  }
}

function isVisible() {
  if (!view || document.visibilityState !== 'visible') return false;
  if (host === 'window') return !!(win && win.open);
  return host === 'embedded';
}

// ---------------------------------------------------------------------------
// Public API (used by app.js and desktop.js)
// ---------------------------------------------------------------------------

function ensureStarted() {
  if (started) return;
  started = true;
  deviceId();
  if (store.get(KEYS.session)) connect(); else setStatus('signedout');
}

export function init() { ensureStarted(); }

export function onBadge(fn) {
  listeners.add(fn);
  ensureStarted();
  notify();
  return () => listeners.delete(fn);
}

function attachView(target) {
  if (!view) buildView();
  target.appendChild(view);
  renderScreen();
  if (S.status === 'ready') renderAll();
}

export function open(fromEl) {
  ensureStarted();
  if (!win) buildWindow();
  if (host === 'embedded') { toast('The chat is open in Desktop Mode.'); return; }
  attachView(win.body);
  host = 'window';
  placeWindow();
  win.root.hidden = false;
  win.open = true;
  if (S.status === 'offline') { retry = 0; clearTimeout(retryTimer); connect(); }
  if (!reduceMotion()) {
    let from = 'translateY(24px) scale(.94)';
    if (fromEl && !prefs.full && !narrow()) {
      const a = fromEl.getBoundingClientRect();
      const b = win.box.getBoundingClientRect();
      from = `translate(${(a.left + a.width / 2) - (b.left + b.width / 2)}px, ${(a.top + a.height / 2) - (b.top + b.height / 2)}px) scale(.18)`;
    }
    win.box.animate([{ transform: from, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2, 1, .3, 1)' });
  }
  if (S.status === 'ready') openConvo(S.current || firstChannelKey(), true);
  else if (S.status === 'signedout') setTimeout(() => { const f = view.querySelector('.ch-auth input[name="name"]'); if (f && !narrow()) f.focus(); }, 80);
  notify();
}

export function close() {
  if (!win || !win.open) return;
  win.open = false;
  closeAllModals();
  const done = () => { if (!win.open) win.root.hidden = true; };
  if (reduceMotion()) done();
  else win.box.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(16px) scale(.96)', opacity: 0 }], { duration: 200, easing: 'cubic-bezier(.4, 0, 1, 1)' }).onfinish = done;
  notify();
}

export function toggle(fromEl) { if (win && win.open) close(); else open(fromEl); }
export function isOpen() { return !!(win && win.open); }

// Desktop Mode puts the chat inside one of its windows.
export function mountInto(target) {
  ensureStarted();
  if (win && win.open) { win.open = false; win.root.hidden = true; }
  attachView(target);
  host = 'embedded';
  embeddedHost = target;
  if (S.status === 'ready') openConvo(S.current || firstChannelKey(), true);
  if (S.status === 'offline') { retry = 0; clearTimeout(retryTimer); connect(); }
}
export function unmount(target) {
  if (host !== 'embedded' || (target && embeddedHost !== target)) return;
  closeAllModals();
  host = 'none';
  embeddedHost = null;
  if (view && view.parentNode) view.remove();
}
