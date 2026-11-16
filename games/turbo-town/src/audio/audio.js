// TURBO TOWN - sound effects, all synthesised with Web Audio (no sound files, no music).
// The audio context starts on the first click or key press (browsers require that).
import { FLAGS } from '../config.js';

export class Sfx {
  constructor(settings) {
    this.ctx = null;
    this.volume = settings ? settings.volume ?? 0.8 : 0.8;
    this.enabled = !FLAGS.mute && (settings ? settings.sfx !== false : true);
    this.engine = null;
    this.drift = null;
    this.noiseBuf = null;
    const unlock = () => { this.start(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
  }

  apply(settings) {
    this.volume = settings.volume ?? 0.8;
    this.enabled = !FLAGS.mute && settings.sfx !== false;
    if (this.master) this.master.gain.value = this.enabled ? this.volume * 0.7 : 0;
  }

  start() {
    if (this.ctx || !this.enabled) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { this.ctx = null; return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume * 0.7;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  get ok() { return !!(this.ctx && this.enabled && this.ctx.state === 'running'); }

  // ------------------------------------------------------------ building blocks

  tone({ freq = 440, to = null, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, delay = 0, filter = null }) {
    if (!this.ok) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (filter) { const f = this.ctx.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.value = filter.freq; o.connect(f); node = f; }
    node.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.3, vol = 0.3, freq = 1200, to = null, type = 'bandpass', q = 1, delay = 0, attack = 0.01 }) {
    if (!this.ok) return;
    const t0 = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }

  notes(seq, type = 'triangle', vol = 0.22, step = 0.09) {
    seq.forEach((f, i) => { if (f) this.tone({ freq: f, type, dur: step * 1.6, vol, delay: i * step }); });
  }

  // ------------------------------------------------------------ named sounds

  play(name, v = 0) {
    if (!this.ok) return;
    switch (name) {
      case 'hover': this.tone({ freq: 880, type: 'sine', dur: 0.05, vol: 0.05 }); break;
      case 'click': this.tone({ freq: 620, to: 900, type: 'triangle', dur: 0.08, vol: 0.18 }); break;
      case 'back': this.tone({ freq: 700, to: 420, type: 'triangle', dur: 0.1, vol: 0.15 }); break;
      case 'count': this.tone({ freq: 523, type: 'square', dur: 0.22, vol: 0.14, filter: { freq: 2400 } }); break;
      case 'go': this.tone({ freq: 1046, type: 'square', dur: 0.5, vol: 0.16, filter: { freq: 3000 } }); this.tone({ freq: 784, type: 'triangle', dur: 0.5, vol: 0.12 }); break;
      case 'hop': this.tone({ freq: 300, to: 520, type: 'sine', dur: 0.12, vol: 0.12 }); break;
      case 'land': this.noise({ dur: 0.18, vol: Math.min(0.35, 0.08 + v * 0.03), freq: 300, type: 'lowpass' }); this.tone({ freq: 120, to: 60, dur: 0.15, vol: 0.18 }); break;
      case 'wall': case 'bonk': this.noise({ dur: 0.16, vol: Math.min(0.4, 0.1 + v * 0.02), freq: 900, q: 0.8 }); this.tone({ freq: 180, to: 90, type: 'square', dur: 0.12, vol: 0.12, filter: { freq: 900 } }); break;
      case 'bump': this.tone({ freq: 240, to: 140, type: 'triangle', dur: 0.12, vol: 0.18 }); this.noise({ dur: 0.08, vol: 0.12, freq: 1500 }); break;
      case 'tier': this.tone({ freq: [0, 660, 880, 1175][v] || 660, type: 'triangle', dur: 0.12, vol: 0.14 }); break;
      case 'turbo': this.noise({ dur: 0.45 + v * 0.1, vol: 0.28, freq: 600, to: 3000, type: 'bandpass', q: 0.7 }); this.tone({ freq: 200, to: 500, type: 'sawtooth', dur: 0.35, vol: 0.08, filter: { freq: 1200 } }); break;
      case 'boostPad': this.noise({ dur: 0.5, vol: 0.25, freq: 500, to: 2500, q: 0.8 }); break;
      case 'trick': this.notes([784, 1046, 1318], 'triangle', 0.14, 0.06); break;
      case 'splash': this.noise({ dur: 0.45, vol: 0.3, freq: 1800, to: 400, type: 'lowpass' }); break;
      case 'fall': this.tone({ freq: 700, to: 140, type: 'sine', dur: 0.6, vol: 0.15 }); break;
      case 'rescue': this.notes([523, 659, 784], 'sine', 0.12, 0.08); break;
      case 'box': this.notes([1046, 1318, 1568, 2093], 'triangle', 0.13, 0.04); this.noise({ dur: 0.15, vol: 0.12, freq: 3000 }); break;
      case 'roulette': this.tone({ freq: 1200 + Math.random() * 400, type: 'square', dur: 0.03, vol: 0.05, filter: { freq: 3000 } }); break;
      case 'itemGot': this.notes([880, 1318], 'triangle', 0.16, 0.07); break;
      case 'speed': this.noise({ dur: 0.7, vol: 0.3, freq: 400, to: 3500, q: 0.6 }); break;
      case 'shield': this.tone({ freq: 300, to: 900, type: 'sine', dur: 0.35, vol: 0.16 }); this.tone({ freq: 600, to: 1800, type: 'sine', dur: 0.35, vol: 0.06 }); break;
      case 'shieldPop': this.noise({ dur: 0.2, vol: 0.3, freq: 2500, q: 1.5 }); this.tone({ freq: 1200, to: 300, dur: 0.2, vol: 0.12 }); break;
      case 'sticky': this.tone({ freq: 200, to: 90, type: 'sine', dur: 0.25, vol: 0.2 }); this.noise({ dur: 0.2, vol: 0.12, freq: 600, type: 'lowpass' }); break;
      case 'rocket': this.noise({ dur: 0.8, vol: 0.22, freq: 800, to: 2000, q: 1.2 }); this.tone({ freq: 220, to: 660, type: 'sawtooth', dur: 0.4, vol: 0.06, filter: { freq: 1500 } }); break;
      case 'boom': this.noise({ dur: 0.5, vol: 0.4, freq: 600, to: 120, type: 'lowpass' }); this.tone({ freq: 140, to: 50, dur: 0.4, vol: 0.25 }); break;
      case 'spin': this.tone({ freq: 900, to: 300, type: 'triangle', dur: 0.5, vol: 0.12 }); break;
      case 'trail': this.notes([523, 784, 1046], 'sawtooth', 0.06, 0.05); this.noise({ dur: 0.5, vol: 0.2, freq: 900, to: 2500 }); break;
      case 'spring': this.tone({ freq: 220, to: 880, type: 'square', dur: 0.3, vol: 0.12, filter: { freq: 1800 } }); break;
      case 'freeze': this.tone({ freq: 1500, to: 2400, type: 'sine', dur: 0.4, vol: 0.12 }); this.noise({ dur: 0.4, vol: 0.12, freq: 5000, q: 2 }); break;
      case 'frozen': this.notes([2093, 1760, 1568, 1318], 'sine', 0.1, 0.05); break;
      case 'mystery': this.notes([523, 659, 784, 1046, 1318], 'triangle', 0.14, 0.06); break;
      case 'overtake': this.notes([1318, 1760], 'square', 0.07, 0.06); break;
      case 'coin': this.notes([988, 1318], 'square', 0.07, 0.05); break;
      case 'lap': this.notes([784, 988, 1175], 'triangle', 0.14, 0.08); break;
      case 'finalLap': this.notes([659, 784, 988, 1318], 'square', 0.1, 0.1); break;
      case 'finish': this.notes([523, 659, 784, 1046, 0, 784, 1046], 'square', 0.12, 0.11); break;
      case 'win': this.notes([523, 659, 784, 1046, 1318, 1568, 2093], 'triangle', 0.15, 0.1); break;
      case 'purchase': this.notes([880, 1175, 1568], 'square', 0.1, 0.07); this.noise({ dur: 0.2, vol: 0.1, freq: 4000, q: 2, delay: 0.15 }); break;
      case 'unlock': this.notes([784, 1046, 1318, 1568, 2093], 'triangle', 0.13, 0.07); break;
      case 'levelup': this.notes([523, 659, 784, 1046, 784, 1046, 1318], 'square', 0.1, 0.09); break;
      case 'error': this.tone({ freq: 220, type: 'square', dur: 0.18, vol: 0.1, filter: { freq: 900 } }); break;
      default: break;
    }
  }

  // ------------------------------------------------------------ continuous engine + drift

  updateKart(k, dt, active) {
    if (!this.ok) return;
    const c = this.ctx;
    if (!this.engine) {
      const o1 = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o1.type = 'sawtooth'; o2.type = 'square';
      f.type = 'lowpass'; f.frequency.value = 600;
      g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this.engine = { o1, o2, f, g };
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const df = c.createBiquadFilter(); df.type = 'bandpass'; df.Q.value = 6; df.frequency.value = 2200;
      const dg = c.createGain(); dg.gain.value = 0;
      s.connect(df); df.connect(dg); dg.connect(this.master); s.start();
      this.drift = { s, df, dg };
    }
    const now = c.currentTime;
    const sp = Math.abs(k.speed);
    const base = 55 + sp * 3.2 + (k.boostT > 0 ? 30 : 0);
    const on = active && k.respawnT <= 0;
    this.engine.o1.frequency.setTargetAtTime(base, now, 0.05);
    this.engine.o2.frequency.setTargetAtTime(base * 0.5, now, 0.05);
    this.engine.f.frequency.setTargetAtTime(400 + sp * 40 + (k.input.throttle > 0 ? 300 : 0), now, 0.08);
    this.engine.g.gain.setTargetAtTime(on ? 0.035 + Math.min(0.04, sp * 0.0015) : 0, now, 0.1);
    const drifting = on && k.drift.on && k.grounded;
    this.drift.df.frequency.setTargetAtTime(1600 + k.drift.tier * 500, now, 0.05);
    this.drift.dg.gain.setTargetAtTime(drifting ? 0.05 : 0, now, 0.05);
  }

  stopKart() {
    if (!this.engine) return;
    const now = this.ctx.currentTime;
    this.engine.g.gain.setTargetAtTime(0, now, 0.05);
    this.drift.dg.gain.setTargetAtTime(0, now, 0.05);
  }
}
