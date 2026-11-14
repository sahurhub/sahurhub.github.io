// All sound is synthesised with the Web Audio API (no audio files, nothing to license).
// ?mute in the URL disables audio completely (no AudioContext is created).
import { FLAGS, clamp } from './utils.js';

const ENGINE = {
  moped:      { base: 70, range: 190, wave: 'sawtooth', wave2: 'square', cut: 900, gain: 0.16 },
  motorbike:  { base: 46, range: 175, wave: 'sawtooth', wave2: 'sawtooth', cut: 1300, gain: 0.2 },
  van:        { base: 38, range: 95, wave: 'sawtooth', wave2: 'square', cut: 700, gain: 0.2 },
  truck:      { base: 28, range: 72, wave: 'sawtooth', wave2: 'square', cut: 520, gain: 0.24 },
  supertruck: { base: 25, range: 80, wave: 'sawtooth', wave2: 'sawtooth', cut: 620, gain: 0.26, turbo: true },
};

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.enabled = !FLAGS.mute;
    this.engine = null;
    this.engineKind = null;
    this.listener = { x: 0, z: 0 };
    this.lastStep = 0;
  }

  init() {
    if (!this.enabled || this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
    } catch (e) { this.enabled = false; return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0;          // silent until applyVolumes() sets the real level
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.ui = c.createGain(); this.ui.connect(this.master);
    this.eng = c.createGain(); this.eng.connect(this.master);
    this.amb = c.createGain(); this.amb.connect(this.master);
    // shared noise buffer
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.6 + b * 3; }
    this.applyVolumes();
    this.startAmbient();
    this.startRoad();
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    const set = (node, v) => {
      if (!this.volumesSet) { node.gain.cancelScheduledValues(t); node.gain.setValueAtTime(v, t); node.gain.value = v; }
      else node.gain.setTargetAtTime(v, t, 0.05);
    };
    set(this.master, s.master);
    set(this.sfx, s.sfx);
    set(this.ui, s.sfx * 0.9);
    set(this.eng, s.engine);
    set(this.amb, s.ambient * 0.5);
    this.volumesSet = true;
  }
  setPaused(p) {
    if (!this.ctx) return;
    this.eng.gain.setTargetAtTime(p ? 0 : this.settings.engine, this.ctx.currentTime, 0.1);
  }

  noise(dest, { filter = 'lowpass', freq = 1000, q = 1, gain = 0.2 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(dest);
    src.start(0, Math.random() * 1.5);
    return { src, f, g };
  }

  // ---------------------------------------------------------------- vehicles
  setVehicle(def) {
    if (!this.ctx) return;
    const kind = def ? (def.sound || 'pedal') : null;
    if (kind === this.engineKind) return;
    if (this.engine) {
      const e = this.engine;
      const t = this.ctx.currentTime;
      e.out.gain.setTargetAtTime(0, t, 0.08);
      setTimeout(() => { e.nodes.forEach(n => { try { n.stop(); } catch (er) { /* already stopped */ } }); e.out.disconnect(); }, 400);
      this.engine = null;
    }
    this.engineKind = kind;
    if (!kind) return;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0; out.connect(this.eng);
    const e = { kind, out, nodes: [] };
    if (ENGINE[kind]) {
      const p = ENGINE[kind];
      const o1 = c.createOscillator(); o1.type = p.wave;
      const o2 = c.createOscillator(); o2.type = p.wave2;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.cut; f.Q.value = 2;
      const g2 = c.createGain(); g2.gain.value = 0.5;
      const lfo = c.createOscillator(); lfo.frequency.value = 9;
      const lg = c.createGain(); lg.gain.value = 0.25;
      const am = c.createGain(); am.gain.value = 0.75;
      lfo.connect(lg).connect(am.gain);
      o1.connect(f); o2.connect(g2).connect(f);
      f.connect(am).connect(out);
      const rumble = this.noise(out, { filter: 'lowpass', freq: 160, gain: 0.25 });
      o1.start(); o2.start(); lfo.start();
      e.nodes.push(o1, o2, lfo, rumble.src);
      Object.assign(e, { o1, o2, f, lfo, p, rumble });
      if (p.turbo) {
        const tb = c.createOscillator(); tb.type = 'sine'; tb.frequency.value = 1800;
        const tg = c.createGain(); tg.gain.value = 0;
        tb.connect(tg).connect(out); tb.start();
        e.nodes.push(tb); e.turbo = { tb, tg };
      }
    } else if (kind === 'electric') {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 300;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 600;
      const g = c.createGain(); g.gain.value = 0.5;
      o.connect(out); o2.connect(g).connect(out);
      o.start(); o2.start();
      e.nodes.push(o, o2); Object.assign(e, { o, o2 });
    } else {
      // pedal bikes: chain whirr + freewheel ticks (scheduled)
      const whirr = this.noise(out, { filter: 'bandpass', freq: 2400, q: 3, gain: 0.0 });
      e.nodes.push(whirr.src); e.whirr = whirr; e.tickT = 0;
    }
    this.engine = e;
  }

  updateVehicle(dt, v) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const spd = v ? Math.abs(v.vf) : 0;
    const slip = v ? Math.abs(v.vx * Math.cos(v.h) - v.vz * Math.sin(v.h)) : 0;
    // road + wind + skid
    if (this.road) {
      this.road.tire.g.gain.setTargetAtTime(v ? clamp(spd / 25, 0, 1) * 0.12 : 0, t, 0.1);
      this.road.wind.g.gain.setTargetAtTime(v ? clamp((spd - 6) / 25, 0, 1) * 0.16 : 0, t, 0.2);
      this.road.skid.g.gain.setTargetAtTime(v && (slip > 2.5 || (v.braking && spd > 6 && !v.def.twoWheel)) ? clamp(slip / 8, 0.05, 0.3) : 0, t, 0.05);
    }
    const e = this.engine;
    if (!e || !v) return;
    if (e.p) {
      const rpm = v.rpm;
      const f = e.p.base + rpm * e.p.range;
      e.o1.frequency.setTargetAtTime(f, t, 0.03);
      e.o2.frequency.setTargetAtTime(f * 0.5 * 1.01, t, 0.03);
      e.lfo.frequency.setTargetAtTime(f / 8, t, 0.05);
      e.f.frequency.setTargetAtTime(e.p.cut * (0.6 + rpm * 0.9 + v.throttle * 0.5), t, 0.05);
      e.out.gain.setTargetAtTime(e.p.gain * (0.55 + v.throttle * 0.45), t, 0.05);
      if (e.turbo) e.turbo.tg.gain.setTargetAtTime(v.throttle * rpm * 0.025, t, 0.1), e.turbo.tb.frequency.setTargetAtTime(1500 + rpm * 1600, t, 0.1);
    } else if (e.o) {
      e.o.frequency.setTargetAtTime(220 + spd * 55, t, 0.05);
      e.o2.frequency.setTargetAtTime(440 + spd * 110, t, 0.05);
      e.out.gain.setTargetAtTime(clamp(spd / 12, 0, 1) * 0.06 * (0.5 + v.throttle * 0.5), t, 0.08);
    } else if (e.whirr) {
      e.out.gain.value = 1;
      e.whirr.g.gain.setTargetAtTime(v.throttle > 0 ? clamp(spd / 10, 0, 1) * 0.05 : 0, t, 0.1);
      e.whirr.f.frequency.setTargetAtTime(1600 + spd * 120, t, 0.1);
      if (v.throttle === 0 && spd > 1) {
        e.tickT -= dt;
        if (e.tickT <= 0) { e.tickT = 1 / (5 + spd * 1.8); this.click(3200, 0.012, 0.035); }
      }
    }
  }

  startRoad() {
    this.road = {
      tire: this.noise(this.sfx, { filter: 'lowpass', freq: 500, gain: 0 }),
      wind: this.noise(this.sfx, { filter: 'bandpass', freq: 900, q: 0.5, gain: 0 }),
      skid: this.noise(this.sfx, { filter: 'bandpass', freq: 1700, q: 6, gain: 0 }),
    };
  }
  startAmbient() {
    this.hum = this.noise(this.amb, { filter: 'lowpass', freq: 300, gain: 0.08 });
    this.birdT = 3;
  }
  updateAmbient(dt, district, night) {
    if (!this.ctx) return;
    this.hum.g.gain.setTargetAtTime(district === 'industrial' ? 0.14 : district === 'downtown' ? 0.1 : 0.05, this.ctx.currentTime, 1);
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 2 + Math.random() * 6;
      if ((district === 'suburbs' || district === 'shopping') && night < 0.5) this.bird();
    }
  }

  // ---------------------------------------------------------------- one-shots
  tone(freq, dur, { type = 'sine', gain = 0.2, dest = null, attack = 0.005, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, { freq = 1000, filter = 'lowpass', gain = 0.3, q = 1, dest = null, delay = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  click(freq, dur, gain) { this.burst(dur, { freq, filter: 'highpass', gain }); }

  uiClick() { this.tone(880, 0.06, { type: 'triangle', gain: 0.12, dest: this.ui }); }
  uiHover() { this.tone(1320, 0.03, { type: 'sine', gain: 0.03, dest: this.ui }); }
  uiOpen() { this.tone(520, 0.08, { type: 'triangle', gain: 0.1, dest: this.ui, slide: 300 }); }
  uiClose() { this.tone(700, 0.08, { type: 'triangle', gain: 0.08, dest: this.ui, slide: -300 }); }
  error() { this.tone(160, 0.18, { type: 'square', gain: 0.08, dest: this.ui }); this.tone(130, 0.2, { type: 'square', gain: 0.06, dest: this.ui, delay: 0.08 }); }
  pickup() { this.tone(660, 0.12, { type: 'triangle', gain: 0.18 }); this.tone(990, 0.18, { type: 'triangle', gain: 0.18, delay: 0.09 }); }
  coin(n = 3) { for (let i = 0; i < n; i++) { this.tone(1568, 0.12, { type: 'square', gain: 0.05, delay: i * 0.07 }); this.tone(2093, 0.18, { type: 'sine', gain: 0.07, delay: i * 0.07 + 0.04 }); } }
  deliver() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', gain: 0.18, delay: i * 0.08 }));
    this.coin(4);
  }
  purchase() {
    this.burst(0.08, { freq: 3000, filter: 'highpass', gain: 0.2 });
    [1318, 1760, 2637].forEach((f, i) => this.tone(f, 0.35, { type: 'sine', gain: 0.12, delay: 0.05 + i * 0.05 }));
  }
  levelUp() {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', gain: 0.16, delay: i * 0.07 }));
    for (let i = 0; i < 8; i++) this.tone(2000 + Math.random() * 2000, 0.2, { type: 'sine', gain: 0.03, delay: 0.4 + i * 0.05 });
  }
  achievement() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.25, { type: 'square', gain: 0.06, delay: i * 0.09 })); }
  fail() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', gain: 0.14, delay: i * 0.12 })); }
  checkpoint() { this.tone(1046, 0.1, { type: 'square', gain: 0.07 }); this.tone(1568, 0.16, { type: 'square', gain: 0.07, delay: 0.08 }); }
  beep(high) { this.tone(high ? 1320 : 660, high ? 0.4 : 0.15, { type: 'square', gain: 0.08 }); }
  event() { for (let i = 0; i < 10; i++) this.tone(1200 + i * 150, 0.15, { type: 'sine', gain: 0.06, delay: i * 0.04 }); }
  jump() { this.tone(300, 0.12, { type: 'sine', gain: 0.06, slide: 300 }); }
  land() { this.burst(0.1, { freq: 300, gain: 0.15 }); }
  step(sprint) {
    const now = performance.now();
    if (now - this.lastStep < (sprint ? 250 : 380)) return;
    this.lastStep = now;
    this.burst(0.05, { freq: 600 + Math.random() * 300, gain: 0.05 });
  }
  crash(strength) {
    const s = clamp(strength / 12, 0.1, 1);
    this.burst(0.35, { freq: 500, gain: 0.4 * s });
    this.tone(70, 0.3, { type: 'sine', gain: 0.4 * s, slide: -30 });
    if (s > 0.4) this.burst(0.25, { freq: 4000, filter: 'highpass', gain: 0.12 * s, delay: 0.03 });
  }
  horn(x, z, kind) {
    if (!this.ctx) return;
    const d = x == null ? 0 : Math.hypot(x - this.listener.x, z - this.listener.z);
    const att = clamp(1 - d / 120, 0, 1);
    if (att <= 0.01) return;
    if (kind === 'bell') { this.tone(2350, 0.25, { type: 'sine', gain: 0.12 * att }); this.tone(2350, 0.3, { type: 'sine', gain: 0.12 * att, delay: 0.16 }); }
    else if (kind === 'party') [523, 659, 784, 659, 1047].forEach((f, i) => this.tone(f, 0.12, { type: 'square', gain: 0.08 * att, delay: i * 0.09 }));
    else if (kind === 'truck') { this.tone(220, 0.6, { type: 'sawtooth', gain: 0.1 * att }); this.tone(277, 0.6, { type: 'sawtooth', gain: 0.08 * att }); }
    else { this.tone(415, 0.35, { type: 'square', gain: 0.07 * att }); this.tone(523, 0.35, { type: 'square', gain: 0.05 * att }); }
  }
  bird() {
    const base = 2500 + Math.random() * 1500;
    for (let i = 0; i < 3; i++) this.tone(base, 0.08, { type: 'sine', gain: 0.02, slide: 900, delay: i * 0.12 });
  }
}
