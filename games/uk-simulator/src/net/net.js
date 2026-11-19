// UK Simulator - connection to the UK Simulator server (WebSocket) using the player's
// SahurHub Chat sign-in (the same browser storage as the chat on sahurhub.github.io).
// Sends our position ~15 times a second, receives everyone else's, chat, and profile changes.
import { SERVER, FLAGS } from '../config.js';

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
  const test = new URLSearchParams(location.search).get('as');
  if (FLAGS.dev && test) return { token: 'dev:' + test, device: 'dev' };
  const token = store.get(KEYS.session);
  return token ? { token, device: chatDevice() } : null;
}
async function chatPost(path, body) {
  const res = await fetch(SERVER.chatUrl + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'Could not reach SahurHub Chat. Try again in a moment.');
  return data;
}
export async function chatLogin(name, password) { const d = await chatPost('/api/login', { name, password, device: chatDevice() }); store.set(KEYS.session, d.token); return d; }
export async function chatSignup(name, password) { const d = await chatPost('/api/signup', { name, password, device: chatDevice() }); store.set(KEYS.session, d.token); return d; }

const SEND_HZ = 15;

export class Net {
  constructor(game) {
    this.g = game; this.ws = null; this.status = 'offline'; this.online = false; this.rid = 1; this.pending = new Map(); this.sendT = 0; this.wantOpen = false; this.tries = 0; this.lastError = '';
  }

  start(force) {
    if (FLAGS.offline) return;
    const s = chatSession();
    if (!s) { this.status = 'guest'; return; }
    if (this.wantOpen && !force) return;
    this.session = s; this.wantOpen = true; this.tries = 0;
    this.open();
  }

  open() {
    if (this.ws) { try { this.ws.close(); } catch (e) { /* */ } }
    this.status = 'connecting';
    let ws;
    try { ws = new WebSocket(SERVER.url.replace(/^http/, 'ws') + '/ws'); } catch (e) { this.retry(); return; }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: this.session.token, device: this.session.device, v: 1 }));
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.onMessage(m); };
    ws.onclose = () => {
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Lost the connection to the server.')); }
      this.pending.clear();
      const was = this.online;
      this.online = false;
      if (was) { this.g.hud.toast('Lost the connection - your progress is safe on the server. Reconnecting...', 'bad'); this.g.remotes.clear(); }
      if (this.wantOpen) this.retry(); else this.status = 'offline';
    };
    ws.onerror = () => {};
  }

  retry() {
    this.status = 'reconnecting';
    this.tries++;
    if (this.tries > 5 && !this.online) { this.status = 'could not connect'; this.lastError = 'The LB Simulator server is not answering. You can keep playing as a guest.'; }
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { if (this.wantOpen) this.open(); }, Math.min(15000, 800 * this.tries));
  }

  onMessage(m) {
    const g = this.g;
    switch (m.t) {
      case 'welcome':
        this.online = true; this.status = 'online'; this.tries = 0; this.me = m.me; this.offset = m.serverTime - Date.now();
        g.profile.fromServer(m.profile);
        g.hud.toast(`Signed in as ${m.me.name}. ${m.players.length ? m.players.length + ' other player' + (m.players.length === 1 ? '' : 's') + ' in town.' : 'You are the only one in town right now.'}`, 'good');
        for (const p of m.players) g.remotes.join(p);
        for (const c of m.chat || []) g.hud.chatLine(c.name, c.text);
        break;
      case 'helloFail': this.wantOpen = false; this.status = 'signed out'; this.lastError = m.reason; g.hud.toast(m.reason, 'bad'); break;
      case 'w': g.remotes.snapshot(m); break;
      case 'join': g.remotes.join(m.p); g.hud.chatLine('', `${m.p.name} arrived in town`, true); break;
      case 'leave': { const r = g.remotes.get(m.id); if (r) g.hud.chatLine('', `${r.name} left`, true); g.remotes.leave(m.id); break; }
      case 'look': g.remotes.look(m); break;
      case 'chat': g.hud.chatLine(m.name, m.text); break;
      case 'profile': g.profile.fromServer(m.profile); break;
      case 'toast': g.hud.toast(m.text, m.kind || ''); break;
      case 'res': { const p = this.pending.get(m.rid); if (p) { this.pending.delete(m.rid); clearTimeout(p.timer); if (m.ok) p.resolve(m.data); else p.reject(new Error(m.error || 'The server said no.')); } break; }
      default: break;
    }
  }

  send(t, data = {}) { if (this.ws && this.ws.readyState === 1 && this.online) this.ws.send(JSON.stringify({ t, ...data })); }

  request(t, data = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1 || !this.online) { reject(new Error('Not connected to the server right now.')); return; }
      const rid = this.rid++;
      const timer = setTimeout(() => { this.pending.delete(rid); reject(new Error('The server took too long to answer.')); }, timeout);
      this.pending.set(rid, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ t, rid, ...data }));
    });
  }

  chat(text) { this.send('chat', { text }); }

  // our state to the server, ~15 times a second
  update(dt) {
    if (!this.online) return;
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 1 / SEND_HZ;
    const g = this.g, v = g.vehicle;
    let d, k;
    if (v) {
      const p = v.phys.pos, q = v.phys.rot, ph = v.phys;
      const flags = (ph.brakeLight ? 1 : 0) | ((v.lightsOn || g.weather.night > 0.5) ? 2 : 0) | (ph.crashed ? 4 : 0) | (ph.airborne ? 8 : 0);
      d = [r2(p[0]), r2(p[1]), r2(p[2]), r3(q.x), r3(q.y), r3(q.z), r3(q.w), r2(v.speed), r3(ph.steer || 0), flags];
      k = v.id;
    } else {
      const c = g.character;
      d = [r2(c.pos.x), r2(c.pos.y - 0.85), r2(c.pos.z), 0, r3(Math.sin(c.heading / 2)), 0, r3(Math.cos(c.heading / 2)), r2(c.speed), 0, 16];
      k = 'foot';
    }
    this.send('s', { d, k });
  }
}
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
