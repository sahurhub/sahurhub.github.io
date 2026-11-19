// UK Simulator - simple synthesised sounds: engine (pitch follows rpm), electric motor whine,
// tyre squeal, wind, bicycle freewheel ticks, horn and UI beeps. ?mute turns everything off.
import { FLAGS } from '../config.js';

export class Audio {
  constructor(game) {
    this.g = game; this.ok = !FLAGS.mute; this.ctx = null; this.vehicle = null;
    this.volume = game.profile.settings.volume ?? 0.7;
    if (!this.ok) return;
    const start = () => { this.init(); removeEventListener('keydown', start); removeEventListener('pointerdown', start); };
    addEventListener('keydown', start); addEventListener('pointerdown', start);
  }

  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) { this.ok = false; return; }
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(ctx.destination);
    // engine: two detuned oscillators through a low-pass filter
    this.eng = { a: ctx.createOscillator(), b: ctx.createOscillator(), f: ctx.createBiquadFilter(), g: ctx.createGain() };
    this.eng.a.type = 'sawtooth'; this.eng.b.type = 'square'; this.eng.f.type = 'lowpass'; this.eng.f.frequency.value = 900; this.eng.g.gain.value = 0;
    this.eng.a.connect(this.eng.f); this.eng.b.connect(this.eng.f); this.eng.f.connect(this.eng.g); this.eng.g.connect(this.master);
    this.eng.a.start(); this.eng.b.start();
    // motor whine
    this.mot = { o: ctx.createOscillator(), g: ctx.createGain() }; this.mot.o.type = 'sine'; this.mot.g.gain.value = 0; this.mot.o.connect(this.mot.g); this.mot.g.connect(this.master); this.mot.o.start();
    // noise for tyres and wind
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = (type, freq, q) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); s.start(); return { f, g }; };
    this.tyre = noise('bandpass', 1400, 6);
    this.wind = noise('lowpass', 500, 0.7);
    this.roll = noise('lowpass', 180, 0.5);
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setVehicle(v) { this.vehicle = v; }

  update(dt) {
    if (!this.ctx || !this.ok) return;
    const t = this.ctx.currentTime, v = this.vehicle, set = (p, val, k = 0.05) => p.setTargetAtTime(val, t, k);
    if (!v) { set(this.eng.g.gain, 0); set(this.mot.g.gain, 0); set(this.tyre.g.gain, 0); set(this.wind.g.gain, 0); set(this.roll.g.gain, 0); return; }
    const ph = v.phys, sp = Math.abs(v.speed);
    const e = ph.engine;
    if (e) {
      const rpm = e.rpm, f = rpm / 60 * (v.isCar ? 2 : 1); // 4-stroke firing frequency (approx.)
      set(this.eng.a.frequency, f); set(this.eng.b.frequency, f * 0.5 * 1.01);
      set(this.eng.f.frequency, 400 + rpm * 0.25 + e.throttle * 900);
      set(this.eng.g.gain, 0.05 + e.throttle * 0.12);
    } else set(this.eng.g.gain, 0);
    if (ph.motor) { set(this.mot.o.frequency, 200 + sp * 60); set(this.mot.g.gain, Math.min(0.05, ph.motor.watts / 20000) + (sp > 1 ? 0.01 : 0)); } else set(this.mot.g.gain, 0);
    let slip = 0;
    for (const w of ph.wheels) if (w.contact && w.surf && w.surf.surface <= 2) slip = Math.max(slip, Math.abs(w.tyre.slipRatio) * 1.5 + Math.abs(w.tyre.slipAngle) * 2 - 0.25);
    set(this.tyre.g.gain, Math.max(0, Math.min(0.18, slip * 0.25)) * (sp > 2 ? 1 : 0), 0.03);
    set(this.wind.g.gain, Math.min(0.25, sp * sp * 0.00012)); set(this.wind.f.frequency, 300 + sp * 20);
    set(this.roll.g.gain, Math.min(0.1, sp * 0.004) * (ph.wheels.some((w) => w.contact) ? 1 : 0));
    if (this.g.input.state.horn && !this.hornOn) { this.hornOn = this.tone(v.isCar ? 420 : 900, 9, 'square', 0.12, true); } else if (!this.g.input.state.horn && this.hornOn) { this.hornOn.stop(); this.hornOn = null; }
  }

  tone(freq, dur, type = 'sine', vol = 0.15, hold = false) {
    if (!this.ctx) return null;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(this.master); o.start();
    if (!hold) { g.gain.setTargetAtTime(0, this.ctx.currentTime + dur * 0.6, dur * 0.2); o.stop(this.ctx.currentTime + dur); }
    return o;
  }

  beep(freq = 880) { if (this.ok) this.tone(freq, 0.18, 'sine', 0.12); }
}
