// TURBO TOWN - connection to the Turbo Town server (WebSocket) and the SahurHub Chat
// sign-in it relies on. The game shares the chat's own sign-in (same browser storage on
// sahurhub.github.io), so signing in here also signs you in to the chat and the other way.
import { SERVER, FLAGS } from '../config.js';

const KEYS = { device: 'sahurhub.chat.device', session: 'sahurhub.chat.session' };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

export function chatDevice() {
  let d = store.get(KEYS.device);
  if (!d || !/^[a-f0-9]{64}$/.test(d)) {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    d = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    store.set(KEYS.device, d);
  }
  return d;
}

export function chatSession() {
  const test = new URLSearchParams(location.search).get('as');
  if (FLAGS.dev && test) return { token: 'dev:' + test, device: 'dev' }; // test accounts (test server only)
  const token = store.get(KEYS.session);
  return token ? { token, device: chatDevice() } : null;
}

async function chatPost(path, body) {
  const res = await fetch(SERVER.chatUrl + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'Could not reach SahurHub Chat. Try again in a moment.');
  return data;
}

export async function chatLogin(name, password) {
  const data = await chatPost('/api/login', { name, password, device: chatDevice() });
  store.set(KEYS.session, data.token);
  return data;
}

export async function chatSignup(name, password) {
  const data = await chatPost('/api/signup', { name, password, device: chatDevice() });
  store.set(KEYS.session, data.token);
  return data;
}

export class Net {
  constructor(url = SERVER.url) {
    this.url = url.replace(/^http/, 'ws') + '/ws';
    this.handlers = new Map();
    this.pending = new Map();
    this.rid = 1;
    this.offset = 0;
    this.rtt = 100;
    this.status = 'offline';
    this.wantOpen = false;
  }

  on(t, fn) { if (!this.handlers.has(t)) this.handlers.set(t, []); this.handlers.get(t).push(fn); return () => this.off(t, fn); }
  off(t, fn) { const l = this.handlers.get(t); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  emit(t, m) { for (const fn of [...(this.handlers.get(t) || [])]) fn(m); for (const fn of [...(this.handlers.get('*') || [])]) fn(m); }

  setStatus(s, detail) { this.status = s; this.emit('status', { t: 'status', status: s, detail }); }

  // resolves with the welcome message, rejects if the sign-in is refused
  connect(session) {
    this.session = session;
    this.wantOpen = true;
    return new Promise((resolve, reject) => {
      this.firstResolve = resolve; this.firstReject = reject;
      this.open();
    });
  }

  open() {
    if (this.ws) { try { this.ws.close(); } catch (e) { /* */ } }
    this.setStatus('connecting');
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { this.retry(); return; }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: this.session.token, device: this.session.device, v: 1 }));
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'welcome') {
        this.me = m.me;
        this.offset = m.serverTime - Date.now();
        this.tries = 0;
        this.setStatus('online');
        this.syncClock();
        if (this.firstResolve) { this.firstResolve(m); this.firstResolve = this.firstReject = null; }
      } else if (m.t === 'helloFail') {
        this.wantOpen = false;
        this.setStatus('signedout', m.reason);
        if (this.firstReject) { this.firstReject(new Error(m.reason)); this.firstResolve = this.firstReject = null; }
      } else if (m.t === 'res') {
        const p = this.pending.get(m.rid);
        if (p) { this.pending.delete(m.rid); clearTimeout(p.timer); if (m.ok) p.resolve(m.data); else p.reject(new Error(m.error || 'The server said no.')); }
      } else if (m.t === 'pong') {
        const now = Date.now();
        const rtt = now - m.c;
        if (rtt < this.rtt * 1.5 || this.pongs < 3) { this.rtt = this.rtt * 0.7 + rtt * 0.3; this.offset = m.s + rtt / 2 - now; }
        this.pongs = (this.pongs || 0) + 1;
      }
      this.emit(m.t, m);
    };
    ws.onclose = () => {
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Lost the connection to the server.')); }
      this.pending.clear();
      if (this.wantOpen) this.retry();
      else this.setStatus('offline');
    };
    ws.onerror = () => {};
  }

  retry() {
    this.setStatus('reconnecting');
    this.tries = (this.tries || 0) + 1;
    if (this.firstReject && this.tries > 3) { this.firstReject(new Error('Could not reach the Turbo Town server. Check your internet and try again.')); this.firstResolve = this.firstReject = null; }
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { if (this.wantOpen) this.open(); }, Math.min(8000, 600 * this.tries));
  }

  syncClock() {
    this.pongs = 0;
    for (let i = 0; i < 5; i++) setTimeout(() => this.send('ping', { c: Date.now() }), i * 250);
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.send('ping', { c: Date.now() }), 10000);
  }

  serverNow() { return Date.now() + this.offset; }

  send(t, data = {}) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t, ...data }));
  }

  request(t, data = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) { reject(new Error('Not connected to the server right now.')); return; }
      const rid = this.rid++;
      const timer = setTimeout(() => { this.pending.delete(rid); reject(new Error('The server took too long to answer.')); }, timeout);
      this.pending.set(rid, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ t, rid, ...data }));
    });
  }

  close() { this.wantOpen = false; clearInterval(this.pingTimer); if (this.ws) this.ws.close(); }
}
