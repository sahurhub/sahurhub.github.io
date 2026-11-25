// Driver Online USA - connection to the game server (WebSocket) using the player's SahurHub Chat
// sign-in (the same browser storage as the chat on sahurhub.github.io, so signing in to one signs
// in to both). Car states go up 15 times a second as small binary messages.
import { SERVER, FLAGS } from '../config.js';
import { Emitter } from '../core/util.js';
import { BIN, PROTOCOL_VERSION } from '../shared/protocol.js';

const KEYS = { device: 'sahurhub.chat.device', session: 'sahurhub.chat.session' };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

export function chatDevice() {
  let d = store.get(KEYS.device);
  if (!d || !/^[a-f0-9]{64}$/.test(d)) {
    const b = new Uint8Array(32); crypto.getRandomValues(b);
    d = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    store.set(KEYS.device, d);
  }
  return d;
}
export function chatSession() {
  if (FLAGS.dev && FLAGS.as) return { token: 'dev:' + FLAGS.as, device: 'dev' };
  const token = store.get(KEYS.session);
  return token ? { token, device: chatDevice() } : null;
}
async function chatPost(path, body) {
  let res;
  try {
    res = await fetch(SERVER.chatUrl + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) { throw new Error('Could not reach SahurHub Chat. Check your internet and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'Could not reach SahurHub Chat. Try again in a moment.');
  return data;
}
export async function chatLogin(name, password) { const d = await chatPost('/api/login', { name, password, device: chatDevice() }); store.set(KEYS.session, d.token); return d; }
export async function chatSignup(name, password) { const d = await chatPost('/api/signup', { name, password, device: chatDevice() }); store.set(KEYS.session, d.token); return d; }

export class Net extends Emitter {
  constructor() {
    super();
    this.ws = null;
    this.status = 'offline';
    this.me = null;
    this.rid = 1;
    this.pending = new Map();
    this.offset = null;     // server time - performance.now() (from the fastest recent packet)
    this.offsets = [];
    this.wanted = false;
    this.tries = 0;
  }

  /** Connect and sign in. Resolves with the account, rejects with a message. */
  connect() {
    const session = chatSession();
    if (!session) return Promise.reject(Object.assign(new Error('Please sign in with your SahurHub Chat account.'), { signin: true }));
    this.session = session;
    this.wanted = true;
    return new Promise((resolve, reject) => {
      this.status = 'connecting';
      // only one connection at a time: an older one (e.g. a slow reconnect attempt) is dropped,
      // and anything it still delivers is ignored (it would otherwise see "replaced" and kick us out)
      if (this.ws) { const old = this.ws; this.ws = null; try { old.close(); } catch (e) { /* */ } }
      let ws;
      try { ws = new WebSocket(SERVER.url.replace(/^http/, 'ws') + '/ws'); } catch (e) { reject(new Error('Could not connect to the game server.')); return; }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true; reject(new Error('The game server is not answering. Try again in a moment.'));
          if (this.ws === ws) this.ws = null;
          try { ws.close(); } catch (e) { /* */ }
        }
      }, 10000);
      ws.onopen = () => { if (this.ws === ws) ws.send(JSON.stringify({ t: 'hello', token: session.token, device: session.device, v: PROTOCOL_VERSION })); };
      ws.onmessage = (ev) => {
        if (this.ws !== ws) return;
        if (typeof ev.data !== 'string') { this.onBinary(ev.data); return; }
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'welcome') {
          this.me = m.me; this.status = 'online'; this.tries = 0; this.limits = m.limits;
          this.noteTime(m.time);
          if (!settled) { settled = true; clearTimeout(timer); resolve(m.me); }
        } else if (m.t === 'helloFail') {
          if (!settled) { settled = true; clearTimeout(timer); reject(Object.assign(new Error(m.reason), { signin: true })); }
          this.wanted = false;
        }
        this.onMessage(m);
      };
      ws.onclose = (ev) => {
        clearTimeout(timer);
        if (!settled) { settled = true; reject(new Error('Could not connect to the game server. Try again in a moment.')); }
        if (this.ws !== ws && this.ws !== null) return; // an old connection closing: nothing to do
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Lost the connection to the server.')); }
        this.pending.clear();
        const was = this.status === 'online';
        this.status = 'offline';
        if (was) this.emit('disconnect', ev.code);
      };
      ws.onerror = () => {};
    });
  }

  close() { this.wanted = false; if (this.ws) { try { this.ws.close(); } catch (e) { /* */ } } this.ws = null; }

  get online() { return this.status === 'online' && this.ws && this.ws.readyState === 1; }

  send(obj) { if (this.online) this.ws.send(JSON.stringify(obj)); }
  sendBin(buf) { if (this.online && this.ws.bufferedAmount < 64 * 1024) this.ws.send(buf); }

  /** Ask the server something and wait for the answer. */
  request(t, data = {}) {
    return new Promise((resolve, reject) => {
      if (!this.online) { reject(new Error('Not connected to the game server.')); return; }
      const rid = this.rid++;
      const timer = setTimeout(() => { this.pending.delete(rid); reject(new Error('The server took too long to answer.')); }, 10000);
      this.pending.set(rid, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ ...data, t, rid }));
    });
  }

  onMessage(m) {
    if (m.t === 'res') {
      const p = this.pending.get(m.rid);
      if (!p) return;
      this.pending.delete(m.rid); clearTimeout(p.timer);
      if (m.ok) p.resolve(m.data); else p.reject(new Error(m.error || 'Something went wrong.'));
      return;
    }
    if (m.t === 'ping') { this.send({ t: 'pong', s: m.s }); return; }
    if (m.time !== undefined) this.noteTime(m.time);
    this.emit(m.t, m);
  }

  onBinary(buf) {
    const view = new DataView(buf);
    const type = view.getUint8(0);
    if (type === BIN.SNAPSHOT) { this.noteTime(view.getUint32(2, true)); this.emit('snapshot', view); }
    else if (type === BIN.TRAFFIC) { this.noteTime(view.getUint32(2, true)); this.emit('traffic', view); }
  }

  /** Keep track of the server clock from packet times (the least-delayed packet wins). */
  noteTime(serverMs) {
    const now = performance.now();
    const cand = serverMs - now;
    this.offsets.push({ at: now, v: cand });
    while (this.offsets.length && now - this.offsets[0].at > 8000) this.offsets.shift();
    let best = -1e15; for (const o of this.offsets) if (o.v > best) best = o.v;
    this.offset = this.offset === null ? best : this.offset + (best - this.offset) * 0.1;
  }

  /** Estimated server time in ms (for weather blends, traffic lights, interpolation). */
  serverNow() { return this.offset === null ? performance.now() : performance.now() + this.offset; }
}
